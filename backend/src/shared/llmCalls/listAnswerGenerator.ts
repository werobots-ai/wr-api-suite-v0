import OpenAI from "openai";
import { openAIWithCache } from "../utils/openaiConnector";
import { ListQuestion, Question } from "../types/Questions";
import { getGroupedReasoningWarning } from "../utils/getGroupedReasoningWarning";
import { ANSWER_GENERATOR_INSTRUCTIONS } from "./promptSnippets";
import { CostReporter } from "../utils/costReporter";
import { SNIPPET_TITLE } from "../config/questionTypes";

export async function listAnswerGenerator(
  fullSnippet: string,
  reasoning: string,
  questions: Question[],
  question: Question,
  qaContext: string,
  logger: {
    sendLog: (msg: string, snippetId?: string) => void;
    sendEvent: (event: string, data: any) => void;
    sendError: (error: any) => void;
  },
  costReporter: CostReporter,
  snippetId: string
): Promise<{
  question: string;
  detailed_answer: string;
  metadata: {
    preText: string;
    list: Array<{ text: string; ambiguous: boolean | null; rows: number[] }>;
    postText: string;
  };
  short_answer: string;
  reasoning: string;
}> {
  const {
    description,
    extractMode,
    extractionCriteria,
    cardinality,
    allowAmbiguity,
    disambiguationGuide,
    questionText,
    previewGuidance,
    resultType,
    uniqueItems,
  } = question as ListQuestion;

  const answerPrompt: OpenAI.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: `
You are a List-Answer Generator.

${ANSWER_GENERATOR_INSTRUCTIONS}

For the given list question, produce exactly one JSON object with these keys:
  • "reasoning": brief rationale pointing to evidence lines.
  • "list": an array of${
    uniqueItems ? " unique" : ""
  } items extracted. Each item must be an object with { 
      "rows": number[], // array of row numbers (usually a single row number) where the item was found or inferred from. Empty array if not applicable.
      "text": string, // the extracted text, ${
        extractMode === "exact"
          ? "verbatim"
          : extractMode === "inferred"
          ? "paraphrased"
          : "verbatim and/or paraphrased"
      }${
        allowAmbiguity
          ? `
      "ambiguous": boolean // Set to true if the item is ambiguous, false if not. Refer to the disambiguation guide for criteria.`
          : ""
      }
      "notes": string // any additional notes or context about the item
    } key-value pairs.${
      uniqueItems
        ? ""
        : ` Note: You must collect all items, even duplicates as they appear as per the user's request.`
    }
  • "preText": an introductory block that will be displayed before the list.
  • "postText": a closing sentence or summary that will be displayed after the list.
  • "short_answer": a concise preview for table display (use "previewGuidance").

${
  disambiguationGuide
    ? `Distinguishing Ambiguous from Clear Items (Disambiguation Guide): ${disambiguationGuide}`
    : ""
}


Do not output extra keys or prose—only the JSON object.
      `.trim(),
    },
    {
      role: "user",
      content: `
${SNIPPET_TITLE}
${fullSnippet}

Extraction criteria:
${extractionCriteria}

Row numbers note:
You must include the row numbers of the original document where the items were found or inferred from. This might be one or more rows, depending on the request and the context.

Detailed reasoning:
${reasoning}

Context:
${qaContext}

Question (short form):
${questionText}

Description and extraction criteria:
${description}

Notes as per the user's request:
- ${
        uniqueItems
          ? `You are required to extract unique items only. Group duplicates as needed.`
          : `You are required to extract all items, including duplicates. This is important for the user's request.`
      }
- ${
        extractMode === "exact"
          ? `You must extract verbatim text as it appears in the document.`
          : extractMode === "inferred"
          ? `You must extract paraphrased text and / or inferred information as per the user's request.`
          : `You must extract both verbatim and paraphrased text along with inferred information as per the user's request.`
      }
