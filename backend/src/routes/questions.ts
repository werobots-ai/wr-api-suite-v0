import express, { Router } from "express";
import {
  listQuestionSets,
  loadQuestionSet,
  saveQuestionSet,
  softDeleteQuestionSet,
} from "../utils/questionStore";
import { initStream } from "../utils/initStream";
import { questionsReasoner } from "../llmCalls/questionsReasoner";
import { questionGuidanceGenerator } from "../llmCalls/questionGuidanceGenerator";
import {
  RAW_QUESTION_TYPES_MAP,
  RawQuestionType,
} from "../config/questionTypes";
import { questionExecutionPlanner } from "../llmCalls/questionExecutionPlanner";
import { v4 as uuid } from "uuid";
import { marked } from "marked";
import { QAResult } from "../types/Questions";
import { recordUsage, getUser } from "../utils/userStore";
import pricing from "../config/pricing.json";

const router = Router();

router.get("/:id", async (req, res) => {
  const { id } = req.params;
  const question = await loadQuestionSet(id);
  if (!question) {
    res.status(404).json({ error: "Question not found" });
    return;
  }

  // parse all answer fields with marked to html
  // question.qaResults = await Promise.all( question.qaResults.map(async(qa) => {
  //   return {
  //     ...qa,
  //     answers: Object.entries(qa.answers).reduce((acc, [key, value]) => {
  //       acc[key] = {
  //         ...value,
  //         detailed_answer: await marked.parse(value.detailed_answer),
  //         short_reasoning: await marked.parse(value.short_reasoning),
  //         detailed_reasoning: await marked.parse(value.detailed_reasoning),
  //       };
  //       return acc;
  //     }, {} as QAResult["answers"]),
  //   };
  // }));

  // same but await marked.parse parallelized
  question.qaResults = await Promise.all(
    question.qaResults.map(async (qa) => {
      const answers = await Promise.all(
        Object.entries(qa.answers).map(async ([key, value]) => {
          const detailed_answer = await marked.parse(value.detailed_answer);
          const short_reasoning = await marked.parse(value.short_reasoning);
          const detailed_reasoning = await marked.parse(
            value.detailed_reasoning
          );
          return {
            [key]: {
              ...value,
              detailed_answer,
              short_reasoning,
              detailed_reasoning,
            },
          };
        })
      );
      return {
        ...qa,
        answers: answers.reduce((acc, curr) => {
          const [key, value] = Object.entries(curr)[0];
          acc[key] = value;
          return acc;
        }, {} as QAResult["answers"]),
      };
    })
  );

  res.json(question);
});

router.get("/", async (_req, res) => {
  const questions = await listQuestionSets();
  res.json(questions);
});

router.post("/", express.json(), async (req, res) => {
  const logger = initStream(res);
  const { sendEvent, sendError, sendLog } = logger;

  try {
    const { changeRequest } = req.body;
    if (!changeRequest) {
      throw new Error("No change request provided.");
    }

    sendLog(`Starting question augmentation process...`);

    const id = uuid();

    const {
      result: { reasoningDocument },
      totalCost: reasoningCost,
    } = await questionsReasoner({
      changeRequest,
      logger,
    });

    console.debug(
      `Question augmentation result: ${JSON.stringify(
        reasoningDocument,
        null,
        2
      )}
      Reasoning cost: ${reasoningCost}`
    );

    const [
      {
        result: { guidance },
        totalCost: guidanceCost,
      },
      {
        result: { executionPlan, snippetType, title, executionPlanReasoning },
        totalCost: executionPlanCost,
      },
    ] = await Promise.all([
      questionGuidanceGenerator({
        reasoningDocument,
        changeRequest,
        logger,
      }),
      questionExecutionPlanner({
        reasoningDocument,
        changeRequest,
        logger,
      }),
    ]);

    let overallCost = reasoningCost + guidanceCost + executionPlanCost;

    console.debug(
      `Question guidance result: ${JSON.stringify(guidance, null, 2)}
      Guidance cost: ${guidanceCost}`,
      `Execution plan result: ${JSON.stringify(executionPlan, null, 2)}
      Execution plan cost: ${executionPlanCost}`
    );

    const definedFields = await Promise.allSettled(
      guidance.map(async (g) => {
        const { questionId, questionType, ...rest } = g;

        const finalizer =
          RAW_QUESTION_TYPES_MAP[questionType as RawQuestionType]
            .questionFinalizer;

        if (!finalizer) {
          throw new Error(
            `No finalizer defined for question type: ${questionType}`
          );
        }

        const { result, totalCost } = await finalizer({
          guidanceObj: g,
          changeRequest,
          reasoningDocument,
          logger,
        });

        overallCost += totalCost;

        sendLog(
          `Finalized ${result.question.questionType} question Q${result.question.questionId}: "${result.question.shortQuestionText}"`
        );

        console.debug(
          `Finalized question ${rest.question}: ${JSON.stringify(
            result,
            null,
            2
          )} (cost: ${totalCost})`
        );

        return {
          questionId,
          questionType,
          ...result,
        };
      })
    );

    // one more retry but with Promise.all
    const finalizedFields = await Promise.all(
      definedFields.map(async (f, i) => {
        if (f.status === "rejected") {
          console.error(
            `Failed to finalize question: ${f.reason.message}, retrying once...`
          );

          const finalizer =
            RAW_QUESTION_TYPES_MAP[guidance[i].questionType as RawQuestionType]
              .questionFinalizer;
          if (!finalizer) {
            throw new Error(
              `No finalizer defined for question type: ${guidance[i].questionType}`
            );
          }
          const {
            result: { question },
            totalCost,
          } = await finalizer({
            guidanceObj: guidance[i],
            changeRequest,
            reasoningDocument,
            logger,
            failedAttemptResult: f.reason,
          });

          overallCost += totalCost;

          console.debug(
            `Finalized question ${guidance[i].question}: ${JSON.stringify(
              question,
              null,
              2
            )} (cost: ${totalCost})`
          );

          return question;
        }

        return f.value.question;
      })
    );

    await saveQuestionSet({
      originalUserInput: changeRequest,
      questions: finalizedFields,
      executionPlan,
      executionPlanReasoning,
      snippetType,
      title,
      id,
    });

    sendLog(`Saved question set with title "${title}"`);

    sendEvent("loadQuestionSet", { questionSetId: id });

    const { userId, keySetId, keyId } = res.locals as {
      userId: string;
      keySetId: string;
      keyId: string;
    };
    const user = await getUser(userId);
    const questionCount = finalizedFields.length;
    const billed = questionCount * pricing.questionGeneration;
    const requests = questionCount + 3; // reasoner + guidance + plan + per question finalizer
    await recordUsage(overallCost, billed, "question_generation", user.id, requests, keySetId, keyId);

    sendLog(`DONE.`);

    res.end();
  } catch (err: any) {
    sendError(new Error(`Error during question augmentation: ${err.message}`));
    console.error(err);
    res.end();
  }
});

router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await softDeleteQuestionSet(id);
    // Successful soft delete: no content
    res.sendStatus(204);
  } catch (err: any) {
    console.error(err);
    // If the question set wasn't found, return 404
    if (err.message.includes("not found")) {
      res.status(404).json({ error: err.message });
    } else {
      // For other errors, return 500
      res.status(500).json({ error: err.message });
    }
  }
});
export default router;
