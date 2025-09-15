import { Router } from "express";
import { getUsers, rotateApiKey } from "../utils/userStore";

const router = Router();

router.get("/users", async (_req, res) => {
  const users = await getUsers();
  const masked = users.map((u) => ({
    id: u.id,
    name: u.name,
    credits: u.credits,
    usage: u.usage,
    keySets: u.keySets.map((ks) => ({
      id: ks.id,
      name: ks.name,
      description: ks.description,
      keys: ks.keys.map((k) => ({
        id: k.id,
        key: k.key.replace(/.(?=.{4})/g, "*"),
        lastRotated: k.lastRotated,
        usage: k.usage,
      })),
    })),
  }));
  res.json(masked);
});

router.post(
  "/users/:userId/keysets/:setId/keys/:index/rotate",
  async (req, res) => {
    const { userId, setId, index } = req.params;
    try {
      const key = await rotateApiKey(setId, Number(index), userId);
      res.json({ apiKey: key });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  },
);

export default router;

