import OpenAI from "openai";
import { openAIWithCache } from "../utils/openaiConnector";
import { ScaleQuestion } from "../types/Questions";

export async function scaleFinalizer({
  guidanceObj,
  changeRequest,
  reasoningDocument,
  logger: { sendLog, sendEvent, sendError },
  failedAttemptResult,
}: {
  guidanceObj: any; // one element from round2 guidance for scale questions
  changeRequest: string; // original user request
  reasoningDocument: string; // output from questionsReasoner
  logger: {
    sendLog: (msg: string) => void;
    sendEvent: (event: string, data: any) => void;
    sendError: (error: any) => void;
  };
  failedAttemptResult?: any;
}): Promise<{ result: { question: ScaleQuestion }; totalCost: number }> {
  try {
    const systemContent = `
You are a Scale-Question Finalizer.

Input guidance object:
${JSON.stringify(guidanceObj, null, 2)}

Scale questions require:
  • A numeric range (min and max).
  • At least three contiguous buckets in 'ranges', each with:
      - min, max (inclusive bounds)
      - criteria: how to decide membership, described in great detail
      - guidanceWithinRange: how to refine the answer within this range and pinpoint an exact score. Describe both positive and negative criteria that moves the needle within this range, and how to score it. 

Produce exactly one JSON object matching this interface:
interface ScaleQuestion {
  questionId: number;
  questionText: string; // Question text for table display
  shortQuestionText: string; // Short text for table display, needs to grammatically match the question text for the answer to naturally follow
  description: string;
  questionType: "scale";
  group: string;
  dependencies: Array<{ questionId: number; reason: string }>;
  min: number;
  max: number;
  ranges: Array<{
    min: number;
    max: number;
    criteria: string; // Rules to determine if value falls in this bucket
    guidanceWithinRange: string; // Tips for selecting an exact score within this range, including both positive and negative examples that move the needle up or down within this range
    title: string; // A short, descriptive title for the range
  }>;
}

Do not output any extra keys or explanatory text.`.trim();

    const userContent = `
Original Change Request:
${changeRequest}

Round-1 Reasoning Document:
${reasoningDocument}

Guidance Object:
${JSON.stringify(guidanceObj, null, 2)}

${
  failedAttemptResult
    ? `## Retry Context:
Previous failed attempt output:
${JSON.stringify(failedAttemptResult, null, 2)}
`
    : ``
}`.trim();
    const prompt: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: systemContent },
      { role: "user", content: userContent },
    ];

    const { response, totalCost } = await openAIWithCache(
      "scale-finalizer",
      prompt,
      {
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "ScaleQuestion",
            strict: true,
            schema: {
              type: "object",
              properties: {
                questionId: { type: "integer" },

                questionText: { type: "string" },
                shortQuestionText: { type: "string" },
                description: { type: "string" },
                questionType: { type: "string", enum: ["scale"] },
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
                min: { type: "number" },
                max: { type: "number" },
                ranges: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      min: { type: "number" },
                      max: { type: "number" },
                      criteria: { type: "string" },
                      guidanceWithinRange: { type: "string" },
                      title: { type: "string" },
                    },
                    required: [
                      "min",
                      "max",
                      "criteria",
                      "guidanceWithinRange",
                      "title",
                    ],
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
                "dependencies",
                "min",
                "max",
                "ranges",
              ],
              additionalProperties: false,
            },
          },
        },
      }
    );

    const question = JSON.parse(
      response.choices[0].message.content || "{}"
    ) as ScaleQuestion;
    return { result: { question }, totalCost };
  } catch (error) {
    sendError(`Error in scale finalizer: ${error}`);
    console.error(`Error in scale finalizer:`, error);
    throw error;
  }
}
