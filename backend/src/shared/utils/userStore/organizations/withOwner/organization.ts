import { slugify } from "../../helpers";
import { cloneProducts, ownerRoles } from "./products";
import type {
  CreateOptions,
  CreateParams,
  DefaultProducts,
  Identifiers,
} from "./types";
import type {
  Organization,
  OrgMembership,
} from "../../../../types/Identity";
import type { createDefaultKeySet } from "../../apiKeys";

export function buildOrganization(
  params: CreateParams,
  options: CreateOptions,
  ids: Identifiers,
  createdAt: string,
  products: DefaultProducts,
  keySet: ReturnType<typeof createDefaultKeySet>,
): Organization {
  return {
    id: ids.orgId,
    name: params.organizationName,
    slug: slugify(params.organizationName),
    credits: 0,
    usage: [],
    keySets: [keySet],
    members: [ownerMembership(ids.ownerId, createdAt, products)],
    billingProfile: buildBillingProfile(params),
    createdAt,
    createdBy: ids.ownerId,
    isMaster: Boolean(options.isMaster),
  };
}

function ownerMembership(
  ownerId: string,
  createdAt: string,
  products: DefaultProducts,
): OrgMembership {
  return {
    userId: ownerId,
    roles: ownerRoles(),
    invitedAt: createdAt,
    joinedAt: createdAt,
    status: "active",
    productAccess: cloneProducts(products),
    usage: [],
    lastAccessed: null,
  };
}

function buildBillingProfile(params: CreateParams): Organization["billingProfile"] {
  return {
    contactEmail: params.billingEmail || params.ownerEmail,
    contactName: params.ownerName,
  };
}
