import {
  createTable,
  describeTable,
  describeTimeToLive,
  tableNameFromEnv,
  updateTable,
  updateTimeToLive,
  waitForTableActive,
  resetInMemoryTables,
} from "./client";

const IDENTITY_TABLE_NAME = tableNameFromEnv(
  "IDENTITY_TABLE_NAME",
  "wr-api-suite-identity",
);

const QUESTION_SETS_TABLE_NAME = tableNameFromEnv(
  "QUESTION_SETS_TABLE_NAME",
  "wr-api-suite-question-sets",
);

const QUESTION_SETS_SNIPPET_GSI_NAME =
  process.env.QUESTION_SETS_SNIPPET_GSI_NAME || "questionSetsBySnippet";

const OPENAI_CACHE_TABLE_NAME = tableNameFromEnv(
  "OPENAI_CACHE_TABLE_NAME",
  "wr-api-suite-openai-cache",
);

const OPENAI_CACHE_TTL_ATTRIBUTE = "expiresAt";

let ensurePromise: Promise<void> | null = null;

function usingInMemory(): boolean {
  return process.env.DYNAMODB_IN_MEMORY === "1";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function ensureIdentityTable(): Promise<void> {
  const description = await describeTable(IDENTITY_TABLE_NAME);
  if (!description) {
    await createTable({
      TableName: IDENTITY_TABLE_NAME,
      AttributeDefinitions: [
        { AttributeName: "pk", AttributeType: "S" },
        { AttributeName: "sk", AttributeType: "S" },
      ],
      KeySchema: [
        { AttributeName: "pk", KeyType: "HASH" },
        { AttributeName: "sk", KeyType: "RANGE" },
      ],
      BillingMode: "PAY_PER_REQUEST",
    });
  }
  await waitForTableActive(IDENTITY_TABLE_NAME);
}

async function ensureQuestionSetsTable(): Promise<void> {
  const description = await describeTable(QUESTION_SETS_TABLE_NAME);
  if (!description) {
    await createTable({
      TableName: QUESTION_SETS_TABLE_NAME,
      AttributeDefinitions: [
        { AttributeName: "pk", AttributeType: "S" },
        { AttributeName: "sk", AttributeType: "S" },
        { AttributeName: "snippetIndexPk", AttributeType: "S" },
        { AttributeName: "updatedAt", AttributeType: "S" },
      ],
      KeySchema: [
        { AttributeName: "pk", KeyType: "HASH" },
        { AttributeName: "sk", KeyType: "RANGE" },
      ],
      BillingMode: "PAY_PER_REQUEST",
      GlobalSecondaryIndexes: [
        {
          IndexName: QUESTION_SETS_SNIPPET_GSI_NAME,
          KeySchema: [
            { AttributeName: "snippetIndexPk", KeyType: "HASH" },
            { AttributeName: "updatedAt", KeyType: "RANGE" },
          ],
          Projection: { ProjectionType: "ALL" },
        },
      ],
    });
    await waitForTableActive(QUESTION_SETS_TABLE_NAME);
    return;
  }

  const indexes = description.Table?.GlobalSecondaryIndexes || [];
  const hasSnippetIndex = indexes.some(
    (index) => index.IndexName === QUESTION_SETS_SNIPPET_GSI_NAME,
  );
  if (!hasSnippetIndex) {
    await updateTable({
      TableName: QUESTION_SETS_TABLE_NAME,
      AttributeDefinitions: [
        { AttributeName: "snippetIndexPk", AttributeType: "S" },
        { AttributeName: "updatedAt", AttributeType: "S" },
      ],
      GlobalSecondaryIndexUpdates: [
        {
          Create: {
            IndexName: QUESTION_SETS_SNIPPET_GSI_NAME,
            KeySchema: [
              { AttributeName: "snippetIndexPk", KeyType: "HASH" },
              { AttributeName: "updatedAt", KeyType: "RANGE" },
            ],
            Projection: { ProjectionType: "ALL" },
          },
        },
      ],
    });
  }

  await waitForTableActive(QUESTION_SETS_TABLE_NAME);
}

async function waitForTtlEnabled(
  tableName: string,
  attributeName: string,
): Promise<void> {
  const maxAttempts = 25;
  const delayMs = 1000;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const description = await describeTimeToLive(tableName);
    const ttl = description?.TimeToLiveDescription;
    if (!ttl) {
      await sleep(delayMs);
      continue;
    }
    if (ttl.TimeToLiveStatus === "ENABLED") {
      if (ttl.AttributeName && ttl.AttributeName !== attributeName) {
        throw new Error(
          `DynamoDB TTL for ${tableName} enabled on unexpected attribute ${ttl.AttributeName}`,
        );
      }
      return;
    }
    if (ttl.TimeToLiveStatus === "DISABLED") {
      await sleep(delayMs);
      continue;
    }
    await sleep(delayMs);
  }
  throw new Error(
    `Timed out waiting for DynamoDB TTL on ${tableName} (${attributeName}) to enable`,
  );
}

async function ensureOpenAiCacheTable(): Promise<void> {
  const description = await describeTable(OPENAI_CACHE_TABLE_NAME);
  if (!description) {
    await createTable({
      TableName: OPENAI_CACHE_TABLE_NAME,
      AttributeDefinitions: [{ AttributeName: "cacheKey", AttributeType: "S" }],
      KeySchema: [{ AttributeName: "cacheKey", KeyType: "HASH" }],
      BillingMode: "PAY_PER_REQUEST",
    });
    await waitForTableActive(OPENAI_CACHE_TABLE_NAME);
  } else {
    await waitForTableActive(OPENAI_CACHE_TABLE_NAME);
  }

  const ttlDescription = await describeTimeToLive(OPENAI_CACHE_TABLE_NAME);
  const ttl = ttlDescription?.TimeToLiveDescription;
  if (
    ttl &&
    ttl.TimeToLiveStatus === "ENABLED" &&
    ttl.AttributeName === OPENAI_CACHE_TTL_ATTRIBUTE
  ) {
    return;
  }
  if (ttl && (ttl.TimeToLiveStatus === "ENABLING" || ttl.TimeToLiveStatus === "UPDATING")) {
    await waitForTtlEnabled(OPENAI_CACHE_TABLE_NAME, OPENAI_CACHE_TTL_ATTRIBUTE);
    return;
  }

  await updateTimeToLive(OPENAI_CACHE_TABLE_NAME, OPENAI_CACHE_TTL_ATTRIBUTE);
  await waitForTtlEnabled(OPENAI_CACHE_TABLE_NAME, OPENAI_CACHE_TTL_ATTRIBUTE);
}

async function ensureTables(): Promise<void> {
  if (usingInMemory()) {
    resetInMemoryTables();
    return;
  }

  await ensureIdentityTable();
  await ensureQuestionSetsTable();
  await ensureOpenAiCacheTable();
}

export async function ensureDynamoTables(): Promise<void> {
  if (!ensurePromise) {
    ensurePromise = ensureTables();
  }
  try {
    await ensurePromise;
  } catch (error) {
    ensurePromise = null;
    throw error;
  }
  ensurePromise = null;
}
