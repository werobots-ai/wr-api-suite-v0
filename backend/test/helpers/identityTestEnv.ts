import type { IdentityStoreData } from "../../src/shared/types/Identity";
import { resetInMemoryTables } from "../../src/shared/utils/dynamo";

declare global {
  // eslint-disable-next-line no-var
  var __wrIdentityInitialized: boolean | undefined;
}

function ensureInMemoryDynamo(): void {
  if (!global.__wrIdentityInitialized) {
    process.env.DYNAMODB_IN_MEMORY = "1";
    global.__wrIdentityInitialized = true;
  }
  resetInMemoryTables();
}

export function prepareIdentityTestEnv(): void {
  ensureInMemoryDynamo();
}

export function createLegacyIdentityStore(): IdentityStoreData {
  const now = new Date().toISOString();
  const raw = {
    users: {
      "user-1": {
        id: "user-1",
        email: "user@example.com",
        name: "Example User",
        passwordHash: "hash",
        globalRoles: ["SYSADMIN"],
        organizations: [
          { orgId: "org-1", roles: "OWNER", productAccess: null },
        ],
        createdAt: now,
        status: "active",
      },
    },
    organizations: {
      "org-1": {
        id: "org-1",
        name: "Org",
        slug: "org",
        credits: 0,
        usage: null,
        keySets: [
          {
            id: "set-1",
            name: "Primary",
            description: "",
            keys: [],
            createdBy: "user-1",
            createdAt: now,
            products: null,
          },
        ],
        members: [
          {
            userId: "user-1",
            roles: "OWNER",
            invitedAt: now,
            joinedAt: now,
            status: "active",
            productAccess: null,
            usage: null,
            lastAccessed: undefined,
          },
        ],
        billingProfile: { contactEmail: "billing@example.com" },
        createdAt: now,
        createdBy: "user-1",
        isMaster: 1,
      },
    },
    auditLog: undefined,
    metadata: {},
  };
  return raw as unknown as IdentityStoreData;
}
