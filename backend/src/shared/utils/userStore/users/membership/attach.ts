import { loadIdentity, saveIdentity } from "../../persistence";
import { resolveProductAccess } from "../productAccess";
import type { AttachParams } from "./context";
import { findLink, findMembership, requireOrganization, requireUser } from "./lookups";
import { syncMembership, syncUserLink } from "./sync";

export async function attachUserToOrganization(
  params: AttachParams,
): Promise<void> {
  const store = await loadIdentity();
  const user = requireUser(store, params);
  const organization = requireOrganization(store, params);
  const normalized = resolveProductAccess(
    params.productAccess,
    findLink(user, params.orgId),
    findMembership(organization, params.userId),
  );
  syncUserLink(findLink(user, params.orgId), user.organizations, params.orgId, params.roles, normalized);
  syncMembership(
    findMembership(organization, params.userId),
    organization.members,
    params.userId,
    params.roles,
    normalized,
  );
  await saveIdentity(store);
}
