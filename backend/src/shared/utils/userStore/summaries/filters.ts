import type { UsageEntry } from "../../../types/Identity";

export function isTopUp(entry: UsageEntry): boolean {
  return entry.action === "topup";
}
