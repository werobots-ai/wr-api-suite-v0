import test from "node:test";
import assert from "node:assert/strict";

import {
  API_PLATFORM_PRODUCT_ID,
  DOCUMENT_ANALYSIS_PRODUCT_ID,
  CV_PARSER_PRODUCT_ID,
  LEGACY_CV_PARSER_PRODUCT_ID,
  PRODUCT_CATALOG,
  createDefaultApiPlatformConfig,
  createDefaultDocumentAnalysisConfig,
  createDefaultCvParserConfig,
  cloneProductConfig,
  isApiPlatformConfig,
  isDocumentAnalysisConfig,
  isCvParserConfig,
} from "../src/shared/types/Products";
import {
  getProductCatalog,
  normalizeProductConfigs,
} from "../src/shared/utils/userStore/productConfig";

test("default product config helpers coerce overrides", () => {
  const documentConfig = createDefaultDocumentAnalysisConfig({
    createQuestionSet: true,
  });
  assert.equal(documentConfig.productId, DOCUMENT_ANALYSIS_PRODUCT_ID);
  assert.equal(documentConfig.permissions.createQuestionSet, true);
  assert.equal(documentConfig.permissions.evaluateDocument, false);
  assert.equal(isDocumentAnalysisConfig(documentConfig), true);

  const cvParserConfig = createDefaultCvParserConfig({
    accessLevel: "write",
    betaFeatures: true,
  });
  assert.equal(cvParserConfig.options.accessLevel, "write");
  assert.equal(cvParserConfig.options.betaFeatures, true);
  assert.equal(isCvParserConfig(cvParserConfig), true);

  const apiConfig = createDefaultApiPlatformConfig({
    environment: "production",
    allowModelTraining: true,
  });
  assert.equal(apiConfig.options.environment, "production");
  assert.equal(apiConfig.options.allowModelTraining, true);
  assert.equal(isApiPlatformConfig(apiConfig), true);

  const clone = cloneProductConfig(apiConfig);
  clone.options.environment = "sandbox";
  assert.equal(apiConfig.options.environment, "production");
});

test("normalizeProductConfigs deduplicates and fills defaults", () => {
  const normalized = normalizeProductConfigs([
    {
      productId: DOCUMENT_ANALYSIS_PRODUCT_ID,
      permissions: { createQuestionSet: "yes" },
    },
    {
      productId: DOCUMENT_ANALYSIS_PRODUCT_ID,
    },
    {
      productId: API_PLATFORM_PRODUCT_ID,
      options: { environment: "production", allowModelTraining: 0 },
    },
    {
      productId: "unknown-product",
    },
    {
      productId: "",
    },
    {
      productId: LEGACY_CV_PARSER_PRODUCT_ID,
      options: { accessLevel: "write", betaFeatures: "" },
    },
  ] as any);

  assert.deepEqual(normalized.map((c) => c.productId), [
    DOCUMENT_ANALYSIS_PRODUCT_ID,
    CV_PARSER_PRODUCT_ID,
    API_PLATFORM_PRODUCT_ID,
  ]);
  const document = normalized[0];
  assert.equal(isDocumentAnalysisConfig(document), true);
  if (isDocumentAnalysisConfig(document)) {
    assert.equal(document.permissions.createQuestionSet, true);
    assert.equal(document.permissions.evaluateDocument, false);
  }

  const cvParser = normalized[1];
  assert.equal(isCvParserConfig(cvParser), true);
  if (isCvParserConfig(cvParser)) {
    assert.equal(cvParser.options.accessLevel, "write");
    assert.equal(cvParser.options.betaFeatures, false);
  }

  const api = normalized[2];
  assert.equal(isApiPlatformConfig(api), true);
  if (isApiPlatformConfig(api)) {
    assert.equal(api.options.environment, "production");
    assert.equal(api.options.allowModelTraining, false);
  }
});

test("normalizeProductConfigs respects ensureDocument flag", () => {
  const normalized = normalizeProductConfigs(
    [
      {
        productId: API_PLATFORM_PRODUCT_ID,
      },
    ],
    { ensureDocument: false },
  );

  assert.deepEqual(normalized, [
    createDefaultApiPlatformConfig(),
  ]);
});

test("normalizeProductConfigs adds document analysis when missing", () => {
  const normalized = normalizeProductConfigs([
    {
      productId: API_PLATFORM_PRODUCT_ID,
    },
  ]);

  const document = normalized[0];
  assert.equal(document.productId, DOCUMENT_ANALYSIS_PRODUCT_ID);
  assert.equal(isDocumentAnalysisConfig(document), true);
  if (isDocumentAnalysisConfig(document)) {
    assert.equal(document.permissions.createQuestionSet, true);
    assert.equal(document.permissions.evaluateDocument, true);
  }
});

test("getProductCatalog returns deep clones of definitions", () => {
  const first = getProductCatalog();
  const second = getProductCatalog();

  first[0].defaultConfig = createDefaultDocumentAnalysisConfig({
    createQuestionSet: true,
  });

  const secondDefault = second[0].defaultConfig;
  assert.equal(secondDefault.productId, DOCUMENT_ANALYSIS_PRODUCT_ID);
  assert.equal(isDocumentAnalysisConfig(secondDefault), true);
  if (isDocumentAnalysisConfig(secondDefault)) {
    assert.equal(secondDefault.permissions.createQuestionSet, false);
  }

  const catalogDefault = PRODUCT_CATALOG[0].defaultConfig;
  assert.equal(catalogDefault.productId, DOCUMENT_ANALYSIS_PRODUCT_ID);
  assert.equal(isDocumentAnalysisConfig(catalogDefault), true);
  if (isDocumentAnalysisConfig(catalogDefault)) {
    assert.equal(catalogDefault.permissions.createQuestionSet, false);
  }
});
