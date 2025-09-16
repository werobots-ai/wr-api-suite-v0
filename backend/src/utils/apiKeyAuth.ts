import { RequestHandler } from "express";
import { findOrgByApiKey } from "./userStore";

export const apiKeyAuth: RequestHandler = async (req, res, next) => {
  const apiKey = req.header("x-api-key");
  if (!apiKey) {
    res.status(401).json({ error: "Missing API key" });
    return;
  }

  const match = await findOrgByApiKey(apiKey);
  if (!match) {
    res.status(401).json({ error: "Invalid API key" });
    return;
  }

  res.locals.orgId = match.organization.id;
  res.locals.keySetId = match.keySet.id;
  res.locals.keyId = match.key.id;

  next();
};
