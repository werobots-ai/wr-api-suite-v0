import { IdentityStoreData } from "../../types/Identity";
import { createBootstrapIdentity } from "./bootstrap";
import {
  applyStoreSideEffects,
  normalizeIdentity,
  syncInternalOrgIds,
} from "./identityNormalization";
import {
  getItem,
  putItem,
  IDENTITY_TABLE_NAME,
} from "../dynamo";

const IDENTITY_PK = "IDENTITY";
const IDENTITY_SK = "STORE";

type IdentityItem = {
  pk: string;
  sk: string;
  payload: IdentityStoreData;
  updatedAt: string;
};

async function readIdentity(): Promise<IdentityStoreData | null> {
  const result = await getItem({
    TableName: IDENTITY_TABLE_NAME,
    Key: {
      pk: IDENTITY_PK,
      sk: IDENTITY_SK,
    },
    ConsistentRead: true,
  });
  if (!result.Item) {
    return null;
  }
  const item = result.Item as IdentityItem;
  return item.payload;
}

async function writeIdentity(store: IdentityStoreData): Promise<void> {
  const now = new Date().toISOString();
  const payload = normalizeIdentity(store);
  await putItem({
    TableName: IDENTITY_TABLE_NAME,
    Item: {
      pk: IDENTITY_PK,
      sk: IDENTITY_SK,
      payload,
      updatedAt: now,
    },
  });
  syncInternalOrgIds(payload.organizations);
}

export async function saveIdentity(store: IdentityStoreData): Promise<void> {
  await writeIdentity(store);
}

export async function loadIdentity(): Promise<IdentityStoreData> {
  const existing = await readIdentity();
  if (existing) {
    return applyStoreSideEffects(existing);
  }

  const bootstrap = await createBootstrapIdentity();
  await writeIdentity(bootstrap);
  return applyStoreSideEffects(bootstrap);
}

export async function getIdentityStore(): Promise<IdentityStoreData> {
  return loadIdentity();
}
