import crypto from "crypto";
import { v4 as uuid } from "uuid";

import {
  GlobalRole,
  OrgRole,
  UserAccount,
} from "../../types/Identity";
import { createPasswordHash } from "./passwords";
import { loadIdentity, saveIdentity } from "./persistence";
import { now } from "./time";

export async function getUsersForOrganization(
  orgId: string,
): Promise<UserAccount[]> {
  const store = await loadIdentity();
  const org = store.organizations[orgId];
  if (!org) return [];
  return org.members
    .map((member) => store.users[member.userId])
    .filter((u): u is UserAccount => Boolean(u));
}

export async function getUser(userId: string): Promise<UserAccount | null> {
  const store = await loadIdentity();
  return store.users[userId] || null;
}

export async function getUserByEmail(
  email: string,
): Promise<UserAccount | null> {
  const store = await loadIdentity();
  return (
    Object.values(store.users).find(
      (u) => u.email.toLowerCase() === email.toLowerCase(),
    ) || null
  );
}

export async function createUserAccount(params: {
  email: string;
  name: string;
  password: string;
  globalRoles?: GlobalRole[];
}): Promise<UserAccount> {
  const store = await loadIdentity();
  const id = uuid();
  const user: UserAccount = {
    id,
    email: params.email,
    name: params.name,
    passwordHash: createPasswordHash(params.password),
    globalRoles: params.globalRoles || [],
    organizations: [],
    createdAt: now(),
    status: "active",
  };
  store.users[id] = user;
  await saveIdentity(store);
  return user;
}

export async function updateUserLastLogin(userId: string): Promise<void> {
  const store = await loadIdentity();
  const user = store.users[userId];
  if (!user) return;
  user.lastLoginAt = now();
  await saveIdentity(store);
}

export async function attachUserToOrganization(params: {
  userId: string;
  orgId: string;
  roles: OrgRole[];
}): Promise<void> {
  const store = await loadIdentity();
  const user = store.users[params.userId];
  const org = store.organizations[params.orgId];
  if (!user || !org) throw new Error("User or organization not found");

  if (!user.organizations.some((o) => o.orgId === params.orgId)) {
    user.organizations.push({ orgId: params.orgId, roles: params.roles });
  } else {
    user.organizations = user.organizations.map((o) =>
      o.orgId === params.orgId ? { orgId: params.orgId, roles: params.roles } : o,
    );
  }

  const membership = org.members.find((m) => m.userId === params.userId);
  if (membership) {
    membership.roles = params.roles;
    membership.status = "active";
  } else {
    org.members.push({
      userId: params.userId,
      roles: params.roles,
      invitedAt: now(),
      joinedAt: now(),
      status: "active",
    });
  }

  await saveIdentity(store);
}

export async function createOrUpdateOrgUser(params: {
  orgId: string;
  email: string;
  name: string;
  roles: OrgRole[];
  password?: string;
}): Promise<{
  user: UserAccount;
  isNewUser: boolean;
  generatedPassword?: string;
}> {
  const store = await loadIdentity();
  const org = store.organizations[params.orgId];
  if (!org) throw new Error("Organization not found");

  let user = Object.values(store.users).find(
    (u) => u.email.toLowerCase() === params.email.toLowerCase(),
  );
  let generatedPassword: string | undefined;
  let isNewUser = false;
  if (!user) {
    const password = params.password || crypto.randomBytes(8).toString("hex");
    generatedPassword = params.password ? undefined : password;
    user = {
      id: uuid(),
      email: params.email,
      name: params.name,
      passwordHash: createPasswordHash(password),
      globalRoles: [],
      organizations: [],
      createdAt: now(),
      status: "active",
    };
    store.users[user.id] = user;
    isNewUser = true;
  } else {
    user.name = params.name;
    if (params.password) {
      user.passwordHash = createPasswordHash(params.password);
    }
  }

  if (!user.organizations.some((o) => o.orgId === params.orgId)) {
    user.organizations.push({ orgId: params.orgId, roles: params.roles });
  } else {
    user.organizations = user.organizations.map((o) =>
      o.orgId === params.orgId ? { orgId: params.orgId, roles: params.roles } : o,
    );
  }

  const membership = org.members.find((m) => m.userId === user.id);
  if (membership) {
    membership.roles = params.roles;
    membership.status = "active";
  } else {
    org.members.push({
      userId: user.id,
      roles: params.roles,
      invitedAt: now(),
      joinedAt: now(),
      status: "active",
    });
  }

  await saveIdentity(store);

  return { user, isNewUser, generatedPassword };
}
