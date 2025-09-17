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
import { normalizeProductConfigs } from "./productConfig";
import { cloneProductConfig, ProductKeyConfig } from "../../types/Products";

function resolveProductAccess(
  requested: ProductKeyConfig[] | undefined,
  currentLink?: { productAccess?: ProductKeyConfig[] },
  currentMembership?: { productAccess?: ProductKeyConfig[] },
): ProductKeyConfig[] {
  if (requested !== undefined) {
    return normalizeProductConfigs(requested, { ensureDocument: true });
  }
  if (currentLink?.productAccess) {
    return normalizeProductConfigs(currentLink.productAccess, {
      ensureDocument: true,
    });
  }
  if (currentMembership?.productAccess) {
    return normalizeProductConfigs(currentMembership.productAccess, {
      ensureDocument: true,
    });
  }
  return normalizeProductConfigs(null, { ensureDocument: true });
}

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
  productAccess?: ProductKeyConfig[];
}): Promise<void> {
  const store = await loadIdentity();
  const user = store.users[params.userId];
  const org = store.organizations[params.orgId];
  if (!user || !org) throw new Error("User or organization not found");

  const existingLink = user.organizations.find((o) => o.orgId === params.orgId);
  const membership = org.members.find((m) => m.userId === params.userId);
  const normalizedProducts = resolveProductAccess(
    params.productAccess,
    existingLink,
    membership,
  );
  const userProducts = normalizedProducts.map((config) =>
    cloneProductConfig(config),
  );
  const memberProducts = normalizedProducts.map((config) =>
    cloneProductConfig(config),
  );

  if (!existingLink) {
    user.organizations.push({
      orgId: params.orgId,
      roles: params.roles,
      productAccess: userProducts,
    });
  } else {
    existingLink.roles = params.roles;
    existingLink.productAccess = userProducts;
  }

  if (membership) {
    membership.roles = params.roles;
    membership.status = "active";
    membership.productAccess = memberProducts;
  } else {
    org.members.push({
      userId: params.userId,
      roles: params.roles,
      invitedAt: now(),
      joinedAt: now(),
      status: "active",
      productAccess: memberProducts,
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
  productAccess?: ProductKeyConfig[];
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

  const existingLink = user.organizations.find((o) => o.orgId === params.orgId);
  const membership = org.members.find((m) => m.userId === user.id);
  const normalizedProducts = resolveProductAccess(
    params.productAccess,
    existingLink,
    membership,
  );
  const userProducts = normalizedProducts.map((config) =>
    cloneProductConfig(config),
  );
  const memberProducts = normalizedProducts.map((config) =>
    cloneProductConfig(config),
  );

  if (!existingLink) {
    user.organizations.push({
      orgId: params.orgId,
      roles: params.roles,
      productAccess: userProducts,
    });
  } else {
    existingLink.roles = params.roles;
    existingLink.productAccess = userProducts;
  }

  if (membership) {
    membership.roles = params.roles;
    membership.status = "active";
    membership.productAccess = memberProducts;
  } else {
    org.members.push({
      userId: user.id,
      roles: params.roles,
      invitedAt: now(),
      joinedAt: now(),
      status: "active",
      productAccess: memberProducts,
    });
  }

  await saveIdentity(store);

  return { user, isNewUser, generatedPassword };
}
