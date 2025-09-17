import { v4 as uuid } from "uuid";

import {
  GlobalRole,
  Organization,
  UsageEntry,
  UserAccount,
} from "../../types/Identity";
import { cloneProductConfig } from "../../types/Products";
import { createDefaultKeySet, revealStoredKey } from "./apiKeys";
import { createPasswordHash } from "./passwords";
import { loadIdentity, saveIdentity } from "./persistence";
import { slugify } from "./helpers";
import { now } from "./time";
import { getUserByEmail } from "./users";
import { normalizeProductConfigs } from "./productConfig";

export async function getOrganizations(): Promise<Organization[]> {
  const store = await loadIdentity();
  return Object.values(store.organizations);
}

export async function getOrganization(
  orgId: string,
): Promise<Organization | null> {
  const store = await loadIdentity();
  return store.organizations[orgId] || null;
}

export async function createOrganizationWithOwner(
  params: {
    organizationName: string;
    ownerEmail: string;
    ownerName: string;
    ownerPassword: string;
    billingEmail?: string;
  },
  options: {
    isMaster?: boolean;
    ownerGlobalRoles?: GlobalRole[];
    markBootstrapComplete?: boolean;
  } = {},
): Promise<{
  organization: Organization;
  owner: UserAccount;
  apiKeys: string[];
}> {
  const store = await loadIdentity();
  const existing = await getUserByEmail(params.ownerEmail);
  if (existing) {
    throw new Error("User with this email already exists");
  }

  const orgId = uuid();
  const ownerId = uuid();
  const created = now();

  const keySet = createDefaultKeySet(ownerId);
  const defaultProductAccess = normalizeProductConfigs(null, {
    ensureDocument: true,
  });
  const ownerProductAccess = defaultProductAccess.map((config) =>
    cloneProductConfig(config),
  );

  const owner: UserAccount = {
    id: ownerId,
    email: params.ownerEmail,
    name: params.ownerName,
    passwordHash: createPasswordHash(params.ownerPassword),
    globalRoles: options.ownerGlobalRoles ?? [],
    organizations: [
      {
        orgId,
        roles: ["OWNER", "ADMIN", "BILLING"],
        productAccess: ownerProductAccess.map((config) =>
          cloneProductConfig(config),
        ),
      },
    ],
    createdAt: created,
    status: "active",
  };

  const organization: Organization = {
    id: orgId,
    name: params.organizationName,
    slug: slugify(params.organizationName),
    credits: 0,
    usage: [],
    keySets: [keySet],
    members: [
      {
        userId: ownerId,
        roles: ["OWNER", "ADMIN", "BILLING"],
        invitedAt: created,
        joinedAt: created,
        status: "active",
        productAccess: ownerProductAccess.map((config) =>
          cloneProductConfig(config),
        ),
      },
    ],
    billingProfile: {
      contactEmail: params.billingEmail || params.ownerEmail,
      contactName: params.ownerName,
    },
    createdAt: created,
    createdBy: ownerId,
    isMaster: Boolean(options.isMaster),
  };

  store.users[ownerId] = owner;
  store.organizations[orgId] = organization;
  if (options.markBootstrapComplete) {
    store.metadata.bootstrapCompletedAt = now();
  }
  await saveIdentity(store);

  const apiKeys = keySet.keys.map((key) => revealStoredKey(key));

  return { organization, owner, apiKeys };
}

export async function setOrganizationMasterStatus(
  orgId: string,
  isMaster: boolean,
): Promise<Organization> {
  const store = await loadIdentity();
  const org = store.organizations[orgId];
  if (!org) {
    throw new Error("Organization not found");
  }
  org.isMaster = isMaster;
  await saveIdentity(store);
  return org;
}

export async function userHasMasterOrgAccess(userId: string): Promise<boolean> {
  const store = await loadIdentity();
  return Object.values(store.organizations).some((org) =>
    org.isMaster
      ? org.members.some(
          (member) =>
            member.userId === userId &&
            member.status === "active" &&
            member.roles.includes("OWNER"),
        )
      : false,
  );
}

export async function topUpOrganization(
  orgId: string,
  amount: number,
): Promise<Organization> {
  const store = await loadIdentity();
  const org = store.organizations[orgId];
  if (!org) throw new Error("Organization not found");
  org.credits += amount;
  const entry: UsageEntry = {
    timestamp: now(),
    action: "topup",
    tokenCost: 0,
    billedCost: -amount,
    requests: 0,
  };
  org.usage.push(entry);
  await saveIdentity(store);
  return org;
}

export async function recordUsage(params: {
  orgId: string;
  tokenCost: number;
  billedCost: number;
  action: string;
  requests?: number;
  keySetId?: string;
  keyId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const store = await loadIdentity();
  const org = store.organizations[params.orgId];
  if (!org) throw new Error("Organization not found");
  org.credits -= params.billedCost;
  const entry: UsageEntry = {
    timestamp: now(),
    action: params.action,
    tokenCost: params.tokenCost,
    billedCost: params.billedCost,
    requests: params.requests ?? 0,
    metadata: params.metadata,
  };
  org.usage.push(entry);

  if (params.keySetId && params.keyId) {
    const keySet = org.keySets.find((ks) => ks.id === params.keySetId);
    const key = keySet?.keys.find((k) => k.id === params.keyId);
    if (key) {
      key.usage.push(entry);
      key.lastAccessed = entry.timestamp;
    }
  }

  await saveIdentity(store);
}
