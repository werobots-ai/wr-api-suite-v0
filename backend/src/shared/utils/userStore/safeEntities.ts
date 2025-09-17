import {
  KeySet,
  Organization,
  StoredApiKey,
  UsageEntry,
  UserAccount,
} from "../../types/Identity";
import { cloneProductConfig } from "../../types/Products";
import { maskFromLastFour } from "./helpers";

export interface SafeEntityOptions {
  maskCosts?: boolean;
}

function toSafeUsageEntry(
  entry: UsageEntry,
  options: SafeEntityOptions = {},
) {
  return {
    ...entry,
    tokenCost: options.maskCosts ? null : entry.tokenCost,
  };
}

export function toSafeKey(
  set: StoredApiKey,
  options: SafeEntityOptions = {},
) {
  return {
    id: set.id,
    maskedKey: maskFromLastFour(set.lastFour),
    lastFour: set.lastFour,
    lastRotated: set.lastRotated,
    lastAccessed: set.lastAccessed ?? null,
    usage: set.usage.map((entry) => toSafeUsageEntry(entry, options)),
    createdAt: set.createdAt,
    createdBy: set.createdBy,
  };
}

export function toSafeKeySet(
  set: KeySet,
  options: SafeEntityOptions = {},
) {
  return {
    id: set.id,
    name: set.name,
    description: set.description,
    createdAt: set.createdAt,
    createdBy: set.createdBy,
    keys: set.keys.map((key) => toSafeKey(key, options)),
    products: set.products.map((product) => cloneProductConfig(product)),
  };
}

export function toSafeOrganization(
  org: Organization,
  options: SafeEntityOptions = {},
) {
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    credits: org.credits,
    isMaster: org.isMaster,
    usage: org.usage.map((entry) => toSafeUsageEntry(entry, options)),
    keySets: org.keySets.map((set) => toSafeKeySet(set, options)),
    billingProfile: org.billingProfile,
    members: org.members.map((member) => ({
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
    createdAt: org.createdAt,
    createdBy: org.createdBy,
  };
}

export function toSafeUser(user: UserAccount) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    globalRoles: user.globalRoles,
    organizations: user.organizations.map((link) => ({
      ...link,
      productAccess: link.productAccess.map((config) =>
        cloneProductConfig(config),
      ),
    })),
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
    status: user.status,
  };
}

export function maskKey(lastFour: string): string {
  return maskFromLastFour(lastFour);
}
