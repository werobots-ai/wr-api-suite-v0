import express from "express";
import pricing from "../config/pricing.json";

const router = express.Router();

router.get("/", (_req, res) => {
  res.json(pricing);
});

export default router;
