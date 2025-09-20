import test from "node:test";
import assert from "node:assert/strict";

import {
  putItem,
  getItem,
  updateItem,
  query,
  deleteItem,
  resetInMemoryTables,
} from "../src/shared/utils/dynamo";

test("http client issues signed requests when not using in-memory mode", async (t) => {
  const originalFetch = global.fetch;
  resetInMemoryTables();
  delete process.env.DYNAMODB_IN_MEMORY;
  process.env.DYNAMODB_ENDPOINT = "http://localhost:8000";

  const calls: { body: any }[] = [];
  const responses = [
    { ok: true, status: 200, json: async () => ({}), text: async () => "" },
    {
      ok: true,
      status: 200,
      json: async () => ({
        Item: {
          pk: { S: "IDENTITY" },
          sk: { S: "STORE" },
          payload: { M: { flag: { BOOL: true } } },
        },
      }),
      text: async () => "",
    },
    {
      ok: true,
      status: 200,
      json: async () => ({
        Items: [
          {
            pk: { S: "ORG#1" },
            sk: { S: "QA#1" },
          },
        ],
        Count: 1,
      }),
      text: async () => "",
    },
    { ok: true, status: 200, json: async () => ({}), text: async () => "" },
    { ok: true, status: 200, json: async () => ({}), text: async () => "" },
  ];
  let index = 0;

  global.fetch = async (_input, init) => {
    calls.push({ body: init?.body ? JSON.parse(String(init.body)) : null });
    return responses[index++] as unknown as Response;
  };

  t.after(() => {
    global.fetch = originalFetch;
    process.env.DYNAMODB_IN_MEMORY = "1";
  });

  await putItem({
    TableName: "wr-api-suite-identity",
    Item: { pk: "IDENTITY", sk: "STORE", payload: {}, updatedAt: "ts" },
  });

  const result = await getItem({
    TableName: "wr-api-suite-identity",
    Key: { pk: "IDENTITY", sk: "STORE" },
  });
  assert.equal(result.Item?.payload.flag, true);

  const queried = await query({
    TableName: "wr-api-suite-question-sets",
    KeyConditionExpression: "pk = :pk",
    ExpressionAttributeValues: { ":pk": "ORG#1" },
  });
  assert.equal(queried.Count, 1);

  await updateItem({
    TableName: "wr-api-suite-identity",
    Key: { pk: "IDENTITY", sk: "STORE" },
    UpdateExpression: "SET updatedAt = :ts",
    ExpressionAttributeValues: { ":ts": "next" },
  });

  await deleteItem({
    TableName: "wr-api-suite-identity",
    Key: { pk: "IDENTITY", sk: "STORE" },
  });

  assert.equal(calls.length, 5);
  assert.ok(calls[0].body.Item);
});
