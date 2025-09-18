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
  | "evaluateDocument";

export interface DocumentAnalysisProductConfig {
  productId: typeof DOCUMENT_ANALYSIS_PRODUCT_ID;
  permissions: Record<DocumentAnalysisPermission, boolean>;
}

export interface CvParserProductConfig {
  productId: typeof CV_PARSER_PRODUCT_ID;
  options: {
    accessLevel: "none" | "read" | "write";
    betaFeatures: boolean;
  };
}

export interface ApiPlatformProductConfig {
  productId: typeof API_PLATFORM_PRODUCT_ID;
  options: {
    environment: "sandbox" | "production";
    allowModelTraining: boolean;
  };
}

export type ProductKeyConfig =
  | DocumentAnalysisProductConfig
  | CvParserProductConfig
  | ApiPlatformProductConfig;

export interface ProductDefinition<TConfig extends ProductKeyConfig> {
  id: ProductId;
  name: string;
  description: string;
  defaultConfig: TConfig;
}

export function createDefaultDocumentAnalysisConfig(
  overrides: Partial<DocumentAnalysisProductConfig["permissions"]> = {},
): DocumentAnalysisProductConfig {
  return {
    productId: DOCUMENT_ANALYSIS_PRODUCT_ID,
    permissions: {
      createQuestionSet: Boolean(overrides.createQuestionSet),
      evaluateDocument: Boolean(overrides.evaluateDocument),
    },
  };
}

export function createDefaultCvParserConfig(
  overrides: Partial<CvParserProductConfig["options"]> = {},
): CvParserProductConfig {
  return {
    productId: CV_PARSER_PRODUCT_ID,
    options: {
      accessLevel: overrides.accessLevel ?? "none",
      betaFeatures: Boolean(overrides.betaFeatures),
    },
  };
}

export function createDefaultApiPlatformConfig(
  overrides: Partial<ApiPlatformProductConfig["options"]> = {},
): ApiPlatformProductConfig {
  return {
    productId: API_PLATFORM_PRODUCT_ID,
    options: {
      environment: overrides.environment ?? "sandbox",
      allowModelTraining: Boolean(overrides.allowModelTraining),
    },
  };
}

export const PRODUCT_CATALOG: ProductDefinition<ProductKeyConfig>[] = [
  {
    id: DOCUMENT_ANALYSIS_PRODUCT_ID,
    name: "Document Analysis",
    description:
      "Generates question sets and evaluates uploaded documents for compliance, QA, and auditing pipelines.",
    defaultConfig: createDefaultDocumentAnalysisConfig(),
  },
  {
    id: CV_PARSER_PRODUCT_ID,
    name: "CV parser",
    description:
      "It will take CV inputs and output structured data with all relevant info from the resume.",
    defaultConfig: createDefaultCvParserConfig(),
  },
  {
    id: API_PLATFORM_PRODUCT_ID,
    name: "API Platform",
    description:
      "Future public API offering with dedicated rate limits and model access controls.",
    defaultConfig: createDefaultApiPlatformConfig(),
  },
];

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

export function cloneProductConfig<TConfig extends ProductKeyConfig>(
  config: TConfig,
): TConfig {
  return JSON.parse(JSON.stringify(config));
}
