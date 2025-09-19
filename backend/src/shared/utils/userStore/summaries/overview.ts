import { loadIdentity } from "../persistence";
import { toSafeOrganization } from "../safeEntities";
import type {
  PlatformOverview,
  PlatformOrganizationSummary,
} from "./types";
import { summarizeTopUps } from "./topUps";
import { summarizeUsageEntries } from "./usage";

export async function getPlatformOverview(): Promise<PlatformOverview> {
  const store = await loadIdentity();
  const summaries = Object.values(store.organizations).map(buildSummary);
  return { organizations: summaries, totals: accumulateTotals(summaries) };
}

function buildSummary(org: Parameters<typeof toSafeOrganization>[0]): PlatformOrganizationSummary {
  const usage = summarizeUsageEntries(org.usage);
  const topUps = summarizeTopUps(org.usage);
  const activeMemberCount = org.members.filter(
    (member) => member.status === "active",
  ).length;
  const apiKeyCount = org.keySets.reduce(
    (total, set) => total + set.keys.length,
    0,
  );
  return {
    organization: toSafeOrganization(org),
    usage,
    topUps,
    activeMemberCount,
    apiKeyCount,
  };
}

function accumulateTotals(
  summaries: PlatformOrganizationSummary[],
): PlatformOverview["totals"] {
  return summaries.reduce(
    (acc, entry) => {
      acc.totalTokenCost += entry.usage.totalTokenCost;
      acc.totalBilled += entry.usage.totalBilled;
      acc.totalRequests += entry.usage.totalRequests;
      acc.netRevenue += entry.usage.netRevenue;
      acc.totalTopUps += entry.topUps.totalTopUps;
      acc.totalCredits += entry.organization.credits;
      acc.organizationCount += 1;
      acc.activeMemberCount += entry.activeMemberCount;
      acc.apiKeyCount += entry.apiKeyCount;
      return acc;
    },
    {
      totalTokenCost: 0,
      totalBilled: 0,
      totalRequests: 0,
      netRevenue: 0,
      totalTopUps: 0,
      totalCredits: 0,
      organizationCount: 0,
      activeMemberCount: 0,
      apiKeyCount: 0,
    },
  );
}
