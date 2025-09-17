import { v4 as uuid } from "uuid";

import {
  IdentityStoreData,
  Organization,
  UserAccount,
} from "../../types/Identity";
import { createDefaultKeySet } from "./apiKeys";
import { createPasswordHash } from "./passwords";
import { slugify } from "./helpers";
import { now } from "./time";

export async function createBootstrapIdentity(): Promise<IdentityStoreData> {
  const orgId = uuid();
  const ownerId = uuid();
  const sysAdminId = uuid();
  const created = now();

  const owner: UserAccount = {
    id: ownerId,
    email: "owner@example.com",
    name: "Default Org Owner",
    passwordHash: createPasswordHash("owner"),
    globalRoles: [],
    organizations: [{ orgId, roles: ["OWNER", "ADMIN", "BILLING"] }],
    createdAt: created,
    status: "active",
  };

  const sysAdmin: UserAccount = {
    id: sysAdminId,
    email: "sysadmin@werobots.dev",
    name: "WR SysAdmin",
    passwordHash: createPasswordHash("sysadmin"),
    globalRoles: ["SYSADMIN"],
    organizations: [],
    createdAt: created,
    status: "active",
  };

  const organization: Organization = {
    id: orgId,
    name: "Default Organization",
    slug: slugify("Default Organization"),
    credits: 0,
    usage: [],
    keySets: [createDefaultKeySet(ownerId)],
    members: [
      {
        userId: ownerId,
        roles: ["OWNER", "ADMIN", "BILLING"],
        invitedAt: created,
        joinedAt: created,
        status: "active",
      },
    ],
    billingProfile: {
      contactEmail: "billing@example.com",
      contactName: "Default Billing Contact",
    },
    createdAt: created,
    createdBy: ownerId,
  };

  return {
    users: {
      [ownerId]: owner,
      [sysAdminId]: sysAdmin,
    },
    organizations: {
      [orgId]: organization,
    },
    auditLog: [],
  };
}
