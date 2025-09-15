import { Question } from "../types/Questions";

export const getGroupedReasoningWarning = (
  questions: Question[],
  question: Question
) => {
  const otherQuestions = questions.filter(
    (q) => q.questionId !== question.questionId
  );
  if (otherQuestions.length === 0) {
    return "";
  }
  return `
Note: While the reasoning provided is generated to support ${
    questions.length
  } questions (${questions
    .map((q) => `Q${q.questionId}: ${q.questionText}`)
    .join(", ")}), your task is to answer only the question "${
    question.questionText
  }".
Please ensure that that you only use the reasoning that is relevant to this question and do not attempt to answer any other questions than "${
    question.questionText
  }".
`.trim();
};
