import type { Organization, UsageEntry } from "../../../../types/Identity";

export function applyOrganizationUsage(
  organization: Organization,
  entry: UsageEntry,
  billedCost: number,
): void {
  organization.credits -= billedCost;
  organization.usage.push(entry);
}
