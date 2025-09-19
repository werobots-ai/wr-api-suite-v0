import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

import { DOCUMENT_ANALYSIS_PRODUCT_ID } from "../src/shared/types/Products";
import { createLegacyIdentityStore, getIdentityTestPath } from "./helpers/identityTestEnv";

const identityPath = getIdentityTestPath();

let saveIdentity: typeof import("../src/shared/utils/userStore/persistence").saveIdentity;
let loadIdentity: typeof import("../src/shared/utils/userStore/persistence").loadIdentity;
let getIdentityStore: typeof import("../src/shared/utils/userStore/persistence").getIdentityStore;
let setInternalOrgIdsDirect: typeof import("../src/shared/utils/userStore/config").setInternalOrgIds;
let getInternalOrgIds: typeof import("../src/shared/utils/userStore/config").getInternalOrgIds;

test.before(async () => {
  ({ saveIdentity, loadIdentity, getIdentityStore } = await import(
    "../src/shared/utils/userStore/persistence"
  ));
  ({ setInternalOrgIds: setInternalOrgIdsDirect, getInternalOrgIds } = await import(
    "../src/shared/utils/userStore/config"
  ));
});

test.beforeEach(async () => {
  await fs.rm(identityPath, { force: true });
  setInternalOrgIdsDirect([]);
});

function expectDocumentAccess(access: readonly { productId: string }[]): void {
  assert.equal(
    access.some((item) => item.productId === DOCUMENT_ANALYSIS_PRODUCT_ID),
    true,
  );
}

test("saveIdentity writes normalized store", { concurrency: false }, async () => {
  await saveIdentity(createLegacyIdentityStore());
  const raw = await fs.readFile(identityPath, "utf-8");
  const stored = JSON.parse(raw);
  expectDocumentAccess(stored.organizations["org-1"].keySets[0].products);
  assert.equal(stored.organizations["org-1"].isMaster, true);
  assert.ok(getInternalOrgIds().includes("org-1"));
});

test("loadIdentity bootstraps when missing", { concurrency: false }, async () => {
  const store = await loadIdentity();
  assert.equal(Object.keys(store.users).length, 0);
  assert.equal(Object.keys(store.organizations).length, 0);
});

test("loadIdentity normalizes persisted data", { concurrency: false }, async () => {
  const raw = createLegacyIdentityStore();
  await fs.writeFile(identityPath, JSON.stringify(raw), "utf-8");
  const store = await loadIdentity();
  assert.equal(store.organizations["org-1"].isMaster, true);
  assert.ok(getInternalOrgIds().includes("org-1"));
});

test("getIdentityStore delegates to loader", { concurrency: false }, async () => {
  await saveIdentity(createLegacyIdentityStore());
  const viaGetter = await getIdentityStore();
  const viaLoader = await loadIdentity();
  assert.deepEqual(viaGetter, viaLoader);
});
