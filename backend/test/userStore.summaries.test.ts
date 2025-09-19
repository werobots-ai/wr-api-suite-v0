import test from "node:test";
import assert from "node:assert/strict";
import {
  summarizeUsageEntries,
  summarizeTopUps,
  getPlatformOverview,
} from "../src/shared/utils/userStore/summaries";
import { saveIdentity } from "../src/shared/utils/userStore/persistence";
import type {
  IdentityStoreData,
  UsageEntry,
} from "../src/shared/types/Identity";
import { prepareIdentityTestEnv } from "./helpers/identityTestEnv";

const sampleUsage: UsageEntry[] = [
  {
    timestamp: "2024-01-01T00:00:00.000Z",
    action: "document",
    tokenCost: 3,
    billedCost: 7,
    requests: 2,
  },
  {
    timestamp: "2024-01-02T00:00:00.000Z",
    action: "topup",
    tokenCost: 0,
    billedCost: -25,
    requests: 0,
  },
  {
    timestamp: "2024-01-03T00:00:00.000Z",
    action: "document",
    tokenCost: 2,
    billedCost: 6,
    requests: 1,
  },
];

test("summarizeUsageEntries ignores top ups and computes net revenue", () => {
  const totals = summarizeUsageEntries(sampleUsage);
  assert.deepEqual(totals, {
    totalTokenCost: 5,
    totalBilled: 13,
    totalRequests: 3,
    netRevenue: 8,
  });
});

test("summarizeTopUps tallies amounts and tracks latest timestamp", () => {
  const summary = summarizeTopUps(sampleUsage);
  assert.deepEqual(summary, {
    totalTopUps: 25,
    lastTopUpAt: "2024-01-02T00:00:00.000Z",
    count: 1,
  });
});

