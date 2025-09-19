import type { Organization } from "../../../types/Identity";
import { loadIdentity, saveIdentity } from "../persistence";

export async function setOrganizationMasterStatus(
  orgId: string,
  isMaster: boolean,
): Promise<Organization> {
  const store = await loadIdentity();
  const organization = store.organizations[orgId];
  if (!organization) {
    throw new Error("Organization not found");
  }
  organization.isMaster = isMaster;
  await saveIdentity(store);
  return organization;
}
