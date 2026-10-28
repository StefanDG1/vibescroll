import type { Doc } from "../_generated/dataModel";
import { postDisplayTitle } from "../../packages/sources/display";
import { acquisitionPolicy } from "../../packages/media/acquisition-runtime";
import { retainedCloudFrames } from "../../packages/media/cloud-frames";
import { canonicalJson } from "../../packages/contracts/canonical-json.mjs";
import {
  postSummaryV1,
  postProgressV1,
  postSourceState,
  postExecutionState,
  postStage,
  postOrderedPhase,
  type PostSummaryV1,
  type PostProgressV1,
} from "../../packages/contracts/post-summary";
import { sourceRetained } from "./sourceAuthority";

export async function postRevision(value: unknown) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonicalJson(value)),
  );
  return Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
const date = (v: unknown): number | null =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : null;
const generation = (v: unknown) => date(v);
const optionalEnum = <T>(result: { success: boolean; data?: T }): T | null =>
  result.success ? result.data! : null;
const earliest = (...values: (number | undefined | null)[]) => {
  const finite = values.filter((v): v is number => date(v) !== null && v! > 0);
  return finite.length ? Math.min(...finite) : null;
};

async function revisionedProgress(
  value: Omit<PostProgressV1, "progressRevision">,
) {
  return postProgressV1.parse({
    ...value,
    progressRevision: await postRevision(value),
  });
}

