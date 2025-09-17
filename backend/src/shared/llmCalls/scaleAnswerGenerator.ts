import OpenAI from "openai";
import { openAIWithCache } from "../utils/openaiConnector";
import { ScaleQuestion, Question } from "../types/Questions";
import { getGroupedReasoningWarning } from "../utils/getGroupedReasoningWarning";
import { CostReporter } from "../utils/costReporter";
import { SNIPPET_TITLE, SNIPPET_WORD } from "../config/questionTypes";

export async function scaleAnswerGenerator(
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
  short_answer: string;
  reasoning: string;
}> {
  const { questionText, description, ranges, min, max } =
    question as ScaleQuestion;

  // Round 1: Select the appropriate range
  const rangePrompt: OpenAI.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: `
You are a Scale Range Selector on a scale from ${min} to ${max}.

Based on the "description" rubric and the provided reasoning, choose the best fitting range for a possible score.
Your task is not to assign an exact score, but to **select the most appropriate range** based on the ${SNIPPET_WORD} and the provided reasoning.
In your response, include a well thought-out exploration of the positive and negative supporting evidence for each range, and the reasoning behind your selection.
You should also suggest a score within the selected range, but that will not be used in the final output.
The range id you return should match the id assigned to the range you select and will be used to guide the next step.

Ranges:
${ranges
  .map(
    (r, i) =>
      `  Range ID **${i + 1}**: _${r.title} from ${r.min} to ${r.max}: ${
        r.criteria
      }`
  )
  .join("\n")}

General instructions:
- When referring to any data or information from the source, always mention the row numbers where it can be confirmed.
- Avoid fabricating examples; only reference actual ${SNIPPET_WORD} content.


Output exactly one JSON object with:
- "reasoning": a concise justification citing which range and why. Do not mention the range ID here just refer to it by its title.
- "suggestedValues": a few suggested values and their justifications within the selected range.
- "selectedRangeId": the Range ID of the selected range
Do not output any additional text.`.trim(),
    },
    {
      role: "user",
      content: `
${SNIPPET_TITLE}
${fullSnippet}

Detailed reasoning:
${reasoning}

Question:
${questionText}

Question description:
${description}

${getGroupedReasoningWarning(questions, question)}

      `.trim(),
    },
  ];

  const { response: rangeResp, totalCost: rangeCost } = await openAIWithCache(
    "scale-range-selector",
    rangePrompt,
    {
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "scale_range_schema",
          strict: true,
          schema: {
            type: "object",
            properties: {
              reasoning: { type: "string" },
              suggestedValues: { type: "string" },
              selectedRangeId: {
                type: "number",
                description: "The ID of the selected range, not the score",
              },
            },
            required: ["reasoning", "suggestedValues", "selectedRangeId"],
            additionalProperties: false,
          },
        },
      },
    }
  );

  costReporter.addCost(rangeCost);

  const rangeOutput = JSON.parse(rangeResp.choices[0].message!.content!) as {
    reasoning: string;
    suggestedValues: string;
    selectedRangeId: number;
  };
  const {
    selectedRangeId: rangeId,
    reasoning: groupReasoning,
    suggestedValues,
  } = rangeOutput;

  const range = ranges[rangeId - 1];

  if (!range) {
    logger.sendError(
      `Range ${rangeId} not found in ranges: ${JSON.stringify(ranges)}
      
      Range output: ${JSON.stringify(rangeOutput)}
      Range response: ${JSON.stringify(rangeResp)}`
    );
    throw new Error(`Range ${rangeId} not found`);
  }

  if (range.min === range.max) {
    const syntheticReasoning = `On a scale from ${min} to ${max}, the selected score was ${range.min} (${range.title}) as the ${SNIPPET_WORD} justified the following criteria: ${range.criteria}. ${suggestedValues}.\n\nThe final score was determined to be ${range.min} based on the guidance for the associated range: ${range.guidanceWithinRange}.`;

    return {
      question: questionText,
      detailed_answer: `The score is ${range.min} (${range.title}).\n\n${rangeOutput.reasoning}`,
      short_answer: String(range.min) + ` - ${range.title}`,
      reasoning: syntheticReasoning,
    };
  }

  const rangeWidth = range.max - range.min;
  const offsetInstruction =
    rangeWidth > 3
      ? `The suggested score might not be the final score. You must try to disprove and adjust if needed in your reasoning and final score. `
      : rangeWidth > 7
      ? `The suggested score is not accurate. You must try to disprove and adjust it in your reasoning and final score. `
      : `The suggested score is a wild and inaccurate guess and you must adjust it up or down using the guidance. Do not copy the suggested score. Justify the final score. `;
  `You must select a score different from the suggested score, but within the selected range. `;

  // Round 2: Pick exact score within the selected range
  const scorePrompt: OpenAI.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: `
You are a Scale Score Generator.

You will be given a ${SNIPPET_WORD} that has been evaluated on a scale from ${min} to ${max} and was assigned a range based preliminary score. 
You will also be given guidance on how to assign a score within that range, and a suggested score that is not final.
${offsetInstruction} Be very particular about the reasoning and the final score. 
You must reason out and justify your final score based on the ${SNIPPET_WORD} and the guidance provided.

Your task is to assign a precise integer score within the preselected range based on the provided information.

Output exactly one JSON object with:
- "reasoning": concise justification for this precise score.
- "score": an exact and justified integer score
Do not output any extra text.`.trim(),
    },
    {
      role: "user",
      content: `
${SNIPPET_TITLE}
${fullSnippet}

Context:
${qaContext}

Range justification:
${rangeOutput.reasoning}

Question:
${questionText}

Original description:
${description}

Preselected range:
${range.min}-${range.max}: ${range.title} (${range.criteria})

Suggested score(s):
${suggestedValues}
Note: ${offsetInstruction} Be very particular about the reasoning and the final score. 

Guidance within range:
${range.guidanceWithinRange}

Given the selected range: ${range.title} (${range.min}-${range.max}) - choose an exact integer score within that range.

Output exactly one JSON object with:
- "reasoning": concise justification for this precise score.
- "score": integer between ${range.min} and ${range.max}.
Do not output any extra text.
      `.trim(),
    },
  ];

  const { response: scoreResp, totalCost: scoreCost } = await openAIWithCache(
    "scale-score-generator",
    scorePrompt,
    {
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "scale_score_schema",
          strict: true,
          schema: {
            type: "object",
            properties: {
              reasoning: { type: "string" },
              score: {
                type: "integer",
              },
            },
            required: ["reasoning", "score"],
            additionalProperties: false,
          },
        },
      },
    }
  );

  costReporter.addCost(scoreCost);

  const scoreOutput = JSON.parse(scoreResp.choices[0].message!.content!);

  // Compose final outputs
  const detailed_answer = `The score is ${scoreOutput.score}.\n\n${rangeOutput.reasoning}\n\n${scoreOutput.reasoning}`;
  const syntheticReasoning = `On a scale from ${min} to ${max}, the initially selected range was ${range.title} (${range.min}-${range.max}) as the ${SNIPPET_WORD} justified the following criteria: ${range.criteria}.\n\nThe suggested scores were ${suggestedValues}. The final score was determined to be ${scoreOutput.score} based on the guidance for the associated range: ${range.guidanceWithinRange}.`;
  const short_answer = String(scoreOutput.score) + ` - ${range.title}`;

  console.debug(`Final score: ${scoreOutput.score} (${scoreOutput.reasoning})`);

  return {
    question: questionText,
    detailed_answer,
    short_answer,
    reasoning: syntheticReasoning,
  };
}
