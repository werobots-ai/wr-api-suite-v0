import type { ProductDefinition, ProductKeyConfig } from "../../../types/Products";
import { PRODUCT_CATALOG, cloneProductConfig } from "../../../types/Products";

export function getProductCatalog(): ProductDefinition<ProductKeyConfig>[] {
  return PRODUCT_CATALOG.map((definition) => ({
    ...definition,
    defaultConfig: cloneProductConfig(definition.defaultConfig),
  }));
}
