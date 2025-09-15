import { classificationAnswerGenerator } from "../llmCalls/classificationAnswerGenerator";
import { classificationQuestionFinalizer } from "../llmCalls/classificationQuestionFinalizer";
import { listAnswerGenerator } from "../llmCalls/listAnswerGenerator";
import { listFinalizer } from "../llmCalls/listFinalizer";
import { openEndedAnswerGenerator } from "../llmCalls/openEndedAnswerGenerator";
import { openEndedQuestionFinalizer } from "../llmCalls/openEndedQuestionFinalizer";
import { scaleAnswerGenerator } from "../llmCalls/scaleAnswerGenerator";
import { scaleFinalizer } from "../llmCalls/scaleFinalizer";

// export const SNIPPET_SHORT_DESCRIPTION =
//   "conversation between a customer and a customer service representative";

// export const SNIPPET_TITLE = "Customer Service Conversation";

// export const SNIPPET_WORD_TITLE_CASE = "Conversation";

export const SNIPPET_SHORT_DESCRIPTION =
  "application to an aviation related job";
export const SNIPPET_TITLE = "Aviation Job Application";
export const SNIPPET_WORD_TITLE_CASE = "Application";

export const SNIPPET_WORD = SNIPPET_WORD_TITLE_CASE.toLowerCase();

export const RAW_QUESTION_TYPES = [
  "classification",
  "scale",
  "list_or_count",
  "open_ended",
] as const;

export type RawQuestionType = (typeof RAW_QUESTION_TYPES)[number];

export const RAW_QUESTION_TYPES_MAP = {
  classification: {
    name: "Classification",
    designedFor:
      "Choosing one from a set of labels as the answer. This is the most common type of question, answers may be binary or multi-class.",
    gotchas:
      "Be careful with ambiguous cases, as the model may not be able to choose a label. Allow for escape routes by including an 'N/A', 'Partial', or other labels where and as justified. Always define the criteria for each label clearly and in detail.",
    paramsNeeded: "choices array of { label, criteria }",
    questionFinalizer: classificationQuestionFinalizer,
    answerGenerator: classificationAnswerGenerator,
  },
  scale: {
    name: "Scale",
    designedFor:
      "Rating something on a scale, such as 1-5 or 0-100. This is useful for subjective questions where the answer is not binary.",
    gotchas: "Scales of less than 5 points are often not very useful.",
    paramsNeeded:
      "min, max, and guidance clearly describing at least 3 ranges on the scale",
    questionFinalizer: scaleFinalizer,
    answerGenerator: scaleAnswerGenerator,
  },
  list_or_count: {
    name: "List or Count",
    designedFor:
      "Retrieving text snippets or constructing lists (verbatim, inferred, or mixed). Can return a list of items or a count of items for answering quantifiable questions.",
    gotchas:
      "You may ask to allow ambiguity in the list, this helps the overall results accuracy by collecting and marking ambiguous items. These will result in a range of values for the count question. Define both criteria for items to be included in and excluded from the list clearly and in detail.",
    paramsNeeded:
      "extractionCriteria, cardinality, ambiguityHints, listOrCount",
    questionFinalizer: listFinalizer,
    answerGenerator: listAnswerGenerator,
  },
  open_ended: {
    name: "Open-ended",
    designedFor:
      "Free-form narrative or explanation. This is useful for subjective questions where the answer is not binary.",
    gotchas: "Reasonable length is within a few paragraphs.",
    paramsNeeded: "coverageGuidance, expectedLength",
    questionFinalizer: openEndedQuestionFinalizer,
    answerGenerator: openEndedAnswerGenerator,
  },
} as const;
