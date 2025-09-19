import {
  API_PLATFORM_PRODUCT_ID,
  CV_PARSER_PRODUCT_ID,
  DOCUMENT_ANALYSIS_PRODUCT_ID,
} from "../../../types/Products";
import type { ProductId } from "../../../types/Products";

export const PRODUCT_SORT_ORDER: ProductId[] = [
  DOCUMENT_ANALYSIS_PRODUCT_ID,
  CV_PARSER_PRODUCT_ID,
  API_PLATFORM_PRODUCT_ID,
];

export function compareProducts(a: ProductId, b: ProductId): number {
  return PRODUCT_SORT_ORDER.indexOf(a) - PRODUCT_SORT_ORDER.indexOf(b);
}
