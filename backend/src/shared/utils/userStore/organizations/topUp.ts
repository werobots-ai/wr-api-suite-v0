import type { Organization } from "../../../types/Identity";
import { loadIdentity, saveIdentity } from "../persistence";
import { now } from "../time";

export async function topUpOrganization(
  orgId: string,
  amount: number,
): Promise<Organization> {
  const store = await loadIdentity();
  const organization = store.organizations[orgId];
  if (!organization) {
    throw new Error("Organization not found");
  }
  organization.credits += amount;
  organization.usage.push(buildTopUpEntry(amount));
  await saveIdentity(store);
  return organization;
}

function buildTopUpEntry(amount: number) {
  return {
    timestamp: now(),
    action: "topup",
    tokenCost: 0,
    billedCost: -amount,
    requests: 0,
  };
}
