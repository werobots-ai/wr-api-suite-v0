export const DOCUMENT_ANALYSIS_PRODUCT_ID = "document-analysis" as const;
export const CV_PARSER_PRODUCT_ID = "cv-parser" as const;
// Temporary alias to migrate previously stored product IDs.
export const LEGACY_CV_PARSER_PRODUCT_ID = "insights-sandbox" as const;
export const API_PLATFORM_PRODUCT_ID = "api-platform" as const;

export type ProductId =
  | typeof DOCUMENT_ANALYSIS_PRODUCT_ID
  | typeof CV_PARSER_PRODUCT_ID
  | typeof API_PLATFORM_PRODUCT_ID;

export type DocumentAnalysisPermission =
  | "createQuestionSet"
  | "editQuestionSet"
  | "manageQuestionSetActivation"
  | "evaluateDocument";

export type DocumentAnalysisProductConfig = {
  productId: typeof DOCUMENT_ANALYSIS_PRODUCT_ID;
  permissions: Record<DocumentAnalysisPermission, boolean>;
};

export type CvParserProductConfig = {
  productId: typeof CV_PARSER_PRODUCT_ID;
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
  | CvParserProductConfig
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

export function isCvParserConfig(
  config: ProductKeyConfig,
): config is CvParserProductConfig {
  return config.productId === CV_PARSER_PRODUCT_ID;
}

export function isApiPlatformConfig(
  config: ProductKeyConfig,
): config is ApiPlatformProductConfig {
  return config.productId === API_PLATFORM_PRODUCT_ID;
}

export function cloneProductConfig<T extends ProductKeyConfig>(config: T): T {
  return JSON.parse(JSON.stringify(config));
}
