import {
  CV_PARSER_PRODUCT_ID,
  LEGACY_CV_PARSER_PRODUCT_ID,
  createDefaultCvParserConfig,
} from "../../../types/Products";
import type { ProductKeyConfig } from "../../../types/Products";

type CvParserOptions = {
  accessLevel?: unknown;
  betaFeatures?: unknown;
};

type CvParserInput = Partial<{ options: CvParserOptions }>;

export function buildCvParserConfig(input: CvParserInput): ProductKeyConfig {
  return createDefaultCvParserConfig(coerceOptions(input));
}

function coerceOptions(input: CvParserInput) {
  const options = input.options ?? {};
  const access = options.accessLevel;
  const accessLevel: "none" | "read" | "write" =
    access === "read" || access === "write" ? access : "none";
  return {
    accessLevel,
    betaFeatures: Boolean(options.betaFeatures),
  };
}

export function isCvParserConfig(productId: unknown): boolean {
  return productId === CV_PARSER_PRODUCT_ID;
}

export function isLegacyCvParser(productId: unknown): boolean {
  return productId === LEGACY_CV_PARSER_PRODUCT_ID;
}
