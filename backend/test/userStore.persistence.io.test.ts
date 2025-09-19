import test from "node:test";
import assert from "node:assert/strict";
import { DOCUMENT_ANALYSIS_PRODUCT_ID } from "../src/shared/types/Products";
import { prepareIdentityTestEnv, createLegacyIdentityStore } from "./helpers/identityTestEnv";

let saveIdentity: typeof import("../src/shared/utils/userStore/persistence").saveIdentity;
let loadIdentity: typeof import("../src/shared/utils/userStore/persistence").loadIdentity;
let getIdentityStore: typeof import("../src/shared/utils/userStore/persistence").getIdentityStore;
let setInternalOrgIdsDirect: typeof import("../src/shared/utils/userStore/config").setInternalOrgIds;
let getInternalOrgIds: typeof import("../src/shared/utils/userStore/config").getInternalOrgIds;
let getRawIdentity: (() => Promise<any>) | undefined;

test.before(async () => {
  prepareIdentityTestEnv();
  ({ saveIdentity, loadIdentity, getIdentityStore } = await import(
    "../src/shared/utils/userStore/persistence"
  ));
  ({ setInternalOrgIds: setInternalOrgIdsDirect, getInternalOrgIds } = await import(
    "../src/shared/utils/userStore/config"
  ));
  const dynamo = await import("../src/shared/utils/dynamo");
  getRawIdentity = async () => {
    const result = await dynamo.getItem({
      TableName:
        process.env.IDENTITY_TABLE_NAME || "wr-api-suite-identity",
      Key: { pk: "IDENTITY", sk: "STORE" },
      ConsistentRead: true,
    });
    return result.Item;
  };
});

test.beforeEach(async () => {
  prepareIdentityTestEnv();
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
  const stored = await getRawIdentity?.();
  assert.ok(stored);
  expectDocumentAccess(stored.payload.organizations["org-1"].keySets[0].products);
  assert.equal(stored.payload.organizations["org-1"].isMaster, true);
  assert.ok(getInternalOrgIds().includes("org-1"));
});

test("loadIdentity bootstraps when missing", { concurrency: false }, async () => {
  const store = await loadIdentity();
  assert.equal(Object.keys(store.users).length, 0);
  assert.equal(Object.keys(store.organizations).length, 0);
});

test("loadIdentity normalizes persisted data", { concurrency: false }, async () => {
  const raw = createLegacyIdentityStore();
  const { putItem } = await import("../src/shared/utils/dynamo");
  await putItem({
    TableName: process.env.IDENTITY_TABLE_NAME || "wr-api-suite-identity",
    Item: {
      pk: "IDENTITY",
      sk: "STORE",
      payload: raw,
      updatedAt: new Date().toISOString(),
    },
  });
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
