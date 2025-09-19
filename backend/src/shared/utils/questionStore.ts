import {
  QAResult,
  QuestionSet,
  QuestionSetActor,
  QuestionSetStatus,
} from "../types/Questions";
import {
  getItem,
  putItem,
  query,
  updateItem,
  QUESTION_SETS_TABLE_NAME,
  QUESTION_SETS_SNIPPET_GSI_NAME,
  DynamoItem,
} from "./dynamo";

type StoredQuestionSet = Omit<QuestionSet, "qaResults">;

const ENTITY_TYPE_QUESTION_SET = "QUESTION_SET";
const ENTITY_TYPE_QA_RESULT = "QA_RESULT";
const ORG_KEY_PREFIX = "ORG#";
const QUESTION_SET_PREFIX = "QSET#";
const QA_PREFIX = "QA#";
const SNIPPET_PREFIX = "SNIPPET#";

interface QuestionSetItem extends DynamoItem {
  pk: string;
  sk: string;
  entityType: typeof ENTITY_TYPE_QUESTION_SET;
  orgId: string;
  questionSetId: string;
  title: string;
  status: QuestionSetStatus;
  createdAt: string;
  updatedAt: string;
  finalizedAt: string | null;
  questionCount: number;
  payload: StoredQuestionSet;
  deletedAt?: string;
}

interface QaResultItem extends DynamoItem {
  pk: string;
  sk: string;
  entityType: typeof ENTITY_TYPE_QA_RESULT;
  orgId: string;
  questionSetId: string;
  snippetId: string;
  createdAt: string;
  updatedAt: string;
  payload: QAResult;
  snippetIndexPk: string;
  deletedAt?: string;
}

function orgPartitionKey(orgId: string): string {
  return `${ORG_KEY_PREFIX}${orgId}`;
}

function questionSetSortKey(questionSetId: string): string {
  return `${QUESTION_SET_PREFIX}${questionSetId}`;
}

function qaResultSortKey(questionSetId: string, snippetId: string): string {
  return `${QA_PREFIX}${questionSetId}#${snippetId}`;
}

function snippetIndexPartitionKey(orgId: string, snippetId: string): string {
  return `${SNIPPET_PREFIX}${orgId}#${snippetId}`;
}

function cloneRecord<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

