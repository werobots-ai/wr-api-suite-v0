// 1. Allowed question categories
//   - 'classification': pick one label from a set (e.g., Yes/No, sentiment categories).
//     Fallback options like 'Partially' or 'Unknown' are highly recommended to boost LLM accuracy.
//   - 'scale': numeric rating within a defined range (e.g., 1–5, 0–100).
//     Must specify at least three contiguous ranges, each with clear criteria and guidance.
//   - 'list_or_count': retrieve text snippets or construct lists (verbatim, inferred, or mixed).
//     Can return a list of items or a count of items.
//   - 'open_ended': free-form narrative or explanation.
//     Must include guidance on coverage, expected length, and short-answer formatting.

export type QuestionType =
  | "classification"
  | "scale"
  | "list_or_count"
  | "open_ended";

// 2. Shared properties for every question
export interface BaseQuestion {
  questionId: number; // Unique identifier
  questionText: string; // Question text for table display
  shortQuestionText: string; // Short text for table display, needs to grammatically match the question text for the answer to naturally follow
  description: string; // Detailed rubric: edge cases, decision rules, scoring criteria
  questionType: QuestionType; // Category of logic to apply
  group: string; // Topic cluster: batch these in one reasoning pass
  dependencies: Array<{
    questionId: number; // ID of a prerequisite question
    reason: string; // Explanation of why this must run first
  }>;
}

// 3. Extensions for each question category

// A) Classification questions
export interface ClassificationQuestion extends BaseQuestion {
  questionType: "classification";

  choices: Array<{
    label: string; // e.g., "Yes", "No", "Partially", "N/A"
    criteria: string; // definitive and exhaustive criteria describing when the label applies. Needs to describe the criteria in great detail
  }>;
}

// B) Scale questions
export interface ScaleQuestion extends BaseQuestion {
  questionType: "scale";

  min: number; // Lowest possible score
  max: number; // Highest possible score

  // Partition the continuum into at least three adjacent ranges.
  ranges: Array<{
    title: string; // A short, descriptive title for the range
    min: number; // Inclusive lower bound
    max: number; // Inclusive upper bound
    criteria: string; // Rules to determine if value falls in this bucket
    guidanceWithinRange: string; // Tips for selecting an exact score within this range
  }>;
}

// C) Questions extracting lists of items
export interface ListQuestion extends BaseQuestion {
  questionType: "list_or_count";

  extractionCriteria: string; // Rubric for choosing spans or list items, needs to be definitive and exhaustive
  extractMode: "exact" | "inferred" | "mixed"; // "exact" for verbatim spans, "inferred" for paraphrases or summaries, "mixed" for both
  resultType: "list" | "count" | "both"; // "list" for list questions, "count" for count questions. Both for list questions that also need a count.
  uniqueItems: boolean; // true if the list should contain unique items, false if duplicates need to be included
  cardinality: string; // for list type results, e.g., "1", "all", "few"; To get accurate counts, use "All".
  allowAmbiguity: boolean; // true if ambiguous items should be included and marked as such. Will result in ranges for count questions
  disambiguationGuide: string; // definitive and exhaustive criteria for when and how to include ambiguous items. May apply both when including ambiguous items and when excluding them.

  // For list type only; Clear instructions on how to show a preview in table cells where only a few words or key phrase is needed
  previewGuidance: string;
}

// D) Open-ended questions
export interface OpenEndedQuestion extends BaseQuestion {
  questionType: "open_ended";

  guidance: string; // Topics or points to cover in the narrative
  expectedLength?: string; // e.g. "3–5 sentences", "1 paragraph"

  // Short preview for table cells: a headline or few-word summary
  previewGuidance: string;
}

// 4. Union of all question variants
export type Question =
  | ClassificationQuestion
  | ScaleQuestion
  | ListQuestion
  | OpenEndedQuestion;

export type QuestionSetStatus = "draft" | "active" | "inactive";

export type QuestionSetActor =
  | {
      type: "user";
      id: string;
      label?: string | null;
    }
  | {
      type: "apiKey";
      id: string;
      label?: string | null;
    };

export interface QuestionSet {
  id: string;
  executionPlan: string;
  executionPlanReasoning: string;
  snippetType: string;
  questions: Question[];
  qaResults: QAResult[];
  title: string;
  originalUserInput: string;
  status: QuestionSetStatus;
  createdAt: string;
  updatedAt: string;
  finalizedAt: string | null;
  createdBy: QuestionSetActor | null;
  lastModifiedBy: QuestionSetActor | null;
}

/**
 * Friendly labels and short descriptions for each QuestionType.
 */
export const QUESTION_TYPE_LABELS: Record<
  QuestionType,
  { label: string; description: string }
> = {
  classification: {
    label: "Classification",
    description: "Selects one label from a predefined set",
  },
  scale: {
    label: "Scale",
    description: "Chooses a numeric rating within a defined range",
  },
  list_or_count: {
    label: "List Or Count",
    description:
      "Extracts a list of verbatim or inferred items and/or counts them",
  },
  open_ended: {
    label: "Open-ended",
    description: "Provides a free-form narrative response",
  },
};

export interface QAResult {
  files: string[];
  snippetId: string;
  questionSetId: string;
  answers: Record<
    string,
    {
      detailed_reasoning: string;
      short_reasoning: string;
      detailed_answer: string;
      short_answer: string;
    }
  >;
  logs: string[];
  metrics: {
    requests: number;
    cost: number;
  };
  rowCount: number;
  errors: string[];
}
