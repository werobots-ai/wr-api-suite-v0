import { loadIdentity, saveIdentity } from "../persistence";

export async function removeKeySet(
  orgId: string,
  setId: string,
): Promise<void> {
  const store = await loadIdentity();
  const organization = store.organizations[orgId];
  if (!organization) throw new Error("Organization not found");
  organization.keySets = organization.keySets.filter((set) => set.id !== setId);
  await saveIdentity(store);
}
