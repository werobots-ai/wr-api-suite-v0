import test from "node:test";
import assert from "node:assert/strict";

import { DOCUMENT_ANALYSIS_PRODUCT_ID } from "../src/shared/types/Products";
import { createLegacyIdentityStore } from "./helpers/identityTestEnv";

let normalizeIdentity: typeof import("../src/shared/utils/userStore/identityNormalization").normalizeIdentity;
let syncInternalOrgIds: typeof import("../src/shared/utils/userStore/identityNormalization").syncInternalOrgIds;
let applyStoreSideEffects: typeof import("../src/shared/utils/userStore/identityNormalization").applyStoreSideEffects;
let setInternalOrgIdsDirect: typeof import("../src/shared/utils/userStore/config").setInternalOrgIds;
let getInternalOrgIds: typeof import("../src/shared/utils/userStore/config").getInternalOrgIds;

test.before(async () => {
  ({ normalizeIdentity, syncInternalOrgIds, applyStoreSideEffects } = await import(
    "../src/shared/utils/userStore/identityNormalization"
  ));
  ({ setInternalOrgIds: setInternalOrgIdsDirect, getInternalOrgIds } = await import(
    "../src/shared/utils/userStore/config"
  ));
});

test.beforeEach(() => {
  setInternalOrgIdsDirect([]);
});

function expectDocumentAccess(access: readonly { productId: string }[]): void {
  assert.equal(
    access.some((item) => item.productId === DOCUMENT_ANALYSIS_PRODUCT_ID),
    true,
  );
}

test("normalizeIdentity hydrates defaults", { concurrency: false }, () => {
  const normalized = normalizeIdentity(createLegacyIdentityStore());
  const userLink = normalized.users["user-1"].organizations[0];
  assert.deepEqual(userLink.roles, []);
  expectDocumentAccess(userLink.productAccess);
  const member = normalized.organizations["org-1"].members[0];
  assert.deepEqual(member.roles, []);
  expectDocumentAccess(member.productAccess);
  assert.deepEqual(member.usage, []);
  assert.equal(member.lastAccessed, null);
  expectDocumentAccess(normalized.organizations["org-1"].keySets[0].products);
  assert.equal(normalized.metadata.bootstrapCompletedAt, null);
});

test("syncInternalOrgIds caches master orgs", { concurrency: false }, () => {
  const normalized = normalizeIdentity(createLegacyIdentityStore());
  syncInternalOrgIds(normalized.organizations);
  assert.ok(getInternalOrgIds().includes("org-1"));
});

test("applyStoreSideEffects normalizes and updates cache", { concurrency: false }, () => {
  const processed = applyStoreSideEffects(createLegacyIdentityStore());
  assert.equal(processed.organizations["org-1"].isMaster, true);
  assert.ok(getInternalOrgIds().includes("org-1"));
});
