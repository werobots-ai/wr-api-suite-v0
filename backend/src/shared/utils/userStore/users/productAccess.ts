import { normalizeProductConfigs } from "../productConfig";
import type { ProductKeyConfig } from "../../../types/Products";

type ProductHolder = { productAccess?: ProductKeyConfig[] } | undefined;

type ProductRequest = ProductKeyConfig[] | undefined;

export function resolveProductAccess(
  requested: ProductRequest,
  link: ProductHolder,
  membership: ProductHolder,
): ProductKeyConfig[] {
  if (requested !== undefined) {
    return normalizeProductConfigs(requested, { ensureDocument: true });
  }
  if (link?.productAccess) {
    return normalizeProductConfigs(link.productAccess, {
      ensureDocument: true,
    });
  }
  if (membership?.productAccess) {
    return normalizeProductConfigs(membership.productAccess, {
      ensureDocument: true,
    });
  }
  return normalizeProductConfigs(null, { ensureDocument: true });
}
