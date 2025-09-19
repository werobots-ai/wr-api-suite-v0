import type { Organization } from "../../../types/Identity";
import { cloneProductConfig } from "../../../types/Products";
import type { SafeEntityOptions } from "./options";
import { toSafeKeySet } from "./keySets";
import { toSafeUsageEntry } from "./usage";

export function toSafeOrganization(
  organization: Organization,
  options: SafeEntityOptions = {},
) {
  return {
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    credits: organization.credits,
    isMaster: organization.isMaster,
    usage: organization.usage.map((entry) => toSafeUsageEntry(entry, options)),
    keySets: organization.keySets.map((set) => toSafeKeySet(set, options)),
    billingProfile: organization.billingProfile,
    members: organization.members.map((member) => ({
      userId: member.userId,
      roles: member.roles,
      invitedAt: member.invitedAt,
      joinedAt: member.joinedAt,
      status: member.status,
      productAccess: member.productAccess.map((config) =>
        cloneProductConfig(config),
      ),
      usage: (member.usage ?? []).map((entry) =>
        toSafeUsageEntry(entry, options),
      ),
      lastAccessed: member.lastAccessed ?? null,
    })),
    createdAt: organization.createdAt,
    createdBy: organization.createdBy,
  };
}
