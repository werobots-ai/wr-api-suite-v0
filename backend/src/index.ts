import { createDocumentAnalysisApp } from "./products/documentAnalysis";

const PORT = process.env.PORT || 4000;

const app = createDocumentAnalysisApp();

app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
});
