import type { UsageTotals, UsageList } from "./types";
import { isTopUp } from "./filters";

export function summarizeUsageEntries(entries: UsageList): UsageTotals {
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
