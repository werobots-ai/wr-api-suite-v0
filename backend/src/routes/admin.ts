import express, { Router, Response } from "express";
import { requireAuth } from "../middleware/requireAuth";
import {
  getPlatformOverview,
  rotateApiKey,
  setOrganizationMasterStatus,
  toSafeOrganization,
  userHasMasterOrgAccess,
} from "../utils/userStore";

const router = Router();

router.use(requireAuth);

async function ensureMasterAccess(res: Response): Promise<boolean> {
  if (res.locals.isSysAdmin) {
    return true;
  }
  const userId = res.locals.userId as string | undefined;
  if (!userId) {
    res.status(403).json({ error: "Master access required" });
    return false;
  }
  if (await userHasMasterOrgAccess(userId)) {
    return true;
  }
  res.status(403).json({ error: "Master access required" });
  return false;
}

router.get("/overview", async (_req, res) => {
  if (!(await ensureMasterAccess(res))) return;
  const overview = await getPlatformOverview();
  res.json(overview);
});

router.get("/organizations", async (_req, res) => {
  if (!(await ensureMasterAccess(res))) return;
  const overview = await getPlatformOverview();
  res.json({ organizations: overview.organizations });
});

router.post(
  "/organizations/:orgId/keysets/:setId/keys/:index/rotate",
  async (req, res) => {
    if (!(await ensureMasterAccess(res))) return;
    const { orgId, setId, index } = req.params;
    const parsed = Number(index);
    if (Number.isNaN(parsed)) {
      res.status(400).json({ error: "Invalid key index" });
      return;
    }
    try {
      const { apiKey, safeKey } = await rotateApiKey(
        orgId,
        setId,
        parsed,
        res.locals.userId as string,
      );
      res.json({ apiKey, key: safeKey });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(400).json({ error: message });
    }
  },
);

router.patch(
  "/organizations/:orgId/master",
  express.json(),
  async (req, res) => {
    if (!(await ensureMasterAccess(res))) return;
    const { orgId } = req.params;
    const { isMaster } = req.body as { isMaster?: unknown };
    if (typeof isMaster !== "boolean") {
      res.status(400).json({ error: "isMaster must be a boolean" });
      return;
    }
    try {
      const org = await setOrganizationMasterStatus(orgId, isMaster);
      res.json({
        organization: toSafeOrganization(org, { maskCosts: !org.isMaster }),
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(400).json({ error: message });
    }
  },
);

export default router;
