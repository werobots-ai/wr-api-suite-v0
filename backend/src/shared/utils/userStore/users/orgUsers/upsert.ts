import { loadIdentity, saveIdentity } from "../../persistence";
import { resolveProductAccess } from "../productAccess";
import { findLink, findMembership } from "../membership/lookups";
import { syncMembership, syncUserLink } from "../membership/sync";
import { resolveUser } from "./lifecycle";
import type { OrgUserParams, OrgUserResult } from "./types";

export async function createOrUpdateOrgUser(
  params: OrgUserParams,
): Promise<OrgUserResult> {
  const store = await loadIdentity();
  const organization = store.organizations[params.orgId];
  if (!organization) throw new Error("Organization not found");
  const resolved = resolveUser(store, params);
  const link = findLink(resolved.user, params.orgId);
  const membership = findMembership(organization, resolved.user.id);
  const products = resolveProductAccess(
    params.productAccess,
    link,
    membership,
  );
  syncUserLink(link, resolved.user.organizations, params.orgId, params.roles, products);
  syncMembership(membership, organization.members, resolved.user.id, params.roles, products);
  await saveIdentity(store);
  return {
    user: resolved.user,
    isNewUser: resolved.isNew,
    generatedPassword: resolved.generatedPassword,
  };
}
