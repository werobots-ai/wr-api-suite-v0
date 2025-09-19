import type { KeySet } from "../../../types/Identity";
import { cloneProductConfig } from "../../../types/Products";
import type { SafeEntityOptions } from "./options";
import { toSafeKey } from "./keys";

export function toSafeKeySet(
  set: KeySet,
  options: SafeEntityOptions = {},
) {
  return {
    id: set.id,
    name: set.name,
    description: set.description,
    createdAt: set.createdAt,
    createdBy: set.createdBy,
    keys: set.keys.map((key) => toSafeKey(key, options)),
    products: set.products.map((product) => cloneProductConfig(product)),
  };
}
