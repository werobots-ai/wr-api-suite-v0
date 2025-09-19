import type { StoredApiKey } from "../../../types/Identity";
import { maskFromLastFour } from "../helpers";
import type { SafeEntityOptions } from "./options";
import { toSafeUsageEntry } from "./usage";

export function toSafeKey(
  key: StoredApiKey,
  options: SafeEntityOptions = {},
) {
  return {
    id: key.id,
    maskedKey: maskFromLastFour(key.lastFour),
    lastFour: key.lastFour,
    lastRotated: key.lastRotated,
    lastAccessed: key.lastAccessed ?? null,
    usage: key.usage.map((entry) => toSafeUsageEntry(entry, options)),
    createdAt: key.createdAt,
    createdBy: key.createdBy,
  };
}
