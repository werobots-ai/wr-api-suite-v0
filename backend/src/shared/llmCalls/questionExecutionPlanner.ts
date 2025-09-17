import OpenAI from "openai";
import { openAIWithCache } from "../utils/openaiConnector";
import {
  SNIPPET_SHORT_DESCRIPTION,
  SNIPPET_TITLE,
  SNIPPET_WORD,
} from "../config/questionTypes";

export async function questionExecutionPlanner({
  changeRequest,
  reasoningDocument,
  logger: { sendLog, sendEvent, sendError },
}: {
  changeRequest: {
    rawQuestions: string;
    snippetType?: string;
  };
  reasoningDocument: string;
  logger: {
    sendLog: (msg: string) => void;
    sendEvent: (event: string, data: any) => void;
    sendError: (error: any) => void;
  };
}): Promise<{
  result: {
    snippetType: string;
    executionPlan: string;
    executionPlanReasoning: string;
    title: string;
  };
  totalCost: number;
}> {
  const plannerPrompt: OpenAI.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: `
You are a Question Execution Planner.

Inputs:
 1) The user's original request: raw questions or high-level idea and optional ${SNIPPET_WORD} description.
 2) The reasoning document generated earlier.

Task:
Produce a JSON object with exactly 4 keys:
 1. executionPlanReasoning: Use this space to think out loud about the execution plan. This is not the final version and will be hidden from the user. You need to fantasize about multiple possible angles, think out of the box, evaluate and rethink your ideas. This is a brainstorming space for you to explore the possibilities and come up with the best plan. You can use this space to jot down your thoughts, ideas, and any other relevant information that will help you create a comprehensive and refined execution plan before actually writing it down. 
 2. snippetType: Describe the type of documents expected to come to the system for evaluation. (Normally a ${SNIPPET_SHORT_DESCRIPTION} of some kind, unless otherwise specified.) the set of questions will be used to evaluate the documents. The user might explained the type of documents expected, if not, you must infer it from the questions.
 3. executionPlan: An ordered plan in structured natural language format detailing how the set of questions will be answered using each incoming ${SNIPPET_WORD}. Use clean text, separate sections by double linebreaks like this: \"\n\n\" The system will autonomously evaluate any incoming ${SNIPPET_WORD} once the questions are finalized without any user assistance, so don't use phrases like "ask the user" or similar. The plan should include:
    - Possible groupings of questions according to topics. These will then share the initial reasoning so they can be answered together. Explain this in detail.
    - Groups that are completely independent from each other therefore can be run in parallel.(important)
    - Questions and group of questions that are dependent on each other and must be ran sequentially.
    - Include grouping logic, dependencies, and opportunities for batching independent question groups to run in parallel, if applicable.
    - Any other considerations or gotchas for the AI that will be evaluating a ${SNIPPET_WORD}.
 4. title: A concise title referring to the entire set of questions. This will be used to help the user identify the questions in the system. Do not use phrases referring to the system or the user, just a title that describes the set of questions, their nature and/or purpose. Follow the user's request if they refer to "title" or "name" for this set of questions.

Ensure the JSON is valid and no additional keys are present.
      `.trim(),
    },
    {
      role: "user",
      content: `
User Request:
${
  changeRequest.snippetType
    ? `${SNIPPET_TITLE} type:\n${changeRequest.snippetType}\n`
    : ""
}Raw Questions:
${changeRequest.rawQuestions}

Reasoning Document:
${reasoningDocument}
      `.trim(),
    },
  ];

  sendLog("Generating question set metadata...");

  const { response, totalCost } = await openAIWithCache(
    "question-execution-planner",
    plannerPrompt,
    {
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "question_execution_plan_schema",
          strict: true,
          schema: {
            type: "object",
            properties: {
              executionPlanReasoning: { type: "string" },
              snippetType: { type: "string" },
              executionPlan: { type: "string" },
              title: { type: "string" },
            },
            required: [
              "executionPlanReasoning",
              "snippetType",
              "executionPlan",
              "title",
            ],
            additionalProperties: false,
          },
        },
      },
    }
  );

  sendLog(
    `Generated execution plan, snippet type and title, ${
      response.choices[0].message.content?.length || 0
    } characters in total.`
  );

  // Parse JSON object from LLM response
  const planResult = JSON.parse(
    response.choices[0].message.content || "{}"
  ) as {
    snippetType: string;
    executionPlanReasoning: string;
    executionPlan: string;
    title: string;
  };

  return { result: planResult, totalCost };
}
