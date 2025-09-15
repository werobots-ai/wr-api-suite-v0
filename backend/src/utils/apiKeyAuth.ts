import { RequestHandler } from "express";
import { getUser } from "./userStore";

export const apiKeyAuth: RequestHandler = async (req, res, next) => {
  const apiKey = req.header("x-api-key");
  if (!apiKey) {
    res.status(401).json({ error: "Missing API key" });
    return;
  }
  const user = await getUser();
  const valid = user.apiKeys.some((k) => k.key === apiKey);
  if (!valid) {
    res.status(401).json({ error: "Invalid API key" });
    return;
  }
  next();
};
