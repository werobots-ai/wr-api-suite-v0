import type { Organization, UsageEntry } from "../../../../types/Identity";

function findMembership(
  organization: Organization,
  userId: string,
) {
  return organization.members.find((member) => member.userId === userId);
}

function ensureMemberUsage(membership: NonNullable<ReturnType<typeof findMembership>>): void {
  if (!Array.isArray(membership.usage)) {
    membership.usage = [];
  }
  if (membership.lastAccessed === undefined) {
    membership.lastAccessed = null;
  }
}

export function applyMemberUsage(
  organization: Organization,
  entry: UsageEntry,
  userId: string | undefined,
): void {
  if (!userId) return;
  const membership = findMembership(organization, userId);
  if (!membership) return;
  ensureMemberUsage(membership);
  membership.usage.push(entry);
  membership.lastAccessed = entry.timestamp;
}
