import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { IdentityStoreData } from "../../src/shared/types/Identity";

const identityPath = (() => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wr-identity-tests-"));
  const file = path.join(dir, "identity.json");
  process.env.IDENTITY_FILE_PATH = file;
  return file;
})();

export function getIdentityTestPath(): string {
  return identityPath;
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
