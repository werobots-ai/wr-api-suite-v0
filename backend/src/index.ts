import { createDocumentAnalysisApp } from "./products/documentAnalysis";
import { ensureDynamoTables } from "./shared/utils/dynamo";

const PORT = process.env.PORT || 4000;

async function start(): Promise<void> {
  try {
    await ensureDynamoTables();
  } catch (error) {
    console.error("Failed to initialize DynamoDB tables", error);
    process.exit(1);
  }

  const app = createDocumentAnalysisApp();

  app.listen(PORT, () => {
    console.log(`Backend listening on http://localhost:${PORT}`);
  });
}

void start();
