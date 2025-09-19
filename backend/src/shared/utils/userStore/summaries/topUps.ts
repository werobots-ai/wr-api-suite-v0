import type { TopUpTotals, UsageList } from "./types";
import { isTopUp } from "./filters";

export function summarizeTopUps(entries: UsageList): TopUpTotals {
  const topUps = entries.filter(isTopUp);
  if (topUps.length === 0) {
    return { totalTopUps: 0, lastTopUpAt: null, count: 0 };
  }
  return topUps.reduce(
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
}
