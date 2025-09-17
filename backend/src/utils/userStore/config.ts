import path from "path";

export const IDENTITY_FILE = path.join(
  __dirname,
  "../../../data/identity.json",
);

export const KEY_SECRET = process.env.API_KEY_SECRET || "local-dev-secret";
export const HASH_SECRET = process.env.API_KEY_HASH_SECRET || KEY_SECRET;

const INTERNAL_ORG_IDS = new Set(
  (process.env.WEROBOTS_INTERNAL_ORG_IDS ||
    process.env.WEROBOTS_INTERNAL_ORG_ID ||
    "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0),
);

export function isInternalOrg(orgId: string): boolean {
  return INTERNAL_ORG_IDS.has(orgId);
}
