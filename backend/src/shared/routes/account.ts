import express, { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import {
  addKeySet,
  createOrUpdateOrgUser,
  getOrganization,
  getUsersForOrganization,
  getProductCatalog,
  removeKeySet,
  rotateApiKey,
  toSafeOrganization,
  toSafeUser,
  topUpOrganization,
  normalizeProductConfigs,
} from "../utils/userStore";
import { OrgRole } from "../types/Identity";
import {
  DOCUMENT_ANALYSIS_PRODUCT_ID,
  isDocumentAnalysisConfig,
  ProductKeyConfig,
  cloneProductConfig,
} from "../types/Products";
import {
  assertPermission,
  sanitizeOrganizationForRoles,
} from "./account/access";

const router = Router();

router.use(requireAuth);

function getEffectiveRoles(res: express.Response): OrgRole[] {
  const membership =
    (res.locals.membership as { roles?: OrgRole[] } | undefined) ?? undefined;
  const isSysAdmin = Boolean(res.locals.isSysAdmin);
  const baseRoles = membership?.roles ?? [];
  if (isSysAdmin) {
    return ["OWNER", "ADMIN", "BILLING", "MEMBER"];
  }
  return baseRoles;
}


router.get("/", async (req, res) => {
  const orgId = res.locals.activeOrgId as string;
  const user = res.locals.user;
  const roles = getEffectiveRoles(res);
  const membership = res.locals.membership as
    | { productAccess?: ProductKeyConfig[] }
    | undefined;
  const organization = await getOrganization(orgId);
  if (!organization) {
    res.status(404).json({ error: "Organization not found" });
    return;
  }

  const canViewInternalCosts =
    organization.isMaster || Boolean(res.locals.isSysAdmin);

  const baseProductAccess =
    membership?.productAccess ??
    (res.locals.isSysAdmin
      ? normalizeProductConfigs(null, { ensureDocument: true })
      : []);
  const productAccess = baseProductAccess.map((config) =>
    cloneProductConfig(config),
  );
  const documentEntry =
    productAccess.find(
      (config) => config.productId === DOCUMENT_ANALYSIS_PRODUCT_ID,
    ) ?? null;
  const documentAccess =
    documentEntry && isDocumentAnalysisConfig(documentEntry)
      ? documentEntry
      : null;

  const permissions = {
    manageBilling: assertPermission(roles, ["OWNER", "BILLING"]),
    manageKeys: assertPermission(roles, ["OWNER", "ADMIN"]),
    manageUsers: assertPermission(roles, ["OWNER", "ADMIN"]),
    viewInternalCosts: canViewInternalCosts,
  };

  const maskCosts = !organization.isMaster;
  const safeOrganization = toSafeOrganization(organization, {
    maskCosts,
  });
  const organizationResponse = sanitizeOrganizationForRoles(
    safeOrganization,
    roles,
    { isSysAdmin: Boolean(res.locals.isSysAdmin) },
  );

  res.json({
    organization: organizationResponse,
    user,
    permissions,
    productCatalog: getProductCatalog(),
    productAccess,
    documentAccess,
  });
});

router.get("/organizations", async (_req, res) => {
  const user = res.locals.user as {
    organizations: { orgId: string; roles?: OrgRole[] }[];
  };
  const isSysAdmin = Boolean(res.locals.isSysAdmin);
  const organizations = (
    await Promise.all(
      user.organizations.map(async (link) => {
        const org = await getOrganization(link.orgId);
        if (!org) return null;
        const maskCosts = !org.isMaster;
        const safeOrganization = toSafeOrganization(org, { maskCosts });
        const roles = Array.isArray(link.roles) ? link.roles : [];
        return sanitizeOrganizationForRoles(safeOrganization, roles, {
          isSysAdmin,
        });
      }),
    )
  ).filter(
    (org): org is ReturnType<typeof toSafeOrganization> => org !== null,
  );

  res.json({ organizations });
});

router.post("/topup", express.json(), async (req, res) => {
  const roles = getEffectiveRoles(res);
  if (!assertPermission(roles, ["OWNER", "BILLING"])) {
    res.status(403).json({ error: "Insufficient permissions" });
    return;
  }

  const { amount } = req.body;
  const num = Number(amount);
  if (!num || num <= 0) {
    res.status(400).json({ error: "Invalid amount" });
    return;
  }
  const orgId = res.locals.activeOrgId as string;
  const org = await topUpOrganization(orgId, num);
  res.json({ credits: org.credits });
});

router.post("/keysets", express.json(), async (req, res) => {
  const roles = getEffectiveRoles(res);
  if (!assertPermission(roles, ["OWNER", "ADMIN"])) {
    res.status(403).json({ error: "Insufficient permissions" });
    return;
  }

  const { name, description, products } = req.body;
  if (!name) {
    res.status(400).json({ error: "Name is required" });
    return;
  }
  const orgId = res.locals.activeOrgId as string;
  const actorId = res.locals.userId as string;
  const org = await getOrganization(orgId);
  if (!org) {
    res.status(404).json({ error: "Organization not found" });
    return;
  }
  const maskCosts = !org.isMaster;
  const normalizedProducts = normalizeProductConfigs(products, {
    ensureDocument: true,
  });
  const result = await addKeySet(
    {
      orgId,
      actorId,
      name,
      description: description || "",
      products: normalizedProducts,
    },
    { maskCosts },
  );
  res.json(result);
});

router.delete("/keysets/:id", async (req, res) => {
  const roles = getEffectiveRoles(res);
  if (!assertPermission(roles, ["OWNER", "ADMIN"])) {
    res.status(403).json({ error: "Insufficient permissions" });
    return;
  }
  const orgId = res.locals.activeOrgId as string;
  await removeKeySet(orgId, req.params.id);
  res.json({ ok: true });
});

router.post("/keysets/:id/keys/:index/rotate", async (req, res) => {
  const roles = getEffectiveRoles(res);
  if (!assertPermission(roles, ["OWNER", "ADMIN"])) {
    res.status(403).json({ error: "Insufficient permissions" });
    return;
  }

  const orgId = res.locals.activeOrgId as string;
  const actorId = res.locals.userId as string;
  const { id, index } = req.params;
  const parsed = Number(index);
  if (Number.isNaN(parsed)) {
    res.status(400).json({ error: "Invalid key index" });
    return;
  }
  try {
    const org = await getOrganization(orgId);
    if (!org) {
      res.status(404).json({ error: "Organization not found" });
      return;
    }
    const maskCosts = !org.isMaster;
    const { apiKey, safeKey } = await rotateApiKey(orgId, id, parsed, actorId, {
      maskCosts,
    });
    res.json({ apiKey, key: safeKey });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(400).json({ error: message });
  }
});

router.get("/users", async (req, res) => {
  const roles = getEffectiveRoles(res);
  if (!assertPermission(roles, ["OWNER", "ADMIN", "BILLING"])) {
    res.status(403).json({ error: "Insufficient permissions" });
    return;
  }

  const orgId = res.locals.activeOrgId as string;
  const org = await getOrganization(orgId);
  if (!org) {
    res.status(404).json({ error: "Organization not found" });
    return;
  }
  const maskCosts = !org.isMaster;

  const users = await getUsersForOrganization(orgId);
  const mapped = users.map((user) => {
    const membership = org.members.find((m) => m.userId === user.id);
    const productAccess = membership
      ? membership.productAccess.map((config) => cloneProductConfig(config))
      : [];
    const usage = (membership?.usage ?? []).map((entry) => ({
      ...entry,
      tokenCost: maskCosts ? null : entry.tokenCost,
    }));
    return {
      ...toSafeUser(user),
      roles: membership?.roles ?? [],
      productAccess,
      usage,
      lastAccessed: membership?.lastAccessed ?? null,
    };
  });

  res.json({ members: mapped });
});

router.post("/users", express.json(), async (req, res) => {
  const roles = getEffectiveRoles(res);
  if (!assertPermission(roles, ["OWNER", "ADMIN"])) {
    res.status(403).json({ error: "Insufficient permissions" });
    return;
  }

  const {
    email,
    name,
    roles: requestedRoles,
    password,
    productAccess: requestedProducts,
  } = req.body as {
    email: string;
    name: string;
    roles: OrgRole[];
    password?: string;
    productAccess?: unknown;
  };

  if (!email || !name || !requestedRoles?.length) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  const allowedRoles: OrgRole[] = ["OWNER", "ADMIN", "BILLING", "MEMBER"];
  const invalidRole = requestedRoles.find((role) => !allowedRoles.includes(role));
  if (invalidRole) {
    res.status(400).json({ error: `Invalid role: ${invalidRole}` });
    return;
  }

  const orgId = res.locals.activeOrgId as string;
  const productAccessInput = Array.isArray(requestedProducts)
    ? requestedProducts
    : undefined;
  const normalizedProductAccess =
    productAccessInput !== undefined
      ? normalizeProductConfigs(productAccessInput, { ensureDocument: true })
      : undefined;
  const { user, generatedPassword, isNewUser } = await createOrUpdateOrgUser({
    orgId,
    email,
    name,
    roles: requestedRoles,
    password,
    productAccess: normalizedProductAccess,
  });

  const link = user.organizations.find((o) => o.orgId === orgId);
  const safeProductAccess = link
    ? link.productAccess.map((config) => cloneProductConfig(config))
    : [];
  const refreshedOrg = await getOrganization(orgId);
  const memberRecord = refreshedOrg?.members.find((m) => m.userId === user.id);
  const maskCosts = !(refreshedOrg?.isMaster ?? false);
  const usage = (memberRecord?.usage ?? []).map((entry) => ({
    ...entry,
    tokenCost: maskCosts ? null : entry.tokenCost,
  }));

  res.json({
    user: {
      ...toSafeUser(user),
      roles: requestedRoles,
      productAccess: safeProductAccess,
      usage,
      lastAccessed: memberRecord?.lastAccessed ?? null,
    },
    generatedPassword,
    isNewUser,
  });
});

export default router;
