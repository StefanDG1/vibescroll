import { z } from "zod";
import { insightOutput, sourceInsightOutput } from "./index";
import {
  cloudObservedMediaSchema,
  socialEvidenceSchema,
} from "../social/contracts";
import { socialAnalysisOutput } from "../social/analysis";
import downloader from "../../infra/downloader.json";
import asr from "../media/asr-model.lock.json";

export const workCloudMediaPolicy = {
  schemaVersion: "work-cloud-media-v2",
  pipelineVersion: "official-work-cloud-media-v2",
  funding: "own_subscription",
  maxApiUsd: 0,
  publication: "private_only",
  maximumBytes: 50 * 1024 * 1024,
  maximumDurationMs: 600000,
  maximumFrames: 48,
  maximumSegments: 200,
  maximumPayloadBytes: 120000,
  maximumExecutionMs: 900000,
  maximumLeaseMs: 180000,
  maximumAcquisitionMs: 60000,
  maximumSourceInvocations: 1,
  maximumDownloadedBytes: 750 * 1024 * 1024,
  maximumPrivateDiskBytes: 2 * 1024 * 1024 * 1024,
  automaticRetries: 0,
  networkEnforcement: "current_restricted_required",
  maximumResultRetentionMs: 30 * 86400000,
  rawMediaCleanupTargetMs: 86400000,
  provenance: "authenticated_host_reported",
  toolchain: { version: "cloud-sampled-preparation-v2", downloader, asr },
} as const;
export const workCloudMediaPreparation = z.strictObject({
  schemaVersion: z.literal("work-cloud-media-preparation-v2"),
  post: cloudObservedMediaSchema,
  evidence: z.array(socialEvidenceSchema).max(248),
});
export const validateWorkCloudMediaOutput = (value: unknown) =>
  socialAnalysisOutput.parse(value);

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
export const workCloudMcpRequestOptions = z.strictObject({
  model: z.string().min(1).max(100),
  effort: z.enum(["low", "medium", "high", "xhigh"]),
  useOwnPlan: z.literal(true),
  maxApiUsd: z.literal(0),
  retainUntil: z.number().int().positive(),
});
export const workCloudLeaseInput = z.object(lease).strict();
export const workCloudPrepareInput = z
  .object({
    ...lease,
    preparationJson: z.string().min(2).max(120000),
  })
  .strict();
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
      operation: z.literal("work_cloud_prepare"),
      args: workCloudPrepareInput,
    })
    .strict(),
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
    return (
      "operation" in value &&
      ["work_cloud_complete", "work_cloud_prepare"].includes(
        value.operation as string,
      )
    );
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
    ["work_cloud_complete", "work_cloud_prepare"].includes(
      params.name as string,
    )
  );
}
