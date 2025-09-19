import { loadIdentity, saveIdentity } from "../../persistence";
import { resolveProductAccess } from "../productAccess";
import { findLink, findMembership } from "../membership/lookups";
import { syncMembership, syncUserLink } from "../membership/sync";
import { resolveUser } from "./lifecycle";
import type { OrgUserParams, OrgUserResult } from "./types";
import { syncOrganizationUser } from "../../../keycloak/admin";
import type { IdentityStoreData, UserAccount } from "../../../../types/Identity";

export async function createOrUpdateOrgUser(
  params: OrgUserParams,
): Promise<OrgUserResult> {
  const store = await loadIdentity();
  const organization = store.organizations[params.orgId];
  if (!organization) throw new Error("Organization not found");
  const resolved = resolveUser(store, params);
  const passwordForKeycloak = params.password ?? resolved.generatedPassword;
  if (resolved.isNew && !passwordForKeycloak) {
    throw new Error("Password generation failed for new user");
  }
  const syncResult = await syncOrganizationUser({
    userId: resolved.user.id,
    email: params.email,
    name: params.name,
    password: passwordForKeycloak,
    roles: params.roles,
    organizationId: params.orgId,
  });
  const alignedUser = ensureUserId(store, resolved.user, syncResult.userId);
  const link = findLink(alignedUser, params.orgId);
  const membership = findMembership(organization, alignedUser.id);
  const products = resolveProductAccess(
    params.productAccess,
    link,
    membership,
  );
  syncUserLink(link, alignedUser.organizations, params.orgId, params.roles, products);
  syncMembership(
    membership,
    organization.members,
    alignedUser.id,
    params.roles,
    products,
  );
  await saveIdentity(store);
  return {
    user: alignedUser,
    isNewUser: resolved.isNew,
    generatedPassword: resolved.generatedPassword,
  };
}

function ensureUserId(
  store: IdentityStoreData,
  user: UserAccount,
  keycloakId: string,
): UserAccount {
  if (user.id === keycloakId) {
    store.users[user.id] = user;
    return user;
  }
  const previousId = user.id;
  delete store.users[previousId];
  user.id = keycloakId;
  store.users[user.id] = user;

  for (const org of Object.values(store.organizations)) {
    if (org.createdBy === previousId) {
      org.createdBy = keycloakId;
    }
    for (const member of org.members) {
      if (member.userId === previousId) {
        member.userId = keycloakId;
      }
    }
    for (const keySet of org.keySets) {
      if (keySet.createdBy === previousId) {
        keySet.createdBy = keycloakId;
      }
      for (const key of keySet.keys) {
        if (key.createdBy === previousId) {
          key.createdBy = keycloakId;
        }
      }
    }
  }

  return user;
}
