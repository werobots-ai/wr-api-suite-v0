import {
  DOCUMENT_ANALYSIS_PRODUCT_ID,
  createDefaultDocumentAnalysisConfig,
} from "../../../types/Products";
import type { ProductKeyConfig } from "../../../types/Products";

export function buildDocumentConfig(
  input: Partial<{ permissions: Partial<Record<string, unknown>> }>,
): ProductKeyConfig {
  return createDefaultDocumentAnalysisConfig(coercePermissions(input));
}

function coercePermissions(
  input: Partial<{ permissions: Partial<Record<string, unknown>> }>,
) {
  const permissions = input.permissions ?? {};
  return {
    createQuestionSet: Boolean(permissions.createQuestionSet),
    editQuestionSet: Boolean(permissions.editQuestionSet),
    manageQuestionSetActivation: Boolean(
      permissions.manageQuestionSetActivation,
    ),
    evaluateDocument: Boolean(permissions.evaluateDocument),
  };
}

export function isDocumentConfig(productId: unknown): boolean {
  return productId === DOCUMENT_ANALYSIS_PRODUCT_ID;
}
