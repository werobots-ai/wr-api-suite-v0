import cors from "cors";
import express from "express";

export function createApiPlatformApp() {
  const app = express();
  app.use(cors());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", product: "api-platform", mode: "placeholder" });
  });

  app.all("/api/*", (_req, res) => {
    res.status(501).json({ error: "API Platform backend has not been implemented" });
  });

  return app;
}
