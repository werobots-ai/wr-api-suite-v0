import {
  API_PLATFORM_PRODUCT_ID,
  createDefaultApiPlatformConfig,
} from "../../../types/Products";
import type { ProductKeyConfig } from "../../../types/Products";

type ApiPlatformOptions = {
  environment?: unknown;
  allowModelTraining?: unknown;
};

type ApiPlatformInput = Partial<{ options: ApiPlatformOptions }>;

export function buildApiPlatformConfig(
  input: ApiPlatformInput,
): ProductKeyConfig {
  return createDefaultApiPlatformConfig(coerceOptions(input));
}

function coerceOptions(input: ApiPlatformInput) {
  const options = input.options ?? {};
  const environment: "sandbox" | "production" =
    options.environment === "production" ? "production" : "sandbox";
  return {
    environment,
    allowModelTraining: Boolean(options.allowModelTraining),
  };
}

export function isApiPlatformConfig(productId: unknown): boolean {
  return productId === API_PLATFORM_PRODUCT_ID;
}