// Hash full source content, rather than the clipped preview. Operational fields
// (updatedAt/state/job stages/leases/usage/private variants/project context) are
// deliberately absent, so heartbeat writes cannot invalidate heavy detail.
export async function projectPostSource(
  source: Doc<"sources">,
): Promise<PostSummaryV1> {
  const content = {
    sourceId: source._id,
    capturedAt: source.createdAt,
    generation: source.generation,
    canonical: source.canonical,
    url: source.url,
    kind: source.kind,
    sourceType: source.sourceType,
    title: source.title,
    nativeMetadata: source.linkPreview
      ? {
          title: source.linkPreview.title,
          authorName: source.linkPreview.authorName,
          durationSeconds: source.linkPreview.durationSeconds,
        }
      : undefined,
    text: source.text,
    originalText: source.originalText,
    summary: source.summary,
    analysis: source.analysis,
    coverage: source.coverage,
    mediaCoverage: source.mediaCoverage,
    mediaEvidence: source.mediaEvidence,
    originalMediaEvidence: source.originalMediaEvidence,
    speechProvenance: source.speechProvenance,
    orderedMedia: source.orderedMedia,
    personalOrderedInput: source.personalOrderedInput,
    acquisition: source.acquisition
      ? {
          basis: source.acquisition.basis,
          title: source.acquisition.title,
          description: source.acquisition.description,
          durationSeconds: source.acquisition.durationSeconds,
          publishedAt: source.acquisition.publishedAt,
          byteLength: source.acquisition.byteLength,
          acquiredAt: source.acquisition.acquiredAt,
          downloaderVersion: source.acquisition.downloaderVersion,
          extractor: source.acquisition.extractor,
        }
      : undefined,
    currentRevisionId: source.currentRevisionId,
    originalSavedAt: source.originalSavedAt,
    publishedAt: source.publishedAt,
    tags: source.tags,
    categoryKeys: source.categoryKeys,
    categoryNames: source.categoryNames,
    categoryOverride: source.categoryOverride,
    domainKeys: source.domainKeys,
    rightsAttested: source.rightsAttested,
    sourceRetentionUntil: source.sourceRetentionUntil,
    creatorRights: source.creatorRights,
    thumbnailAssetId:
      (source.linkPreview?.state === "ready"
        ? source.linkPreview.assetId
        : undefined) ?? retainedCloudFrames(source)[0]?.assetId,
  };
  const contentRevision = await postRevision(content);
  const job = source.personalAnalysis;
  const currentJob = job?.generation === source.generation ? job : undefined;
  const saveIntent =
    !currentJob &&
    source.workCloudSaveIntent?.analysisGeneration === undefined &&
    source.workCloudSaveIntent?.generation === source.generation &&
    ["saved", "needs_upload"].includes(source.state)
      ? source.workCloudSaveIntent
      : undefined;
  const ordered =
    source.orderedPreparation?.generation === source.generation
      ? source.orderedPreparation
      : undefined;
  const availableUntil = earliest(
    source.sourceRetentionUntil,
    source.creatorRights?.expiresAt,
  );
  const executionState = optionalEnum(
    postExecutionState.safeParse(currentJob?.state),
  );
  // Recovery authorizes only return of a previously prepared result. Its fresh
  // lease/expiry replaces the execution window, not the old provider deadline.
  const recovering =
    currentJob?.executor === "work_cloud" && executionState === "recovering";
  let activeUntil = earliest(
    currentJob?.expiresAt,
    recovering ? undefined : currentJob?.deadline,
    ordered?.deadline,
    saveIntent?.expiresAt,
  );
  if (executionState === "running" || executionState === "recovering") {
    // Queued/preparing jobs intentionally have no lease. Claimed jobs must
    // stop at the current finite lease, including a missing/zero lease.
    activeUntil = Math.min(
      activeUntil ?? Infinity,
      date(currentJob?.leaseUntil) ?? 0,
      recovering ? Infinity : (date(currentJob?.deadline) ?? 0),
    );
  }
  const active =
    (!currentJob || executionState !== null) &&
    !["unknown", "failed", "canceled", "cancelled", "completed"].includes(
      executionState ?? "",
    ) &&
    (["queued", "processing"].includes(source.state) ||
      executionState === "recovering" ||
      (!!saveIntent && saveIntent.expiresAt > Date.now()));
  const progress = await revisionedProgress({
    version: "post-progress-v1",
    sourceId: source._id,
    generation: source.generation,
    contentRevision,
    state: postSourceState.parse(source.state),
    executor: currentJob
      ? currentJob.executor === "work_cloud"
        ? "work_cloud"
        : "paired_computer"
      : ordered || source.managedAnalysisActor
        ? "managed"
        : saveIntent
          ? "work_cloud"
          : null,
    executionState,
    stage: saveIntent
      ? "preflight"
      : optionalEnum(postStage.safeParse(currentJob?.stage)),
    orderedPhase: optionalEnum(
      postOrderedPhase.safeParse(currentJob?.ordered?.phase ?? ordered?.phase),
    ),
    active,
    activeUntil,
    availableUntil,
    measuredProgress: null,
  });
  const insights: unknown[] = Array.isArray(source.analysis?.insights)
    ? source.analysis.insights
    : [];
  const preview: PostSummaryV1["insightPreview"] = [];
  for (const item of insights.slice(0, 3)) {
    if (!item || typeof item !== "object") continue;
    const insight = item as Record<string, unknown>;
    if (
      typeof insight.id !== "string" ||
      !insight.id ||
      insight.id.length > 200 ||
      typeof insight.title !== "string" ||
      typeof insight.claim !== "string"
    )
      continue;
    preview.push({
      insightId: insight.id,
      title: insight.title.slice(0, 140),
      claimExcerpt: insight.claim.slice(0, 240),
    });
  }
  const thumbnailId =
    (source.linkPreview?.state === "ready"
      ? source.linkPreview.assetId
      : undefined) ?? retainedCloudFrames(source)[0]?.assetId;
  const thumbnail = thumbnailId
    ? {
        kind: "source-thumbnail-asset-v1" as const,
        assetId: thumbnailId,
        sourceId: source._id,
        generation: source.generation,
      }
    : null;
  let platform: string | null = null;
  try {
    if (source.url) platform = acquisitionPolicy(source.url).platform;
  } catch {
    /* Non-media sources keep their kind. */
  }
  return postSummaryV1.parse({
    version: "post-summary-v1",
    sourceId: source._id,
    generation: source.generation,
    projection: "complete",
    contentRevision,
    title: postDisplayTitle(source).slice(0, 200),
    authorName: source.linkPreview?.authorName?.slice(0, 160) ?? null,
    durationSeconds:
      source.linkPreview?.durationSeconds ??
      source.acquisition?.durationSeconds ??
      null,
    sourceKind: source.kind.slice(0, 40),
    platform,
    coverage: source.coverage.slice(0, 64),
    capturedAt: date(source.createdAt),
    savedAt: date(source.originalSavedAt ?? source.createdAt),
    publishedAt: date(source.publishedAt ?? source.acquisition?.publishedAt),
    availableUntil,
    thumbnail,
    insightCount: insights.length,
    insightPreview: preview,
    insightPreviewTruncated: insights.length > preview.length,
    progress,
  });
}

