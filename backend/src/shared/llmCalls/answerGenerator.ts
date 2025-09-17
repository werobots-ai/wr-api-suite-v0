import { Question } from "../types/Questions";
import { RAW_QUESTION_TYPES_MAP } from "../config/questionTypes";
import { CostReporter } from "../utils/costReporter";
import { marked } from "marked";

// Encapsulates the answer generation LLM calls for each question in answerQuestionTool
export async function answerGenerator(
  fullSnippet: string,
  reasoning: string,
  questions: Question[],
  qaContext: string,
  logger: {
    sendLog: (msg: string, snippetId?: string) => void;
    sendEvent: (event: string, data: any) => void;
    sendError: (error: any) => void;
  },
  costReporter: CostReporter,
  snippetId: string
): Promise<
  PromiseSettledResult<{
    question: string;
    detailed_answer: string;
    short_answer: string;
    short_reasoning: string;
  }>[]
> {
  return Promise.allSettled(
    questions.map(async (question) => {
      const { questionId, description, questionType, questionText } = question;
      const customAnswerGenerator =
        RAW_QUESTION_TYPES_MAP[questionType].answerGenerator;

      const result = await customAnswerGenerator(
        fullSnippet,
        reasoning,
        questions,
        question,
        qaContext,
        logger,
        costReporter,
        snippetId
      );
      // Parse markdown to HTML
      const rawDetailed = result.detailed_answer || "-";
      const rawReasoning = result.reasoning || "-";
      const detailedHtml = await marked.parse(rawDetailed);
      const reasoningHtml = await marked.parse(rawReasoning);

      logger.sendEvent("detailedAnswer", {
        snippetId,
        question: questionText,
        detailedAnswer: detailedHtml,
      });
      logger.sendEvent("shortAnswer", {
        snippetId,
        question: questionText,
        shortAnswer: result.short_answer || "-",
      });
      logger.sendEvent("reasoning", {
        snippetId,
        question: questionText,
        reasoning: reasoningHtml,
      });
      logger.sendLog(
        `Generated answer for question "${question.shortQuestionText}": ${result.short_answer}`,
        snippetId
      );

      return {
        question: questionText,
        detailed_answer: detailedHtml,
        short_answer: result.short_answer || "-",
        short_reasoning: reasoningHtml,
      };
    })
  );
}
