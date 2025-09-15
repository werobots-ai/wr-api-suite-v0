import express, { Router } from "express";
import {
  getUser,
  topUp,
  rotateApiKey,
  addKeySet,
  removeKeySet,
} from "../utils/userStore";

const router = Router();

router.get("/", async (_req, res) => {
  const user = await getUser();
  res.json(user);
});

router.post("/topup", express.json(), async (req, res) => {
  const { amount } = req.body;
  const num = Number(amount);
  if (!num || num <= 0) {
    res.status(400).json({ error: "Invalid amount" });
    return;
  }
  const user = await topUp(num);
  res.json({ credits: user.credits });
});

router.post("/keysets", express.json(), async (req, res) => {
  const { name, description } = req.body;
  if (!name) {
    res.status(400).json({ error: "Name is required" });
    return;
  }
  const keySet = await addKeySet(name, description || "");
  res.json(keySet);
});

router.delete("/keysets/:id", async (req, res) => {
  const { id } = req.params;
  await removeKeySet(id);
  res.json({ ok: true });
});

router.post(
  "/keysets/:id/keys/:index/rotate",
  async (req, res) => {
    const { id, index } = req.params;
    try {
      const key = await rotateApiKey(id, Number(index));
      res.json({ apiKey: key });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  },
);

export default router;
