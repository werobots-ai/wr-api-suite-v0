import OpenAI from "openai";
import { openAIWithCache } from "../utils/openaiConnector";
import { OpenEndedQuestion } from "../types/Questions";

export async function openEndedQuestionFinalizer({
  guidanceObj,
  changeRequest,
  reasoningDocument,
  logger: { sendLog, sendEvent, sendError },
  failedAttemptResult,
}: {
  guidanceObj: any; // one element from round2 guidance for open_ended
  changeRequest: string; // original user request
  reasoningDocument: string; // output from questionsReasoner
  logger: {
    sendLog: (msg: string) => void;
    sendEvent: (event: string, data: any) => void;
    sendError: (error: any) => void;
  };
  failedAttemptResult?: any;
}): Promise<{
  result: {
    question: OpenEndedQuestion;
  };
  totalCost: number;
}> {
  try {
    const systemContent = `
You are an Open-Ended-Question Finalizer.
Input guidance object:
${JSON.stringify(guidanceObj, null, 2)}
Produce exactly one JSON object matching this interface:
interface OpenEndedQuestion {
  questionId: number;
  questionText: string; // Question text for table display
  shortQuestionText: string; // Short text for table display, needs to grammatically match the question text for the answer to naturally follow
  description: string;
  questionType: "open_ended";
  group: string;
  dependencies: Array<{ questionId: number; reason: string }>;
  guidance: string;
  expectedLength: string;
  previewGuidance: string; // exact and complete instructions on how to reduce the detailed answer's length to a single word or very short phrase that fits in a table cell (few words only)
}
Do not output any extra keys or explanatory text.
    `.trim();

    const userContent = `
Original Change Request:
${changeRequest}

Reasoning Document:
${reasoningDocument}

Guidance Object:
${JSON.stringify(guidanceObj)}

${
  failedAttemptResult
    ? `
## Retry Information:
Previous attempt result:
${JSON.stringify(failedAttemptResult)}
`
    : ``
}
`;

    const prompt: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: systemContent },
      { role: "user", content: userContent },
    ];

    const { response, totalCost } = await openAIWithCache(
      "open-ended-finalizer",
      prompt,
      {
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "OpenEndedQuestion",
            strict: true,
            schema: {
              type: "object",
              properties: {
                questionId: { type: "integer" },

                questionText: { type: "string" },
                shortQuestionText: { type: "string" },
                description: { type: "string" },
                questionType: { type: "string", enum: ["open_ended"] },
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
                guidance: { type: "string" },
                expectedLength: { type: "string" },
                previewGuidance: { type: "string" },
              },
              required: [
                "questionId",
                "questionText",
                "shortQuestionText",
                "description",
                "questionType",
                "dependencies",
                "expectedLength",
                "group",
                "guidance",
                "previewGuidance",
              ],
              additionalProperties: false,
            },
          },
        },
      }
    );

    const question = JSON.parse(
      response.choices[0].message.content || "{}"
    ) as OpenEndedQuestion;
    return { result: { question }, totalCost };
  } catch (error) {
    sendError(`Error in open-ended finalizer: ${error}`);
    console.error(`Error in open-ended finalizer: ${error}`);
    throw error;
  }
}
