import { OrgMembership, Organization } from "../../types/Identity";
import { normalizeProductConfigs } from "./productConfig";

type OrganizationMap = Record<string, Organization> | null | undefined;

type OrgMembers = OrgMembership[] | null | undefined;

type KeySets = Organization["keySets"] | null | undefined;

function normalizeKeySets(keySets: KeySets): Organization["keySets"] {
  return (keySets ?? []).map((set) => ({
    ...set,
    products: normalizeProductConfigs(set.products, {
      ensureDocument: true,
    }),
  }));
}

function normalizeMembers(members: OrgMembers): OrgMembership[] {
  return (members ?? []).map((member) => ({
    ...member,
    roles: Array.isArray(member.roles) ? member.roles : [],
    productAccess: normalizeProductConfigs(member.productAccess, {
      ensureDocument: true,
    }),
    usage: Array.isArray(member.usage) ? member.usage : [],
    lastAccessed: member.lastAccessed ?? null,
  }));
}

function normalizeOrganization(org: Organization): Organization {
  return {
    ...org,
    keySets: normalizeKeySets(org.keySets),
    members: normalizeMembers(org.members),
    isMaster: Boolean(org.isMaster),
  };
}

export function normalizeOrganizations(
  organizations: OrganizationMap,
): Record<string, Organization> {
  return Object.fromEntries(
    Object.entries(organizations ?? {}).map(([id, org]) => [
      id,
      normalizeOrganization(org),
    ]),
  );
}

export function collectMasterOrgIds(store: Record<string, Organization>): string[] {
  return Object.values(store)
    .filter((org) => org.isMaster)
    .map((org) => org.id);
}
