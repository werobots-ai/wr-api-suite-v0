import type { ProductKeyConfig } from "../../../types/Products";
import {
  createDefaultDocumentAnalysisConfig,
  DOCUMENT_ANALYSIS_PRODUCT_ID,
} from "../../../types/Products";
import type { ProductConfigInput, ProductList } from "./types";
import { processEntries } from "./processor";
import { compareProducts } from "./order";

type NormalizeOptions = {
  ensureDocument?: boolean;
};

type EntryHandlers = {
  seen: Set<string>;
  normalized: ProductList;
};

export function normalizeProductConfigs(
  input: ProductConfigInput[] | null | undefined,
  options: NormalizeOptions = {},
): ProductKeyConfig[] {
  const handlers: EntryHandlers = { seen: new Set(), normalized: [] };
  const entries = Array.isArray(input) ? input : [];
  processEntries(entries, handlers);
  if (shouldEnsureDocument(options, handlers.seen)) {
    handlers.normalized.push(defaultDocumentConfig());
    handlers.seen.add(DOCUMENT_ANALYSIS_PRODUCT_ID);
  }
  handlers.normalized.sort((a, b) => compareProducts(a.productId, b.productId));
  return handlers.normalized;
}

function shouldEnsureDocument(
  options: NormalizeOptions,
  seen: Set<string>,
): boolean {
  return (
    options.ensureDocument !== false &&
    !seen.has(DOCUMENT_ANALYSIS_PRODUCT_ID)
  );
}

function defaultDocumentConfig(): ProductKeyConfig {
  return createDefaultDocumentAnalysisConfig({
    createQuestionSet: true,
    editQuestionSet: true,
    manageQuestionSetActivation: true,
    evaluateDocument: true,
  });
}
