import crypto from "crypto";
import { URL } from "url";

type AttributeValue =
  | { S: string }
  | { N: string }
  | { BOOL: boolean }
  | { NULL: true }
  | { M: Record<string, AttributeValue> }
  | { L: AttributeValue[] };

type AttributeMap = Record<string, AttributeValue>;

type DynamoItem = Record<string, any>;

type BaseExpressionValues = Record<string, any> | undefined;

type BaseExpressionNames = Record<string, string> | undefined;

type CommonQueryInput = {
  TableName: string;
  IndexName?: string;
  KeyConditionExpression: string;
  FilterExpression?: string;
  ExpressionAttributeValues?: BaseExpressionValues;
  ExpressionAttributeNames?: BaseExpressionNames;
  ExclusiveStartKey?: DynamoItem;
  ScanIndexForward?: boolean;
  Limit?: number;
};

type QueryCommandInput = CommonQueryInput;

type QueryCommandOutput = {
  Items: DynamoItem[];
  Count: number;
  LastEvaluatedKey?: DynamoItem;
};

type GetItemCommandInput = {
  TableName: string;
  Key: DynamoItem;
  ConsistentRead?: boolean;
};

type GetItemCommandOutput = {
  Item?: DynamoItem;
};

type PutItemCommandInput = {
  TableName: string;
  Item: DynamoItem;
  ConditionExpression?: string;
  ExpressionAttributeValues?: BaseExpressionValues;
  ExpressionAttributeNames?: BaseExpressionNames;
};

type UpdateItemCommandInput = {
  TableName: string;
  Key: DynamoItem;
  UpdateExpression: string;
  ConditionExpression?: string;
  ExpressionAttributeValues?: BaseExpressionValues;
  ExpressionAttributeNames?: BaseExpressionNames;
};

type DeleteItemCommandInput = {
  TableName: string;
  Key: DynamoItem;
};

type UpdateItemCommandOutput = {
  Attributes?: DynamoItem;
};

type MarshallContext = {
  removeUndefinedValues: boolean;
};

const DEFAULT_REGION = process.env.AWS_REGION || "us-east-1";
const DEFAULT_ENDPOINT =
  process.env.DYNAMODB_ENDPOINT ||
  `https://dynamodb.${DEFAULT_REGION}.amazonaws.com`;

function useInMemory(): boolean {
  return process.env.DYNAMODB_IN_MEMORY === "1";
}

const memoryTables = new Map<string, Map<string, DynamoItem>>();

function cloneItem<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function deriveKey(item: DynamoItem): DynamoItem {
  if (item.pk !== undefined && item.sk !== undefined) {
    return { pk: item.pk, sk: item.sk };
  }
  if (item.pk !== undefined) {
    return { pk: item.pk };
  }
  if (item.cacheKey !== undefined) {
    return { cacheKey: item.cacheKey };
  }
  throw new Error("Unsupported key schema for in-memory Dynamo mock");
}

function memoryKey(key: DynamoItem): string {
  const normalized: Record<string, unknown> = {};
  for (const field of Object.keys(key).sort()) {
    normalized[field] = key[field];
  }
  return JSON.stringify(normalized);
}

function getMemoryTable(tableName: string): Map<string, DynamoItem> {
  let table = memoryTables.get(tableName);
  if (!table) {
    table = new Map();
    memoryTables.set(tableName, table);
  }
  return table;
}

function matchesKeyCondition(
  expression: string,
  values: Record<string, any>,
  item: DynamoItem,
): boolean {
  if (expression.includes("begins_with")) {
    return (
      item.pk === values[":pk"] &&
      typeof item.sk === "string" &&
      item.sk.startsWith(values[":prefix"])
    );
  }
  if (expression.includes("snippetIndexPk = :pk")) {
    return item.snippetIndexPk === values[":pk"];
  }
  if (expression.includes("pk = :pk")) {
    return item.pk === values[":pk"];
  }
  throw new Error(`Unsupported key condition expression: ${expression}`);
}

