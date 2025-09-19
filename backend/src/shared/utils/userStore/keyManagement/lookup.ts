import type {
  KeySet,
  Organization,
  StoredApiKey,
} from "../../../types/Identity";
import { hashApiKey } from "../crypto";
import { loadIdentity, saveIdentity } from "../persistence";
import { now } from "../time";

type LookupResult = {
  organization: Organization;
  keySet: KeySet;
  key: StoredApiKey;
};

type LookupOptions = {
  recordAccess?: boolean;
};

export async function findOrgByApiKey(
  apiKey: string,
  options: LookupOptions = {},
): Promise<LookupResult | null> {
  const store = await loadIdentity();
  const hash = hashApiKey(apiKey);
  for (const organization of Object.values(store.organizations)) {
    const match = findMatch(organization, hash);
    if (match) {
      if (options.recordAccess) {
        match.key.lastAccessed = now();
        await saveIdentity(store);
      }
      return match;
    }
  }
  return null;
}

function findMatch(
  organization: Organization,
  hash: string,
): LookupResult | null {
  for (const keySet of organization.keySets) {
    const key = keySet.keys.find((candidate) => candidate.keyHash === hash);
    if (key) {
      return { organization, keySet, key };
    }
  }
  return null;
}
