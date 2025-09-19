import test from "node:test";
import assert from "node:assert/strict";

import {
  ensureDynamoTables,
  getItem,
  putItem,
  resetInMemoryTables,
} from "../src/shared/utils/dynamo";

const IDENTITY_TABLE = "wr-api-suite-identity";
const QUESTION_SETS_TABLE = "wr-api-suite-question-sets";
const CACHE_TABLE = "wr-api-suite-openai-cache";

test("ensureDynamoTables resets in-memory tables", async () => {
  process.env.DYNAMODB_IN_MEMORY = "1";
  resetInMemoryTables();

  await putItem({
    TableName: CACHE_TABLE,
    Item: { cacheKey: "key-1", payload: { flag: true } },
  });

  const before = await getItem({
    TableName: CACHE_TABLE,
    Key: { cacheKey: "key-1" },
  });
  assert.ok(before.Item);

  await ensureDynamoTables();

  const after = await getItem({
    TableName: CACHE_TABLE,
    Key: { cacheKey: "key-1" },
  });
  assert.equal(after.Item, undefined);
});

test("ensureDynamoTables provisions DynamoDB tables over HTTP", async (t) => {
  delete process.env.DYNAMODB_IN_MEMORY;
  process.env.DYNAMODB_ENDPOINT = "http://localhost:8000";

  const originalFetch = global.fetch;
  const calls: { target: string | undefined; body: any }[] = [];
  const responses: {
    ok: boolean;
    status: number;
    json?: () => Promise<any>;
    text: () => Promise<string>;
  }[] = [
    {
      ok: false,
      status: 400,
      text: async () =>
        JSON.stringify({
          __type: "com.amazonaws.dynamodb.v20120810#ResourceNotFoundException",
          message: "Requested resource not found",
        }),
    },
    { ok: true, status: 200, json: async () => ({}), text: async () => "" },
    {
      ok: true,
      status: 200,
      json: async () => ({ Table: { TableStatus: "ACTIVE" } }),
      text: async () => "",
    },
    {
      ok: false,
      status: 400,
      text: async () =>
        JSON.stringify({
          __type: "com.amazonaws.dynamodb.v20120810#ResourceNotFoundException",
          message: "Requested resource not found",
        }),
    },
    { ok: true, status: 200, json: async () => ({}), text: async () => "" },
    {
      ok: true,
      status: 200,
      json: async () => ({
        Table: {
          TableStatus: "ACTIVE",
          GlobalSecondaryIndexes: [
            { IndexName: "questionSetsBySnippet", IndexStatus: "ACTIVE" },
          ],
        },
      }),
      text: async () => "",
    },
    {
      ok: false,
      status: 400,
      text: async () =>
        JSON.stringify({
          __type: "com.amazonaws.dynamodb.v20120810#ResourceNotFoundException",
          message: "Requested resource not found",
        }),
    },
    { ok: true, status: 200, json: async () => ({}), text: async () => "" },
    {
      ok: true,
      status: 200,
      json: async () => ({ Table: { TableStatus: "ACTIVE" } }),
      text: async () => "",
    },
    {
      ok: true,
      status: 200,
      json: async () => ({
        TimeToLiveDescription: { TimeToLiveStatus: "DISABLED" },
      }),
      text: async () => "",
    },
    { ok: true, status: 200, json: async () => ({}), text: async () => "" },
    {
      ok: true,
      status: 200,
      json: async () => ({
        TimeToLiveDescription: { TimeToLiveStatus: "DISABLED" },
      }),
      text: async () => "",
    },
    {
      ok: true,
      status: 200,
      json: async () => ({
        TimeToLiveDescription: {
          TimeToLiveStatus: "ENABLED",
          AttributeName: "expiresAt",
        },
      }),
      text: async () => "",
    },
    {
      ok: true,
      status: 200,
      json: async () => ({ Table: { TableStatus: "ACTIVE" } }),
      text: async () => "",
    },
    {
      ok: true,
      status: 200,
      json: async () => ({ Table: { TableStatus: "ACTIVE" } }),
      text: async () => "",
    },
    {
      ok: true,
      status: 200,
      json: async () => ({
        Table: {
          TableStatus: "ACTIVE",
          GlobalSecondaryIndexes: [
            { IndexName: "questionSetsBySnippet", IndexStatus: "ACTIVE" },
          ],
        },
      }),
      text: async () => "",
    },
    {
      ok: true,
      status: 200,
      json: async () => ({
        Table: {
          TableStatus: "ACTIVE",
          GlobalSecondaryIndexes: [
            { IndexName: "questionSetsBySnippet", IndexStatus: "ACTIVE" },
          ],
        },
      }),
      text: async () => "",
    },
    {
      ok: true,
      status: 200,
      json: async () => ({ Table: { TableStatus: "ACTIVE" } }),
      text: async () => "",
    },
    {
      ok: true,
      status: 200,
      json: async () => ({ Table: { TableStatus: "ACTIVE" } }),
      text: async () => "",
    },
    {
      ok: true,
      status: 200,
      json: async () => ({
        TimeToLiveDescription: {
          TimeToLiveStatus: "ENABLED",
          AttributeName: "expiresAt",
        },
      }),
      text: async () => "",
    },
  ];

  let index = 0;

  global.fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
    const headers = (init?.headers || {}) as Record<string, string>;
    const target = headers["x-amz-target"] || headers["X-Amz-Target"];
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ target, body });
    const response = responses[index++];
    if (!response) {
      throw new Error("No mock response available for DynamoDB request");
    }
    const fullResponse = {
      ok: response.ok,
      status: response.status,
      json: response.json ?? (async () => ({})),
      text: response.text,
    } as Response;
    return fullResponse;
  };

  t.after(() => {
    global.fetch = originalFetch;
    process.env.DYNAMODB_IN_MEMORY = "1";
    delete process.env.DYNAMODB_ENDPOINT;
  });

  await ensureDynamoTables();
  await ensureDynamoTables();

  const targets = calls.map((call) => call.target);
  assert.deepEqual(targets, [
    "DynamoDB_20120810.DescribeTable",
    "DynamoDB_20120810.CreateTable",
    "DynamoDB_20120810.DescribeTable",
    "DynamoDB_20120810.DescribeTable",
    "DynamoDB_20120810.CreateTable",
    "DynamoDB_20120810.DescribeTable",
    "DynamoDB_20120810.DescribeTable",
    "DynamoDB_20120810.CreateTable",
    "DynamoDB_20120810.DescribeTable",
    "DynamoDB_20120810.DescribeTimeToLive",
    "DynamoDB_20120810.UpdateTimeToLive",
    "DynamoDB_20120810.DescribeTimeToLive",
    "DynamoDB_20120810.DescribeTimeToLive",
    "DynamoDB_20120810.DescribeTable",
    "DynamoDB_20120810.DescribeTable",
    "DynamoDB_20120810.DescribeTable",
    "DynamoDB_20120810.DescribeTable",
    "DynamoDB_20120810.DescribeTable",
    "DynamoDB_20120810.DescribeTable",
    "DynamoDB_20120810.DescribeTimeToLive",
  ]);

  const createBodies = calls
    .filter((call) => call.target === "DynamoDB_20120810.CreateTable")
    .map((call) => call.body);
  assert.equal(createBodies.length, 3);
  assert.equal(createBodies[0].TableName, IDENTITY_TABLE);
  assert.equal(createBodies[1].TableName, QUESTION_SETS_TABLE);
  assert.equal(createBodies[2].TableName, CACHE_TABLE);

  const ttlUpdate = calls.find(
    (call) => call.target === "DynamoDB_20120810.UpdateTimeToLive",
  );
  assert.equal(ttlUpdate?.body.TableName, CACHE_TABLE);
  assert.equal(
    ttlUpdate?.body.TimeToLiveSpecification?.AttributeName,
    "expiresAt",
  );
});