async function queryAllItems(input: {
  TableName: string;
  KeyConditionExpression: string;
  ExpressionAttributeValues: Record<string, any>;
  ExpressionAttributeNames?: Record<string, string>;
  IndexName?: string;
  FilterExpression?: string;
}): Promise<DynamoItem[]> {
  const items: DynamoItem[] = [];
  let lastKey: DynamoItem | undefined;
  do {
    const result = await query({
      TableName: input.TableName,
      KeyConditionExpression: input.KeyConditionExpression,
      ExpressionAttributeValues: input.ExpressionAttributeValues,
      ExpressionAttributeNames: input.ExpressionAttributeNames,
      IndexName: input.IndexName,
      FilterExpression: input.FilterExpression,
      ExclusiveStartKey: lastKey,
    });
    if (result.Items) {
      items.push(...result.Items);
    }
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

async function loadQuestionSetRecord(
  orgId: string,
  id: string,
): Promise<StoredQuestionSet> {
  const result = await getItem({
    TableName: QUESTION_SETS_TABLE_NAME,
    Key: {
      pk: orgPartitionKey(orgId),
      sk: questionSetSortKey(id),
    },
    ConsistentRead: true,
  });
  if (!result.Item) {
    throw new Error("Question set with id " + id + " not found");
  }
  const item = result.Item as QuestionSetItem;
  if (item.deletedAt) {
    throw new Error("Question set with id " + id + " not found");
  }
  return cloneRecord(item.payload);
}

async function writeQuestionSetRecord(
  orgId: string,
  record: StoredQuestionSet,
): Promise<void> {
  const item: QuestionSetItem = {
    pk: orgPartitionKey(orgId),
    sk: questionSetSortKey(record.id),
    entityType: ENTITY_TYPE_QUESTION_SET,
    orgId,
    questionSetId: record.id,
    title: record.title,
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    finalizedAt: record.finalizedAt,
    questionCount: record.questions.length,
    payload: cloneRecord(record),
  };
  await putItem({
    TableName: QUESTION_SETS_TABLE_NAME,
    Item: item,
  });
}

function toQuestionSet(item: QuestionSetItem, qaResults: QAResult[]): QuestionSet {
  return {
    ...cloneRecord(item.payload),
    qaResults,
  };
}

export async function loadQuestionSet(
  orgId: string,
  id: string,
): Promise<QuestionSet> {
  if (!id) {
    throw new Error("No question set ID provided");
  }
  const record = await loadQuestionSetRecord(orgId, id);
  const qaResults = await listQaResults(orgId, { questionSetId: record.id });
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
  const qaResultsByQuestionSetId = qaResults.reduce<Record<string, number>>(
    (acc, result) => {
      acc[result.questionSetId] = (acc[result.questionSetId] || 0) + 1;
      return acc;
    },
    {},
  );

  const items = await queryAllItems({
    TableName: QUESTION_SETS_TABLE_NAME,
    KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
    ExpressionAttributeValues: {
      ":pk": orgPartitionKey(orgId),
      ":prefix": QUESTION_SET_PREFIX,
    },
    FilterExpression: "attribute_not_exists(deletedAt)",
  });

  const mapped = (items as QuestionSetItem[]).map((item) => ({
    id: item.questionSetId,
    title: item.title,
    date: new Date(item.updatedAt),
    questionCount: item.questionCount,
    snippetCount: qaResultsByQuestionSetId[item.questionSetId] || 0,
    status: item.status,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    finalizedAt: item.finalizedAt,
  }));

  if (titleFilter) {
    const filterLower = titleFilter.toLowerCase();
    return mapped.filter((item) =>
      item.title.toLowerCase().includes(filterLower),
    );
  }

  return mapped;
}

export async function updateQuestionSet(
  orgId: string,
  id: string,
  mutate: (
    record: StoredQuestionSet,
  ) => StoredQuestionSet | Promise<StoredQuestionSet>,
): Promise<QuestionSet> {
  const current = await loadQuestionSetRecord(orgId, id);
  const draft = cloneRecord(current);
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
  const result = await getItem({
    TableName: QUESTION_SETS_TABLE_NAME,
    Key: {
      pk: orgPartitionKey(orgId),
      sk: qaResultSortKey(questionSetId, snippetId),
    },
    ConsistentRead: true,
  });
  if (!result.Item) return null;
  const item = result.Item as QaResultItem;
  if (item.deletedAt) return null;
  return cloneRecord(item.payload);
};

export const saveQaResult = async (
  orgId: string,
  qaResult: QAResult,
): Promise<void> => {
  const timestamp = new Date().toISOString();
  const item: QaResultItem = {
    pk: orgPartitionKey(orgId),
    sk: qaResultSortKey(qaResult.questionSetId, qaResult.snippetId),
    entityType: ENTITY_TYPE_QA_RESULT,
    orgId,
    questionSetId: qaResult.questionSetId,
    snippetId: qaResult.snippetId,
    createdAt: timestamp,
    updatedAt: timestamp,
    payload: cloneRecord(qaResult),
    snippetIndexPk: snippetIndexPartitionKey(orgId, qaResult.snippetId),
  };
  await putItem({
    TableName: QUESTION_SETS_TABLE_NAME,
    Item: item,
  });
};

export const listQaResults = async (
  orgId: string,
  params: {
    questionSetId?: string;
    snippetId?: string;
  } = {},
): Promise<QAResult[]> => {
  const { questionSetId, snippetId } = params;

  if (snippetId) {
    const items = await queryAllItems({
      TableName: QUESTION_SETS_TABLE_NAME,
      KeyConditionExpression: "snippetIndexPk = :pk",
      ExpressionAttributeValues: {
        ":pk": snippetIndexPartitionKey(orgId, snippetId),
        ...(questionSetId ? { ":qs": questionSetId } : {}),
      },
      FilterExpression: questionSetId
        ? "questionSetId = :qs AND attribute_not_exists(deletedAt)"
        : "attribute_not_exists(deletedAt)",
      IndexName: QUESTION_SETS_SNIPPET_GSI_NAME,
    });
    return (items as QaResultItem[])\n      .filter((item) => !item.deletedAt)\n      .map((item) => cloneRecord(item.payload));
  }

  const prefix = questionSetId ? `${QA_PREFIX}${questionSetId}#` : QA_PREFIX;
  const items = await queryAllItems({
    TableName: QUESTION_SETS_TABLE_NAME,
    KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
    ExpressionAttributeValues: {
      ":pk": orgPartitionKey(orgId),
      ":prefix": prefix,
    },
    FilterExpression: "attribute_not_exists(deletedAt)",
  });

  return (items as QaResultItem[])
    .filter((item) => !item.deletedAt)
    .map((item) => cloneRecord(item.payload));
};

export async function softDeleteQuestionSet(
  orgId: string,
  id: string,
): Promise<void> {
  const timestamp = new Date().toISOString();
  await updateItem({
    TableName: QUESTION_SETS_TABLE_NAME,
    Key: {
      pk: orgPartitionKey(orgId),
      sk: questionSetSortKey(id),
    },
    UpdateExpression: "SET deletedAt = :timestamp",
    ExpressionAttributeValues: {
      ":timestamp": timestamp,
    },
  });

  const qaResults = await listQaResults(orgId, { questionSetId: id });
  await Promise.all(
    qaResults.map((result) =>
      updateItem({
        TableName: QUESTION_SETS_TABLE_NAME,
        Key: {
          pk: orgPartitionKey(orgId),
          sk: qaResultSortKey(id, result.snippetId),
        },
        UpdateExpression: "SET deletedAt = :timestamp",
        ExpressionAttributeValues: {
          ":timestamp": timestamp,
        },
      }),
    ),
  );
}
