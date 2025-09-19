import type { IdentityStoreData, Organization } from "../../../../types/Identity";

export function requireOrganization(
  organizations: IdentityStoreData["organizations"],
  orgId: string,
): Organization {
  const organization = organizations[orgId];
  if (!organization) throw new Error("Organization not found");
  return organization;
}
