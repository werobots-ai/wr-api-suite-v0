import { RequestHandler } from "express";
import { findOrgByApiKey } from "./userStore";
import {
  DOCUMENT_ANALYSIS_PRODUCT_ID,
  DocumentAnalysisPermission,
  ProductId,
  isDocumentAnalysisConfig,
} from "../types/Products";

interface ProductAuthOptions {
  productId: ProductId;
  requireDocumentPermissions?: DocumentAnalysisPermission[];
}

function hasDocumentPermissions(
  permissions: Record<DocumentAnalysisPermission, boolean>,
  required: DocumentAnalysisPermission[],
) {
  return required.every((permission) => permissions[permission]);
}

export function createProductApiKeyAuth({
  productId,
  requireDocumentPermissions = [],
}: ProductAuthOptions): RequestHandler {
  return async (req, res, next) => {
    const apiKey = req.header("x-api-key");
    if (!apiKey) {
      res.status(401).json({ error: "Missing API key" });
      return;
    }

    const match = await findOrgByApiKey(apiKey, { recordAccess: true });
    if (!match) {
      res.status(401).json({ error: "Invalid API key" });
      return;
    }

    const productConfig = match.keySet.products.find(
      (config) => config.productId === productId,
    );

    if (!productConfig) {
      res.status(403).json({ error: "API key is not enabled for this product" });
      return;
    }

    if (
      productId === DOCUMENT_ANALYSIS_PRODUCT_ID &&
      requireDocumentPermissions.length
    ) {
      if (!isDocumentAnalysisConfig(productConfig)) {
        res
          .status(403)
          .json({ error: "API key is missing document permissions" });
        return;
      }

      if (
        !hasDocumentPermissions(
          productConfig.permissions,
          requireDocumentPermissions,
        )
      ) {
        res.status(403).json({ error: "Insufficient API key permissions" });
        return;
      }
      res.locals.documentPermissions = productConfig.permissions;
    }

    res.locals.orgId = match.organization.id;
    res.locals.keySetId = match.keySet.id;
    res.locals.keyId = match.key.id;
    res.locals.productAccess = {
      productId,
      config: productConfig,
    };

    next();
  };
}

export const apiKeyAuth = createProductApiKeyAuth({
  productId: DOCUMENT_ANALYSIS_PRODUCT_ID,
});
