import fs from "fs/promises";
import path from "path";
import { QAResult, QuestionSet } from "../types/Questions";

const Q_DIR = path.join(__dirname, "../../../data/questions");
const FILE_PREFIX = "questions-";

export async function loadQuestionSet(id: string): Promise<QuestionSet> {
  const files = await fs.readdir(Q_DIR);

  if (!id) {
    throw new Error("No question set ID provided");
  }
  if (!files.length) {
    throw new Error("No question sets found");
  }

  const safeId = encodeURIComponent(id).replace(/-/g, "%2D");
  const filename = files.find((file) => {
    if (!file.startsWith(FILE_PREFIX) || !file.endsWith(".json")) return false;
    const basename = file.slice(FILE_PREFIX.length, -5);
    const parts = basename.split("-");
    return parts.length === 3 && parts[1] === safeId;
  });
  if (!filename) {
    throw new Error(`Question set with id ${id} not found`);
  }
  const raw = await fs.readFile(path.join(Q_DIR, filename), "utf-8");
  const questionSet = JSON.parse(raw) as Omit<QuestionSet, "qaResults">;

  const qaResults = await listQaResults({
    questionSetId: questionSet.id,
  });

  return {
    ...questionSet,
    qaResults,
  };
}

export async function saveQuestionSet(
  store: Omit<QuestionSet, "qaResults">
): Promise<void> {
  await fs.mkdir(Q_DIR, { recursive: true });
  const rawTitle = store.title || "untitled";
  const questionCount = store.questions.length;
  const safeTitle = encodeURIComponent(rawTitle).replace(/-/g, "%2D");
  const safeId = encodeURIComponent(store.id).replace(/-/g, "%2D");
  const filename = `${FILE_PREFIX}${safeTitle}-${safeId}-${questionCount}.json`;
  await fs.writeFile(
    path.join(Q_DIR, filename),
    JSON.stringify(store, null, 2),
    "utf-8"
  );
}

export async function listQuestionSets(
  titleFilter?: string
): Promise<{ id: string; title: string; date: Date; questionCount: number }[]> {
  const qaResults = await listQaResults();
  const qaResultsByQuestionSetId = {} as Record<string, QAResult[]>;
  for (const qaResult of qaResults) {
    if (!qaResultsByQuestionSetId[qaResult.questionSetId]) {
      qaResultsByQuestionSetId[qaResult.questionSetId] = [];
    }
    qaResultsByQuestionSetId[qaResult.questionSetId].push(qaResult);
  }

  const files = await fs.readdir(Q_DIR);
  const result: {
    id: string;
    title: string;
    date: Date;
    questionCount: number;
    snippetCount: number;
  }[] = [];

  for (const file of files) {
    if (!file.startsWith(FILE_PREFIX) || !file.endsWith(".json")) continue;
    const basename = file.slice(FILE_PREFIX.length, -5);
    const parts = basename.split("-");
    if (parts.length !== 3) continue;
    const [safeTitle, safeId, countStr] = parts;
    let title: string;
    try {
      title = decodeURIComponent(safeTitle);
    } catch {
      title = safeTitle;
    }
    let id: string;
    try {
      id = decodeURIComponent(safeId);
    } catch {
      id = safeId;
    }
    const questionCount = Number(countStr);
    const stat = await fs.stat(path.join(Q_DIR, file));

    result.push({
      id,
      title,
      date: stat.mtime,
      questionCount,
      snippetCount: qaResultsByQuestionSetId[id]?.length || 0,
    });
  }
  if (titleFilter) {
    const filterLower = titleFilter.toLowerCase();
    return result.filter((item) =>
      item.title.toLowerCase().includes(filterLower)
    );
  }
  return result;
}

export const loadQaResult = async (
  snippetId: string,
  questionSetId: string
): Promise<QAResult | null> => {
  const filePath = path.join(
    __dirname,
    "../../../data/qaResults",
    `${questionSetId.replace(/-/g, "%2D")}-${snippetId.replace(
      /-/g,
      "%2D"
    )}.json`
  );
  try {
    const data = await fs.readFile(filePath, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    console.error("Error loading QA result:", error);
    return null;
  }
};
export const saveQaResult = async (qaResult: QAResult): Promise<void> => {
  const filePath = path.join(
    __dirname,
    "../../../data/qaResults",
    `${encodeURIComponent(qaResult.questionSetId).replace(
      /-/g,
      "%2D"
    )}-${encodeURIComponent(qaResult.snippetId).replace(/-/g, "%2D")}.json`
  );
  try {
    await fs.mkdir(path.join(__dirname, "../../../data/qaResults"), {
      recursive: true,
    });
    await fs.writeFile(filePath, JSON.stringify(qaResult, null, 2), "utf-8");
  } catch (error) {
    console.error("Error saving QA result:", error);
  }
};
export const listQaResults = async (
  params: {
    questionSetId?: string;
    snippetId?: string;
  } = {}
): Promise<QAResult[]> => {
  console.log("Listing QA results with params:", params);

  const dirPath = path.join(__dirname, "../../../data/qaResults");
  const { questionSetId, snippetId } = params;
  try {
    const files = await fs.readdir(dirPath);
    const results: QAResult[] = [];
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const [safeQuestionSetId, safeSnippetId] = file
        .slice(0, -5)
        .split("-")
        .map((part) => decodeURIComponent(part));
      if (
        (questionSetId && questionSetId !== safeQuestionSetId) ||
        (snippetId && snippetId !== safeSnippetId)
      )
        continue;
      const data = await fs.readFile(path.join(dirPath, file), "utf-8");
      results.push(JSON.parse(data));
    }
    return results;
  } catch (error) {
    console.error("Error listing QA results:", error);
    return [];
  }
};

export async function softDeleteQuestionSet(id: string): Promise<void> {
  if (!id) {
    throw new Error("No question set ID provided");
  }
  const safeId = encodeURIComponent(id).replace(/-/g, "%2D");

  // Rename question set file
  const files = await fs.readdir(Q_DIR);
  const filename = files.find((file) => {
    if (!file.startsWith(FILE_PREFIX) || !file.endsWith(".json")) return false;
    const basename = file.slice(FILE_PREFIX.length, -5);
    const parts = basename.split("-");
    return parts.length === 3 && parts[1] === safeId;
  });
  if (!filename) {
    throw new Error(`Question set with id ${id} not found`);
  }
  const oldPath = path.join(Q_DIR, filename);
  const newFilename = `.DELETED_${filename}`;
  const newPath = path.join(Q_DIR, newFilename);
  await fs.rename(oldPath, newPath);

  // Rename related QA result files
  const qaDir = path.join(__dirname, "../../../data/qaResults");
  let qaFiles: string[];
  try {
    qaFiles = await fs.readdir(qaDir);
  } catch {
    // No QA results directory; nothing to rename
    return;
  }
  const prefix = `${safeId}-`;
  for (const file of qaFiles) {
    if (!file.endsWith(".json") || !file.startsWith(prefix)) continue;
    const oldQaPath = path.join(qaDir, file);
    const newQaFilename = `.DELETED_${file}`;
    const newQaPath = path.join(qaDir, newQaFilename);
    await fs.rename(oldQaPath, newQaPath);
  }
}