function passesFilter(
  expression: string | undefined,
  values: Record<string, any> | undefined,
  item: DynamoItem,
): boolean {
  if (!expression) return true;
  let result = true;
  if (expression.includes("attribute_not_exists(deletedAt)")) {
    result = result && item.deletedAt === undefined;
  }
  if (expression.includes("questionSetId = :qs")) {
    result = result && item.questionSetId === values?.[":qs"];
  }
  return result;
}

export function resetInMemoryTables(): void {
  memoryTables.clear();
}

function iso8601Timestamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(".000Z", "Z");
}

function dateStamp(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

function sha256Hex(data: string): string {
  return crypto.createHash("sha256").update(data, "utf8").digest("hex");
}

function hmac(key: crypto.BinaryLike, data: string): Buffer {
  return crypto.createHmac("sha256", key).update(data, "utf8").digest();
}

function hmacHex(key: crypto.BinaryLike, data: string): string {
  return crypto.createHmac("sha256", key).update(data, "utf8").digest("hex");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Date)
  );
}

function sanitizeValue(value: any, context: MarshallContext): any {
  if (value === undefined && context.removeUndefinedValues) {
    return undefined;
  }
  if (Array.isArray(value)) {
    const items = value
      .map((item) => sanitizeValue(item, context))
      .filter((item) => item !== undefined);
    return items;
  }
  if (isPlainObject(value)) {
    const entries = Object.entries(value)
      .map(([key, inner]) => [key, sanitizeValue(inner, context)] as const)
      .filter(([, inner]) => inner !== undefined);
    return Object.fromEntries(entries);
  }
  return value;
}

function marshallValue(value: any, context: MarshallContext): AttributeValue {
  if (value === undefined) {
    if (context.removeUndefinedValues) {
      throw new Error("Attempted to marshall undefined value");
    }
    return { NULL: true };
  }
  if (value === null) return { NULL: true };
  if (typeof value === "string") return { S: value };
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Cannot marshall non-finite numbers");
    }
    return { N: value.toString() };
  }
  if (typeof value === "boolean") return { BOOL: value };
  if (value instanceof Date) return { S: value.toISOString() };
  if (Array.isArray(value)) {
    return {
      L: value.map((item) => marshallValue(item, context)),
    };
  }
  if (isPlainObject(value)) {
    const map: Record<string, AttributeValue> = {};
    for (const [key, inner] of Object.entries(value)) {
      if (inner === undefined && context.removeUndefinedValues) continue;
      map[key] = marshallValue(inner, context);
    }
    return { M: map };
  }
  throw new Error(`Unsupported attribute type: ${typeof value}`);
}

function marshallRecord(
  item: DynamoItem,
  context: MarshallContext = { removeUndefinedValues: true },
): AttributeMap {
  const sanitized = sanitizeValue(item, context) as Record<string, unknown>;
  const result: Record<string, AttributeValue> = {};
  for (const [key, value] of Object.entries(sanitized)) {
    if (value === undefined) continue;
    result[key] = marshallValue(value, context);
  }
  return result;
}

function unmarshallValue(attribute: AttributeValue): any {
  if ("S" in attribute) return attribute.S;
  if ("N" in attribute) return Number(attribute.N);
  if ("BOOL" in attribute) return attribute.BOOL;
  if ("NULL" in attribute) return null;
  if ("L" in attribute) return attribute.L.map(unmarshallValue);
  if ("M" in attribute) {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(attribute.M)) {
      result[key] = unmarshallValue(value);
    }
    return result;
  }
  throw new Error("Unsupported attribute in unmarshall");
}

function unmarshallRecord(item: AttributeMap | undefined): DynamoItem {
  if (!item) return {};
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(item)) {
    result[key] = unmarshallValue(value);
  }
  return result;
}

