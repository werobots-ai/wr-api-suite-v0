import OpenAI from "openai";
import { openAIWithCache } from "../utils/openaiConnector";
import {
  RAW_QUESTION_TYPES,
  RAW_QUESTION_TYPES_MAP,
  SNIPPET_WORD,
} from "../config/questionTypes";

export async function questionsReasoner({
  changeRequest, // raw questions or idea (e.g. "evaluate CS agent performance")
  logger: { sendLog, sendEvent, sendError },
}: {
  changeRequest: string; // raw questions or idea (e.g. "evaluate CS agent performance"), may include snippet type
  logger: {
    sendLog: (msg: string, snippetId?: string) => void;
    sendEvent: (event: string, data: any) => void;
    sendError: (error: any) => void;
  };
}): Promise<{
  result: {
    reasoningDocument: string; // long-form reasoning: question list, groups, dependencies, types, execution plan
  };
  totalCost: number;
}> {
  // Build system + user prompt
  const reasoningPrompt: OpenAI.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: `
You are a \`Question Designer\` for ${SNIPPET_WORD} analysis.

Input:
 • A user’s raw question set or a high-level idea of desired topics (e.g. "questions to evaluate CS agent performance").
 • (Optional) A brief description of the target ${SNIPPET_WORD} type.

Task:
Produce a long-form reasoning document with:
 1. A refined list of concrete questions (typos fixed).
 2. Semantic grouping of questions into topics. Create logical groups and name them.
 3. Dependencies: which question must run first and why.
 4. Assigned question types ("${RAW_QUESTION_TYPES.join(
   '", "'
 )}") with one-sentence rationale.
 5. High-level execution plan: ordering of groups, parallelization, and potential pitfalls. Elaborate on this in detail.

Type guidance:
${RAW_QUESTION_TYPES.map(
  (type) =>
    `• ${type}:\n  Designed for ${RAW_QUESTION_TYPES_MAP[type].designedFor}\n  Gotchas:\n  ${RAW_QUESTION_TYPES_MAP[type].gotchas}\n  ${RAW_QUESTION_TYPES_MAP[type].paramsNeeded}\n`
).join("\n")}

Other considerations:
• Start by elaborating on the likely nature of the research considering the questions and user request.
• The questions normally relate to a ${SNIPPET_WORD}, unless otherwise specified.
• Explore the kind of answers the user might be looking for as a whole and for each question before proceeding.
• Mind that some classification questions need escape routes for ambiguous or non applicable cases, like an "N/A" or "Partial" value - while other questions should be strictly binary. Consider this when assigning question types and guidance.
 
Output as plain text, organized under clear headings.  `.trim(),
    },
    {
      role: "user",
      content: `

User Request:
${changeRequest}
      `.trim(),
    },
  ];

  sendLog(
    `Starting to process the following input: ${changeRequest
      .substring(0, 100)
      .trim()}${changeRequest.length > 100 ? "..." : ""}`
  );

  const { response, totalCost } = await openAIWithCache(
    "questions-reasoner",
    reasoningPrompt
  );

  const reasoningDocument =
    response.choices[0].message.content ||
    `Invalid response: ${response.choices[0].message}`;
  return { result: { reasoningDocument }, totalCost };
}
