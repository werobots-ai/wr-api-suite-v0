import { RequestHandler } from "express";
import { getUser } from "./userStore";

export const apiKeyAuth: RequestHandler = async (req, res, next) => {
  const apiKey = req.header("x-api-key");
  if (!apiKey) {
    res.status(401).json({ error: "Missing API key" });
    return;
  }

  const user = await getUser();
  let match: { keySetId: string; keyId: string } | null = null;

  for (const set of user.keySets) {
    for (const key of set.keys) {
      if (key.key === apiKey) {
        match = { keySetId: set.id, keyId: key.id };
        break;
      }
    }
    if (match) break;
  }

  if (!match) {
    res.status(401).json({ error: "Invalid API key" });
    return;
  }

  res.locals.userId = user.id;
  res.locals.keySetId = match.keySetId;
  res.locals.keyId = match.keyId;

  next();
};