test("ensureDynamoTables adds missing question set index", async (t) => {
  delete process.env.DYNAMODB_IN_MEMORY;
  process.env.DYNAMODB_ENDPOINT = "http://localhost:8000";

  const originalFetch = global.fetch;
  const calls: { target: string | undefined; body: any }[] = [];
  const responses: {
    ok: boolean;
    status: number;
    json?: () => Promise<any>;
    text: () => Promise<string>;
  }[] = [
    {
      ok: true,
      status: 200,
      json: async () => ({ Table: { TableStatus: "ACTIVE" } }),
      text: async () => "",
    },
    {
      ok: true,
      status: 200,
      json: async () => ({ Table: { TableStatus: "ACTIVE" } }),
      text: async () => "",
    },
    {
      ok: true,
      status: 200,
      json: async () => ({
        Table: {
          TableStatus: "ACTIVE",
          GlobalSecondaryIndexes: [],
        },
      }),
      text: async () => "",
    },
    { ok: true, status: 200, json: async () => ({}), text: async () => "" },
    {
      ok: true,
      status: 200,
      json: async () => ({
        Table: {
          TableStatus: "ACTIVE",
          GlobalSecondaryIndexes: [
            { IndexName: "questionSetsBySnippet", IndexStatus: "ACTIVE" },
          ],
        },
      }),
      text: async () => "",
    },
    {
      ok: true,
      status: 200,
      json: async () => ({
        Table: {
          TableStatus: "ACTIVE",
          GlobalSecondaryIndexes: [
            { IndexName: "questionSetsBySnippet", IndexStatus: "ACTIVE" },
          ],
        },
      }),
      text: async () => "",
    },
    {
      ok: true,
      status: 200,
      json: async () => ({ Table: { TableStatus: "ACTIVE" } }),
      text: async () => "",
    },
    {
      ok: true,
      status: 200,
      json: async () => ({ Table: { TableStatus: "ACTIVE" } }),
      text: async () => "",
    },
    {
      ok: true,
      status: 200,
      json: async () => ({
        TimeToLiveDescription: { TimeToLiveStatus: "ENABLING" },
      }),
      text: async () => "",
    },
    {
      ok: true,
      status: 200,
      json: async () => ({
        TimeToLiveDescription: {
          TimeToLiveStatus: "ENABLED",
          AttributeName: "expiresAt",
        },
      }),
      text: async () => "",
    },
  ];

  let index = 0;

  global.fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
    const headers = (init?.headers || {}) as Record<string, string>;
    const target = headers["x-amz-target"] || headers["X-Amz-Target"];
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ target, body });
    const response = responses[index++];
    if (!response) {
      throw new Error("No mock response available for DynamoDB request");
    }
    const fullResponse = {
      ok: response.ok,
      status: response.status,
      json: response.json ?? (async () => ({})),
      text: response.text,
    } as Response;
    return fullResponse;
  };

  t.after(() => {
    global.fetch = originalFetch;
    process.env.DYNAMODB_IN_MEMORY = "1";
    delete process.env.DYNAMODB_ENDPOINT;
  });

  await ensureDynamoTables();

  const updateCall = calls.find(
    (call) => call.target === "DynamoDB_20120810.UpdateTable",
  );
  assert.ok(updateCall, "Expected UpdateTable call when index missing");
  assert.deepEqual(updateCall?.body.AttributeDefinitions, [
    { AttributeName: "snippetIndexPk", AttributeType: "S" },
    { AttributeName: "updatedAt", AttributeType: "S" },
  ]);

  const ttlTargets = calls.filter(
    (call) => call.target === "DynamoDB_20120810.DescribeTimeToLive",
  );
  assert.equal(ttlTargets.length, 2);
});
