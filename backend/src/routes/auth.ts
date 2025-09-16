import express, { Router } from "express";
import {
  createOrganizationWithOwner,
  getOrganization,
  getUserByEmail,
  isInternalOrg,
  toSafeOrganization,
  toSafeUser,
  updateUserLastLogin,
  verifyPassword,
} from "../utils/userStore";
import { issueDevToken } from "../utils/devAuth";

const router = Router();

router.post("/dev/signup", express.json(), async (req, res) => {
  const { organizationName, ownerEmail, ownerName, ownerPassword, billingEmail } = req.body;
  if (!organizationName || !ownerEmail || !ownerName || !ownerPassword) {
    res.status(400).json({ error: "Missing required fields" });
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
    const token = issueDevToken(owner.id);
    await updateUserLastLogin(owner.id);
    res.json({
      token,
      user: toSafeUser(owner),
      organization: toSafeOrganization(organization, {
        maskCosts: !isInternalOrg(organization.id),
      }),
      revealedApiKeys: apiKeys,
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
  if (!user || !verifyPassword(password, user.passwordHash)) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const token = issueDevToken(user.id);
  await updateUserLastLogin(user.id);
  const organizations = (
    await Promise.all(
      user.organizations.map(async (link) => {
        const org = await getOrganization(link.orgId);
        if (!org) return null;
        const maskCosts = !isInternalOrg(org.id);
        return toSafeOrganization(org, { maskCosts });
      }),
    )
  ).filter(
    (org): org is ReturnType<typeof toSafeOrganization> => org !== null,
  );

  res.json({
    token,
    user: toSafeUser(user),
    organizations,
  });
});

export default router;
