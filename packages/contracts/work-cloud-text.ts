import { z } from "zod";
import { insightOutput, sourceInsightOutput } from "./index";
import {
  cloudObservedMediaSchema,
  socialEvidenceSchema,
} from "../social/contracts";
import { socialAnalysisOutput } from "../social/analysis";
import downloader from "../../infra/downloader.json";
import asr from "../media/asr-model.lock.json";
import cloudDownloader from "../media/cloud-downloader.lock.json";
import extractionPackage from "../media/cloud-extractor.lock.json";
import initialV3Package from "../media/cloud-extractor-initial-v3.lock.json";

export const workCloudMediaPolicyV2 = {
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
export const workCloudMediaPolicy = {
  ...workCloudMediaPolicyV2,
  schemaVersion: "work-cloud-media-v3",
  pipelineVersion: "official-work-cloud-media-v3",
  toolchain: {
    ...workCloudMediaPolicyV2.toolchain,
    downloader: cloudDownloader,
    extractionPackage,
    captionParser: {
      version: "1.9.0",
      sha256:
        "83f1979cb7e064294f0c8473ef672ca2e5c0a7172bbf8ae9b4337899d5cdf01f",
    },
    version: "cloud-caption-preparation-v3",
  },
} as const;
// Keep accepted jobs reproducible across the reviewed decoder patch. The
// source/cost/privacy limits are unchanged; only implementation pins differ.
export const workCloudMediaPolicyInitialV3 = {
  ...workCloudMediaPolicy,
  toolchain: {
    ...workCloudMediaPolicy.toolchain,
    extractionPackage: initialV3Package,
  },
} as const;
export const workCloudRequestPolicies = [
  workCloudMediaPolicyV2,
  workCloudMediaPolicyInitialV3,
  workCloudMediaPolicy,
] as const;
export const workCloudMediaPreparation = z
  .strictObject({
    schemaVersion: z.enum([
      "work-cloud-media-preparation-v2",
      "work-cloud-media-preparation-v3",
    ]),
    post: cloudObservedMediaSchema,
    evidence: z.array(socialEvidenceSchema).max(248),
  })
  .superRefine((value, ctx) => {
    if (
      (value.schemaVersion === "work-cloud-media-preparation-v3") !==
      (value.post.schemaVersion === "work-cloud-observed-media-v2")
    )
      ctx.addIssue({
        code: "custom",
        message: "Caption-aware observations require media-v3 preparation.",
      });
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
export const workCloudMetadata = z.strictObject({
  title: z.string().min(1).max(160).optional(),
  authorName: z.string().min(1).max(160).optional(),
  durationSeconds: z.number().positive().max(600).optional(),
  publishedAt: z.number().int().positive().optional(),
});
export const workCloudMetadataInput = z.strictObject({
  ...lease,
  metadata: workCloudMetadata,
});
export const workCloudPrepareInput = z
  .object({
    ...lease,
    preparationJson: z.string().min(2).max(120000),
  })
  .strict();
export const workCloudFrameInput = z.strictObject({
  ...lease,
  repair: z.literal(true).optional(),
  frameId: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
  preparationHash: z.string().regex(/^[a-f0-9]{64}$/),
  data: z
    .string()
    .min(4)
    .max(200000)
    .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
});
// Existing connected hosts may retain their original six-tool catalog. Keep
// staged media return on the already available bounded preparation scalar.
export const workCloudPreparationStage = z.discriminatedUnion("stage", [
  z.strictObject({
    schemaVersion: z.literal("work-cloud-media-stage-v1"),
    stage: z.literal("metadata"),
    metadata: workCloudMetadata,
  }),
  z.strictObject({
    schemaVersion: z.literal("work-cloud-media-stage-v1"),
    stage: z.literal("frame"),
    ...workCloudFrameInput.omit({
      sourceId: true,
      generation: true,
      taskId: true,
      leaseToken: true,
    }).shape,
    // 80 KiB fits the original 120000-byte scalar, including its envelope.
    data: workCloudFrameInput.shape.data
      .max(109228)
      .refine(
        (data) =>
          (data.length / 4) * 3 -
            (data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0) <=
          81920,
      ),
  }),
]);
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
  z.strictObject({
    operation: z.literal("work_cloud_repair_claim"),
    args: workCloudClaimInput,
  }),
  z.strictObject({
    operation: z.literal("work_cloud_repair_input"),
    args: workCloudLeaseInput,
  }),
  z.strictObject({
    operation: z.literal("work_cloud_repair_heartbeat"),
    args: workCloudLeaseInput,
  }),
  z.strictObject({
    operation: z.literal("work_cloud_repair_complete"),
    args: workCloudLeaseInput,
  }),
  z.strictObject({
    operation: z.literal("work_cloud_metadata"),
    args: workCloudMetadataInput,
  }),
  z.strictObject({
    operation: z.literal("work_cloud_frame"),
    args: workCloudFrameInput,
  }),
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
      [
        "work_cloud_complete",
        "work_cloud_prepare",
        "work_cloud_frame",
      ].includes(value.operation as string)
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
    ["work_cloud_complete", "work_cloud_prepare", "work_cloud_frame"].includes(
      params.name as string,
    )
  );
}
