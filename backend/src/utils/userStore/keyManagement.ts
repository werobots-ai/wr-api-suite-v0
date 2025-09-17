import { v4 as uuid } from "uuid";

import {
  KeySet,
  Organization,
  StoredApiKey,
} from "../types/Identity";
import { createStoredKeyFromPlain, generatePlainApiKey } from "./apiKeys";
import { hashApiKey } from "./crypto";
import { loadIdentity, saveIdentity } from "./persistence";
import {
  SafeEntityOptions,
  toSafeKey,
  toSafeKeySet,
} from "./safeEntities";
import { now } from "./time";

export async function addKeySet(
  orgId: string,
  actorId: string,
  name: string,
  description: string,
  options: SafeEntityOptions = {},
): Promise<{
  keySet: ReturnType<typeof toSafeKeySet>;
  revealedKeys: string[];
}> {
  const store = await loadIdentity();
  const org = store.organizations[orgId];
  if (!org) throw new Error("Organization not found");
  const createdAt = now();
  const keyAPlain = generatePlainApiKey();
  const keyBPlain = generatePlainApiKey();
  const keySet: KeySet = {
    id: uuid(),
    name,
    description,
    keys: [
      createStoredKeyFromPlain(keyAPlain, actorId),
      createStoredKeyFromPlain(keyBPlain, actorId),
    ],
    createdAt,
    createdBy: actorId,
  };
  org.keySets.push(keySet);
  await saveIdentity(store);
  return {
    keySet: toSafeKeySet(keySet, options),
    revealedKeys: [keyAPlain, keyBPlain],
  };
}

export async function removeKeySet(
  orgId: string,
  setId: string,
): Promise<void> {
  const store = await loadIdentity();
  const org = store.organizations[orgId];
  if (!org) throw new Error("Organization not found");
  org.keySets = org.keySets.filter((ks) => ks.id !== setId);
  await saveIdentity(store);
}

export async function rotateApiKey(
  orgId: string,
  setId: string,
  index: number,
  actorId: string,
  options: SafeEntityOptions = {},
): Promise<{
  apiKey: string;
  safeKey: ReturnType<typeof toSafeKey>;
}> {
  const store = await loadIdentity();
  const org = store.organizations[orgId];
  if (!org) throw new Error("Organization not found");
  const keySet = org.keySets.find((ks) => ks.id === setId);
  if (!keySet) throw new Error("Key set not found");
  if (index < 0 || index >= keySet.keys.length) {
    throw new Error("Invalid key index");
  }
  const plain = generatePlainApiKey();
  const stored = createStoredKeyFromPlain(plain, actorId);
  keySet.keys[index] = stored;
  await saveIdentity(store);
  return { apiKey: plain, safeKey: toSafeKey(stored, options) };
}

export async function findOrgByApiKey(
  apiKey: string,
  options: { recordAccess?: boolean } = {},
): Promise<{
  organization: Organization;
  keySet: KeySet;
  key: StoredApiKey;
} | null> {
  const store = await loadIdentity();
  const hash = hashApiKey(apiKey);
  for (const org of Object.values(store.organizations)) {
    for (const keySet of org.keySets) {
      const key = keySet.keys.find((k) => k.keyHash === hash);
      if (key) {
        if (options.recordAccess) {
          key.lastAccessed = now();
          await saveIdentity(store);
        }
        return { organization: org, keySet, key };
      }
    }
  }
  return null;
}
