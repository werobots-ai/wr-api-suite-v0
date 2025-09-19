import { loadIdentity, saveIdentity } from "../../persistence";
import { applyKeyUsage } from "./keys";
import { applyMemberUsage } from "./members";
import { applyOrganizationUsage } from "./organization";
import { requireOrganization } from "./requireOrganization";
import { buildUsageEntry } from "./entry";
import type { UsageParams } from "./types";

export async function recordUsage(params: UsageParams): Promise<void> {
  const store = await loadIdentity();
  const organization = requireOrganization(store.organizations, params.orgId);
  const entry = buildUsageEntry(params);
  applyOrganizationUsage(organization, entry, params.billedCost);
  applyMemberUsage(organization, entry, params.userId);
  applyKeyUsage(organization, entry, params.keySetId, params.keyId);
  await saveIdentity(store);
}
