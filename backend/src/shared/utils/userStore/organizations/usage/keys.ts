import type { Organization, UsageEntry } from "../../../../types/Identity";

export function applyKeyUsage(
  organization: Organization,
  entry: UsageEntry,
  keySetId: string | undefined,
  keyId: string | undefined,
): void {
  if (!keySetId || !keyId) return;
  const keySet = organization.keySets.find((set) => set.id === keySetId);
  const key = keySet?.keys.find((stored) => stored.id === keyId);
  if (!key) return;
  key.usage.push(entry);
  key.lastAccessed = entry.timestamp;
}
