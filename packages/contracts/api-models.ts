// Ordinary API models only. Availability still requires current server funding
// and acceptance; an entry is not permission to dispatch a request.
export const apiModels = {
  "meta/muse-spark-1.3-contributor": {
    name: "Muse Contributor",
    provider: "vercel_gateway",
    efforts: ["medium"],
    defaultEffort: "medium",
    creditMultiplier: 1,
    maximumOutputTokens: 6000,
    inputNanoUsd: 100,
    cachedInputNanoUsd: 100,
    cacheWriteNanoUsd: 100,
    outputNanoUsd: 200,
  },
  "gpt-6-luna": {
    name: "GPT-6 Luna",
    provider: "openai_responses",
    efforts: ["none", "low", "medium", "high", "xhigh", "max"],
    defaultEffort: "max",
    creditMultiplier: 3,
    maximumOutputTokens: 12000,
    inputNanoUsd: 100,
    cachedInputNanoUsd: 10,
    cacheWriteNanoUsd: 125,
    outputNanoUsd: 500,
  },
  "gpt-6.1-sol": {
    name: "GPT-6.1 Sol",
    provider: "openai_responses",
    efforts: ["low", "medium", "high", "xhigh", "max"],
    defaultEffort: "max",
    creditMultiplier: 50,
    maximumOutputTokens: 12000,
    inputNanoUsd: 2000,
    cachedInputNanoUsd: 100,
    cacheWriteNanoUsd: 2500,
    outputNanoUsd: 10000,
  },
} as const;
export type ApiModelId = keyof typeof apiModels;
export type ApiEffort = "none" | "low" | "medium" | "high" | "xhigh" | "max";
export const apiModelTariff = "api-model-bands-20261031-v1";

export function apiModelSelection(model: string, effort?: string) {
  if (!Object.hasOwn(apiModels, model)) throw Error("MODEL_UNAVAILABLE");
  const entry = apiModels[model as ApiModelId];
  const selected = effort ?? entry.defaultEffort;
  if (!(entry.efforts as readonly string[]).includes(selected))
    throw Error("MODEL_EFFORT_UNAVAILABLE");
  return { ...entry, id: model as ApiModelId, effort: selected as ApiEffort };
}

function quantity(value: number) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 1000000)
    throw Error("MODEL_USAGE_UNAVAILABLE");
  return value;
}

// Ordinary Standard requests below 272k input tokens only. Fast/regional/long
// context prices are separate contracts and cannot borrow these rates.
export function apiTokenCost(
  model: ApiModelId,
  inputTokens: number,
  outputTokens: number,
  cachedTokens = 0,
) {
  if (!Object.hasOwn(apiModels, model)) throw Error("MODEL_UNAVAILABLE");
  const m = apiModels[model];
  quantity(inputTokens);
  quantity(outputTokens);
  quantity(cachedTokens);
  if (inputTokens > 272000 || cachedTokens > inputTokens)
    throw Error("MODEL_QUOTE_EXCEEDED");
  const uncached = inputTokens - cachedTokens;
  const nominalNanoUsd =
    uncached * m.inputNanoUsd +
    cachedTokens * m.cachedInputNanoUsd +
    outputTokens * m.outputNanoUsd;
  // Some responses do not classify cache writes separately. Preserve the price
  // interval instead of labelling an inferred upper bound a settled charge.
  const ceilingNanoUsd =
    uncached * Math.max(m.inputNanoUsd, m.cacheWriteNanoUsd) +
    cachedTokens * m.cachedInputNanoUsd +
    outputTokens * m.outputNanoUsd;
  return { nominalNanoUsd, ceilingNanoUsd };
}

export function modelAnalysisCredits(durationMs: number, model: ApiModelId) {
  if (
    !Number.isSafeInteger(durationMs) ||
    durationMs <= 0 ||
    durationMs > 600000
  )
    throw Error("INVALID_DURATION");
  return Math.ceil(durationMs / 60000) * apiModels[model].creditMultiplier;
}
