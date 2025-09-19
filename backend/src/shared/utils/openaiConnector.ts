import { config } from "dotenv";

config({
  path: `.env.${process.env.NODE_ENV || "local"}`,
});

if (!process.env.OPENAI_API_KEY) {
  throw new Error("Missing OPENAI_API_KEY in environment variables");
}

const CACHE_SPEED_RATIO = process.env.CACHE_SPEED_RATIO
  ? parseFloat(process.env.CACHE_SPEED_RATIO)
  : undefined;

if (CACHE_SPEED_RATIO !== undefined) {
  console.debug(
    `Cache speed ratio is set to ${CACHE_SPEED_RATIO}. Cached request will be ${Number(
      (1 / CACHE_SPEED_RATIO).toFixed(1)
    )} times faster.`
  );
}

import crypto from "crypto";
import OpenAI from "openai";
import { ModelKey, models } from "../config/models";
import { playMacSound } from "./playMacSound";
import {
  getItem,
  putItem,
  OPENAI_CACHE_TABLE_NAME,
  OPENAI_CACHE_TTL_SECONDS,
} from "./dynamo";

type OpenAIResponse = OpenAI.Chat.Completions.ChatCompletion & {
  _request_id?: string | null;
};

interface CacheEntry {
  inputParams: any;
  hashSource: any;
  response: OpenAIResponse;
  usage: OpenAI.Completions.CompletionUsage;
  costPrompt: number;
  costCompletion: number;
  totalCost: number;
  timestampStart: string;
  timestampEnd: string;
  durationMs: number;
}

interface CacheTableItem {
  cacheKey: string;
  modelKey: ModelKey;
  entry: CacheEntry;
  hashSource: string;
  expiresAt: number;
  createdAt: string;
  updatedAt: string;
}

const recursivelyCleanObject = (obj: any): string => {
  if (obj === null || obj === undefined) {
    return "";
  }

  if (typeof obj === "string") {
    return obj;
  }

  if (typeof obj === "object") {
    if (Array.isArray(obj)) {
      return obj.map(recursivelyCleanObject).join("");
    }

    const keys = Object.keys(obj).sort();
    return keys
      .filter((key) => key !== "tool_call_id" && key !== "id")
      .map((key) => `${key}${recursivelyCleanObject(obj[key])}`)
      .join("");
  }

  return obj.toString();
};

const customIdRegex = /\d{8}T\d{6}-[a-fA-F0-9]+/g;
const removeCustomIds = (str: string) =>
  str.replace(customIdRegex, "CUSTOM_ID");

const getObjectHash = (obj: any) => {
  const hash = crypto.createHash("md5");
  hash.update(removeCustomIds(recursivelyCleanObject(obj)));
  return hash.digest("hex");
};

export async function openAIWithCache(
  modelKey: ModelKey,
  messages: OpenAI.ChatCompletionMessageParam[],
  options: Partial<OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming> = {}
): Promise<{
  response: OpenAIResponse;
  costPrompt: number;
  costCompletion: number;
  totalCost: number;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}> {
  const cfg = models[modelKey];
  if (!cfg) throw new Error(`Unknown model key "${modelKey}"`);

  const params = {
    model: cfg.model,
    messages,
    ...(cfg.temperature && { temperature: cfg.temperature }),
    ...(cfg.top_p && { top_p: cfg.top_p }),
    ...(cfg.seed && { seed: cfg.seed }),
    ...(cfg.max_tokens && { max_tokens: cfg.max_tokens }),
    ...options, // allow callers to override defaults when needed
  };

  const hash = getObjectHash(params);
  const cacheKey = hash;
  const nowEpoch = Math.floor(Date.now() / 1000);

  try {
    const cached = await getItem({
      TableName: OPENAI_CACHE_TABLE_NAME,
      Key: {
        cacheKey,
      },
      ConsistentRead: true,
    });
    if (cached.Item) {
      const item = cached.Item as CacheTableItem;
      if (!item.expiresAt || item.expiresAt > nowEpoch) {
        const entry = item.entry;

        const cachedCostPrompt =
          entry.usage.prompt_tokens_details!.cached_tokens! *
          (cfg.cost.cachedIn / cfg.cost.quantity);
        const costPrompt =
          (entry.usage.prompt_tokens -
            entry.usage.prompt_tokens_details!.cached_tokens!) *
            (cfg.cost.in / cfg.cost.quantity) +
          cachedCostPrompt;
        const costCompletion =
          entry.usage.completion_tokens * (cfg.cost.out / cfg.cost.quantity);
        const totalCost = costPrompt + costCompletion;

        if (CACHE_SPEED_RATIO !== undefined) {
          const delayMs = Math.round(entry.durationMs * CACHE_SPEED_RATIO);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }

        playMacSound(0);

        return {
          response: entry.response,
          costPrompt,
          costCompletion,
          totalCost,
          usage: entry.usage,
        };
      }
    }
  } catch (error) {
    console.warn("Failed to read cache entry from DynamoDB", error);
  }

  const start = Date.now();
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  // Emit an audible cue so cache misses are easy to notice during local dev.
  playMacSound(1);

  // Issue the request to OpenAI and capture timings for cache metadata.
  const resp = await openai.chat.completions.create(params);
  const end = Date.now();

  const usage = resp.usage!;
  const costPrompt = usage.prompt_tokens * (cfg.cost.in / cfg.cost.quantity);
  const costCompletion =
    usage.completion_tokens * (cfg.cost.out / cfg.cost.quantity);
  const totalCost = costPrompt + costCompletion;

  const entry: CacheEntry = {
    inputParams: params,
    hashSource: removeCustomIds(recursivelyCleanObject(params)),
    response: resp,
    usage,
    costPrompt,
    costCompletion,
    totalCost,
    timestampStart: new Date(start).toISOString(),
    timestampEnd: new Date(end).toISOString(),
    durationMs: end - start,
  };

  const expiresAt = Math.floor(end / 1000) + OPENAI_CACHE_TTL_SECONDS;
  const item: CacheTableItem = {
    cacheKey,
    modelKey,
    entry,
    hashSource: entry.hashSource,
    expiresAt,
    createdAt: entry.timestampStart,
    updatedAt: entry.timestampEnd,
  };

  try {
    await putItem({
      TableName: OPENAI_CACHE_TABLE_NAME,
      Item: item,
    });
  } catch (error) {
    console.warn("Failed to persist cache entry to DynamoDB", error);
  }

  return { response: resp, costPrompt, costCompletion, totalCost, usage };
}
