import OpenAI from "openai";
import { openAIWithCache } from "../utils/openaiConnector";
import { OpenEndedQuestion, Question } from "../types/Questions";
import { getGroupedReasoningWarning } from "../utils/getGroupedReasoningWarning";
import { ANSWER_GENERATOR_INSTRUCTIONS } from "./promptSnippets";
import { CostReporter } from "../utils/costReporter";
import { SNIPPET_TITLE, SNIPPET_WORD } from "../config/questionTypes";

export async function openEndedAnswerGenerator(
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
    questionText,
    description,
    previewGuidance,
    guidance,
    expectedLength,
  } = question as OpenEndedQuestion;
  const answerPrompt: OpenAI.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: `
You are an open ended answer generator. 

${ANSWER_GENERATOR_INSTRUCTIONS}

Given the ${SNIPPET_WORD} and the detailed reasoning above,
produce exactly one JSON object with keys:
- "reasoning": a shortened version of the reasoning, keeping only the most relevant parts
- "detailed_answer": a clear, complete explanation and outcome (no mention of internal process). Also, copy over the most relevant verbatim references from the input, quoting each in double quotes, and include their source row numbers in parentheses after each quote.
- "short_answer": as concise as possible (aim for a single word)
        `.trim(),
    },
    {
      role: "user",
      content: `
${SNIPPET_TITLE}
${fullSnippet}

Detailed reasoning:
${reasoning}

Context:
${qaContext}

Now answer the question:
${questionText}

Description of the question:
${description}

Expected length:
${expectedLength}

Short answer generation instructions:
${previewGuidance}

Question specific instructions:
${guidance}

${getGroupedReasoningWarning(questions, question)}
        `.trim(),
    },
  ];

  const { response: answerResp, totalCost: answerCost } = await openAIWithCache(
    "open-ended-answer",
    answerPrompt,
    {
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "final_answer_schema",
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
    short_answer: parsed.short_answer || "-",
    reasoning: parsed.reasoning,
  };
}
