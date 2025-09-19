import { RequestHandler } from "express";
import { verifyAccessToken } from "../utils/keycloak/tokens";
import { getOrganization, getUser, toSafeUser } from "../utils/userStore";

export const requireAuth: RequestHandler = async (req, res, next) => {
  const header = req.header("authorization") || req.header("Authorization");
  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing bearer token" });
    return;
  }

  const token = header.replace(/^Bearer\s+/i, "");
  let userId: string;
  try {
    const payload = await verifyAccessToken(token);
    userId = payload.userId;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid or expired token";
    res.status(401).json({ error: message });
    return;
  }

  const user = await getUser(userId);
  if (!user || user.status !== "active") {
    res.status(403).json({ error: "User account disabled" });
    return;
  }

  const orgHeader = req.header("x-org-id");
  const linkedOrg = user.organizations[0]?.orgId;
  const activeOrgId = orgHeader || linkedOrg || null;

  if (!activeOrgId) {
    res.status(400).json({ error: "No organization selected" });
    return;
  }

  const org = await getOrganization(activeOrgId);
  if (!org) {
    res.status(404).json({ error: "Organization not found" });
    return;
  }

  const membership = org.members.find((m) => m.userId === user.id && m.status === "active");
  const isSysAdmin = user.globalRoles.some((role) =>
    role === "SYSADMIN" || role === "MASTER_ADMIN",
  );
  if (!membership && !isSysAdmin) {
    res.status(403).json({ error: "User does not belong to this organization" });
    return;
  }
  res.locals.user = toSafeUser(user);
  res.locals.userId = user.id;
  res.locals.activeOrgId = org.id;
  res.locals.membership = membership;
  res.locals.isSysAdmin = isSysAdmin;

  next();
};
