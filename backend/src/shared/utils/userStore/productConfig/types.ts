import type { ProductId, ProductKeyConfig } from "../../../types/Products";

export type ProductConfigInput =
  | (Partial<ProductKeyConfig> & { productId?: ProductId | string })
  | null
  | undefined;

export type ProductList = ProductKeyConfig[];
