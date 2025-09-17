import cors from "cors";
import express from "express";

export function createInsightsSandboxApp() {
  const app = express();
  app.use(cors());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", product: "insights-sandbox", mode: "placeholder" });
  });

  app.get("/api/insights", (_req, res) => {
    res.status(501).json({ error: "Insights Sandbox API is not yet implemented" });
  });

  return app;
}
