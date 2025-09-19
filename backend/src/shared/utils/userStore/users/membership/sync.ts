import { cloneProductConfig } from "../../../../types/Products";
import { now } from "../../time";
import type { OrgRole } from "../../../../types/Identity";
import type { OrgMembership, OrganizationLink, ProductList } from "./context";

export function syncUserLink(
  link: OrganizationLink | undefined,
  collection: OrganizationLink[],
  orgId: string,
  roles: OrgRole[],
  products: ProductList,
): void {
  const cloned = cloneProducts(products);
  if (link) {
    link.roles = roles;
    link.productAccess = cloned;
    return;
  }
  collection.push({ orgId, roles, productAccess: cloned });
}

export function syncMembership(
  membership: OrgMembership | undefined,
  collection: OrgMembership[],
  userId: string,
  roles: OrgRole[],
  products: ProductList,
): void {
  const cloned = cloneProducts(products);
  if (membership) {
    membership.roles = roles;
    membership.status = "active";
    membership.productAccess = cloned;
    ensureUsage(membership);
    return;
  }
  collection.push(createMembership(userId, roles, cloned));
}

function ensureUsage(membership: OrgMembership): void {
  if (!Array.isArray(membership.usage)) {
    membership.usage = [];
  }
  if (membership.lastAccessed === undefined) {
    membership.lastAccessed = null;
  }
}

function createMembership(
  userId: string,
  roles: OrgRole[],
  products: ProductList,
): OrgMembership {
  return {
    userId,
    roles,
    invitedAt: now(),
    joinedAt: now(),
    status: "active",
    productAccess: products,
    usage: [],
    lastAccessed: null,
  };
}

function cloneProducts(products: ProductList): ProductList {
  return products.map((config) => cloneProductConfig(config));
}
