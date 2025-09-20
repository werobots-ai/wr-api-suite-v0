import {
  putItem,
  getItem,
  updateItem,
  deleteItem,
  query,
  tableNameFromEnv,
  resetInMemoryTables,
} from "./client";

export {
  putItem,
  getItem,
  updateItem,
  deleteItem,
  query,
  tableNameFromEnv,
  resetInMemoryTables,
};
export type { DynamoItem } from "./client";
export { ensureDynamoTables } from "./bootstrap";

export const IDENTITY_TABLE_NAME = tableNameFromEnv(
  "IDENTITY_TABLE_NAME",
  "wr-api-suite-identity",
);

export const QUESTION_SETS_TABLE_NAME = tableNameFromEnv(
  "QUESTION_SETS_TABLE_NAME",
  "wr-api-suite-question-sets",
);

export const QUESTION_SETS_SNIPPET_GSI_NAME =
  process.env.QUESTION_SETS_SNIPPET_GSI_NAME || "questionSetsBySnippet";

export const OPENAI_CACHE_TABLE_NAME = tableNameFromEnv(
  "OPENAI_CACHE_TABLE_NAME",
  "wr-api-suite-openai-cache",
);

export const OPENAI_CACHE_TTL_SECONDS = (() => {
  const raw = process.env.OPENAI_CACHE_TTL_SECONDS;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 6 * 60 * 60; // 6 hours
})();
