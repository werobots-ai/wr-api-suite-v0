import express from "express";
import uploadRouter from "./routes/uploadRoute";
import questionsRouter from "./routes/questions";
import accountRouter from "./routes/account";
import { apiKeyAuth } from "./utils/apiKeyAuth";
import cors from "cors";
import pricingRouter from "./routes/pricing";
import adminRouter from "./routes/admin";
import authRouter from "./routes/auth";

import path from "path";

const PORT = process.env.PORT || 4000;

const app = express();
app.use(cors());

// serve static folders (optional)
app.use("/uploads", express.static(path.join(__dirname, "../../uploads")));
app.use("/data", express.static(path.join(__dirname, "../../data")));

// account management
app.use("/api/auth", authRouter);
app.use("/api/account", accountRouter);
app.use("/api/pricing", pricingRouter);
app.use("/api/admin", adminRouter);

// main API router with API key auth
app.use("/api/questions", apiKeyAuth, questionsRouter);
app.use("/api/upload", apiKeyAuth, uploadRouter);

app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
});
