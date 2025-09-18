import type { UsageEntry } from "@/types/account";

export function isTopUpEntry(entry: UsageEntry): boolean {
  return entry.action === "topup";
}

export function splitUsageEntries(
  entries: UsageEntry[],
): { usage: UsageEntry[]; topUps: UsageEntry[] } {
  return entries.reduce(
    (acc, entry) => {
      if (isTopUpEntry(entry)) {
        acc.topUps.push(entry);
      } else {
        acc.usage.push(entry);
      }
      return acc;
    },
    { usage: [] as UsageEntry[], topUps: [] as UsageEntry[] },
  );
}

export function summarizeTopUps(entries: UsageEntry[]): {
  totalAmount: number;
  lastTimestamp: string | null;
  count: number;
} {
  if (entries.length === 0) {
    return { totalAmount: 0, lastTimestamp: null, count: 0 };
  }
  return entries.reduce(
    (acc, entry) => {
      const amount = Math.abs(entry.billedCost);
      acc.totalAmount += amount;
      acc.count += 1;
      if (!acc.lastTimestamp || entry.timestamp > acc.lastTimestamp) {
        acc.lastTimestamp = entry.timestamp;
      }
      return acc;
    },
    { totalAmount: 0, lastTimestamp: null as string | null, count: 0 },
  );
}
