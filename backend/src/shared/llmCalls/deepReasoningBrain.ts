import OpenAI from "openai";
import { openAIWithCache } from "../utils/openaiConnector";
import { CostReporter } from "../utils/costReporter";
import { Question } from "../types/Questions";
import { marked } from "marked";
import {
  SNIPPET_SHORT_DESCRIPTION,
  SNIPPET_TITLE,
  SNIPPET_WORD,
} from "../config/questionTypes";

// Encapsulates the deep reasoning LLM call for answerQuestionTool
export async function deepReasoningBrain(
  fullSnippet: string,
  questions: Question[],
  qaContext: string,
  logger: {
    sendLog: (msg: string, snippetId?: string) => void;
    sendEvent: (event: string, data: any) => void;
    sendError: (error: any) => void;
  },
  costReporter: CostReporter,
  snippetId: string
): Promise<string> {
  const reasoningPrompt: OpenAI.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: `
You are a compliance auditor. You are executing the preliminary step of a compliance audit where you are asked to analyze a ${SNIPPET_SHORT_DESCRIPTION}.
Your task is to produce a detailed reasoning that explores the pros and cons of the ${SNIPPET_WORD}, iteratively listing them, and calling out supporting and contradicting facts.
You will be provided with the full ${SNIPPET_WORD}, a set of questions, and some context.

Given the ${SNIPPET_WORD} and ${
        questions.length > 1 ? questions.length : "a"
      } question${
        questions.length > 1 ? "s" : ""
      }, produce one very long, natural-language reasoning that:
- Iteratively lists pros and cons
- Calls out supporting and contradicting facts, quoting statements from the source text (always include row numbers for each quote)
- Performs at least 3 rounds of proposing an answer and then trying to disprove it
- Collects verbatim references from the ${SNIPPET_WORD}, quoting each in double quotes, and includes many such quotes throughout the reasoning
- Always include row numbers for each verbatim reference, e.g. "Some word by word text copied from the source" (Row 14).
- When referring to data or information from the source, always mention the row numbers where the data can be confirmed.
- Never come to a definite conclusion, but rather show all supporting and contradicting evidence for multiple viewpoints and the reasoning behind them.
- Include many verbatim quotes and inferred reasoning.
- You may go in great detail, length is not a concern.
- Never attempt to output a count or any numeric value. All counting tasks are addressed in a later step.${
        questions.some((q) => q.questionType === "list_or_count")
          ? `
- For any question asking for a count, as the preliminary auditor your task is not to produce a count, but to list all possible items that might be counted, along with all supporting and contradicting evidence for counting them.
`
          : ""
      }
- Avoid fabricating examples; only reference actual ${SNIPPET_WORD} content.
      `.trim(),
    },
    {
      role: "user",
      content: `
${SNIPPET_TITLE}:
${fullSnippet}


## Questions Table
| ID | Group | Question | Description | Question Type | Depend on | Notes |
|----|-------|----------|-------------|---------------|-----------|
${questions
  .map(
    (q) =>
      `| ${q.questionId} | ${q.group || ""} | ${q.questionText} | ${
        q.description || ""
      } | ${q.questionType} | ${
        q.dependencies && q.dependencies.length > 0
          ? `[${q.dependencies.map((d) => "Q" + d.questionId).join(", ")}]`
          : ""
      } | ${[
        "choices" in q &&
          q.choices &&
          q.choices.length > 0 &&
          `Choices: ${q.choices.map((c) => `"${c}"`).join(", ")}`,
        "max" in q && q.max && `Max: ${q.max}`,
        "min" in q && typeof q.min === "number" && `Min: ${q.min}`,
        "expectedLength" in q &&
          q.expectedLength &&
          `Expected Length: ${q.expectedLength}`,
      ]
        .filter(Boolean)
        .join(", ")} |`
  )
  .join("\n")}

Context:
${qaContext}
      `.trim(),
    },
  ];

  const { response: reasoningResp, totalCost: reasoningCost } =
    await openAIWithCache("deep-reasoning", reasoningPrompt);

  costReporter.addCost(reasoningCost);

  const reasoning = reasoningResp.choices[0].message!.content!.trim();
  // Parse markdown to HTML
  const reasoningHtml = marked.parse(reasoning);
  questions.forEach((question) => {
    logger.sendEvent("detailedReasoning", {
      snippetId,
      question: question.questionText,
      detailedReasoning: reasoningHtml,
    });
  });

  return reasoning;
}
