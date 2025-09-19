import { revealStoredKey } from "../../apiKeys";
import type { CreateResult, Creation } from "./types";
import type { createDefaultKeySet } from "../../apiKeys";

export function finalizeCreation(creation: Creation): CreateResult {
  return {
    organization: creation.organization,
    owner: creation.owner,
    apiKeys: revealApiKeys(creation.keySet),
  };
}

function revealApiKeys(
  keySet: ReturnType<typeof createDefaultKeySet>,
): string[] {
  return keySet.keys.map((key) => revealStoredKey(key));
}
