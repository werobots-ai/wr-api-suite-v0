import {
  API_PLATFORM_PRODUCT_ID,
  DOCUMENT_ANALYSIS_PRODUCT_ID,
  INSIGHTS_SANDBOX_PRODUCT_ID,
  ProductDefinition,
  ProductId,
  ProductKeyConfig,
  PRODUCT_CATALOG,
  cloneProductConfig,
  createDefaultApiPlatformConfig,
  createDefaultDocumentAnalysisConfig,
  createDefaultInsightsSandboxConfig,
} from "../../types/Products";

type ProductConfigInput =
  | (Partial<ProductKeyConfig> & { productId?: ProductId | string })
  | null
  | undefined;

function coerceDocumentPermissions(
  input: Partial<{
    permissions: Partial<Record<string, unknown>>;
  }>,
) {
  const permissions = input.permissions ?? {};
  return {
    createQuestionSet: Boolean(permissions.createQuestionSet),
    evaluateDocument: Boolean(permissions.evaluateDocument),
  };
}

function coerceInsightsOptions(
  input: Partial<{
    options: Partial<{ accessLevel?: unknown; betaFeatures?: unknown }>;
  }>,
) {
  const options = input.options ?? {};
  const access = options.accessLevel;
  const accessLevel: "none" | "read" | "write" =
    access === "read" || access === "write"
      ? access
      : "none";
  return {
    accessLevel,
    betaFeatures: Boolean(options.betaFeatures),
  };
}

function coerceApiPlatformOptions(
  input: Partial<{
    options: Partial<{ environment?: unknown; allowModelTraining?: unknown }>;
  }>,
) {
  const options = input.options ?? {};
  const environment: "sandbox" | "production" =
    options.environment === "production" ? "production" : "sandbox";
  return {
    environment,
    allowModelTraining: Boolean(options.allowModelTraining),
  };
}

const PRODUCT_SORT_ORDER: ProductId[] = [
  DOCUMENT_ANALYSIS_PRODUCT_ID,
  INSIGHTS_SANDBOX_PRODUCT_ID,
  API_PLATFORM_PRODUCT_ID,
];

export function normalizeProductConfigs(
  input: ProductConfigInput[] | null | undefined,
  options: { ensureDocument?: boolean } = {},
): ProductKeyConfig[] {
  const ensureDocument = options.ensureDocument !== false;
  const seen = new Set<ProductId>();
  const normalized: ProductKeyConfig[] = [];

  const entries = Array.isArray(input) ? input : [];
  for (const raw of entries) {
    if (!raw || typeof raw !== "object") continue;
    switch (raw.productId) {
      case DOCUMENT_ANALYSIS_PRODUCT_ID: {
        if (seen.has(DOCUMENT_ANALYSIS_PRODUCT_ID)) break;
        normalized.push(
          createDefaultDocumentAnalysisConfig(
            coerceDocumentPermissions(raw),
          ),
        );
        seen.add(DOCUMENT_ANALYSIS_PRODUCT_ID);
        break;
      }
      case INSIGHTS_SANDBOX_PRODUCT_ID: {
        if (seen.has(INSIGHTS_SANDBOX_PRODUCT_ID)) break;
        normalized.push(
          createDefaultInsightsSandboxConfig(coerceInsightsOptions(raw)),
        );
        seen.add(INSIGHTS_SANDBOX_PRODUCT_ID);
        break;
      }
      case API_PLATFORM_PRODUCT_ID: {
        if (seen.has(API_PLATFORM_PRODUCT_ID)) break;
        normalized.push(
          createDefaultApiPlatformConfig(coerceApiPlatformOptions(raw)),
        );
        seen.add(API_PLATFORM_PRODUCT_ID);
        break;
      }
      default:
        break;
    }
  }

  if (ensureDocument && !seen.has(DOCUMENT_ANALYSIS_PRODUCT_ID)) {
    normalized.push(
      createDefaultDocumentAnalysisConfig({
        createQuestionSet: true,
        evaluateDocument: true,
      }),
    );
  }

  normalized.sort(
    (a, b) =>
      PRODUCT_SORT_ORDER.indexOf(a.productId) -
      PRODUCT_SORT_ORDER.indexOf(b.productId),
  );

  return normalized;
}

export function getProductCatalog(): ProductDefinition<ProductKeyConfig>[] {
  return PRODUCT_CATALOG.map((definition) => ({
    ...definition,
    defaultConfig: cloneProductConfig(definition.defaultConfig),
  }));
}
