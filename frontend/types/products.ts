export const DOCUMENT_ANALYSIS_PRODUCT_ID = "document-analysis" as const;
export const INSIGHTS_SANDBOX_PRODUCT_ID = "insights-sandbox" as const;
export const API_PLATFORM_PRODUCT_ID = "api-platform" as const;

export type ProductId =
  | typeof DOCUMENT_ANALYSIS_PRODUCT_ID
  | typeof INSIGHTS_SANDBOX_PRODUCT_ID
  | typeof API_PLATFORM_PRODUCT_ID;

export type DocumentAnalysisPermission =
  | "createQuestionSet"
  | "evaluateDocument";

export type DocumentAnalysisProductConfig = {
  productId: typeof DOCUMENT_ANALYSIS_PRODUCT_ID;
  permissions: Record<DocumentAnalysisPermission, boolean>;
};

export type InsightsSandboxProductConfig = {
  productId: typeof INSIGHTS_SANDBOX_PRODUCT_ID;
  options: {
    accessLevel: "none" | "read" | "write";
    betaFeatures: boolean;
  };
};

export type ApiPlatformProductConfig = {
  productId: typeof API_PLATFORM_PRODUCT_ID;
  options: {
    environment: "sandbox" | "production";
    allowModelTraining: boolean;
  };
};

export type ProductKeyConfig =
  | DocumentAnalysisProductConfig
  | InsightsSandboxProductConfig
  | ApiPlatformProductConfig;

export type ProductDefinition = {
  id: ProductId;
  name: string;
  description: string;
  defaultConfig: ProductKeyConfig;
};

export function isDocumentAnalysisConfig(
  config: ProductKeyConfig,
): config is DocumentAnalysisProductConfig {
  return config.productId === DOCUMENT_ANALYSIS_PRODUCT_ID;
}

export function isInsightsSandboxConfig(
  config: ProductKeyConfig,
): config is InsightsSandboxProductConfig {
  return config.productId === INSIGHTS_SANDBOX_PRODUCT_ID;
}

export function isApiPlatformConfig(
  config: ProductKeyConfig,
): config is ApiPlatformProductConfig {
  return config.productId === API_PLATFORM_PRODUCT_ID;
}

export function cloneProductConfig<T extends ProductKeyConfig>(config: T): T {
  return JSON.parse(JSON.stringify(config));
}
