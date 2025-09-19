import type { IdentityStoreData, KeySet } from "../../../types/Identity";
import { createStoredKeyFromPlain, generatePlainApiKey } from "../apiKeys";
import { loadIdentity, saveIdentity } from "../persistence";
import { toSafeKey, type SafeEntityOptions } from "../safeEntities";

export async function rotateApiKey(
  orgId: string,
  setId: string,
  index: number,
  actorId: string,
  options: SafeEntityOptions = {},
): Promise<{ apiKey: string; safeKey: ReturnType<typeof toSafeKey> }> {
  const store = await loadIdentity();
  const keySet = findKeySet(store, orgId, setId);
  validateIndex(index, keySet.keys.length);
  const apiKey = generatePlainApiKey();
  const stored = createStoredKeyFromPlain(apiKey, actorId);
  keySet.keys[index] = stored;
  await saveIdentity(store);
  return { apiKey, safeKey: toSafeKey(stored, options) };
}

function findKeySet(
  store: IdentityStoreData,
  orgId: string,
  setId: string,
): KeySet {
  const organization = store.organizations[orgId];
  if (!organization) throw new Error("Organization not found");
  const keySet = organization.keySets.find((set) => set.id === setId);
  if (!keySet) throw new Error("Key set not found");
  return keySet;
}

function validateIndex(index: number, length: number): void {
  if (index < 0 || index >= length) {
    throw new Error("Invalid key index");
  }
}
