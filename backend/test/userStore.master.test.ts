import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "wr-identity-tests-"));
const identityPath = path.join(tempDir, "identity.json");
process.env.IDENTITY_FILE_PATH = identityPath;

let getIdentityStore: typeof import("../src/utils/userStore/persistence").getIdentityStore;
let createOrganizationWithOwner: typeof import("../src/utils/userStore/organizations").createOrganizationWithOwner;
let setOrganizationMasterStatus: typeof import("../src/utils/userStore/organizations").setOrganizationMasterStatus;
let topUpOrganization: typeof import("../src/utils/userStore/organizations").topUpOrganization;
let recordUsage: typeof import("../src/utils/userStore/organizations").recordUsage;
let userHasMasterOrgAccess: typeof import("../src/utils/userStore/organizations").userHasMasterOrgAccess;
let createOrUpdateOrgUser: typeof import("../src/utils/userStore/users").createOrUpdateOrgUser;
let getUsersForOrganization: typeof import("../src/utils/userStore/users").getUsersForOrganization;
let getUser: typeof import("../src/utils/userStore/users").getUser;
let getUserByEmail: typeof import("../src/utils/userStore/users").getUserByEmail;
let updateUserLastLogin: typeof import("../src/utils/userStore/users").updateUserLastLogin;
let attachUserToOrganization: typeof import("../src/utils/userStore/users").attachUserToOrganization;
let isInternalOrg: typeof import("../src/utils/userStore/config").isInternalOrg;
let getInternalOrgIds: typeof import("../src/utils/userStore/config").getInternalOrgIds;

test.before(async () => {
  ({ getIdentityStore } = await import("../src/utils/userStore/persistence"));
  ({
    createOrganizationWithOwner,
    setOrganizationMasterStatus,
    topUpOrganization,
    recordUsage,
    userHasMasterOrgAccess,
  } = await import("../src/utils/userStore/organizations"));
  ({ createOrUpdateOrgUser } = await import("../src/utils/userStore/users"));
  ({
    getUsersForOrganization,
    getUser,
    getUserByEmail,
    updateUserLastLogin,
    attachUserToOrganization,
  } = await import("../src/utils/userStore/users"));
  ({ isInternalOrg, getInternalOrgIds } = await import("../src/utils/userStore/config"));
});

test.beforeEach(() => {
  try {
    fs.rmSync(identityPath);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
});

test("bootstrap identity starts empty", { concurrency: false }, async () => {
  const store = await getIdentityStore();
  assert.equal(Object.keys(store.users).length, 0);
  assert.equal(Object.keys(store.organizations).length, 0);
  assert.equal(store.metadata.bootstrapCompletedAt, null);
});

test("creating master bootstrap marks metadata and roles", { concurrency: false }, async () => {
  const { organization, owner } = await createOrganizationWithOwner(
    {
      organizationName: "Master Org",
      ownerEmail: "master@example.com",
      ownerName: "Master Owner",
      ownerPassword: "bootstrap",
    },
    {
      isMaster: true,
      ownerGlobalRoles: ["MASTER_ADMIN"],
      markBootstrapComplete: true,
    },
  );

  assert.equal(organization.isMaster, true);
  assert.ok(owner.globalRoles.includes("MASTER_ADMIN"));
  assert.equal(await userHasMasterOrgAccess(owner.id), true);

  const store = await getIdentityStore();
  assert.ok(store.metadata.bootstrapCompletedAt);
  assert.equal(isInternalOrg(organization.id), true);
});

test("master status can be toggled", { concurrency: false }, async () => {
  const { organization, owner } = await createOrganizationWithOwner({
    organizationName: "Tenant Org",
    ownerEmail: "tenant@example.com",
    ownerName: "Tenant Owner",
    ownerPassword: "tenantpass",
  });

  assert.equal(organization.isMaster, false);
  assert.equal(await userHasMasterOrgAccess(owner.id), false);
  assert.equal(isInternalOrg(organization.id), false);

  const promoted = await setOrganizationMasterStatus(organization.id, true);
  assert.equal(promoted.isMaster, true);
  assert.equal(await userHasMasterOrgAccess(owner.id), true);
  assert.equal(isInternalOrg(organization.id), true);

  const demoted = await setOrganizationMasterStatus(organization.id, false);
  assert.equal(demoted.isMaster, false);
  assert.equal(await userHasMasterOrgAccess(owner.id), false);
  assert.equal(isInternalOrg(organization.id), false);
});

test("user lifecycle and usage recording", { concurrency: false }, async () => {
  const { organization } = await createOrganizationWithOwner({
    organizationName: "Lifecycle Org",
    ownerEmail: "lifecycle-owner@example.com",
    ownerName: "Lifecycle Owner",
    ownerPassword: "ownerpass",
  });

  const creation = await createOrUpdateOrgUser({
    orgId: organization.id,
    email: "member@example.com",
    name: "Member One",
    roles: ["MEMBER"],
  });
  assert.equal(creation.isNewUser, true);
  assert.ok(creation.generatedPassword);
  assert.equal(
    creation.user.organizations.find((link) => link.orgId === organization.id)?.roles[0],
    "MEMBER",
  );

  const update = await createOrUpdateOrgUser({
    orgId: organization.id,
    email: "member@example.com",
    name: "Member Admin",
    roles: ["ADMIN"],
    password: "updatedpass",
  });
  assert.equal(update.isNewUser, false);
  assert.equal(update.generatedPassword, undefined);
  assert.equal(update.user.name, "Member Admin");
  assert.deepEqual(
    update.user.organizations.find((link) => link.orgId === organization.id)?.roles,
    ["ADMIN"],
  );

  const topped = await topUpOrganization(organization.id, 100);
  assert.equal(topped.credits, 100);

  await recordUsage({
    orgId: organization.id,
    tokenCost: 12,
    billedCost: 15,
    action: "unit-test",
    requests: 3,
  });

  const store = await getIdentityStore();
  const storedOrg = store.organizations[organization.id];
  assert.equal(storedOrg.credits, 85);
  assert.equal(storedOrg.usage.length, 2);
  assert.equal(storedOrg.usage.at(-1)?.action, "unit-test");

  const members = await getUsersForOrganization(organization.id);
  assert.equal(members.length, 2);

  const fetched = await getUser(update.user.id);
  assert.equal(fetched?.name, "Member Admin");

  const byEmail = await getUserByEmail("member@example.com");
  assert.equal(byEmail?.id, update.user.id);

  await updateUserLastLogin(update.user.id);
  const storeAfterLogin = await getIdentityStore();
  assert.ok(storeAfterLogin.users[update.user.id].lastLoginAt);

  await attachUserToOrganization({
    orgId: organization.id,
    userId: update.user.id,
    roles: ["OWNER", "ADMIN"],
  });
  const updatedMembers = await getUsersForOrganization(organization.id);
  const updatedRoles = updatedMembers
    .find((member) => member.id === update.user.id)
    ?.organizations.find((link) => link.orgId === organization.id)?.roles;
  assert.deepEqual(updatedRoles?.sort(), ["ADMIN", "OWNER"].sort());

  const internalIds = getInternalOrgIds();
  assert.equal(internalIds.includes(organization.id), false);
});
