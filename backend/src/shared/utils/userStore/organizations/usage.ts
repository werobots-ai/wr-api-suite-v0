import type { Organization, UsageEntry } from "../../../types/Identity";
import { loadIdentity, saveIdentity } from "../persistence";
import { now } from "../time";

type UsageParams = {
  orgId: string;
  tokenCost: number;
  billedCost: number;
  action: string;
  requests?: number;
  keySetId?: string;
  keyId?: string;
  metadata?: Record<string, unknown>;
  userId?: string;
};

export async function recordUsage(params: UsageParams): Promise<void> {
  const store = await loadIdentity();
  const organization = store.organizations[params.orgId];
  if (!organization) throw new Error("Organization not found");
  const entry = buildUsageEntry(params);
  applyOrganizationUsage(organization, entry, params.billedCost);
  applyUserUsage(organization, entry, params.userId);
  applyKeyUsage(organization, entry, params.keySetId, params.keyId);
  await saveIdentity(store);
}

function buildUsageEntry(params: UsageParams): UsageEntry {
  return {
    timestamp: now(),
    action: params.action,
    tokenCost: params.tokenCost,
    billedCost: params.billedCost,
    requests: params.requests ?? 0,
    metadata: params.metadata,
  };
}

function applyOrganizationUsage(
  organization: Organization,
  entry: UsageEntry,
  billedCost: number,
): void {
  organization.credits -= billedCost;
  organization.usage.push(entry);
}

function applyUserUsage(
  organization: Organization,
  entry: UsageEntry,
  userId: string | undefined,
): void {
  if (!userId) return;
  const membership = organization.members.find(
    (member) => member.userId === userId,
  );
  if (!membership) return;
  if (!Array.isArray(membership.usage)) {
    membership.usage = [];
  }
  membership.usage.push(entry);
  membership.lastAccessed = entry.timestamp;
}

function applyKeyUsage(
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
