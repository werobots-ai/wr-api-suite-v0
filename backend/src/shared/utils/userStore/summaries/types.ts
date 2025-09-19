import type { UsageEntry } from "../../../types/Identity";
import type { toSafeOrganization } from "../safeEntities";

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

export type UsageList = UsageEntry[];
