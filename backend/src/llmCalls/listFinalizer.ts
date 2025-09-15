import OpenAI from "openai";
import { openAIWithCache } from "../utils/openaiConnector";
import { ListQuestion } from "../types/Questions";

export async function listFinalizer({
  guidanceObj,
  changeRequest,
  reasoningDocument,
  logger: { sendLog, sendEvent, sendError },
  failedAttemptResult,
}: {
  guidanceObj: any; // one element from round2 guidance for list questions
  changeRequest: string; // original user request
  reasoningDocument: string; // output from questionsReasoner
  logger: {
    sendLog: (msg: string) => void;
    sendEvent: (event: string, data: any) => void;
    sendError: (error: any) => void;
  };
  failedAttemptResult?: any; // result of a previous failed attempt
}): Promise<{
  result: {
    question: ListQuestion; // final TS-conformant object for questionType "list"
  };
  totalCost: number;
}> {
  try {
    const systemContent = `
You are a List-Question Finalizer.

Input guidance object:
${JSON.stringify(guidanceObj, null, 2)}

Produce exactly one JSON object matching this interface:
interface ListQuestion {  // questionType == "list"
  questionId: number;
  questionText: string; // Question text for table display
  shortQuestionText: string; // Short text for table display, needs to grammatically match the question text for the answer to naturally follow
  description: string;
  questionType: "list_or_count";
  group: string;
  dependencies: Array<{ questionId: number; reason: string }>;

  extractionCriteria: string; // Rubric for choosing spans or list items, needs to be definitive and exhaustive. Mention how to handle rows with multiple items. For an accurate count, request separate items in the list even if they are in the same row.
  extractMode: "exact" | "inferred" | "mixed"; // "exact" for verbatim spans, "inferred" for paraphrases or summaries, "mixed" for both
  resultType: "list" | "count" | "both"; // "list" for list questions, "count" for count questions or occasionally "both" for list questions that must display a count
  uniqueItems: boolean; // true if the list should contain unique items, false if duplicates need to be included
  cardinality: string; // for list type results, e.g., "1", "all", "few"; To get accurate counts, use "All".
  allowAmbiguity: boolean; // true if ambiguous items should be included and marked as such. Will result in ranges for count questions. Recommended for best LLM performance.
  disambiguationGuide: string; // description of how to distinguish ambiguous items from unambiguous ones

  // For list type only; Clear instructions on how to show a preview in table cells where only a few words or key phrase is needed
  previewGuidance: string;
}

Do not output extra keys or any explanatory text.`.trim();

    const userContent = `
Original Change Request:
${changeRequest}

Original Reasoning on the Change Request:
${reasoningDocument}

Guidance:
${JSON.stringify(guidanceObj, null, 2)}

${
  failedAttemptResult
    ? `
## Retry Context:
Previous failed attempt output:
${JSON.stringify(failedAttemptResult, null, 2)}
`
    : ""
}
`.trim();

    const prompt: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: systemContent },
      { role: "user", content: userContent },
    ];

    const { response, totalCost } = await openAIWithCache(
      "list-finalizer",
      prompt,
      {
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "ListQuestion",
            strict: true,
            schema: {
              type: "object",
              properties: {
                questionId: { type: "integer" },
                questionText: { type: "string" },
                shortQuestionText: { type: "string" },
                description: { type: "string" },
                questionType: { type: "string", enum: ["list_or_count"] },
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

                extractionCriteria: { type: "string" },
                extractMode: {
                  type: "string",
                  enum: ["exact", "inferred", "mixed"],
                },
                resultType: {
                  type: "string",
                  enum: ["list", "count", "both"],
                },
                uniqueItems: { type: "boolean" },

                cardinality: { type: "string" },
                allowAmbiguity: { type: "boolean" },
                disambiguationGuide: { type: "string" },
                previewGuidance: { type: "string" },
              },
              required: [
                "questionId",
                "questionText",
                "shortQuestionText",
                "description",
                "questionType",
                "group",
                "dependencies",
                "extractionCriteria",
                "extractMode",
                "resultType",
                "uniqueItems",
                "cardinality",
                "allowAmbiguity",
                "disambiguationGuide",
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
    ) as ListQuestion;
    return { result: { question }, totalCost };
  } catch (error) {
    sendError(`Error in list finalizer: ${error}`);
    console.error(`Error in list finalizer:`, error);
    throw error;
  }
}
