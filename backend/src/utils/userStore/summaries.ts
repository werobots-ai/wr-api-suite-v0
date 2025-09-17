import { UsageEntry } from "../types/Identity";
import { loadIdentity } from "./persistence";
import { toSafeOrganization } from "./safeEntities";

function isTopUp(entry: UsageEntry): boolean {
  return entry.action === "topup";
}

export interface UsageTotals {
  totalTokenCost: number;
  totalBilled: number;
  totalRequests: number;
  netRevenue: number;
}

export interface TopUpTotals {
  totalTopUps: number;
  lastTopUpAt: string | null;
  count: number;
}

export interface PlatformOrganizationSummary {
  organization: ReturnType<typeof toSafeOrganization>;
  usage: UsageTotals;
  topUps: TopUpTotals;
  activeMemberCount: number;
  apiKeyCount: number;
}

export interface PlatformOverview {
  organizations: PlatformOrganizationSummary[];
  totals: UsageTotals & {
    totalTopUps: number;
    totalCredits: number;
    organizationCount: number;
    activeMemberCount: number;
    apiKeyCount: number;
  };
}

export function summarizeUsageEntries(entries: UsageEntry[]): UsageTotals {
  const usageEntries = entries.filter((entry) => !isTopUp(entry));
  const totals = usageEntries.reduce(
    (acc, entry) => {
      acc.totalTokenCost += entry.tokenCost;
      acc.totalBilled += entry.billedCost;
      acc.totalRequests += entry.requests;
      return acc;
    },
    { totalTokenCost: 0, totalBilled: 0, totalRequests: 0 },
  );
  return {
    ...totals,
    netRevenue: totals.totalBilled - totals.totalTokenCost,
  };
}

export function summarizeTopUps(entries: UsageEntry[]): TopUpTotals {
  const topUps = entries.filter(isTopUp);
  if (topUps.length === 0) {
    return { totalTopUps: 0, lastTopUpAt: null, count: 0 };
  }
  const summary = topUps.reduce(
    (acc, entry) => {
      const amount = Math.abs(entry.billedCost);
      acc.totalTopUps += amount;
      acc.count += 1;
      if (!acc.lastTopUpAt || entry.timestamp > acc.lastTopUpAt) {
        acc.lastTopUpAt = entry.timestamp;
      }
      return acc;
    },
    { totalTopUps: 0, lastTopUpAt: null as string | null, count: 0 },
  );
  return summary;
}

export async function getPlatformOverview(): Promise<PlatformOverview> {
  const store = await loadIdentity();
  const organizations = Object.values(store.organizations);
  const summaries: PlatformOrganizationSummary[] = organizations.map((org) => {
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
  });

  const totals = summaries.reduce(
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

  return { organizations: summaries, totals };
}
