import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { personalDecoder } from "../../packages/media/decoder-personal";
import { acquirer } from "../../packages/media/acquirer";
import { downloaderRelease } from "../../packages/media/acquisition";
import { canonicalJson } from "../../packages/contracts/canonical-json.mjs";
import { sourceRetained } from "./sourceAuthority";
import {
  preparationRuntime,
  creationProvenanceCurrent,
  type PreparationRuntime,
} from "../../packages/providers/preparation-runtime";

async function hash(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
export async function personalPreparationPipeline(
  ctx?: QueryCtx,
): Promise<PreparationRuntime | null> {
  if (
    process.env.MEDIA_VERIFIED !== "true" ||
    process.env.RESTORE_LOCK === "true"
  )
    return null;
  if (!process.env.VERCEL_SANDBOX_TOKEN && process.env.SANDBOX_BRIDGE_URL) {
    if (!ctx || process.env.SANDBOX_BRIDGE_ENABLED !== "true") return null;
    const row = await ctx.db
      .query("sandboxToolSnapshots")
      .withIndex("by_kind", (q) => q.eq("kind", "media"))
      .unique();
    if (
      !row ||
      row.projectId !== process.env.VERCEL_SANDBOX_PROJECT_ID ||
      row.teamId !== process.env.VERCEL_SANDBOX_TEAM_ID
    )
      return null;
    return preparationRuntime({
      version: "preparation-runtime-v1",
      route: "broker",
      authority: {
        kind: row.kind,
        snapshotId: row.snapshotId,
        expiresAt: row.expiresAt,
        updatedAt: row.updatedAt,
        parentSnapshotId: row.parentSnapshotId ?? null,
        projectId: row.projectId,
        teamId: row.teamId,
      },
    });
  }
  const snapshot = process.env.VERCEL_MEDIA_SNAPSHOT;
  const image = process.env.VERCEL_MEDIA_IMAGE;
  const identity = snapshot
    ? /^snap_[A-Za-z0-9_-]{8,128}$/.test(snapshot)
      ? { snapshot }
      : null
    : image && /^[A-Za-z0-9/_.-]+@sha256:[a-f0-9]{64}$/.test(image)
      ? { image }
      : null;
  return identity
    ? preparationRuntime({
        version: "preparation-runtime-v1",
        route: "static",
        kind: "media",
        source:
          "snapshot" in identity
            ? { type: "snapshot", snapshotId: identity.snapshot }
            : { type: "image", image: identity.image },
      })
    : null;
}

/** Original upload identity is independent of the new analysis generation. */
export async function personalPreparationInput(
  ctx: QueryCtx,
  source: Doc<"sources">,
) {
  if (!source.rightsAttested || !sourceRetained(source)) return null;
  const base = {
    sourceId: source._id,
    organizationId: source.organizationId,
    kind: source.kind,
    input: source.kind === "upload" ? source.objectKey : source.url,
    rights: source.creatorRights?.policyCanonical ?? null,
    retentionUntil: source.sourceRetentionUntil ?? null,
  };
  if (source.kind === "url" && source.url) return { ...base, raw: null };
  if (source.kind !== "upload" || !source.objectKey) return null;
  const asset = await ctx.db
    .query("assets")
    .withIndex("by_key", (q) => q.eq("key", source.objectKey!))
    .unique();
  if (
    !asset ||
    asset.sourceId !== source._id ||
    asset.organizationId !== source.organizationId ||
    asset.state !== "complete" ||
    !Number.isSafeInteger(asset.sourceGeneration) ||
    asset.sourceGeneration! < 0 ||
    asset.sourceGeneration! > source.generation ||
    !Number.isSafeInteger(asset.size) ||
    asset.size <= 0 ||
    asset.size > 250000000 ||
    !asset.etag ||
    asset.etag.length > 512 ||
    !Number.isSafeInteger(asset.expiresAt) ||
    asset.expiresAt! <= Date.now() ||
    (await ctx.db
      .query("objectDeletions")
      .withIndex("by_key", (q) => q.eq("key", asset.key))
      .unique())
  )
    return null;
  return {
    ...base,
    raw: {
      assetId: asset._id,
      key: asset.key,
      etag: asset.etag,
      size: asset.size,
      sourceGeneration: asset.sourceGeneration!,
      expiresAt: asset.expiresAt!,
    },
  };
}
export async function personalPreparationInputBinding(
  input: NonNullable<Awaited<ReturnType<typeof personalPreparationInput>>>,
) {
  return hash(canonicalJson(input));
}
export async function personalPreparationBinding(
  source: Doc<"sources">,
  input: NonNullable<Awaited<ReturnType<typeof personalPreparationInput>>>,
  runtime?: PreparationRuntime | null,
) {
  const pipeline =
    runtime === undefined
      ? await personalPreparationPipeline()
      : preparationRuntime(runtime);
  if (!pipeline) return null;
  return hash(
    canonicalJson({
      version: "personal-preparation-v1",
      decoder: await hash(personalDecoder),
      acquirer: await hash(acquirer),
      downloader: downloaderRelease,
      pipeline,
      inputSnapshot: input,
      sourceId: source._id,
      kind: source.kind,
      input: source.kind === "upload" ? source.objectKey : source.url,
      rights: source.creatorRights?.policyCanonical ?? null,
    }),
  );
}

// Only server-created retained preparation can be reused. Inference permission
// and each account/model selection are separately reviewed on every approval.
export async function reusablePersonalPreparation(
  ctx: QueryCtx,
  source: Doc<"sources">,
) {
  const media = source.personalMedia,
    stamp = media?.preparation;
  const now = Date.now();
  const input = await personalPreparationInput(ctx, source);
  const runtime = await personalPreparationPipeline(ctx);
  if (
    process.env.MEDIA_VERIFIED !== "true" ||
    process.env.RESTORE_LOCK === "true" ||
    !source.rightsAttested ||
    !sourceRetained(source) ||
    source.state !== "failed" ||
    !source.personalAnalysis ||
    !["failed", "expired"].includes(source.personalAnalysis.state) ||
    source.currentRevisionId ||
    source.orderedMedia ||
    source.orderedPreparation ||
    !stamp ||
    stamp.version !== "personal-preparation-v1" ||
    !Number.isSafeInteger(stamp.generation) ||
    stamp.generation <= 0 ||
    stamp.generation > source.personalAnalysis.generation ||
    source.personalAnalysis.generation !== source.generation ||
    !Number.isSafeInteger(stamp.preparedAt) ||
    stamp.preparedAt > now ||
    !Number.isSafeInteger(stamp.expiresAt) ||
    stamp.expiresAt <= now ||
    stamp.expiresAt > stamp.preparedAt + 3600000 ||
    !input ||
    !stamp.binding ||
    stamp.inputBinding !== (await personalPreparationInputBinding(input)) ||
    !runtime ||
    !creationProvenanceCurrent(stamp.creationProvenance, runtime) ||
    stamp.binding !==
      (await personalPreparationBinding(source, input, runtime)) ||
    (runtime.route === "broker" &&
      stamp.expiresAt > runtime.authority.expiresAt) ||
    (input.raw && stamp.expiresAt > input.raw.expiresAt) ||
    (source.sourceRetentionUntil !== undefined &&
      stamp.expiresAt > source.sourceRetentionUntil) ||
    !Number.isSafeInteger(media.durationMs) ||
    media.durationMs <= 0 ||
    media.durationMs > 600000 ||
    !Array.isArray(media.frames) ||
    media.frames.length > 48 ||
    (!media.audio && !media.frames.length) ||
    media.coverage !==
      (media.audio
        ? media.frames.length
          ? "full_sampled"
          : "audio_only"
        : "visual_only")
  )
    return null;
  const reservation = await ctx.db
    .query("reservations")
    .withIndex("by_key", (q) =>
      q
        .eq("organizationId", source.organizationId)
        .eq("key", `personal-media:${source._id}:${stamp.generation}`),
    )
    .unique();
  if (
    reservation?.state !== "settled" ||
    reservation.dispatchedAt === undefined
  )
    return null;
  const blobs = [...media.frames, ...(media.audio ? [media.audio] : [])];
  const ids = new Set<string>();
  let frameBytes = 0;
  for (const blob of blobs) {
    const audio = blob === media.audio;
    if (
      typeof blob.assetId !== "string" ||
      ids.has(blob.assetId) ||
      !/^[a-f0-9]{64}$/.test(blob.sha256 ?? "") ||
      !Number.isSafeInteger(blob.size) ||
      blob.size <= 0 ||
      blob.size > (audio ? 19500000 : 1000000) ||
      (!audio &&
        (!Number.isSafeInteger(blob.timestampMs) ||
          blob.timestampMs < 0 ||
          blob.timestampMs >= media.durationMs))
    )
      return null;
    ids.add(blob.assetId);
    if (!audio && (frameBytes += blob.size) > 12000000) return null;
    const id = ctx.db.normalizeId("assets", blob.assetId),
      asset = id ? await ctx.db.get(id) : null;
    if (
      !asset ||
      asset.organizationId !== source.organizationId ||
      asset.sourceId !== source._id ||
      asset.sourceGeneration !== stamp.generation ||
      asset.state !== "complete" ||
      asset.key !== blob.key ||
      asset.size !== blob.size ||
      asset.etag !== blob.etag ||
      asset.kind !== (audio ? "normalized_audio" : "evidence") ||
      (asset.expiresAt !== undefined && asset.expiresAt <= now)
    )
      return null;
    if (
      await ctx.db
        .query("objectDeletions")
        .withIndex("by_key", (q) => q.eq("key", asset.key))
        .unique()
    )
      return null;
  }
  return media;
}
