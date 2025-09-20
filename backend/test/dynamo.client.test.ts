import test from "node:test";
import assert from "node:assert/strict";

import {
  putItem,
  getItem,
  updateItem,
  deleteItem,
  query,
  resetInMemoryTables,
} from "../src/shared/utils/dynamo";

const TABLE_NAME = "wr-api-suite-question-sets";
const IDENTITY_TABLE = "wr-api-suite-identity";

function setInMemory() {
  process.env.DYNAMODB_IN_MEMORY = "1";
  resetInMemoryTables();
}

test.beforeEach(() => {
  setInMemory();
});

test("putItem/getItem round trips identity payload in memory", async () => {
  const payload = { foo: "bar" };
  await putItem({
    TableName: IDENTITY_TABLE,
    Item: {
      pk: "IDENTITY",
      sk: "STORE",
      payload,
      updatedAt: "2024-01-01T00:00:00.000Z",
    },
  });
  const result = await getItem({
    TableName: IDENTITY_TABLE,
    Key: { pk: "IDENTITY", sk: "STORE" },
  });
  assert.deepEqual(result.Item?.payload, payload);
});

test("updateItem mutates attributes for in-memory entries", async () => {
  await putItem({
    TableName: IDENTITY_TABLE,
    Item: {
      pk: "IDENTITY",
      sk: "STORE",
      payload: {},
      updatedAt: "2024-01-01T00:00:00.000Z",
    },
  });
  await updateItem({
    TableName: IDENTITY_TABLE,
    Key: { pk: "IDENTITY", sk: "STORE" },
    UpdateExpression: "SET updatedAt = :ts",
    ExpressionAttributeValues: { ":ts": "2024-01-02T00:00:00.000Z" },
  });
  const result = await getItem({
    TableName: IDENTITY_TABLE,
    Key: { pk: "IDENTITY", sk: "STORE" },
  });
  assert.equal(result.Item?.updatedAt, "2024-01-02T00:00:00.000Z");
});

test("query respects begins_with and filter expressions", async () => {
  await putItem({
    TableName: TABLE_NAME,
    Item: {
      pk: "ORG#1",
      sk: "QSET#qs-1",
      questionSetId: "qs-1",
      title: "First",
    },
  });
  await putItem({
    TableName: TABLE_NAME,
    Item: {
      pk: "ORG#1",
      sk: "QA#qs-1#snippet-1",
      questionSetId: "qs-1",
      snippetIndexPk: "SNIPPET#1#snippet-1",
      updatedAt: "2024-01-01T00:00:00.000Z",
    },
  });
  await putItem({
    TableName: TABLE_NAME,
    Item: {
      pk: "ORG#1",
      sk: "QA#qs-2#snippet-2",
      questionSetId: "qs-2",
      snippetIndexPk: "SNIPPET#1#snippet-2",
      updatedAt: "2024-01-02T00:00:00.000Z",
      deletedAt: "2024-01-03T00:00:00.000Z",
    },
  });

  const questionSets = await query({
    TableName: TABLE_NAME,
    KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
    ExpressionAttributeValues: { ":pk": "ORG#1", ":prefix": "QA#qs-" },
    FilterExpression: "attribute_not_exists(deletedAt)",
  });
  assert.equal(questionSets.Items.length, 1);
  assert.equal((questionSets.Items[0] as any).questionSetId, "qs-1");

  const bySnippet = await query({
    TableName: TABLE_NAME,
    IndexName: "questionSetsBySnippet",
    KeyConditionExpression: "snippetIndexPk = :pk",
    ExpressionAttributeValues: { ":pk": "SNIPPET#1#snippet-1" },
    FilterExpression: "attribute_not_exists(deletedAt)",
  });
  assert.equal(bySnippet.Items.length, 1);
  assert.equal((bySnippet.Items[0] as any).sk, "QA#qs-1#snippet-1");
});

test("deleteItem removes entries from in-memory tables", async () => {
  await putItem({
    TableName: IDENTITY_TABLE,
    Item: {
      pk: "IDENTITY",
      sk: "STORE",
      payload: {},
      updatedAt: "2024-01-01T00:00:00.000Z",
    },
  });
  await deleteItem({
    TableName: IDENTITY_TABLE,
    Key: { pk: "IDENTITY", sk: "STORE" },
  });
  const result = await getItem({
    TableName: IDENTITY_TABLE,
    Key: { pk: "IDENTITY", sk: "STORE" },
  });
  assert.equal(result.Item, undefined);
});
