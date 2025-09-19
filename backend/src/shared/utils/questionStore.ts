import fs from "fs/promises";
import path from "path";
import {
  QAResult,
  QuestionSet,
  QuestionSetActor,
  QuestionSetStatus,
} from "../types/Questions";

const PROJECT_ROOT = path.resolve(__dirname, "../../../..");
const QUESTIONS_ROOT = path.join(PROJECT_ROOT, "data/questions");
const QA_RESULTS_ROOT = path.join(PROJECT_ROOT, "data/qaResults");
const FILE_PREFIX = "questions-";

type StoredQuestionSet = Omit<QuestionSet, "qaResults">;

function isQuestionSetStatus(value: unknown): value is QuestionSetStatus {
  return value === "draft" || value === "active" || value === "inactive";
}

function toActor(value: unknown): QuestionSetActor | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as {
    type?: unknown;
    id?: unknown;
    label?: unknown;
  };
  if (candidate.type !== "user" && candidate.type !== "apiKey") {
    return null;
  }
  if (typeof candidate.id !== "string" || !candidate.id) {
    return null;
  }
  const actor: QuestionSetActor = {
    type: candidate.type,
    id: candidate.id,
  };
  if (
    "label" in candidate &&
    (typeof candidate.label === "string" || candidate.label === null)
  ) {
    actor.label = candidate.label;
  }
  return actor;
}

function ensureIsoString(value: unknown, fallback: string): string {
  if (typeof value === "string" && value) {
    const timestamp = Date.parse(value);
    if (!Number.isNaN(timestamp)) {
      return new Date(timestamp).toISOString();
    }
  }
  return fallback;
}

function parseQuestionFilename(filename: string):
  | {
      safeId: string;
      id: string;
      title: string;
      questionCount: number;
    }
  | null {
  if (filename.startsWith(".DELETED_")) return null;
  if (!filename.startsWith(FILE_PREFIX) || !filename.endsWith(".json")) {
    return null;
  }
  const basename = filename.slice(FILE_PREFIX.length, -5);
  const parts = basename.split("-");
  if (parts.length !== 3) return null;
  const [safeTitle, safeId, countStr] = parts;
  const id = toUnsafeSegment(safeId);
  const title = toUnsafeSegment(safeTitle);
  const questionCount = Number(countStr);
  if (!Number.isFinite(questionCount)) {
    return null;
  }
  return { safeId, id, title, questionCount };
}

async function findQuestionSetFile(orgId: string, id: string) {
  const dir = getQuestionsDirForOrg(orgId);
  let files: string[];
  try {
    files = await fs.readdir(dir);
  } catch {
    throw new Error("No question sets found");
  }
  const safeId = toSafeSegment(id);
  for (const file of files) {
    const parsed = parseQuestionFilename(file);
    if (parsed && parsed.safeId === safeId) {
      return { dir, filename: file, parsed };
    }
  }
  throw new Error(`Question set with id ${id} not found`);
}

function normalizeQuestionSetRecord(
  raw: Partial<StoredQuestionSet>,
  defaults: {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
  },
): StoredQuestionSet {
  const createdAt = ensureIsoString(raw.createdAt, defaults.createdAt);
  const updatedAt = ensureIsoString(raw.updatedAt, defaults.updatedAt);
  const status = isQuestionSetStatus(raw.status) ? raw.status : "active";
  const finalizedAtRaw =
    status === "draft"
      ? null
      : raw.finalizedAt === null
      ? null
      : ensureIsoString(raw.finalizedAt, updatedAt);
  return {
    id: raw.id || defaults.id,
    title: raw.title || defaults.title,
    executionPlan: raw.executionPlan || "",
    executionPlanReasoning: raw.executionPlanReasoning || "",
    snippetType: raw.snippetType || "",
    questions: Array.isArray(raw.questions) ? raw.questions : [],
    originalUserInput: raw.originalUserInput || "",
    status,
    createdAt,
    updatedAt,
    finalizedAt: status === "draft" ? null : finalizedAtRaw,
    createdBy: toActor(raw.createdBy),
    lastModifiedBy: toActor(raw.lastModifiedBy) || toActor(raw.createdBy),
  };
}

async function removeExistingQuestionSetFiles(orgId: string, id: string) {
  const dir = getQuestionsDirForOrg(orgId);
  let files: string[];
  try {
    files = await fs.readdir(dir);
  } catch {
    return;
  }
  const safeId = toSafeSegment(id);
  await Promise.all(
    files
      .filter((file) => !file.startsWith(".DELETED_"))
      .map((file) => ({ file, parsed: parseQuestionFilename(file) }))
      .filter((entry) => entry.parsed && entry.parsed.safeId === safeId)
      .map((entry) => fs.unlink(path.join(dir, entry.file))),
  );
}

