export interface ModelCostConfig {
  in: number;
  cachedIn: number;
  out: number;
  quantity: number;
}

export interface ModelConfig {
  model: string;
  cost: ModelCostConfig;
  temperature: number;
  top_p: number;
  seed?: number;
  max_tokens?: number;
}

export type ModelKey =
  | "deep-reasoning"
  | "orchestrator"
  | "questions-reasoner"
  | "question-guidance-generator"
  | "classification-finalizer"
  | "classification-answer"
  | "open-ended-finalizer"
  | "open-ended-answer"
  | "list-finalizer"
  | "list-answer"
  | "count-finalizer"
  | "scale-finalizer"
  | "scale-range-selector"
  | "scale-score-generator"
  | "question-execution-planner";

const defaultParams = {
  temperature: 0.1,
  top_p: 0.9,
  // seed: 42,
  // frequency_penalty: 0.1,
};

const modelConfigs: Record<string, ModelConfig> = {
  "4.1-nano": {
    ...defaultParams,
    model: "gpt-4.1-nano",
    cost: {
      in: 0.1, // cost per fresh input request
      cachedIn: 0.025, // cost per cache hit
      out: 0.4, // cost per output
      quantity: 1_000_000,
    },
  },
  "4.1-mini": {
    ...defaultParams,
    model: "gpt-4.1-mini",
    cost: {
      in: 0.4,
      cachedIn: 0.1,
      out: 1.6,
      quantity: 1_000_000,
    },
  },
  "4.1": {
    ...defaultParams,
    model: "gpt-4.1",
    cost: {
      in: 2.0,
      cachedIn: 0.5,
      out: 8.0,
      quantity: 1_000_000,
    },
  },
  "4o-mini": {
    ...defaultParams,
    model: "gpt-4o-mini",
    cost: {
      in: 0.15,
      cachedIn: 0.075,
      out: 0.6,
      quantity: 1_000_000,
    },
  },
};

const gpt41 = (max_tokens: number) => ({
  ...modelConfigs["4.1"],
  max_tokens,
});
const gpt41Mini = (max_tokens: number) => ({
  ...modelConfigs["4.1-mini"],
  max_tokens,
});
const gpt41Nano = (max_tokens: number) => ({
  ...modelConfigs["4.1-nano"],
  max_tokens,
});

export const models: Record<ModelKey, ModelConfig> = {
  orchestrator: gpt41Mini(2000),

  // question list preparation
  "questions-reasoner": gpt41Mini(8000),
  "question-guidance-generator": gpt41Mini(8000),

  // individual question generation finalizers
  "classification-finalizer": gpt41(2000),
  "open-ended-finalizer": gpt41(2000),
  "list-finalizer": gpt41(2000),
  "count-finalizer": gpt41(2000),
  "scale-finalizer": gpt41(2000),

  // execution plan generation for orchestrator, title and snippet type generation
  "question-execution-planner": gpt41Mini(3000),

  // answer generation: reasoning
  "deep-reasoning": gpt41Mini(8000),

  // individual answer generators per question type
  "open-ended-answer": gpt41Mini(4000),
  "classification-answer": gpt41Mini(2000),
  "list-answer": gpt41Mini(2000),
  "scale-range-selector": gpt41Mini(2000),
  "scale-score-generator": gpt41Mini(2000),
};
