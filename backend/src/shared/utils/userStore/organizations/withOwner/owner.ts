import { createPasswordHash } from "../../passwords";
import { cloneProducts, ownerRoles } from "./products";
import type {
  CreateOptions,
  CreateParams,
  DefaultProducts,
  Identifiers,
} from "./types";
import type { UserAccount } from "../../../../types/Identity";

export function buildOwner(
  params: CreateParams,
  options: CreateOptions,
  ids: Identifiers,
  createdAt: string,
  products: DefaultProducts,
): UserAccount {
  return {
    id: ids.ownerId,
    email: params.ownerEmail,
    name: params.ownerName,
    passwordHash: createPasswordHash(params.ownerPassword),
    globalRoles: options.ownerGlobalRoles ?? [],
    organizations: [ownerLink(ids.orgId, products)],
    createdAt,
    status: "active",
  };
}

function ownerLink(
  orgId: string,
  products: DefaultProducts,
): UserAccount["organizations"][number] {
  return {
    orgId,
    roles: ownerRoles(),
    productAccess: cloneProducts(products),
  };
}
