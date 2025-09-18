import { RequestHandler } from "express";
import {
  DOCUMENT_ANALYSIS_PRODUCT_ID,
  DocumentAnalysisPermission,
  ProductId,
  cloneProductConfig,
  isDocumentAnalysisConfig,
} from "../types/Products";
import {
  findOrgByApiKey,
  getOrganization,
  getUser,
  normalizeProductConfigs,
  toSafeUser,
} from "./userStore";
import { verifyDevToken } from "./devAuth";

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
    const authHeader =
      req.header("authorization") || req.header("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.replace(/^Bearer\s+/i, "");
      const session = verifyDevToken(token);
      if (!session) {
        res.status(401).json({ error: "Invalid or expired token" });
        return;
      }

      const user = await getUser(session.userId);
      if (!user || user.status !== "active") {
        res.status(403).json({ error: "User account disabled" });
        return;
      }

      const orgHeader = req.header("x-org-id");
      const linkedOrg = user.organizations[0]?.orgId ?? null;
      const activeOrgId = orgHeader || linkedOrg;
      if (!activeOrgId) {
        res.status(400).json({ error: "No organization selected" });
        return;
      }

      const organization = await getOrganization(activeOrgId);
      if (!organization) {
        res.status(404).json({ error: "Organization not found" });
        return;
      }

      const membership = organization.members.find(
        (member) => member.userId === user.id && member.status === "active",
      );
      const isSysAdmin = user.globalRoles.some(
        (role) => role === "SYSADMIN" || role === "MASTER_ADMIN",
      );
      if (!membership && !isSysAdmin) {
        res
          .status(403)
          .json({ error: "User does not belong to this organization" });
        return;
      }

      const accessProducts =
        membership?.productAccess ??
        (isSysAdmin
          ? normalizeProductConfigs(null, { ensureDocument: true })
          : []);
      const productConfig = accessProducts.find(
        (config) => config.productId === productId,
      );
      if (!productConfig) {
        res.status(403).json({ error: "User is not enabled for this product" });
        return;
      }

      const safeProductConfig = cloneProductConfig(productConfig);

      if (
        productId === DOCUMENT_ANALYSIS_PRODUCT_ID &&
        requireDocumentPermissions.length
      ) {
        if (!isDocumentAnalysisConfig(safeProductConfig)) {
          res
            .status(403)
            .json({ error: "User is missing document permissions" });
          return;
        }

        if (
          !hasDocumentPermissions(
            safeProductConfig.permissions,
            requireDocumentPermissions,
          )
        ) {
          res.status(403).json({ error: "Insufficient product permissions" });
          return;
        }
        res.locals.documentPermissions = safeProductConfig.permissions;
      }

      res.locals.orgId = organization.id;
      res.locals.activeOrgId = organization.id;
      res.locals.membership = membership;
      res.locals.isSysAdmin = isSysAdmin;
      res.locals.user = toSafeUser(user);
      res.locals.userId = user.id;
      res.locals.keySetId = undefined;
      res.locals.keyId = undefined;
      res.locals.productAccess = {
        productId,
        config: safeProductConfig,
        actorType: "user" as const,
      };
      res.locals.usageSource = "ui";

      next();
      return;
    }

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
      res
        .status(403)
        .json({ error: "API key is not enabled for this product" });
      return;
    }

    const safeProductConfig = cloneProductConfig(productConfig);

    if (
      productId === DOCUMENT_ANALYSIS_PRODUCT_ID &&
      requireDocumentPermissions.length
    ) {
      if (!isDocumentAnalysisConfig(safeProductConfig)) {
        res
          .status(403)
          .json({ error: "API key is missing document permissions" });
        return;
      }

      if (
        !hasDocumentPermissions(
          safeProductConfig.permissions,
          requireDocumentPermissions,
        )
      ) {
        res.status(403).json({ error: "Insufficient API key permissions" });
        return;
      }
      res.locals.documentPermissions = safeProductConfig.permissions;
    }

    res.locals.orgId = match.organization.id;
    res.locals.keySetId = match.keySet.id;
    res.locals.keyId = match.key.id;
    res.locals.productAccess = {
      productId,
      config: safeProductConfig,
      actorType: "apiKey" as const,
      keySetId: match.keySet.id,
      keyId: match.key.id,
    };
    res.locals.usageSource = "api";

    next();
  };
}

export const apiKeyAuth = createProductApiKeyAuth({
  productId: DOCUMENT_ANALYSIS_PRODUCT_ID,
});
