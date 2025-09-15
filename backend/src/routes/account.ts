import express, { Router } from "express";
import { getUser, topUp, rotateApiKey } from "../utils/userStore";

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

router.post("/keys/rotate", express.json(), async (req, res) => {
  const { index } = req.body;
  try {
    const key = await rotateApiKey(Number(index));
    res.json({ apiKey: key });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

export default router;
