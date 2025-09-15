import OpenAI from "openai";
import { openAIWithCache } from "../utils/openaiConnector";
import {
  RAW_QUESTION_TYPES,
  RAW_QUESTION_TYPES_MAP,
  SNIPPET_TITLE,
  SNIPPET_WORD,
} from "../config/questionTypes";

export async function questionGuidanceGenerator({
  changeRequest,
  reasoningDocument,
  logger: { sendLog, sendEvent, sendError },
}: {
  changeRequest: {
    rawQuestions: string;
    snippetType?: string;
  };
  reasoningDocument: string; // output from questionsReasoner
  logger: {
    sendLog: (msg: string) => void;
    sendEvent: (event: string, data: any) => void;
    sendError: (error: any) => void;
  };
}): Promise<{
  result: {
    guidance: any[]; // loose JSON array of per-question blueprints
  };
  totalCost: number;
}> {
  const guidancePrompt: OpenAI.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: `
You are a Question Guidance Generator.

Inputs:
 1) The user's original request: raw questions or high-level idea and optional ${SNIPPET_WORD} description.
 2) The reasoning document from the preprocessing step.

Task:
Produce a JSON array of guidance objects, one per question, each with:
 • questionId
 • question (original verbatim phrasing including any typos or errors)
 • workingQuestionText (augmented phrasing)
 • questionType: ${RAW_QUESTION_TYPES.join(", ")}
 • group (topic name)
 • dependencies (array of prerequisite IDs)
 ${RAW_QUESTION_TYPES.map(
   (type) => ` • for ${type}: ${RAW_QUESTION_TYPES_MAP[type].paramsNeeded}`
 ).join("\n")}

For each question, refer to the following:
${RAW_QUESTION_TYPES.map(
  (type) =>
    `• ${type}:\n  Designed for: ${RAW_QUESTION_TYPES_MAP[type].designedFor}\n  Gotchas: ${RAW_QUESTION_TYPES_MAP[type].gotchas}\n`
).join("\n")}


Output must be valid JSON array. Use flexible field names to fully express the best possible plan.  `.trim(),
    },
    {
      role: "user",
      content: `
User Request:
${
  changeRequest.snippetType
    ? `${SNIPPET_TITLE} type:\n${changeRequest.snippetType}\n`
    : ""
}
Raw Questions:
${changeRequest.rawQuestions}

Reasoning Document:
${reasoningDocument}
      `.trim(),
    },
  ];

  sendLog("Breaking down instructions into individual questions...");

  const { response, totalCost } = await openAIWithCache(
    "question-guidance-generator",
    guidancePrompt
  );

  // Parse JSON array from LLM response
  const guidance = JSON.parse(response.choices[0].message.content || "[]");

  sendLog(`Selected ${guidance.length} questions to define in detail.`);

  return { result: { guidance }, totalCost };
}