- Requested cardinality: ${cardinality}
${
  allowAmbiguity
    ? `- You must also include ambiguous items, if any, as per the ambiguity criteria: ${disambiguationGuide}`
    : `- You must not include ambiguous items, as per the ambiguity criteria: ${disambiguationGuide}`
}

Short answer generation guidance:
${previewGuidance}

**Important Note: Do not output any count of the items, nor any attempt of producing a numeric value about the number of items. This will be done programmatically later. Your short answer, pretext, and posttext must not include any numeric values or counts.**
     
${getGroupedReasoningWarning(questions, question)}
`.trim(),
    },
  ];

  const { response: answerResp, totalCost: answerCost } = await openAIWithCache(
    "list-answer",
    answerPrompt,
    {
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "list_answer_schema",
          strict: true,
          schema: {
            type: "object",
            properties: {
              reasoning: { type: "string" },
              list: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    rows: {
                      type: "array",
                      items: { type: "integer" },
                    },
                    text: { type: "string" },
                    ...(allowAmbiguity
                      ? { ambiguous: { type: "boolean" } }
                      : {}),
                    notes: { type: "string" },
                  },
                  required: [
                    "rows",
                    "text",
                    allowAmbiguity && "ambiguous",
                    "notes",
                  ].filter(Boolean),
                  additionalProperties: false,
                },
              },
              preText: { type: "string" },
              postText: { type: "string" },
              short_answer: { type: "string" },
            },
            required: [
              "reasoning",
              "list",
              "preText",
              "postText",
              "short_answer",
            ],
            additionalProperties: false,
          },
        },
      },
    }
  );

  costReporter.addCost(answerCost);

  let parsed: any;
  try {
    parsed = JSON.parse(answerResp.choices[0].message!.content!.trim());
  } catch (e: any) {
    logger.sendError(`Error parsing list answer JSON: ${e}`);
    parsed = {
      reasoning: "ERROR",
      preText: "",
      list: [],
      postText: "",
      short_answer: "ERROR",
    };
  }

  const displayAmbiguityColumn =
    allowAmbiguity && parsed.list.some((item: any) => item.ambiguous);

  const detailed_answer = `${parsed.preText}${
    parsed.list.length > 0
      ? `

|Row${parsed.list.some((item: any) => item.rows.length > 1) ? "s" : ""}|Item|${
          displayAmbiguityColumn ? "Ambiguity|" : ""
        }Notes|
|---|---|${displayAmbiguityColumn ? "---|" : ""}---|
${parsed.list
  .map((item: any) => {
    const rows = (item.rows || []).join(", ");
    if (!displayAmbiguityColumn) {
      return `|${rows}|${item.text}|${item.notes}|`;
    }

    return `|${rows}|${item.text}|${item.ambiguous ? "Ambiguous" : ""}|${
      item.notes
    }|`;
  })
  .join("\n")}`
      : ""
  }

${parsed.postText}`;

  const result = {
    question: questionText,
    metadata: {
      preText: parsed.preText,
      list: parsed.list,
      postText: parsed.postText,
    },
    detailed_answer,
    short_answer: parsed.short_answer,
    reasoning: parsed.reasoning,
  };

  if (resultType === "list") return result;

  const countIncludingAmbiguous = parsed.list.length;
  const countExcludingAmbiguous = parsed.list.filter(
    (item: any) => !item.ambiguous
  ).length;

  const countAsString =
    countIncludingAmbiguous === countExcludingAmbiguous || !allowAmbiguity
      ? countIncludingAmbiguous.toString()
      : `${countExcludingAmbiguous}-${countIncludingAmbiguous}`;

  if (resultType === "count")
    return {
      ...result,
      detailed_answer: `The answer is ${countAsString}. ${result.detailed_answer}`,
      short_answer: countAsString,
    };

  return {
    ...result,
    detailed_answer: `The answer is ${countAsString}. ${result.detailed_answer}`,
    short_answer:
      countAsString === parsed.short_answer
        ? countAsString
        : `${countAsString}: ${parsed.short_answer}`,
  };
}
