import { z } from "zod";
import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { personalOrderedInputSchema } from "../../packages/social/ordered-intake";
import { orderedDecoderManifest } from "../../packages/media/manifest";
import {
  orderedDiagnostics,
  mergeOrderedWarnings,
} from "../../packages/social/diagnostics";
import {
  validateOrderedEvidence,
  socialHash,
  requireSocialRights,
} from "../../packages/social/contracts";
import { validateOrderedAnalysis } from "../../packages/social/analysis";
import { creatorConfiguration } from "./creatorPolicy";
import { sourceRetained } from "./sourceAuthority";
import { canonicalJson } from "../../packages/contracts/canonical-json.mjs";
import { containsSecret } from "../../packages/policy/secrets.mjs";
import { orderedDecoder } from "../../packages/media/decoder-ordered";
import { personalPreparationPipeline } from "./personalPreparation";
import {
  creationProvenanceCurrent,
  type PreparationRuntime,
} from "../../packages/providers/preparation-runtime";
import { pairedPersonalJob } from "../personalAnalysisSchema";

export { personalOrderedMediaSchema } from "../../packages/media/personal-ordered";
import { personalOrderedMediaSchema } from "../../packages/media/personal-ordered";
export function boundedOrdered(value: unknown, max = 512 * 1024) {
  const text = canonicalJson(value);
  if (new TextEncoder().encode(text).length > max || containsSecret(text))
    throw Error("PERSONAL_ORDERED_LIMIT");
}
export async function orderedInput(ctx: QueryCtx, source: Doc<"sources">) {
  if (
    process.env.RESTORE_LOCK === "true" ||
    process.env.MEDIA_VERIFIED !== "true" ||
    process.env.ORDERED_MEDIA_VERIFIED !== "true" ||
    source.currentRevisionId ||
    source.publicImportId ||
    source.serviceIntent ||
    source.managedAnalysisActor ||
    !source.rightsAttested ||
    !sourceRetained(source)
  )
    throw Error("PERSONAL_ORDERED_AUTHORITY_CHANGED");
  const input = personalOrderedInputSchema.parse(source.personalOrderedInput);
  boundedOrdered(input);
  if (input.metadata.schemaVersion === "provided-media-v1") {
    if (
      source.kind !== "upload" ||
      source.canonical !== `provided:${input.metadata.submissionId}` ||
      source.creatorRights
    )
      throw Error("PERSONAL_ORDERED_IDENTITY_CHANGED");
  } else {
    if (source.canonical !== input.metadata.canonical)
      throw Error("PERSONAL_ORDERED_IDENTITY_CHANGED");
    const policy = creatorConfiguration();
    if (!policy) throw Error("PERSONAL_ORDERED_PERMISSION_CHANGED");
    requireSocialRights(
      policy.rights,
      {
        provider: policy.provider,
        platform: input.metadata.platform,
        creatorId: input.metadata.creatorId,
        workload: "analysis",
        route: "own_subscription",
      },
      Date.now(),
    );
    if (
      input.metadata.providerEvidenceId !== policy.rights.evidenceId ||
      input.metadata.observedAt < policy.rights.reviewedAt ||
      input.metadata.observedAt > Date.now()
    )
      throw Error("PERSONAL_ORDERED_PERMISSION_CHANGED");
  }
  const rows = [];
  for (const a of input.assets) {
    const row = await ctx.db
      .query("assets")
      .withIndex("by_key", (q) => q.eq("key", a.key))
      .unique();
    const retired = await ctx.db
      .query("objectDeletions")
      .withIndex("by_key", (q) => q.eq("key", a.key))
      .unique();
    if (
      retired ||
      !row ||
      row.organizationId !== source.organizationId ||
      row.sourceId !== source._id ||
      row.sourceGeneration !== source.generation ||
      row.state !== "complete" ||
      row.size !== a.bytes ||
      !Number.isSafeInteger(row.expiresAt) ||
      row.expiresAt! <= Date.now() ||
      typeof row.etag !== "string" ||
      !row.etag.length ||
      row.etag.length > 1024 ||
      !(
        a.kind === "image"
          ? ["image/jpeg", "image/png", "image/webp"]
          : ["video/mp4", "video/webm"]
      ).includes(row.type)
    )
      throw Error("PERSONAL_ORDERED_ASSET_CHANGED");
    rows.push(row);
  }
  return { input, rows };
}
export function orderedInputHash(
  source: Doc<"sources">,
  input: unknown,
  rows: Doc<"assets">[],
  generation = source.generation,
) {
  return socialHash(
    canonicalJson({
      sourceId: source._id,
      organizationId: source.organizationId,
      generation,
      input,
      assets: rows.map((row) => ({
        assetId: row._id,
        key: row.key,
        etag: row.etag,
        size: row.size,
        type: row.type,
        expiresAt: row.expiresAt,
        sourceGeneration: row.sourceGeneration,
      })),
    }),
  );
}
// Reuse identity preserves original bytes, order, policy and retention while
// excluding only the mutable execution generations.
export function orderedPreparationInput(
  source: Doc<"sources">,
  input: unknown,
  rows: Doc<"assets">[],
) {
  return {
    sourceId: source._id,
    organizationId: source.organizationId,
    canonical: source.canonical,
    input,
    rights: source.creatorRights ?? null,
    retentionUntil: source.sourceRetentionUntil ?? null,
    assets: rows.map((row) => ({
      assetId: row._id,
      key: row.key,
      etag: row.etag,
      size: row.size,
      type: row.type,
      expiresAt: row.expiresAt,
    })),
  };
}
export async function orderedPreparationBinding(
  source: Doc<"sources">,
  input: unknown,
  rows: Doc<"assets">[],
  runtime: PreparationRuntime,
) {
  const inputBinding = await socialHash(
    canonicalJson(orderedPreparationInput(source, input, rows)),
  );
  return {
    inputBinding,
    binding: await socialHash(
      canonicalJson({
        version: "personal-ordered-preparation-v1",
        decoder: await socialHash(orderedDecoder),
        manifest: "ordered-decoder-v1",
        maximumLifetimeMs: 3600000,
        runtime,
        inputBinding,
      }),
    ),
  };
}
export async function reconciledOrderedCompute(
  ctx: QueryCtx,
  source: Doc<"sources">,
  currentPreflight = false,
) {
  const prefix = `personal-media:${source._id}:`;
  const rows = await ctx.db
    .query("reservations")
    .withIndex("by_key", (q) =>
      q
        .eq("organizationId", source.organizationId)
        .gte("key", prefix)
        .lt("key", `${prefix}\uffff`),
    )
    .take(101);
  // The current ledger has only active -> settled. Expiry/release labels from
  // legacy or restored rows do not establish settlement of dispatched compute.
  if (rows.length > 100 || rows.some((row) => row.state !== "settled"))
    throw Error("COST_RECONCILIATION_REQUIRED");
  const prior = source.personalAnalysis;
  if (!currentPreflight && pairedPersonalJob(prior)) {
    const device = await ctx.db.get(prior.deviceId);
    if (device?.activePersonalSource === source._id)
      throw Error("COST_RECONCILIATION_REQUIRED");
  }
}
async function orderedStampCurrent(
  ctx: QueryCtx,
  source: Doc<"sources">,
  input: unknown,
  rows: Doc<"assets">[],
  media: z.infer<typeof personalOrderedMediaSchema>,
) {
  const stamp = media.preparation;
  if (!stamp) return;
  const runtime = await personalPreparationPipeline(ctx);
  const binding =
    runtime && (await orderedPreparationBinding(source, input, rows, runtime));
  const origin = await ctx.db
    .query("reservations")
    .withIndex("by_key", (q) =>
      q
        .eq("organizationId", source.organizationId)
        .eq("key", `personal-media:${source._id}:${stamp.generation}`),
    )
    .unique();
  if (
    !runtime ||
    !binding ||
    !creationProvenanceCurrent(stamp.creationProvenance, runtime) ||
    stamp.generation > source.generation ||
    stamp.inputBinding !== binding.inputBinding ||
    stamp.binding !== binding.binding ||
    !Number.isSafeInteger(media.preparedAt) ||
    media.preparedAt > Date.now() ||
    media.expiresAt > media.preparedAt + 3600000 ||
    media.expiresAt >
      Math.min(
        ...rows.map((row) => row.expiresAt ?? 0),
        runtime.route === "broker" ? runtime.authority.expiresAt : Infinity,
      ) ||
    media.objects.some((object) => !object.etag) ||
    origin?.state !== "settled" ||
    origin.dispatchedAt === undefined
  )
    throw Error("PERSONAL_ORDERED_PREPARATION_CHANGED");
}
export async function reusablePersonalOrderedPreparation(
  ctx: QueryCtx,
  source: Doc<"sources">,
) {
  await reconciledOrderedCompute(ctx, source);
  const job = source.personalAnalysis;
  const rebasedPreflight =
    pairedPersonalJob(job) &&
    job.ordered?.phase === "preflight" &&
    !!job.ordered.preparedHash &&
    source.personalMedia?.preparation?.generation < job.generation;
  if (
    source.state !== "failed" ||
    !pairedPersonalJob(job) ||
    !["failed", "expired"].includes(job.state) ||
    job.generation !== source.generation ||
    (job.ordered?.phase !== "analysis" && !rebasedPreflight) ||
    !source.personalMedia?.preparation
  )
    return null;
  try {
    return (await orderedPrepared(ctx, source)).media;
  } catch {
    return null;
  }
}
export async function orderedPrepared(ctx: QueryCtx, source: Doc<"sources">) {
  const { input, rows } = await orderedInput(ctx, source),
    media = personalOrderedMediaSchema.parse(source.personalMedia);
  boundedOrdered(media);
  const manifest = orderedDecoderManifest(media.manifest),
    job = source.personalAnalysis;
  if (
    media.generation !== source.generation ||
    media.inputBinding !== (await orderedInputHash(source, input, rows)) ||
    media.expiresAt <= Date.now() ||
    media.expiresAt > (source.sourceRetentionUntil ?? Infinity) ||
    !job?.ordered ||
    job.ordered.inputBinding !== media.inputBinding ||
    job.ordered.preparedHash !== (await socialHash(canonicalJson(media))) ||
    canonicalJson(media.metadata) !== canonicalJson(input.metadata) ||
    canonicalJson(media.omissions) !== canonicalJson(manifest.omitted)
  )
    throw Error("PERSONAL_ORDERED_PREPARATION_CHANGED");
  const all = [...manifest.assets, ...manifest.omitted];
  if (
    all.length !== input.assets.length ||
    !input.assets.every(
      (a) =>
        manifest.assets.some(
          (b) =>
            b.id === a.id &&
            b.index === a.index &&
            b.kind === a.kind &&
            b.bytes === a.bytes &&
            b.contentHash === a.sha256,
        ) || manifest.omitted.some((b) => b.id === a.id && b.index === a.index),
    )
  )
    throw Error("PERSONAL_ORDERED_INPUT_CHANGED");
  const files = manifest.assets.flatMap((a) => [
    ...a.representations,
    ...(a.audio ? [a.audio] : []),
  ]);
  if (
    files.length !== media.objects.length ||
    new Set(media.objects.map((o) => o.file)).size !== files.length
  )
    throw Error("PERSONAL_ORDERED_PREPARATION_CHANGED");
  for (const file of files) {
    const object = media.objects.find((o) => o.file === file.file),
      id = object && ctx.db.normalizeId("assets", object.assetId),
      row = id && (await ctx.db.get(id)),
      retired =
        object &&
        (await ctx.db
          .query("objectDeletions")
          .withIndex("by_key", (q) => q.eq("key", object.key))
          .unique());
    if (
      !object ||
      !row ||
      retired ||
      row.organizationId !== source.organizationId ||
      row.sourceId !== source._id ||
      row.sourceGeneration !== source.generation ||
      row.state !== "complete" ||
      row.key !== object.key ||
      row.size !== object.size ||
      object.size !== file.bytes ||
      object.sha256 !== file.sha256 ||
      row.type !== object.type ||
      (object.etag !== undefined && row.etag !== object.etag) ||
      row.kind !==
        (object.type === "audio/wav" ? "normalized_audio" : "evidence") ||
      row.expiresAt === undefined ||
      row.expiresAt <= Date.now() ||
      row.expiresAt < media.expiresAt
    )
      throw Error("PERSONAL_ORDERED_EVIDENCE_CHANGED");
  }
  await orderedStampCurrent(ctx, source, input, rows, media);
  return { input, media, manifest };
}
export async function orderedCompletion(
  ctx: QueryCtx,
  source: Doc<"sources">,
  evidenceValue: unknown,
  output: unknown,
) {
  boundedOrdered({ evidenceValue, output });
  boundedOrdered(output, 120000);
  const current = await orderedPrepared(ctx, source);
  const checked = z
    .strictObject({
      schemaVersion: z.literal("ordered-media-v1"),
      post: z.unknown(),
      evidence: z.unknown(),
      warnings: z.array(z.string().max(500)).max(20),
      omissions: orderedDiagnostics.shape.omissions,
    })
    .parse(evidenceValue);
  const media = await validateOrderedEvidence(checked.post, checked.evidence);
  const {
    assets,
    captionHash: _captionHash,
    revisionHash: _revisionHash,
    coverage: _coverage,
    ...metadata
  } = media.post;
  const expectedCoverage = current.manifest.omitted.length
    ? "partial"
    : current.input.metadata.expectedAssetCount === assets.length &&
        assets.every((asset, index) => asset.index === index)
      ? "complete_manifest"
      : "unknown";
  if (media.post.coverage !== expectedCoverage)
    throw Error("PERSONAL_ORDERED_RESULT_CHANGED");
  if (
    canonicalJson(metadata) !== canonicalJson(current.input.metadata) ||
    canonicalJson(checked.omissions) !==
      canonicalJson(current.manifest.omitted) ||
    assets.length !== current.manifest.assets.length
  )
    throw Error("PERSONAL_ORDERED_RESULT_CHANGED");
  for (const asset of assets) {
    const decoded = current.manifest.assets.find(
      (a) => a.id === asset.id && a.index === asset.index,
    );
    if (!decoded) throw Error("PERSONAL_ORDERED_RESULT_CHANGED");
    const { representations: _representations, audio, ...original } = decoded;
    if (
      canonicalJson(asset) !==
      canonicalJson({
        ...original,
        inspected: true,
        ...(decoded.kind === "video" ? { audioInspected: !!audio } : {}),
      })
    )
      throw Error("PERSONAL_ORDERED_RESULT_CHANGED");
  }
  for (const record of media.evidence) {
    const asset = current.manifest.assets.find(
      (a) => a.id === record.assetId && a.index === record.assetIndex,
    )!;
    if (record.kind === "image_observation" && record.crop)
      throw Error("PERSONAL_ORDERED_RESULT_CHANGED");
    if (
      record.kind === "video_observation" &&
      (record.basis === "transcript"
        ? !asset.audio
        : !asset.representations.some(
            (r) =>
              r.kind === "video_frame" &&
              r.timestampMs === record.startMs &&
              record.endMs ===
                Math.min(
                  asset.kind === "video" ? asset.durationMs : 0,
                  r.timestampMs + 1,
                ),
          ))
    )
      throw Error("PERSONAL_ORDERED_RESULT_CHANGED");
  }
  const prepared = { schemaVersion: "ordered-media-v1" as const, ...media };
  const validated = await validateOrderedAnalysis(output, prepared, {
    sourceId: source._id,
    generation: source.generation,
  });
  validated.analysis.warnings = mergeOrderedWarnings(
    validated.analysis.warnings,
    [...current.media.warnings, ...checked.warnings],
  );
  return validated;
}
