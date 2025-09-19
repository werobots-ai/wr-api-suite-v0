import test from "node:test";
import assert from "node:assert/strict";

import type {
  IdentityStoreData,
  Organization,
  UsageEntry,
} from "../src/shared/types/Identity";
import { buildUsageEntry } from "../src/shared/utils/userStore/organizations/usage/entry";
import { applyOrganizationUsage } from "../src/shared/utils/userStore/organizations/usage/organization";
import { applyMemberUsage } from "../src/shared/utils/userStore/organizations/usage/members";
import { applyKeyUsage } from "../src/shared/utils/userStore/organizations/usage/keys";
import { requireOrganization } from "../src/shared/utils/userStore/organizations/usage/requireOrganization";

const fixedTimestamp = "2024-01-01T00:00:00.000Z";

function createUsageEntry(action = "unit-test"): UsageEntry {
  return {
    timestamp: fixedTimestamp,
    action,
    tokenCost: 10,
    billedCost: 15,
    requests: 2,
  };
}

function createOrganization(): Organization {
  return {
    id: "org-1",
    name: "Example Org",
    slug: "example-org",
    credits: 100,
    usage: [],
    keySets: [
      {
        id: "set-1",
        name: "Default",
        description: "",
        keys: [
          {
            id: "key-1",
            encryptedKey: "encrypted",
            encryptionIv: "iv",
            encryptionAuthTag: "tag",
            keyHash: "hash",
            lastFour: "1234",
            lastRotated: fixedTimestamp,
            lastAccessed: null,
            usage: [],
            createdBy: "user-1",
            createdAt: fixedTimestamp,
          },
        ],
        createdBy: "user-1",
        createdAt: fixedTimestamp,
        products: [],
      },
    ],
    members: [
      {
        userId: "user-1",
        roles: ["OWNER"],
        invitedAt: fixedTimestamp,
        joinedAt: fixedTimestamp,
        status: "active",
        productAccess: [],
        usage: [],
        lastAccessed: null,
      },
    ],
    billingProfile: { contactEmail: "owner@example.com" },
    createdAt: fixedTimestamp,
    createdBy: "user-1",
    isMaster: false,
  };
}

test("buildUsageEntry captures provided values and defaults", () => {
  const entry = buildUsageEntry({
    orgId: "org-1",
    tokenCost: 5,
    billedCost: 7,
    action: "ingest",
  });

  assert.equal(entry.action, "ingest");
  assert.equal(entry.tokenCost, 5);
  assert.equal(entry.billedCost, 7);
  assert.equal(entry.requests, 0);
  assert.equal(entry.metadata, undefined);
  assert.equal(typeof entry.timestamp, "string");
});

test("buildUsageEntry carries optional metadata", () => {
  const entry = buildUsageEntry({
    orgId: "org-1",
    tokenCost: 5,
    billedCost: 7,
    action: "process",
    metadata: { source: "api" },
    requests: 3,
  });

  assert.equal(entry.requests, 3);
  assert.deepEqual(entry.metadata, { source: "api" });
});

test("applyOrganizationUsage deducts credits and stores entry", () => {
  const organization = createOrganization();
  const entry = createUsageEntry();

  applyOrganizationUsage(organization, entry, 15);

  assert.equal(organization.credits, 85);
  assert.equal(organization.usage.length, 1);
  assert.equal(organization.usage[0], entry);
});

test("applyMemberUsage populates usage and timestamps", () => {
  const organization = createOrganization();
  const entry = createUsageEntry("member-call");
  const member = organization.members[0];
  member.usage = undefined as unknown as UsageEntry[];
  member.lastAccessed = undefined as unknown as string | null;

  applyMemberUsage(organization, entry, member.userId);

  assert.equal(Array.isArray(member.usage), true);
  assert.equal(member.usage.length, 1);
  assert.equal(member.usage[0], entry);
  assert.equal(member.lastAccessed, entry.timestamp);
});

test("applyMemberUsage ignores missing identifiers", () => {
  const organization = createOrganization();
  const entry = createUsageEntry();

  applyMemberUsage(organization, entry, undefined);
  applyMemberUsage(organization, entry, "missing-user");

  assert.equal(organization.members[0].usage.length, 0);
  assert.equal(organization.members[0].lastAccessed, null);
});

test("applyKeyUsage updates matching stored keys", () => {
  const organization = createOrganization();
  const entry = createUsageEntry();

  applyKeyUsage(organization, entry, "set-1", "key-1");

  const storedKey = organization.keySets[0].keys[0];
  assert.equal(storedKey.usage.length, 1);
  assert.equal(storedKey.usage[0], entry);
  assert.equal(storedKey.lastAccessed, entry.timestamp);
});

test("applyKeyUsage skips non-existent keys", () => {
  const organization = createOrganization();
  const entry = createUsageEntry();

  applyKeyUsage(organization, entry, undefined, undefined);
  applyKeyUsage(organization, entry, "set-1", "missing");

  assert.equal(organization.keySets[0].keys[0].usage.length, 0);
  assert.equal(organization.keySets[0].keys[0].lastAccessed, null);
});

test("requireOrganization returns existing entries", () => {
  const organization = createOrganization();
  const organizations: IdentityStoreData["organizations"] = {
    [organization.id]: organization,
  };

  const fetched = requireOrganization(organizations, organization.id);
  assert.equal(fetched, organization);
});

test("requireOrganization throws for missing ids", () => {
  const organizations: IdentityStoreData["organizations"] = {};

  assert.throws(() => {
    requireOrganization(organizations, "missing-org");
  }, /Organization not found/);
});
