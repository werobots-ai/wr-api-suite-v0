import { v4 as uuid } from "uuid";

import { cloneProductConfig } from "../../../../types/Products";
import { normalizeProductConfigs } from "../../productConfig";
import type { DefaultProducts, Identifiers, OwnerRoles } from "./types";

const OWNER_ROLES: OwnerRoles = ["OWNER", "ADMIN", "BILLING"];

export function createIdentifiers(): Identifiers {
  return { ownerId: uuid(), orgId: uuid() };
}

export function defaultProducts(): DefaultProducts {
  return normalizeProductConfigs(null, { ensureDocument: true });
}

export function cloneProducts(products: DefaultProducts): DefaultProducts {
  return products.map((config) => cloneProductConfig(config));
}

export function ownerRoles(): OwnerRoles {
  return [...OWNER_ROLES];
}
