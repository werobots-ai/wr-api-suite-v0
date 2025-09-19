import { now } from "../../time";
import type { UsageEntry } from "../../../../types/Identity";
import type { UsageParams } from "./types";

export function buildUsageEntry(params: UsageParams): UsageEntry {
  return {
    timestamp: now(),
    action: params.action,
    tokenCost: params.tokenCost,
    billedCost: params.billedCost,
    requests: params.requests ?? 0,
    metadata: params.metadata,
  };
}