async function sendDynamoRequest(target: string, body: Record<string, any>) {
  const endpoint = new URL(DEFAULT_ENDPOINT);
  const region = DEFAULT_REGION;

  const accessKeyId = process.env.AWS_ACCESS_KEY_ID || "fakeMyKeyId";
  const secretAccessKey =
    process.env.AWS_SECRET_ACCESS_KEY || "fakeSecretAccessKey";
  const sessionToken = process.env.AWS_SESSION_TOKEN;

  const method = "POST";
  const canonicalUri = endpoint.pathname || "/";
  const canonicalQueryString = "";
  const bodyString = JSON.stringify(body);
  const payloadHash = sha256Hex(bodyString);

  const now = new Date();
  const amzDate = iso8601Timestamp(now);
  const date = dateStamp(now);

  const headers: Record<string, string> = {
    "content-type": "application/x-amz-json-1.0",
    host: endpoint.host,
    "x-amz-date": amzDate,
    "x-amz-target": target,
  };
  if (sessionToken) {
    headers["x-amz-security-token"] = sessionToken;
  }

  const sortedHeaderKeys = Object.keys(headers).sort((a, b) =>
    a.localeCompare(b),
  );
  const canonicalHeaders = sortedHeaderKeys
    .map((key) => `${key}:${headers[key]}`)
    .join("\n");
  const signedHeaders = sortedHeaderKeys.join(";");

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQueryString,
    `${canonicalHeaders}\n`,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${date}/${region}/dynamodb/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const kDate = hmac(`AWS4${secretAccessKey}`, date);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, "dynamodb");
  const kSigning = hmac(kService, "aws4_request");
  const signature = hmacHex(kSigning, stringToSign);

  const authorizationHeader =
    `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  headers.authorization = authorizationHeader;

  const response = await fetch(endpoint.toString(), {
    method,
    headers,
    body: bodyString,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `DynamoDB request failed with status ${response.status}: ${text}`,
    );
  }

  const data = await response.json();
  return data;
}

export async function putItem(
  input: PutItemCommandInput,
): Promise<void> {
  if (useInMemory()) {
    const table = getMemoryTable(input.TableName);
    const sanitized = cloneItem(input.Item);
    const key = deriveKey(sanitized);
    table.set(memoryKey(key), sanitized);
    return;
  }
  const body: Record<string, any> = {
    TableName: input.TableName,
    Item: marshallRecord(input.Item),
  };
  if (input.ConditionExpression) {
    body.ConditionExpression = input.ConditionExpression;
  }
  if (input.ExpressionAttributeValues) {
    body.ExpressionAttributeValues = marshallRecord(
      input.ExpressionAttributeValues,
    );
  }
  if (input.ExpressionAttributeNames) {
    body.ExpressionAttributeNames = input.ExpressionAttributeNames;
  }
  await sendDynamoRequest("DynamoDB_20120810.PutItem", body);
}

export async function getItem(
  input: GetItemCommandInput,
): Promise<GetItemCommandOutput> {
  if (useInMemory()) {
    const table = getMemoryTable(input.TableName);
    const stored = table.get(memoryKey(input.Key));
    return {
      Item: stored ? cloneItem(stored) : undefined,
    };
  }
  const body: Record<string, any> = {
    TableName: input.TableName,
    Key: marshallRecord(input.Key),
  };
  if (input.ConsistentRead) {
    body.ConsistentRead = true;
  }
  const result = await sendDynamoRequest("DynamoDB_20120810.GetItem", body);
  return {
    Item: result.Item ? unmarshallRecord(result.Item) : undefined,
  };
}

export async function deleteItem(input: DeleteItemCommandInput): Promise<void> {
  if (useInMemory()) {
    const table = getMemoryTable(input.TableName);
    table.delete(memoryKey(input.Key));
    return;
  }
  const body: Record<string, any> = {
    TableName: input.TableName,
    Key: marshallRecord(input.Key),
  };
  await sendDynamoRequest("DynamoDB_20120810.DeleteItem", body);
}

export async function updateItem(
  input: UpdateItemCommandInput,
): Promise<UpdateItemCommandOutput> {
  if (useInMemory()) {
    const table = getMemoryTable(input.TableName);
    const key = memoryKey(input.Key);
    const current = table.get(key);
    if (!current) {
      throw new Error("In-memory Dynamo mock could not find item to update");
    }
    const clone = cloneItem(current);
    const match = input.UpdateExpression.match(/SET\s+([a-zA-Z0-9_]+)\s*=\s*(:[a-zA-Z0-9_]+)/);
    if (!match) {
      throw new Error(
        `In-memory Dynamo mock cannot handle update expression: ${input.UpdateExpression}`,
      );
    }
    const [, attribute, valueKey] = match;
    const values = input.ExpressionAttributeValues || {};
    if (!(valueKey in values)) {
      throw new Error(`Missing expression value ${valueKey} for in-memory update`);
    }
    clone[attribute] = values[valueKey];
    table.set(key, clone);
    return { Attributes: cloneItem(clone) };
  }
  const body: Record<string, any> = {
    TableName: input.TableName,
    Key: marshallRecord(input.Key),
    UpdateExpression: input.UpdateExpression,
  };
  if (input.ConditionExpression) {
    body.ConditionExpression = input.ConditionExpression;
  }
  if (input.ExpressionAttributeValues) {
    body.ExpressionAttributeValues = marshallRecord(
      input.ExpressionAttributeValues,
    );
  }
  if (input.ExpressionAttributeNames) {
    body.ExpressionAttributeNames = input.ExpressionAttributeNames;
  }
  const result = await sendDynamoRequest("DynamoDB_20120810.UpdateItem", body);
  return {
    Attributes: result.Attributes ? unmarshallRecord(result.Attributes) : undefined,
  };
}

export async function query(
  input: QueryCommandInput,
): Promise<QueryCommandOutput> {
  if (useInMemory()) {
    const table = getMemoryTable(input.TableName);
    const values = input.ExpressionAttributeValues || {};
    const items = Array.from(table.values()).filter((item) =>
      matchesKeyCondition(input.KeyConditionExpression, values, item),
    );
    const filtered = items.filter((item) =>
      passesFilter(input.FilterExpression, values, item),
    );
    return {
      Items: filtered.map((item) => cloneItem(item)),
      Count: filtered.length,
    };
  }
  const body: Record<string, any> = {
    TableName: input.TableName,
    KeyConditionExpression: input.KeyConditionExpression,
  };
  if (input.IndexName) body.IndexName = input.IndexName;
  if (input.FilterExpression) body.FilterExpression = input.FilterExpression;
  if (input.ExpressionAttributeValues) {
    body.ExpressionAttributeValues = marshallRecord(
      input.ExpressionAttributeValues,
    );
  }
  if (input.ExpressionAttributeNames) {
    body.ExpressionAttributeNames = input.ExpressionAttributeNames;
  }
  if (input.ExclusiveStartKey) {
    body.ExclusiveStartKey = marshallRecord(input.ExclusiveStartKey);
  }
  if (input.ScanIndexForward !== undefined) {
    body.ScanIndexForward = input.ScanIndexForward;
  }
  if (input.Limit !== undefined) {
    body.Limit = input.Limit;
  }

  const result = await sendDynamoRequest("DynamoDB_20120810.Query", body);
  return {
    Items: Array.isArray(result.Items)
      ? result.Items.map((item: AttributeMap) => unmarshallRecord(item))
      : [],
    Count: result.Count || 0,
    LastEvaluatedKey: result.LastEvaluatedKey
      ? unmarshallRecord(result.LastEvaluatedKey)
      : undefined,
  };
}

export function tableNameFromEnv(
  envName: string,
  fallback: string,
): string {
  return process.env[envName] || fallback;
}

export type { DynamoItem };
