import fs from "fs/promises";
import path from "path";
import { QAResult, QuestionSet } from "../types/Questions";

const PROJECT_ROOT = path.resolve(__dirname, "../../../..");
const QUESTIONS_ROOT = path.join(PROJECT_ROOT, "data/questions");
const QA_RESULTS_ROOT = path.join(PROJECT_ROOT, "data/qaResults");
const FILE_PREFIX = "questions-";

function toSafeSegment(value: string): string {
  return encodeURIComponent(value).replace(/-/g, "%2D");
}

function toUnsafeSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function getQuestionsDirForOrg(orgId: string): string {
  return path.join(QUESTIONS_ROOT, toSafeSegment(orgId));
}

function getQaDirForOrg(orgId: string): string {
  return path.join(QA_RESULTS_ROOT, toSafeSegment(orgId));
}

export async function loadQuestionSet(
  orgId: string,
  id: string,
): Promise<QuestionSet> {
  if (!id) {
    throw new Error("No question set ID provided");
  }

  const dir = getQuestionsDirForOrg(orgId);
  let files: string[];
  try {
    files = await fs.readdir(dir);
  } catch {
    throw new Error("No question sets found");
  }

  const safeId = toSafeSegment(id);
  const filename = files.find((file) => {
    if (!file.startsWith(FILE_PREFIX) || !file.endsWith(".json")) return false;
    const basename = file.slice(FILE_PREFIX.length, -5);
    const parts = basename.split("-");
    return parts.length === 3 && parts[1] === safeId;
  });
  if (!filename) {
    throw new Error(`Question set with id ${id} not found`);
  }
  const raw = await fs.readFile(path.join(dir, filename), "utf-8");
  const parsed = JSON.parse(raw) as Omit<QuestionSet, "qaResults"> & {
    orgId?: string;
  };

  if (parsed.orgId && parsed.orgId !== orgId) {
    throw new Error("Question set does not belong to this organization");
  }

  const { orgId: _ignoredOrgId, ...questionSet } = parsed;

  const qaResults = await listQaResults(orgId, {
    questionSetId: questionSet.id,
  });

  return {
    ...questionSet,
    qaResults,
  };
}

export async function saveQuestionSet(
  orgId: string,
  store: Omit<QuestionSet, "qaResults">,
): Promise<void> {
  const dir = getQuestionsDirForOrg(orgId);
  await fs.mkdir(dir, { recursive: true });
  const rawTitle = store.title || "untitled";
  const questionCount = store.questions.length;
  const safeTitle = toSafeSegment(rawTitle);
  const safeId = toSafeSegment(store.id);
  const filename = `${FILE_PREFIX}${safeTitle}-${safeId}-${questionCount}.json`;
  const payload = {
    ...store,
    orgId,
  };
  await fs.writeFile(
    path.join(dir, filename),
    JSON.stringify(payload, null, 2),
    "utf-8",
  );
}

export async function listQuestionSets(
  orgId: string,
  titleFilter?: string,
): Promise<{ id: string; title: string; date: Date; questionCount: number }[]> {
  const qaResults = await listQaResults(orgId);
  const qaResultsByQuestionSetId = {} as Record<string, QAResult[]>;
  for (const qaResult of qaResults) {
    if (!qaResultsByQuestionSetId[qaResult.questionSetId]) {
      qaResultsByQuestionSetId[qaResult.questionSetId] = [];
    }
    qaResultsByQuestionSetId[qaResult.questionSetId].push(qaResult);
  }

  const dir = getQuestionsDirForOrg(orgId);
  let files: string[];
  try {
    files = await fs.readdir(dir);
  } catch {
    return [];
  }
  const result: {
    id: string;
    title: string;
    date: Date;
    questionCount: number;
    snippetCount: number;
  }[] = [];

  for (const file of files) {
    if (file.startsWith(".DELETED_")) continue;
    if (!file.startsWith(FILE_PREFIX) || !file.endsWith(".json")) continue;
    const basename = file.slice(FILE_PREFIX.length, -5);
    const parts = basename.split("-");
    if (parts.length !== 3) continue;
    const [safeTitle, safeId, countStr] = parts;
    const title = toUnsafeSegment(safeTitle);
    const id = toUnsafeSegment(safeId);
    const questionCount = Number(countStr);
    const stat = await fs.stat(path.join(dir, file));

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
  orgId: string,
  snippetId: string,
  questionSetId: string,
): Promise<QAResult | null> => {
  const dir = getQaDirForOrg(orgId);
  const filePath = path.join(
    dir,
    `${toSafeSegment(questionSetId)}-${toSafeSegment(snippetId)}.json`,
  );
  try {
    const data = await fs.readFile(filePath, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    console.error("Error loading QA result:", error);
    return null;
  }
};
export const saveQaResult = async (
  orgId: string,
  qaResult: QAResult,
): Promise<void> => {
  const dir = getQaDirForOrg(orgId);
  const filePath = path.join(
    dir,
    `${toSafeSegment(qaResult.questionSetId)}-${toSafeSegment(
      qaResult.snippetId,
    )}.json`,
  );
  try {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(qaResult, null, 2), "utf-8");
  } catch (error) {
    console.error("Error saving QA result:", error);
  }
};
export const listQaResults = async (
  orgId: string,
  params: {
    questionSetId?: string;
    snippetId?: string;
  } = {}
): Promise<QAResult[]> => {
  console.log("Listing QA results with params:", params);

  const dirPath = getQaDirForOrg(orgId);
  const { questionSetId, snippetId } = params;
  try {
    const files = await fs.readdir(dirPath);
    const results: QAResult[] = [];
    for (const file of files) {
      if (!file.endsWith(".json") || file.startsWith(".DELETED_")) continue;
      const [safeQuestionSetId, safeSnippetId] = file.slice(0, -5).split("-");
      const resolvedQuestionSetId = toUnsafeSegment(safeQuestionSetId);
      const resolvedSnippetId = toUnsafeSegment(safeSnippetId);
      if (
        (questionSetId && questionSetId !== resolvedQuestionSetId) ||
        (snippetId && snippetId !== resolvedSnippetId)
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

export async function softDeleteQuestionSet(
  orgId: string,
  id: string,
): Promise<void> {
  if (!id) {
    throw new Error("No question set ID provided");
  }
  const safeId = toSafeSegment(id);

  const dir = getQuestionsDirForOrg(orgId);
  let files: string[];
  try {
    files = await fs.readdir(dir);
  } catch {
    throw new Error(`Question set with id ${id} not found`);
  }
  const filename = files.find((file) => {
    if (!file.startsWith(FILE_PREFIX) || !file.endsWith(".json")) return false;
    const basename = file.slice(FILE_PREFIX.length, -5);
    const parts = basename.split("-");
    return parts.length === 3 && parts[1] === safeId;
  });
  if (!filename) {
    throw new Error(`Question set with id ${id} not found`);
  }
  const oldPath = path.join(dir, filename);
  const newFilename = `.DELETED_${filename}`;
  const newPath = path.join(dir, newFilename);
  await fs.rename(oldPath, newPath);

  const qaDir = getQaDirForOrg(orgId);
  let qaFiles: string[];
  try {
    qaFiles = await fs.readdir(qaDir);
  } catch {
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
