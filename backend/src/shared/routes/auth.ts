import express, { Router } from "express";
import {
  createOrganizationWithOwner,
  getIdentityStore,
  getOrganization,
  getUserByEmail,
  toSafeOrganization,
  toSafeUser,
  updateUserLastLogin,
} from "../utils/userStore";
import {
  authenticateWithPassword,
  verifyAccessToken,
} from "../utils/keycloak/tokens";

const router = Router();

router.get("/dev/status", async (_req, res) => {
  const store = await getIdentityStore();
  const needsBootstrap = Object.keys(store.users).length === 0;
  res.json({
    needsBootstrap,
    bootstrapCompletedAt: store.metadata.bootstrapCompletedAt,
    organizationCount: Object.keys(store.organizations).length,
  });
});

router.post("/dev/signup", express.json(), async (req, res) => {
  const { organizationName, ownerEmail, ownerName, ownerPassword, billingEmail } = req.body;
  if (!organizationName || !ownerEmail || !ownerName || !ownerPassword) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  const store = await getIdentityStore();
  if (Object.keys(store.users).length === 0) {
    res.status(409).json({ error: "Instance requires master bootstrap" });
    return;
  }

  try {
    const { organization, owner, apiKeys } = await createOrganizationWithOwner({
      organizationName,
      ownerEmail,
      ownerName,
      ownerPassword,
      billingEmail,
    });
    const auth = await authenticateWithPassword(ownerEmail, ownerPassword);
    const token = auth.accessToken;
    await updateUserLastLogin(owner.id);
    res.json({
      token,
      user: toSafeUser(owner),
      organization: toSafeOrganization(organization, {
        maskCosts: !organization.isMaster,
      }),
      revealedApiKeys: apiKeys,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(400).json({ error: message });
  }
});

router.post("/dev/bootstrap", express.json(), async (req, res) => {
  const {
    organizationName,
    ownerEmail,
    ownerName,
    ownerPassword,
    billingEmail,
  } = req.body;
  if (!organizationName || !ownerEmail || !ownerName || !ownerPassword) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  const store = await getIdentityStore();
  if (Object.keys(store.users).length > 0) {
    res.status(409).json({ error: "Bootstrap already completed" });
    return;
  }

  try {
    const { organization, owner, apiKeys } = await createOrganizationWithOwner(
      {
        organizationName,
        ownerEmail,
        ownerName,
        ownerPassword,
        billingEmail,
      },
      {
        isMaster: true,
        ownerGlobalRoles: ["MASTER_ADMIN"],
        markBootstrapComplete: true,
      },
    );
    const auth = await authenticateWithPassword(ownerEmail, ownerPassword);
    const token = auth.accessToken;
    await updateUserLastLogin(owner.id);
    const updatedStore = await getIdentityStore();
    res.json({
      token,
      user: toSafeUser(owner),
      organization: toSafeOrganization(organization, { maskCosts: false }),
      revealedApiKeys: apiKeys,
      bootstrapCompletedAt: updatedStore.metadata.bootstrapCompletedAt,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(400).json({ error: message });
  }
});

router.post("/dev/login", express.json(), async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ error: "Missing credentials" });
    return;
  }

  const user = await getUserByEmail(email);
  try {
    const auth = await authenticateWithPassword(email, password);
    const payload = await verifyAccessToken(auth.accessToken);
    if (!user || user.id !== payload.userId) {
      res.status(401).json({ error: "Account mismatch" });
      return;
    }
    await updateUserLastLogin(user.id);
    const organizations = (
      await Promise.all(
        user.organizations.map(async (link) => {
          const org = await getOrganization(link.orgId);
          if (!org) return null;
          const maskCosts = !org.isMaster;
          return toSafeOrganization(org, { maskCosts });
        }),
      )
    ).filter(
      (org): org is ReturnType<typeof toSafeOrganization> => org !== null,
    );

    res.json({
      token: auth.accessToken,
      user: toSafeUser(user),
      organizations,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Authentication failed";
    res.status(401).json({ error: message });
  }
});

export default router;