test("getPlatformOverview aggregates usage, top ups, and membership", { concurrency: false }, async () => {
  const now = "2024-03-01T12:00:00.000Z";
  const store: IdentityStoreData = {
    users: {
      "user-1": {
        id: "user-1",
        email: "owner@org1.com",
        name: "Owner One",
        passwordHash: "hash",
        globalRoles: [],
        organizations: [
          { orgId: "org-1", roles: ["OWNER"], productAccess: [] },
        ],
        createdAt: now,
        status: "active",
      },
      "user-2": {
        id: "user-2",
        email: "admin@org2.com",
        name: "Admin Two",
        passwordHash: "hash",
        globalRoles: [],
        organizations: [
          { orgId: "org-2", roles: ["ADMIN"], productAccess: [] },
        ],
        createdAt: now,
        status: "active",
      },
    },
    organizations: {
      "org-1": {
        id: "org-1",
        name: "First Org",
        slug: "first-org",
        credits: 150,
        usage: [
          {
            timestamp: "2024-01-10T00:00:00.000Z",
            action: "document",
            tokenCost: 10,
            billedCost: 25,
            requests: 5,
          },
          {
            timestamp: "2024-01-12T00:00:00.000Z",
            action: "topup",
            tokenCost: 0,
            billedCost: -50,
            requests: 0,
          },
          {
            timestamp: "2024-01-14T00:00:00.000Z",
            action: "document",
            tokenCost: 5,
            billedCost: 15,
            requests: 3,
          },
        ],
        keySets: [
          {
            id: "set-1",
            name: "Primary",
            description: "",
            keys: [
              {
                id: "key-1",
                encryptedKey: "enc",
                encryptionIv: "iv",
                encryptionAuthTag: "tag",
                keyHash: "hash",
                lastFour: "1234",
                lastRotated: now,
                lastAccessed: now,
                usage: [],
                createdBy: "user-1",
                createdAt: now,
              },
              {
                id: "key-2",
                encryptedKey: "enc2",
                encryptionIv: "iv2",
                encryptionAuthTag: "tag2",
                keyHash: "hash2",
                lastFour: "5678",
                lastRotated: now,
                lastAccessed: null,
                usage: [],
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
            usage: [],
            lastAccessed: now,
          },
          {
            userId: "user-3",
            roles: ["MEMBER"],
            invitedAt: now,
            joinedAt: now,
            status: "suspended",
            productAccess: [],
            usage: [],
            lastAccessed: null,
          },
        ],
        billingProfile: { contactEmail: "billing@org1.com" },
        createdAt: now,
        createdBy: "user-1",
        isMaster: false,
      },
      "org-2": {
        id: "org-2",
        name: "Second Org",
        slug: "second-org",
        credits: 75,
        usage: [
          {
            timestamp: "2024-02-01T00:00:00.000Z",
            action: "topup",
            tokenCost: 0,
            billedCost: -20,
            requests: 0,
          },
          {
            timestamp: "2024-02-02T00:00:00.000Z",
            action: "document",
            tokenCost: 4,
            billedCost: 10,
            requests: 2,
          },
          {
            timestamp: "2024-02-03T00:00:00.000Z",
            action: "document",
            tokenCost: 6,
            billedCost: 18,
            requests: 4,
          },
        ],
        keySets: [
          {
            id: "set-2",
            name: "Secondary",
            description: "",
            keys: [
              {
                id: "key-3",
                encryptedKey: "enc3",
                encryptionIv: "iv3",
                encryptionAuthTag: "tag3",
                keyHash: "hash3",
                lastFour: "9012",
                lastRotated: now,
                lastAccessed: null,
                usage: [],
                createdBy: "user-2",
                createdAt: now,
              },
            ],
            createdBy: "user-2",
            createdAt: now,
            products: [],
          },
        ],
        members: [
          {
            userId: "user-2",
            roles: ["ADMIN"],
            invitedAt: now,
            joinedAt: now,
            status: "active",
            productAccess: [],
            usage: [],
            lastAccessed: now,
          },
          {
            userId: "user-4",
            roles: ["MEMBER"],
            invitedAt: now,
            joinedAt: now,
            status: "active",
            productAccess: [],
            usage: [],
            lastAccessed: now,
          },
        ],
        billingProfile: { contactEmail: "billing@org2.com" },
        createdAt: now,
        createdBy: "user-2",
        isMaster: false,
      },
    },
    auditLog: [],
    metadata: { bootstrapCompletedAt: null },
};

test.before(() => {
  prepareIdentityTestEnv();
});

  prepareIdentityTestEnv();
  await saveIdentity(store);

  const overview = await getPlatformOverview();
  assert.equal(overview.organizations.length, 2);
  const [first, second] = overview.organizations;

  assert.equal(first.organization.id, "org-1");
  assert.deepEqual(first.usage, {
    totalTokenCost: 15,
    totalBilled: 40,
    totalRequests: 8,
    netRevenue: 25,
  });
  assert.deepEqual(first.topUps, {
    totalTopUps: 50,
    lastTopUpAt: "2024-01-12T00:00:00.000Z",
    count: 1,
  });
  assert.equal(first.activeMemberCount, 1);
  assert.equal(first.apiKeyCount, 2);

  assert.equal(second.organization.id, "org-2");
  assert.deepEqual(second.usage, {
    totalTokenCost: 10,
    totalBilled: 28,
    totalRequests: 6,
    netRevenue: 18,
  });
  assert.deepEqual(second.topUps, {
    totalTopUps: 20,
    lastTopUpAt: "2024-02-01T00:00:00.000Z",
    count: 1,
  });
  assert.equal(second.activeMemberCount, 2);
  assert.equal(second.apiKeyCount, 1);

  assert.deepEqual(overview.totals, {
    totalTokenCost: 25,
    totalBilled: 68,
    totalRequests: 14,
    netRevenue: 43,
    totalTopUps: 70,
    totalCredits: 225,
    organizationCount: 2,
    activeMemberCount: 3,
    apiKeyCount: 3,
  });
});
