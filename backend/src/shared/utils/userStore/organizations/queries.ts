import type { Organization } from "../../../types/Identity";
import { loadIdentity } from "../persistence";

export async function getOrganizations(): Promise<Organization[]> {
  const store = await loadIdentity();
  return Object.values(store.organizations);
}

export async function getOrganization(
  orgId: string,
): Promise<Organization | null> {
  const store = await loadIdentity();
  return store.organizations[orgId] || null;
}
