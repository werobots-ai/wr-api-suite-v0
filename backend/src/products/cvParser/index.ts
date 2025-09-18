import cors from "cors";
import express from "express";

export function createCvParserApp() {
  const app = express();
  app.use(cors());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", product: "cv-parser", mode: "placeholder" });
  });

  app.get("/api/cv-parser", (_req, res) => {
    res.status(501).json({ error: "CV parser API is not yet implemented" });
  });

  return app;
}
