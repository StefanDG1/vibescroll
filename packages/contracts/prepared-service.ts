import { z } from "zod";
import { modelAnalysisCredits, type ApiModelId } from "./api-models";

export const preparedExecutor = z.enum(["gateway", "work_cloud"]);
export const preparedQuoteRequest = z.strictObject({
  sourceId: z.string().min(1).max(100),
  executor: preparedExecutor,
  reanalyze: z.boolean().optional(),
  model: z
    .enum(["meta/muse-spark-1.3-contributor", "gpt-6-luna", "gpt-6.1-sol"])
    .optional(),
  effort: z.enum(["none", "low", "medium", "high", "xhigh", "max"]).optional(),
});
export const preparedStartRequest = preparedQuoteRequest.extend({
  key: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
  quoteHash: z.string().regex(/^[a-f0-9]{64}$/),
  maximumCredits: z.number().int().min(0).max(501),
});
export const preparedTariff = "prepared-service-credits-v1" as const;

// Existing service-credit balances keep their denomination. This tariff changes
// the quoted job quantity, never historical purchases, allocations or invoices.
export function preparedCreditQuote(
  durationMs: number,
  executor: z.infer<typeof preparedExecutor>,
  reuse: boolean,
  model: ApiModelId = "meta/muse-spark-1.3-contributor",
) {
  if (
    !Number.isSafeInteger(durationMs) ||
    durationMs <= 0 ||
    durationMs > 600000
  )
    throw Error("INVALID_DURATION");
  const preparation = reuse ? 0 : 1;
  const analysis =
    executor === "gateway" ? modelAnalysisCredits(durationMs, model) : 0;
  return { preparation, analysis, maximum: preparation + analysis };
}
