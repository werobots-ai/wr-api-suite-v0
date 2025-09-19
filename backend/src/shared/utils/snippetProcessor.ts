import { orchestratorAgent } from "../llmCalls/orchestratorAgent";
import { QAResult, QuestionSet } from "../types/Questions";
import { saveQaResult } from "./questionStore";

interface RecordRow {
  ConversationId: string;
  CreatedTime: string;
  Message: string;
  __row: number;
}

export async function processSnippets(
  orgId: string,
  rows: RecordRow[] | null,
  snippets: { id: string; name: string; content: string }[] | null,
  // either fullSnippet or rows must be provided
  questionSet: QuestionSet,
  {
    sendLog,
    sendEvent,
    sendError,
    }: {
    sendLog: (msg: string, snippetId?: string) => void;
    sendEvent: (event: string, data: any) => void;
    sendError: (error: any) => void;
  }
): Promise<QAResult[]> {
  const {
    questions,
    originalUserInput,
    executionPlan,
    executionPlanReasoning,
    snippetType,
    title,
    id: questionSetId,
  } = questionSet;

  let resultPromises: Promise<QAResult>[] = [];
  console.log(
    "Processing snippets with rows:",
    rows,
    "and snippets:",
    snippets
  );
  if (!snippets && rows) {
    const convMap = new Map<string, RecordRow[]>();
    for (const r of rows!.filter((r) => r.Message)) {
      if (!r.ConversationId) {
        throw new Error(`Missing ConversationId for message: ${r.Message}`);
      }
      if (!convMap.has(r.ConversationId)) {
        convMap.set(r.ConversationId, []);
      }

      if (
        convMap
          .get(r.ConversationId)!
          .some(
            (m) => m.Message === r.Message && m.CreatedTime === r.CreatedTime
          )
      ) {
        continue;
      }
      convMap.get(r.ConversationId)!.push(r);
    }

    resultPromises = Array.from(convMap.entries()).map(
      async ([snippetId, msgs]) => {
        const partialResult: Omit<QAResult, "answers" | "metrics"> = {
          snippetId,
          questionSetId,
          rowCount: msgs.length,
          logs: [],
          errors: [],
          files: Array.from(
            new Set(msgs.map((m: any) => m.__file).filter(Boolean))
          ),
        };

        sendEvent("rowCount", {
          snippetId,
          count: msgs.length,
        });

        msgs.sort(
          (a, b) =>
            new Date(a.CreatedTime).getTime() -
            new Date(b.CreatedTime).getTime()
        );

        const sendConvLog = (msg: string, convId?: string) => {
          if (convId !== snippetId) {
            console.error(`Snippet ID mismatch: ${convId} !== ${snippetId}`);

            sendLog(msg, convId);
            return;
          }

          partialResult.logs.push(msg);
          sendLog(msg, snippetId);
        };

        partialResult.files.forEach((file) => {
          sendEvent("linkFileToSnippet", { snippetId, file });
          sendConvLog(
            `Linked file ${file} to snippet ${snippetId}.`,
            snippetId
          );
        });

        const fullSnippet = msgs
          .map((m) => `${m.__row}: "${m.Message}"`)
          .join("\n");
        const { answers, metrics } = await orchestratorAgent(
          {
            ...questionSet,
            snippetId,
            fullSnippet,
            qaResults: [],
          },
          { sendLog: sendConvLog, sendEvent, sendError },
          {
            snippetId,
          }
        );

        const result: QAResult = {
          ...partialResult,
          answers,
          metrics,
          errors: [],
        };

        await saveQaResult(orgId, result);

        return result;
      }
    );
  }

  // snippets provided, no need to process rows
  resultPromises = (snippets || []).map(async (snippet) => {
    const { id: snippetId, name, content } = snippet;
    const partialResult: Omit<QAResult, "answers" | "metrics"> = {
      snippetId,
      questionSetId,
      rowCount: 0,
      logs: [],
      errors: [],
      files: [],
    };

    sendEvent("snippetCount", {
      snippetId,
      count: 1,
    });

    const sendSnippetLog = (msg: string, snippetId?: string) => {
      if (snippetId !== partialResult.snippetId) {
        console.error(
          `Snippet ID mismatch: ${snippetId} !== ${partialResult.snippetId}`
        );
        sendLog(msg, snippetId);
        return;
      }

      partialResult.logs.push(msg);
      sendLog(msg, partialResult.snippetId);
    };
    partialResult.files.push(name);

    sendEvent("linkFileToSnippet", { snippetId, file: name });
    sendSnippetLog(`Linked file ${name} to snippet ${snippetId}.`, snippetId);

    const { answers, metrics } = await orchestratorAgent(
      {
        ...questionSet,
        snippetId,
        fullSnippet: content,
        qaResults: [],
      },
      { sendLog: sendSnippetLog, sendEvent, sendError },
      {
        snippetId,
      }
    );

    const result: QAResult = {
      ...partialResult,
      answers,
      metrics,
      errors: [],
    };

    await saveQaResult(orgId, result);

    return result;
  });

  const results = await Promise.all(resultPromises);

  return results;
}
