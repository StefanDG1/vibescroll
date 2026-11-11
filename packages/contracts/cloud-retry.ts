import { z } from "zod";

export const cloudRetryRequest = z.strictObject({
  generation: z.number().int().nonnegative(),
  revision: z.number().int().nonnegative(),
  key: z
    .string()
    .min(8)
    .max(64)
    .regex(/^[a-zA-Z0-9_-]+$/),
});

type RetrySource = {
  state: string;
  generation: number;
  kind: string;
  rightsAttested: boolean;
  analysis?: unknown;
  summary?: unknown;
  orderedMedia?: unknown;
  personalMedia?: unknown;
  publicImportId?: unknown;
  currentRevisionId?: unknown;
  selectedAnalysisVersionId?: unknown;
  pendingAnalysisAttemptId?: unknown;
  objectKey?: unknown;
  text?: unknown;
  catalogWait?: unknown;
  personalAnalysis?: {
    executor?: string;
    generation: number;
    state: string;
    leaseUntil: number;
    deadline: number;
    inputTokens?: unknown;
    outputTokens?: unknown;
    cloud?: {
      taskId?: unknown;
      claimedAt?: unknown;
      consentId?: unknown;
      leaseTokenHash?: unknown;
      completionHash?: unknown;
      media?: { preparationHash?: unknown; evidenceRepair?: unknown } | null;
    };
    expiresAt: number;
  };
};

/** Conservative eligibility only. Identity, current defaults and scope are checked by the caller. */
export function cloudRetryEligible(source: RetrySource, now = Date.now()) {
  const job = source.personalAnalysis;
  return (
    source.kind === "url" &&
    source.rightsAttested &&
    ![
      source.analysis,
      source.summary,
      source.orderedMedia,
      source.personalMedia,
      source.publicImportId,
      source.currentRevisionId,
      source.selectedAnalysisVersionId,
      source.pendingAnalysisAttemptId,
      source.objectKey,
      source.text,
      source.catalogWait,
    ].some((value) => value !== undefined) &&
    job?.executor === "work_cloud" &&
    job.generation === source.generation &&
    !!job.cloud?.media &&
    job.leaseUntil === 0 &&
    job.deadline === 0 &&
    ![
      job.cloud.taskId,
      job.cloud.claimedAt,
      job.cloud.consentId,
      job.cloud.leaseTokenHash,
      job.cloud.completionHash,
      job.cloud.media.preparationHash,
      job.cloud.media.evidenceRepair,
      job.inputTokens,
      job.outputTokens,
    ].some((value) => value !== undefined) &&
    ((source.state === "failed" &&
      ["failed", "cancelled", "expired"].includes(job.state)) ||
      (source.state === "queued" &&
        job.state === "queued" &&
        job.expiresAt <= now))
  );
}