async function readQuestionSetFile(
  orgId: string,
  dir: string,
  filename: string,
  parsed: NonNullable<ReturnType<typeof parseQuestionFilename>>,
): Promise<StoredQuestionSet> {
  const filePath = path.join(dir, filename);
  const raw = await fs.readFile(filePath, "utf-8");
  const data = JSON.parse(raw) as Partial<StoredQuestionSet> & {
    orgId?: string;
  };
  if (data.orgId && data.orgId !== orgId) {
    throw new Error("Question set does not belong to this organization");
  }
  const stat = await fs.stat(filePath);
  const defaults = {
    id: parsed.id,
    title: parsed.title,
    createdAt: stat.birthtime
      ? new Date(stat.birthtime).toISOString()
      : new Date().toISOString(),
    updatedAt: stat.mtime
      ? new Date(stat.mtime).toISOString()
      : new Date().toISOString(),
  };
  return normalizeQuestionSetRecord({ ...data, id: data.id || parsed.id }, defaults);
}

async function loadQuestionSetRecord(
  orgId: string,
  id: string,
): Promise<StoredQuestionSet> {
  const context = await findQuestionSetFile(orgId, id);
  return readQuestionSetFile(orgId, context.dir, context.filename, context.parsed);
}

async function writeQuestionSetRecord(
  orgId: string,
  record: StoredQuestionSet,
): Promise<void> {
  const dir = getQuestionsDirForOrg(orgId);
  await fs.mkdir(dir, { recursive: true });
  await removeExistingQuestionSetFiles(orgId, record.id);
  const rawTitle = record.title || "untitled";
  const questionCount = record.questions.length;
  const safeTitle = toSafeSegment(rawTitle);
  const safeId = toSafeSegment(record.id);
  const filename = `${FILE_PREFIX}${safeTitle}-${safeId}-${questionCount}.json`;
  const payload = {
    ...record,
    orgId,
  };
  await fs.writeFile(
    path.join(dir, filename),
    JSON.stringify(payload, null, 2),
    "utf-8",
  );
}

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
  const record = await loadQuestionSetRecord(orgId, id);

  const qaResults = await listQaResults(orgId, {
    questionSetId: record.id,
  });

  return {
    ...record,
    qaResults,
  };
}

export async function saveQuestionSet(
  orgId: string,
  store: StoredQuestionSet,
): Promise<void> {
  await writeQuestionSetRecord(orgId, store);
}

export async function listQuestionSets(
  orgId: string,
  titleFilter?: string,
): Promise<
  {
    id: string;
    title: string;
    date: Date;
    questionCount: number;
    snippetCount: number;
    status: QuestionSetStatus;
    createdAt: string;
    updatedAt: string;
    finalizedAt: string | null;
  }[]
> {
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
    status: QuestionSetStatus;
    createdAt: string;
    updatedAt: string;
    finalizedAt: string | null;
  }[] = [];

  for (const file of files) {
    const parsed = parseQuestionFilename(file);
    if (!parsed) continue;
    const record = await readQuestionSetFile(orgId, dir, file, parsed);
    result.push({
      id: record.id,
      title: record.title,
      date: new Date(record.updatedAt),
      questionCount: record.questions.length,
      snippetCount: qaResultsByQuestionSetId[record.id]?.length || 0,
      status: record.status,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      finalizedAt: record.finalizedAt,
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

export async function updateQuestionSet(
  orgId: string,
  id: string,
  mutate: (
    record: StoredQuestionSet,
  ) => StoredQuestionSet | Promise<StoredQuestionSet>,
): Promise<QuestionSet> {
  const current = await loadQuestionSetRecord(orgId, id);
  const draft = JSON.parse(JSON.stringify(current)) as StoredQuestionSet;
  const next = await mutate(draft);
  const payload: StoredQuestionSet = {
    ...current,
    ...next,
    id: current.id,
    createdAt: next.createdAt || current.createdAt,
    createdBy: next.createdBy ?? current.createdBy,
  };
  await writeQuestionSetRecord(orgId, payload);
  const saved = await loadQuestionSetRecord(orgId, id);
  const qaResults = await listQaResults(orgId, { questionSetId: saved.id });
  return { ...saved, qaResults };
}

export async function finalizeQuestionSet(
  orgId: string,
  id: string,
  actor: QuestionSetActor | null,
): Promise<QuestionSet> {
  return updateQuestionSet(orgId, id, (record) => {
    const timestamp = new Date().toISOString();
    return {
      ...record,
      status: "active",
      finalizedAt: timestamp,
      updatedAt: timestamp,
      lastModifiedBy: actor ?? record.lastModifiedBy ?? record.createdBy,
    };
  });
}

export async function setQuestionSetActivation(
  orgId: string,
  id: string,
  active: boolean,
  actor: QuestionSetActor | null,
): Promise<QuestionSet> {
  return updateQuestionSet(orgId, id, (record) => {
    if (!record.finalizedAt) {
      throw new Error("Question set has not been finalized yet");
    }
    const timestamp = new Date().toISOString();
    return {
      ...record,
      status: active ? "active" : "inactive",
      updatedAt: timestamp,
      finalizedAt: record.finalizedAt || timestamp,
      lastModifiedBy: actor ?? record.lastModifiedBy ?? record.createdBy,
    };
  });
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
