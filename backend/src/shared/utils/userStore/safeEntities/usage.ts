import type { UsageEntry } from "../../../types/Identity";
import type { SafeEntityOptions } from "./options";

export function toSafeUsageEntry(
  entry: UsageEntry,
  options: SafeEntityOptions = {},
) {
  return {
    ...entry,
    tokenCost: options.maskCosts ? null : entry.tokenCost,
  };
}
