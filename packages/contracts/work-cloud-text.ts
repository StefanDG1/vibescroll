import { z } from "zod";
import { insightOutput, sourceInsightOutput } from "./index";

export function validateWorkCloudTextOutput(value: unknown, typed: boolean) {
  // Reject unknown/deep fields with the fixed schema before hashing or
  // serializing user-controlled output recursively.
  return (typed ? sourceInsightOutput : insightOutput).parse(value);
}

const source = {
  sourceId: z.string().min(1).max(100),
  generation: z.number().int().nonnegative(),
  taskId: z.string().regex(/^[A-Za-z0-9._:-]{1,160}$/),
};
const lease = {
  ...source,
  leaseToken: z.string().uuid(),
};
export const workCloudClaimInput = z.object(source).strict();
export const workCloudLeaseInput = z.object(lease).strict();
export const workCloudCompleteInput = z
  .object({
    ...lease,
    // One bounded scalar preserves the MCP SDK's existing 256-element limit.
    // The backend separately validates the parsed canonical analysis schema.
    resultJson: z.string().min(2).max(120000),
    usage: z
      .object({
        inputTokens: z.number().int().min(0).max(10000000),
        outputTokens: z.number().int().min(0).max(10000000),
      })
      .strict()
      .optional(),
    reportedModel: z.string().min(1).max(100).optional(),
    reportedEffort: z.enum(["low", "medium", "high", "xhigh"]).optional(),
  })
  .strict();
export function parseWorkCloudResult(resultJson: string): unknown {
  if (new TextEncoder().encode(resultJson).byteLength > 120000)
    throw Error("Cloud result exceeds its byte bound.");
  return JSON.parse(resultJson);
}

export const workCloudTextOperations = [
  z
    .object({
      operation: z.literal("work_cloud_claim"),
      args: workCloudClaimInput,
    })
    .strict(),
  z
    .object({
      operation: z.literal("work_cloud_input"),
      args: workCloudLeaseInput,
    })
    .strict(),
  z
    .object({
      operation: z.literal("work_cloud_heartbeat"),
      args: workCloudLeaseInput,
    })
    .strict(),
  z
    .object({
      operation: z.literal("work_cloud_complete"),
      args: workCloudCompleteInput,
    })
    .strict(),
  z
    .object({
      operation: z.literal("work_cloud_fail"),
      args: workCloudLeaseInput,
    })
    .strict(),
] as const;

export function cloudCompletionEnvelope(value: unknown, mcp = false) {
  if (!value || typeof value !== "object") return false;
  if (!mcp)
    return "operation" in value && value.operation === "work_cloud_complete";
  if (
    !("method" in value) ||
    value.method !== "tools/call" ||
    !("params" in value)
  )
    return false;
  const params = value.params;
  return (
    !!params &&
    typeof params === "object" &&
    "name" in params &&
    params.name === "work_cloud_complete"
  );
}