// One adapter serves both Home and visible progress. Legacy metadata never
// gains full-content freshness or preview/thumbnail claims through inference.
// It never falls back to reading the original source document.
export async function postSummaryFromCard(
  card: Doc<"dashboardCards">,
  now = Date.now(),
): Promise<PostSummaryV1 | null> {
  if (
    card.kind !== "source" ||
    !card.sourceId ||
    card.sourceId !== card.entityId ||
    card.sourceAuthorityVersion !== 2 ||
    !card.rightsAttested ||
    !sourceRetained(card, now)
  )
    return null;
  const state = postSourceState.safeParse(card.state);
  if (!state.success) return null;
  const availableUntil = earliest(
    card.sourceRetentionUntil,
    card.creatorRights?.expiresAt,
  );
  let summary: PostSummaryV1;
  if (card.postSummary !== undefined) {
    const parsed = postSummaryV1.safeParse(card.postSummary);
    if (
      !parsed.success ||
      parsed.data.sourceId !== card.sourceId ||
      parsed.data.generation !== card.generation ||
      parsed.data.progress.state !== card.state ||
      parsed.data.availableUntil !== availableUntil ||
      parsed.data.progress.sourceId !== parsed.data.sourceId ||
      parsed.data.progress.generation !== parsed.data.generation ||
      parsed.data.progress.contentRevision !== parsed.data.contentRevision ||
      parsed.data.progress.availableUntil !== availableUntil ||
      (parsed.data.projection === "complete") !==
        (parsed.data.contentRevision !== null) ||
      (parsed.data.thumbnail !== null &&
        (parsed.data.thumbnail.sourceId !== parsed.data.sourceId ||
          parsed.data.thumbnail.generation !== parsed.data.generation)) ||
      new Set(parsed.data.insightPreview.map((i) => i.insightId)).size !==
        parsed.data.insightPreview.length ||
      (parsed.data.insightCount !== null &&
        parsed.data.insightCount < parsed.data.insightPreview.length) ||
      parsed.data.insightPreviewTruncated !==
        (parsed.data.insightCount === null ||
          parsed.data.insightCount > parsed.data.insightPreview.length)
    )
      return null;
    summary = parsed.data;
  } else {
    const insightCount = date(card.insightCount);
    const progress = await revisionedProgress({
      version: "post-progress-v1",
      sourceId: card.sourceId,
      generation: generation(card.generation),
      contentRevision: null,
      state: state.data,
      executor: null,
      executionState: null,
      stage: null,
      orderedPhase: null,
      active: ["queued", "processing"].includes(card.state),
      activeUntil: null,
      availableUntil,
      measuredProgress: null,
    });
    summary = postSummaryV1.parse({
      version: "post-summary-v1",
      sourceId: card.sourceId,
      generation: generation(card.generation),
      projection: "legacy",
      contentRevision: null,
      title: card.title.slice(0, 200),
      sourceKind: card.sourceKind?.slice(0, 40) ?? null,
      coverage: card.coverage?.slice(0, 64) ?? null,
      capturedAt: date(card.createdAt),
      savedAt: null,
      publishedAt: null,
      availableUntil,
      thumbnail: null,
      insightCount,
      insightPreview: [],
      insightPreviewTruncated: insightCount === null || insightCount > 0,
      progress,
    });
  }
  const { progressRevision: _revision, ...progress } = summary.progress;
  return {
    ...summary,
    progress: await revisionedProgress({
      ...progress,
      active:
        progress.active &&
        (progress.activeUntil === null || progress.activeUntil > now),
    }),
  };
}
