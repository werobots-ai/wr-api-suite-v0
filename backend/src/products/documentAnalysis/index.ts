import cors from "cors";
import express from "express";
import path from "path";

import authRouter from "../../shared/routes/auth";
import accountRouter from "../../shared/routes/account";
import pricingRouter from "../../shared/routes/pricing";
import adminRouter from "../../shared/routes/admin";
import questionsRouter from "./routes/questions";
import uploadRouter from "./routes/uploadRoute";
import { createProductApiKeyAuth } from "../../shared/utils/apiKeyAuth";
import { DOCUMENT_ANALYSIS_PRODUCT_ID } from "../../shared/types/Products";

const BACKEND_ROOT = path.resolve(__dirname, "../../..");
const PROJECT_ROOT = path.resolve(BACKEND_ROOT, "..");

export function createDocumentAnalysisApp() {
  const app = express();
  app.use(cors());

  app.use("/uploads", express.static(path.join(PROJECT_ROOT, "uploads")));
  app.use("/data", express.static(path.join(PROJECT_ROOT, "data")));

  app.use("/api/auth", authRouter);
  app.use("/api/account", accountRouter);
  app.use("/api/pricing", pricingRouter);
  app.use("/api/admin", adminRouter);

  const evaluationAuth = createProductApiKeyAuth({
    productId: DOCUMENT_ANALYSIS_PRODUCT_ID,
    requireDocumentPermissions: ["evaluateDocument"],
  });

  app.use("/api/questions", evaluationAuth, questionsRouter);
  app.use("/api/upload", evaluationAuth, uploadRouter);

  return app;
}
