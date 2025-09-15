import express from "express";
import uploadRouter from "./routes/uploadRoute";
import questionsRouter from "./routes/questions";
import cors from "cors";

import path from "path";

const PORT = process.env.PORT || 4000;

const app = express();
app.use(cors());

// serve static folders (optional)
app.use("/uploads", express.static(path.join(__dirname, "../../uploads")));
app.use("/data", express.static(path.join(__dirname, "../../data")));

// main API router
app.use("/api/questions", questionsRouter);
app.use("/api/upload", uploadRouter);

app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
});
