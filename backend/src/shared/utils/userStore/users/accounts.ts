import { v4 as uuid } from "uuid";

import type { GlobalRole, UserAccount } from "../../../types/Identity";
import { createPasswordHash } from "../passwords";
import { loadIdentity, saveIdentity } from "../persistence";
import { now } from "../time";

type AccountParams = {
  email: string;
  name: string;
  password: string;
  globalRoles?: GlobalRole[];
};

export async function createUserAccount(
  params: AccountParams,
): Promise<UserAccount> {
  const store = await loadIdentity();
  const id = uuid();
  const user = buildUser(id, params);
  store.users[id] = user;
  await saveIdentity(store);
  return user;
}

function buildUser(id: string, params: AccountParams): UserAccount {
  return {
    id,
    email: params.email,
    name: params.name,
    passwordHash: createPasswordHash(params.password),
    globalRoles: params.globalRoles || [],
    organizations: [],
    createdAt: now(),
    status: "active",
  };
}

export async function updateUserLastLogin(userId: string): Promise<void> {
  const store = await loadIdentity();
  const user = store.users[userId];
  if (!user) return;
  user.lastLoginAt = now();
  await saveIdentity(store);
}
