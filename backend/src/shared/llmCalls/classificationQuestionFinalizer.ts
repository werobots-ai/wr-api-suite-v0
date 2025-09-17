import OpenAI from "openai";
import { openAIWithCache } from "../utils/openaiConnector";
import { ClassificationQuestion } from "../types/Questions";

export async function classificationQuestionFinalizer({
  guidanceObj,
  changeRequest,
  reasoningDocument,
  logger: { sendLog, sendEvent, sendError },
  failedAttemptResult,
}: {
  guidanceObj: any; // one element from round2 guidance for classification
  changeRequest: string; // original user request
  reasoningDocument: string; // output from questionsReasoner
  logger: {
    sendLog: (msg: string) => void;
    sendEvent: (event: string, data: any) => void;
    sendError: (error: any) => void;
  };

  // on retry we get the failed attempt result from Promise.allSettled
  // and we can use it to inform the LLM about the previous attempt
  // and help it to produce a better result
  failedAttemptResult?: any; // the failed attempt result from Promise.allSettled
}): Promise<{
  result: {
    question: ClassificationQuestion; // final TS-conformant object
  };
  totalCost: number;
}> {
  try {
    const systemContent = `
You are a Classification-Question Finalizer.
Input guidance object:
  ${JSON.stringify(guidanceObj, null, 2)}
Produce exactly one JSON object matching this interface:
interface ClassificationQuestion extends BaseQuestion {
  questionType: "classification";

  // Defined labels, each with a decision rubric.
  // Keep label count modest to avoid LLM confusion.
  choices: Array<{
    label: string; // e.g., "Yes", "No", "Partially", "N/A"
    criteria: string; // describe here the criteria for this choice in great detail, over multiple sentences to allow definite classification
  }>;
}

interface BaseQuestion {
  questionId: number; // Unique identifier
  questionText: string; // Question text for table display
  shortQuestionText: string; // Short text for table display, needs to grammatically match the question text for the answer to naturally follow
  description: string; // Detailed rubric: edge cases, decision rules, scoring criteria
  questionType: QuestionType; // Category of logic to apply
  group: string; // Topic cluster: batch these in one reasoning pass
  dependencies: Array<{
    questionId: number; // ID of a prerequisite question
    reason: string; // Explanation of why this must run first
  }>;
}

Do not output any extra keys or explanatory text.  `;

    const userContent = `
Original Change Request:
${changeRequest}

Original Reasoning on the Change Request:
${reasoningDocument}

Guidance:
${JSON.stringify(guidanceObj)}

${
  failedAttemptResult
    ? `

## This is a retry attempt. The previous attempt failed.
Previous attempt:
${JSON.stringify(failedAttemptResult)}
`
    : ""
} 
  `;

    const prompt: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: systemContent.trim() },
      { role: "user", content: userContent.trim() },
    ];

    const { response, totalCost } = await openAIWithCache(
      "classification-finalizer",
      prompt,
      {
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "ClassificationQuestion",
            strict: true,
            schema: {
              type: "object",
              properties: {
                questionId: { type: "integer" },
                questionText: { type: "string" },
                shortQuestionText: { type: "string" },
                description: { type: "string" },
                questionType: { type: "string", enum: ["classification"] },
                group: { type: "string" },
                dependencies: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      questionId: { type: "integer" },
                      reason: { type: "string" },
                    },
                    required: ["questionId", "reason"],
                    additionalProperties: false,
                  },
                },
                choices: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      label: { type: "string" },
                      criteria: { type: "string" },
                    },
                    required: ["label", "criteria"],
                    additionalProperties: false,
                  },
                },
              },
              required: [
                "questionId",
                "questionText",
                "shortQuestionText",
                "description",
                "questionType",
                "group",
                "choices",
                "dependencies",
              ],
              additionalProperties: false,
            },
          },
        },
      }
    );

    const question = JSON.parse(
      response.choices[0].message.content || "{}"
    ) as ClassificationQuestion;
    return { result: { question }, totalCost };
  } catch (error) {
    sendError(`Error in classification finalizer: ${error}`);
    console.error(`Error in classification finalizer: ${error}`);
    throw error;
  }
}
