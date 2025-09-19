import crypto from "node:crypto";
import { v4 as uuid } from "uuid";

import type { IdentityStoreData, UserAccount } from "../../../../types/Identity";
import { createPasswordHash } from "../../passwords";
import { now } from "../../time";
import type { OrgUserParams } from "./types";

export type ResolvedUser = {
  user: UserAccount;
  isNew: boolean;
  generatedPassword?: string;
};

export function resolveUser(
  store: IdentityStoreData,
  params: OrgUserParams,
): ResolvedUser {
  const normalized = params.email.toLowerCase();
  const existing = findUser(store, normalized);
  if (!existing) {
    return createNewUser(store, params);
  }
  updateExisting(existing, params);
  return { user: existing, isNew: false };
}

function findUser(
  store: IdentityStoreData,
  normalizedEmail: string,
): UserAccount | undefined {
  return Object.values(store.users).find(
    (candidate) => candidate.email.toLowerCase() === normalizedEmail,
  );
}

function createNewUser(
  store: IdentityStoreData,
  params: OrgUserParams,
): ResolvedUser {
  const password = params.password ?? crypto.randomBytes(8).toString("hex");
  const user: UserAccount = {
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
  return {
    user,
    isNew: true,
    generatedPassword: params.password ? undefined : password,
  };
}

function updateExisting(user: UserAccount, params: OrgUserParams): void {
  user.name = params.name;
  if (params.password) {
    user.passwordHash = createPasswordHash(params.password);
  }
}
