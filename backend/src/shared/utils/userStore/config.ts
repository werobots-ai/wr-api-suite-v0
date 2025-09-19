import path from "path";

const PROJECT_ROOT = path.resolve(__dirname, "../../../..");
const DEFAULT_IDENTITY_FILE = path.join(PROJECT_ROOT, "data/identity.json");

export const IDENTITY_FILE = process.env.IDENTITY_FILE_PATH
  ? path.resolve(process.env.IDENTITY_FILE_PATH)
  : DEFAULT_IDENTITY_FILE;

export const KEY_SECRET = process.env.API_KEY_SECRET || "local-dev-secret";
export const HASH_SECRET = process.env.API_KEY_HASH_SECRET || KEY_SECRET;

const ENV_INTERNAL_ORG_IDS = new Set(
  (process.env.WEROBOTS_INTERNAL_ORG_IDS ||
    process.env.WEROBOTS_INTERNAL_ORG_ID ||
    "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0),
);

let dynamicInternalOrgIds = new Set<string>();

export function setInternalOrgIds(ids: string[]): void {
  dynamicInternalOrgIds = new Set(ids.map((value) => value.trim()).filter(Boolean));
}

export function addInternalOrgId(id: string): void {
  if (!id) return;
  dynamicInternalOrgIds.add(id);
}

export function getInternalOrgIds(): string[] {
  return Array.from(new Set([...ENV_INTERNAL_ORG_IDS, ...dynamicInternalOrgIds]));
}

export function isInternalOrg(orgId: string): boolean {
  return ENV_INTERNAL_ORG_IDS.has(orgId) || dynamicInternalOrgIds.has(orgId);
}
