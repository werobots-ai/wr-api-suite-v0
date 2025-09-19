import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { parseXlsx } from "../../../shared/utils/xlsxParser";
import { processSnippets } from "../../../shared/utils/snippetProcessor";
import { initStream } from "../../../shared/utils/initStream";
import { loadQuestionSet } from "../../../shared/utils/questionStore";
import { recordUsage } from "../../../shared/utils/userStore";
import pricing from "../../../shared/config/pricing.json";

const BACKEND_ROOT = path.resolve(__dirname, "../../../..");
const PROJECT_ROOT = path.resolve(BACKEND_ROOT, "..");

const router = Router();
const uploadDir = path.join(PROJECT_ROOT, "uploads");
// const dataDir = path.join(__dirname, "../../../data/transcripts");

fs.mkdirSync(uploadDir, { recursive: true });
// fs.mkdirSync(dataDir, { recursive: true });

// accept multiple files
const storage = multer.diskStorage({});
const upload = multer({ storage }).array("files");

router.post("/", upload, async (req, res) => {
  const { sendEvent, sendError, sendLog } = initStream(res);
  // Extract questionSetId from request headers
  const questionSetId = req.headers.questionsetid as string | undefined;
  if (!questionSetId) {
    sendError(new Error("Missing questionSetId header."));
    res.end();
    return;
  }
  const { orgId } = res.locals as { orgId: string };

  const billResults = async (results: any[]) => {
    const { orgId, keySetId, keyId, userId, usageSource, user } = res.locals as {
      orgId: string;
      keySetId?: string;
      keyId?: string;
      userId?: string;
      usageSource?: string;
      user?: { email?: string };
    };
    const source = usageSource === "ui" ? "ui" : "api";
    const userEmail = user?.email;
    const tokenCost = results.reduce(
      (sum, r) => sum + (r.metrics?.cost || 0),
      0,
    );
    const requests = results.reduce(
      (sum, r) => sum + (r.metrics?.requests || 0),
      0,
    );
    const answered = results.reduce(
      (sum, r) => sum + Object.keys(r.answers || {}).length,
      0,
    );
    const multiplier = source === "ui" ? 2 : 1;
    const billed = answered * pricing.questionAnswering * multiplier;
    await recordUsage({
      orgId,
      tokenCost,
      billedCost: billed,
      action:
        source === "ui" ? "ui_snippet_answering" : "snippet_answering",
      requests,
      keySetId: source === "api" ? keySetId : undefined,
      keyId: source === "api" ? keyId : undefined,
      metadata:
        source === "ui"
          ? { source, userId, userEmail }
          : { source, keySetId, keyId },
      userId: source === "ui" ? userId : undefined,
    });
  };

  try {
    const allFiles = req.files as Express.Multer.File[];

    // unique files by originalname
    const files = allFiles.reduce((acc, file) => {
      if (!acc.some((f) => f.originalname === file.originalname)) {
        acc.push(file);
      }
      return acc;
    }, [] as Express.Multer.File[]);

    if (!files || files.length === 0) {
      sendError(new Error("No files uploaded."));
      res.end();
      return;
    }

    sendLog(`Uploading files: ${files.map((f) => f.originalname).join(", ")}`);

    // if xlsx:
    // specific to interactcc xlsx demo

    // 1) Parse each file into rows
    let allRows: any[] = [];
    for (const f of files) {
      if (f.originalname.toLowerCase().endsWith(".xlsx")) {
        try {
          sendLog(`Starting to parse ${f.originalname}...`);
          const { jsonData } = await parseXlsx(f.path);
          const annotatedRows = jsonData.map((row) => ({
            ...row,
            __file: f.originalname,
          }));
          allRows.push(...annotatedRows);

          sendLog(`Parsed ${f.originalname}: ${jsonData.length} rows.`);
        } catch (err: any) {
          sendError(
            new Error(
              `Error parsing ${f.originalname}: ${err.message} Stack: ${err.stack}`
            )
          );
          sendEvent("fileError", {
            file: f.originalname,
            message: err.message,
          });
          continue;
        }
      }

      const questionSet = await loadQuestionSet(orgId, questionSetId);
      if (!questionSet) {
        sendError(new Error(`Question set with ID ${questionSetId} not found.`));
        res.end();
        return;
      }

      if (questionSet.status !== "active") {
        sendError(
          new Error(
            "Question set must be active before snippets can be evaluated.",
          ),
        );
        res.end();
        return;
      }

      if (!questionSet.questions.length) {
        sendEvent("error", { message: "No questions defined." });
        res.end();
        return;
      }
      sendLog(`Loaded ${questionSet.questions.length} questions.`);

      const convCount = Array.from(
        new Set(allRows.map((r) => r.ConversationId))
      ).filter(Boolean).length;
      sendLog(`Extracted ${convCount} snippets, processing...`);

      const newQaResults = await processSnippets(
        orgId,
        allRows,
        null, // fullSnippet is not used for xlsx
        questionSet,
        {
          sendLog,
          sendEvent,
          sendError,
        }
      );

      sendLog(`Processed ${convCount} snippets.`);
      sendEvent("done", { message: "All done!" });
      sendEvent("qaResults", {
        questionSetId: questionSet.id,
        qaResults: newQaResults,
      });
      await billResults(newQaResults);
    }

    // incoming snippets are one per file, accepted extensions: .txt and .md only (other than xlsx)

    const snippets = files
      .map((f) => {
        if (!f.originalname.match(/\.(txt|md)$/i)) {
          return null; // skip non-txt/md files
        }
        return {
          id: f.filename,
          name: f.originalname,
          content: fs.readFileSync(f.path, "utf-8"),
        };
      })
      .filter(Boolean) as { id: string; name: string; content: string }[];

    sendLog(`Received ${snippets.length} snippets.`);

    // Load question set
    const questionSet = await loadQuestionSet(orgId, questionSetId);
    if (!questionSet) {
      sendError(new Error(`Question set with ID ${questionSetId} not found.`));
      res.end();
      return;
    }

    if (questionSet.status !== "active") {
      sendError(
        new Error(
          "Question set must be active before snippets can be evaluated.",
        ),
      );
      res.end();
      return;
    }

    sendLog(`Loaded question set: ${questionSet.title} (${questionSet.id})`);
    sendEvent("questionSetLoaded", {
      id: questionSet.id,
      title: questionSet.title,
    });

    if (!questionSet.questions || questionSet.questions.length === 0) {
      sendError(new Error("No questions defined in the question set."));
      res.end();
      return;
    }

    if (snippets.length === 0) {
      sendError(new Error("No snippets provided for processing."));
      res.end();
      return;
    }

    // Process snippets
    const qaResults = await processSnippets(orgId, null, snippets, questionSet, {
      sendLog,
      sendEvent,
      sendError,
    });

    sendLog(`Processed ${snippets.length} snippets.`);

    sendEvent("qaResults", {
      questionSetId: questionSet.id,
      qaResults,
    });
    await billResults(qaResults);
    sendEvent("done", { message: "All done!" });
    res.end();
  } catch (err: any) {
    console.error(err);
    sendError(err);
    res.end();
  }
});

export default router;
