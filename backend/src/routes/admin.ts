import { Router, Response } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { getPlatformOverview, rotateApiKey } from "../utils/userStore";

const router = Router();

router.use(requireAuth);

function ensureSysAdmin(res: Response): boolean {
  if (!res.locals.isSysAdmin) {
    res.status(403).json({ error: "Admin access required" });
    return false;
  }
  return true;
}

router.get("/overview", async (_req, res) => {
  if (!ensureSysAdmin(res)) return;
  const overview = await getPlatformOverview();
  res.json(overview);
});

router.get("/organizations", async (_req, res) => {
  if (!ensureSysAdmin(res)) return;
  const overview = await getPlatformOverview();
  res.json({ organizations: overview.organizations });
});

router.post(
  "/organizations/:orgId/keysets/:setId/keys/:index/rotate",
  async (req, res) => {
    if (!ensureSysAdmin(res)) return;
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

export default router;
