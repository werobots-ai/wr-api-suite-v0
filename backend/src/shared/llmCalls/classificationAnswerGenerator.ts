import OpenAI from "openai";
import { openAIWithCache } from "../utils/openaiConnector";
import { ClassificationQuestion, Question } from "../types/Questions";
import { getGroupedReasoningWarning } from "../utils/getGroupedReasoningWarning";
import { ANSWER_GENERATOR_INSTRUCTIONS } from "./promptSnippets";
import { CostReporter } from "../utils/costReporter";
import { SNIPPET_SHORT_DESCRIPTION } from "../config/questionTypes";

export async function classificationAnswerGenerator(
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
  const {
    description,
    // classification-specific fields
    choices,
    // shared guidance fields
    questionText,
  } = question as ClassificationQuestion;

  const choiceLabels = choices.map((c) => c.label).join(", ");
  const choiceCriteria = choices
    .map((c) => `- ${c.label}: ${c.criteria}`)
    .join("\n");

  const answerPrompt: OpenAI.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: `
You are a Classification Answer Generator.

${ANSWER_GENERATOR_INSTRUCTIONS}

For the given question, produce exactly one JSON object with:
- "reasoning": concise rationale pointing to evidence lines.
- "detailed_answer": explanation of why the selected label applies, including quoted references with line numbers.
- "short_answer": exactly one label from [${choiceLabels}].

Choice criteria:
${choiceCriteria}
      `.trim(),
    },
    {
      role: "user",
      content: `
${SNIPPET_SHORT_DESCRIPTION}:
${fullSnippet}

Detailed reasoning:
${reasoning}

Context:
${qaContext}

Question (short display):
${questionText}

Description and criteria:
${description}

${getGroupedReasoningWarning(questions, question)}
      `.trim(),
    },
  ];

  const { response: answerResp, totalCost: answerCost } = await openAIWithCache(
    "classification-answer",
    answerPrompt,
    {
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "classification_answer_schema",
          strict: true,
          schema: {
            type: "object",
            properties: {
              reasoning: { type: "string" },
              detailed_answer: { type: "string" },
              short_answer: { type: "string" },
            },
            required: ["reasoning", "detailed_answer", "short_answer"],
            additionalProperties: false,
          },
        },
      },
    }
  );

  costReporter.addCost(answerCost);

  let parsed: {
    reasoning: string;
    detailed_answer: string;
    short_answer: string;
  };
  try {
    parsed = JSON.parse(answerResp.choices[0].message!.content!.trim());
  } catch (e: any) {
    parsed = {
      reasoning: answerResp.choices[0].message!.content || "ERROR",
      detailed_answer: answerResp.choices[0].message!.content || "ERROR",
      short_answer: `ERROR: ${e.message}`,
    };
  }

  return {
    question: questionText,
    detailed_answer: parsed.detailed_answer,
    short_answer: parsed.short_answer,
    reasoning: parsed.reasoning,
  };
}
