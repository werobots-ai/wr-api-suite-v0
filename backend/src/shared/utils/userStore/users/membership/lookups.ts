import type { IdentityStoreData, Organization, UserAccount } from "../../../../types/Identity";
import type { AttachParams, OrgMembership, OrganizationLink } from "./context";

export function requireUser(
  store: IdentityStoreData,
  params: AttachParams,
): UserAccount {
  const user = store.users[params.userId];
  if (!user) throw new Error("User or organization not found");
  return user;
}

export function requireOrganization(
  store: IdentityStoreData,
  params: AttachParams,
): Organization {
  const organization = store.organizations[params.orgId];
  if (!organization) throw new Error("User or organization not found");
  return organization;
}

export function findLink(
  user: UserAccount,
  orgId: string,
): OrganizationLink | undefined {
  return user.organizations.find((link) => link.orgId === orgId);
}

export function findMembership(
  organization: Organization,
  userId: string,
): OrgMembership | undefined {
  return organization.members.find((member) => member.userId === userId);
}
