import OpenAI from "openai";
import { openAIWithCache } from "../utils/openaiConnector";
import { deepReasoningBrain } from "./deepReasoningBrain";
import { answerGenerator } from "./answerGenerator";
import { getCostReporter } from "../utils/costReporter";
import { QAResult, QuestionSet } from "../types/Questions";
import { SNIPPET_SHORT_DESCRIPTION } from "../config/questionTypes";

const MAX_EXIT_ATTEMPTS = 3;

export async function orchestratorAgent(
  context: QuestionSet & {
    fullSnippet: string;
    snippetId: string;
  },
  logger: {
    sendLog: (msg: string, snippetId?: string) => void;
    sendEvent: (event: string, data: any) => void;
    sendError: (error: any) => void;
  },
  incomingPartialResult: Partial<QAResult> & { snippetId: string },
  existingMessages?: OpenAI.ChatCompletionMessageParam[],
  exitAttempts: number = 0,
  lastError?: string,
  costReporter = getCostReporter(logger.sendEvent, context.snippetId)
): Promise<QAResult> {
  if (exitAttempts > MAX_EXIT_ATTEMPTS) {
    const errorMessage = `Maximum exit attempts (${MAX_EXIT_ATTEMPTS}) reached. Exiting with error: ${lastError}`;
    logger.sendError(errorMessage);
    throw new Error(errorMessage);
  }

  const partialResult: Omit<QAResult, "metrics"> = {
    snippetId: context.snippetId,
    answers: incomingPartialResult.answers || {},
    questionSetId: context.id,
    logs: incomingPartialResult.logs || [],
    errors: incomingPartialResult.errors || [],
    files: incomingPartialResult.files || [],
    rowCount:
      incomingPartialResult.rowCount || context.fullSnippet.split("\n").length,
  };

  try {
    const messages: OpenAI.ChatCompletionMessageParam[] = existingMessages || [
      {
        role: "system",
        content: `
You are an orchestrator agent responsible for answering questions about a ${SNIPPET_SHORT_DESCRIPTION}.
Your objective is to use the answerQuestionTool to address all provided questions.
Before each answerQuestionTool call use the logToUser function to:
- Review the answers you have received so far. Look out errors, inconsistencies, or missing information. 
- In case of conflicting answers, rerun the questions with the conflicting answers together as a group to resolve the conflict.
- In case of errors and seemingly incomplete answers for some questions, leave these to the end and rerun with additional context.
- Identify which remaining questions you will answer.
- Explain your reasoning for grouping questions, based on dependencies and known facts to the user.
When calling answerQuestionTool:
- List the exact question IDs you need answers for.
- Supply the relevant information you already have, including prior answers, clues, assumptions, etc.
Continue iterating until every question is answered.

## Questions Table
| ID | Group | Question | Description | Question Type | Depend on | Notes |
|----|-------|----------|-------------|---------------|-----------|
${context.questions
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

## Answer Plan
${context.executionPlan}

## Functions
You have access to two functions. You are encouraged to use them together in each iteration: one log message to explain your reasoning accompanied by one or more answerQuestionTool calls (dealing with one or more question groups within each call itself).
### answerQuestionTool
- **questionIds**: List of question IDs to answer.
- **context**: The context for answering the questions, which may include previous answers and assumptions.
- **Note**: The function must be called iteratively until all questions are answered.
- **Note**: The function must be called for all questions, even for non applicable, ambiguous, impossible or erroneous looking or buggy questions. The process will not stop until all questions are answered using this function.
- **Note**: Always review and elaborate on the answers received from this function before continuing. If the answers are not satisfactory, they seem out of context or erroneous, you may call this function again for given questions while passing this and all other information you have to the function in the context parameter.
### logToUser
- **message**: A message to log to the user.
- **Note**: This function is for logging messages to the user. It should be used before and between function calls to inform the user of your reasoning, intentions, and progress.
    `.trim(),
      },
      {
        role: "user",
        content:
          "Reflect on the questions and their possible groupings, then begin answering the questions iteratively using answerQuestionTool and log your reasoning. Do not respond on this thread before you finish answering all questions.",
      },
    ];

    const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
      {
        type: "function",
        function: {
          name: "answerQuestionTool",
          description: "Answer a list of questions given context",
          parameters: {
            type: "object",
            properties: {
              questionIds: {
                type: "array",
                items: {
                  type: "number",
                },
              },
              context: { type: "string" },
            },
            required: ["questionIds", "context"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "logToUser",
          description: "Log a message to the user",
          parameters: {
            type: "object",
            properties: {
              message: { type: "string" },
            },
            required: ["message"],
          },
        },
      },
    ];

    const { response, totalCost } = await openAIWithCache(
      "orchestrator",
      messages,
      {
        tools,
        parallel_tool_calls: true,
      }
    );

    costReporter.addCost(totalCost);

    messages.push(response.choices[0].message);

    // if there is a message string content, log it to the user
    if (response.choices[0].message.content) {
      logger.sendLog(response.choices[0].message.content, context.snippetId);
    }

    // If the model responded without calling a tool, check if all questions are answered, if not, request the model to call the tool
    if (
      response.choices[0].finish_reason === "stop" &&
      Object.keys(partialResult.answers).length < context.questions.length
    ) {
      logger.sendLog(
        `Missed answer(s) for question(s): "${context.questions
          .filter((q) => !partialResult.answers[q.questionText])
          .map((q) => q.questionText)
          .join('", "')}". Continuing..`,
        context.snippetId
      );
      const unansweredQuestions = context.questions
        .filter((q) => !partialResult.answers[q.questionText])
        .map((q) => `Q${q.questionId}: ${q.questionText}`)
        .join('", "');
      const unansweredQuestionsPrompt = `You have the following unanswered questions:\n${unansweredQuestions}\nPlease iteratively call the "answerQuestionTool" function to answer them. You must call the tool for all questions, even for non applicable, ambiguous, impossible or erroneous and buggy questions. You can use the "logToUser" function to explain what is happening and why you are returning to work after you thought you were done.`;

      messages.push({
        role: "user",
        content: unansweredQuestionsPrompt,
      });

      return orchestratorAgent(
        context,
        logger,
        partialResult,
        messages,
        exitAttempts + 1,
        `Missed answer(s) for question(s): "${context.questions
          .filter((q) => !partialResult.answers[q.questionText])
          .map((q) => q.questionText)
          .join('", "')}". Continuing..`,
        costReporter
      );
    }

    // Process the function calls parallelly
    if (
      response.choices[0].message.tool_calls &&
      response.choices[0].message.tool_calls.length > 0
    ) {
      const toolCalls = response.choices[0].message.tool_calls;

      const toolResults = await Promise.all(
        toolCalls.map(async (toolCall) => {
          if (toolCall.type !== "function" || !toolCall.function) {
            throw new Error(`Invalid tool call: ${JSON.stringify(toolCall)}`);
          }

          const { name, arguments: args } = toolCall.function;
          if (name === "answerQuestionTool") {
            const { questionIds, context: qaContext } = JSON.parse(args) as {
              questionIds: number[];
              context: string;
            };

            const questions = questionIds.map((questionId: number) => {
              const question = context.questions.find(
                (q) => q.questionId === questionId
              );
              if (!question) {
                throw new Error(
                  `Invalid question ID: ${questionId}. Valid IDs are numbers from 1 to ${context.questions.length}.`
                );
              }
              return question;
            });

            logger.sendEvent("processingQuestions", {
              snippetId: context.snippetId,
              questions,
            });

            const reasoning = await deepReasoningBrain(
              context.fullSnippet,
              questions,
              qaContext,
              logger,
              costReporter,
              context.snippetId
            );

            const answers = await answerGenerator(
              context.fullSnippet,
              reasoning,
              questions,
              qaContext,
              logger,
              costReporter,
              context.snippetId
            );

            let responseText = "Below are the answers to the questions:\n";
            const rejectedAnswers: {
              qid: number;
              reason: string;
              shortQuestionText: string;
            }[] = [];
            // Process the answers
            answers.forEach((ans, i) => {
              const qid = questionIds[i];
              const question = context.questions.find(
                (q) => q.questionId === qid
              );
              if (!question) {
                throw new Error(
                  `Invalid question ID: ${qid}. Valid IDs are numbers from 1 to ${context.questions.length}.`
                );
              }

              if (ans.status === "fulfilled") {
                partialResult.answers[question.questionText] = {
                  detailed_reasoning: reasoning,
                  short_reasoning: ans.value.short_reasoning,
                  detailed_answer: ans.value.detailed_answer,
                  short_answer: ans.value.short_answer,
                };

                responseText += `${qid}. ${question.shortQuestionText}: ${ans.value.detailed_answer}\n`;
              }

              if (ans.status === "rejected") {
                const qid = questionIds[i];
                const question = context.questions.find(
                  (q) => q.questionId === qid
                );
                if (!question) {
                  logger.sendError(
                    `Invalid question ID: ${qid}. Valid IDs are numbers from 1 to ${context.questions.length}.`
                  );
                  throw new Error(
                    `Invalid question ID: ${qid}. Valid IDs are numbers from 1 to ${context.questions.length}.`
                  );
                }
                logger.sendError(
                  `Failed to generate answer for question "${question.questionText}": ${ans.reason}`
                );

                rejectedAnswers.push({
                  qid,
                  reason: `Failed to generate answer for question "${question.questionText}": ${ans.reason}`,
                  shortQuestionText: question.questionText,
                });
              }
            });

            if (rejectedAnswers.length > 0) {
              responseText += `\n\nThe model failed to generate answers for the following questions:\n${rejectedAnswers.join(
                "\n"
              )}`;

              rejectedAnswers.forEach(({ reason, qid }) => {
                const question = context.questions.find(
                  (q) => q.questionId === qid
                );
                if (!question) {
                  throw new Error(
                    `Invalid question ID: ${qid}. Valid IDs are numbers from 1 to ${context.questions.length}.`
                  );
                }

                partialResult.answers[question.questionText] = {
                  detailed_reasoning: reasoning,
                  short_reasoning: `Failed to generate answer due to: ${reason}`,
                  detailed_answer: `The answer is not available as the model failed to generate it. The error message is: ${reason}`,
                  short_answer: "N/A (Error)",
                };
              });

              logger.sendLog(
                `The model failed to generate answers for the following questions: ${rejectedAnswers
                  .map((ra) => ra.shortQuestionText)
                  .join(", ")}`,
                context.snippetId
              );
            }

            responseText += `\n\nCarefully review the above answers. If you find information that conflicts with the context or answers you have received so far, resolve the conflict by running the involved questions together as a group now.`;
            return responseText;
          } else if (name === "logToUser") {
            const { message } = JSON.parse(args);
            logger.sendLog(message, context.snippetId);
            return "Message logged to user";
          }
        })
      );

      // Attach the tool results to the messages
      toolResults.forEach((toolResult, i) => {
        if (typeof toolResult === "string") {
          messages.push({
            role: "tool",
            tool_call_id: toolCalls[i].id,
            content: toolResult,
          });
        }
      });

      // Check if all questions are answered, it's normal if not, we continue
      if (
        Object.keys(partialResult.answers).length < context.questions.length
      ) {
        return orchestratorAgent(
          context,
          logger,
          partialResult,
          messages,
          exitAttempts, // not tried to exit yet
          lastError,
          costReporter
        );
      }

      // If all questions are answered, return the answers
      logger.sendLog(`All questions are answered.`, context.snippetId);

      return {
        ...partialResult,
        metrics: costReporter.getMetrics(),
      };
    }

    // If the model did not call any tools, return the answers
    if (Object.keys(partialResult.answers).length === 0) {
      logger.sendLog(
        `UNEXPECTED: The model did not call any tools. Asking it to retry.`,
        context.snippetId
      );

      return orchestratorAgent(
        context,
        logger,
        partialResult,
        messages,
        exitAttempts + 1,
        `UNEXPECTED: The model did not call any tools. Asking it to retry.`,
        costReporter
      );
    }

    return {
      ...partialResult,
      metrics: costReporter.getMetrics(),
    };
  } catch (error: any) {
    const errorMessage = `Error in orchestratorAgent: ${error.message}`;
    logger.sendError(errorMessage);
    return orchestratorAgent(
      context,
      logger,
      partialResult,
      existingMessages,
      exitAttempts + 1,
      errorMessage,
      costReporter
    );
  }
}
