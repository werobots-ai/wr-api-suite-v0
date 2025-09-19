import assert from "node:assert/strict";
import test from "node:test";

import { sanitizeOrganizationForRoles } from "../src/shared/routes/account/access";
import { toSafeOrganization } from "../src/shared/utils/userStore";
import type {
  OrgRole,
  Organization,
  UsageEntry,
} from "../src/shared/types/Identity";

test("sanitizeOrganizationForRoles strips sensitive fields for members", () => {
  const now = new Date().toISOString();
  const usageEntry: UsageEntry = {
    timestamp: now,
    action: "document.evaluated",
    tokenCost: 1.23,
    billedCost: 4.56,
    requests: 3,
  };
  const organization: Organization = {
    id: "org-1",
    name: "Test Org",
    slug: "test-org",
    credits: 250,
    usage: [usageEntry],
    keySets: [
      {
        id: "set-1",
        name: "Primary",
        description: "Main keys",
        keys: [
          {
            id: "key-1",
            encryptedKey: "encrypted",
            encryptionIv: "iv",
            encryptionAuthTag: "tag",
            keyHash: "hash",
            lastFour: "1234",
            lastRotated: now,
            lastAccessed: now,
            usage: [usageEntry],
            createdBy: "user-1",
            createdAt: now,
          },
        ],
        createdBy: "user-1",
        createdAt: now,
        products: [],
      },
    ],
    members: [
      {
        userId: "user-1",
        roles: ["OWNER"],
        invitedAt: now,
        joinedAt: now,
        status: "active",
        productAccess: [],
        usage: [usageEntry],
        lastAccessed: now,
      },
      {
        userId: "user-2",
        roles: ["MEMBER"],
        invitedAt: now,
        joinedAt: now,
        status: "active",
        productAccess: [],
        usage: [],
        lastAccessed: null,
      },
    ],
    billingProfile: {
      contactEmail: "billing@example.com",
      contactName: "Billing Manager",
      stripeCustomerId: "cus_123",
      notes: "Sensitive notes",
    },
    createdAt: now,
    createdBy: "user-1",
    isMaster: false,
  };

  const safeOrganization = toSafeOrganization(organization, { maskCosts: false });
  const result = sanitizeOrganizationForRoles(safeOrganization, ["MEMBER"], {
    isSysAdmin: false,
  });

  assert.notStrictEqual(result, safeOrganization);
  assert.equal(result.credits, 0);
  assert.equal(result.usage.length, 0);
  assert.equal(result.keySets.length, 0);
  assert.equal(result.members.length, 0);
  assert.deepEqual(result.billingProfile, {
    contactEmail: "",
    stripeCustomerId: null,
  });
  assert.equal(safeOrganization.credits, 250);
  assert.equal(safeOrganization.usage.length, 1);
});

test("sanitizeOrganizationForRoles keeps privileged data for admins", () => {
  const now = new Date().toISOString();
  const organization: Organization = {
    id: "org-privileged",
    name: "Privileged Org",
    slug: "privileged-org",
    credits: 10,
    usage: [],
    keySets: [],
    members: [],
    billingProfile: { contactEmail: "owner@example.com" },
    createdAt: now,
    createdBy: "user-1",
    isMaster: true,
  };

  const safeOrganization = toSafeOrganization(organization, { maskCosts: false });
  const result = sanitizeOrganizationForRoles(safeOrganization, ["ADMIN"], {
    isSysAdmin: false,
  });

  assert.strictEqual(result, safeOrganization);
});

test("sanitizeOrganizationForRoles keeps data for sysadmins regardless of roles", () => {
  const now = new Date().toISOString();
  const organization: Organization = {
    id: "org-sysadmin",
    name: "Sysadmin Org",
    slug: "sysadmin-org",
    credits: 5,
    usage: [],
    keySets: [],
    members: [],
    billingProfile: { contactEmail: "sysadmin@example.com" },
    createdAt: now,
    createdBy: "user-1",
    isMaster: false,
  };

  const safeOrganization = toSafeOrganization(organization, { maskCosts: false });
  const result = sanitizeOrganizationForRoles(safeOrganization, [] as OrgRole[], {
    isSysAdmin: true,
  });

  assert.strictEqual(result, safeOrganization);
});
