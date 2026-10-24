import type { QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { ensure, containsSecret } from "../../packages/policy";
import { canonicalJson } from "../../packages/contracts/canonical-json.mjs";
import { digest } from "../product";
import { sourceRetained } from "./sourceAuthority";
import { currentOrderedSource } from "./orderedSource";

export type ProjectSourceImage = {
  id: string;
  key: string;
  size: number;
  etag?: string;
  sha256?: string;
  timestampMs?: number;
};
function descriptor(
  source: Doc<"sources">,
  asset: Doc<"assets">,
): ProjectSourceImage {
  const frame = source.personalMedia?.frames?.find(
    (item: { assetId?: string }) => item.assetId === asset._id,
  );
  return {
    id: asset._id,
    key: asset.key,
    size: asset.size,
    ...(asset.etag ? { etag: asset.etag } : {}),
    ...(frame?.sha256 ? { sha256: frame.sha256 } : {}),
    ...(Number.isSafeInteger(frame?.timestampMs)
      ? { timestampMs: frame.timestampMs }
      : {}),
  };
}
function imageCurrent(
  source: Doc<"sources">,
  asset: Doc<"assets">,
  now: number,
) {
  return (
    asset.sourceId === source._id &&
    asset.organizationId === source.organizationId &&
    asset.sourceGeneration === source.generation &&
    asset.kind === "evidence" &&
    asset.type === "image/jpeg" &&
    asset.state === "complete" &&
    (asset.expiresAt === undefined || asset.expiresAt > now) &&
    Number.isSafeInteger(asset.size) &&
    asset.size > 0 &&
    asset.size <= 1000000
  );
}
export async function currentProjectSourceImage(
  ctx: QueryCtx,
  source: Doc<"sources">,
  id: string,
) {
  const normalized = ctx.db.normalizeId("assets", id);
  const asset = normalized ? await ctx.db.get(normalized) : null;
  ensure(
    asset && imageCurrent(source, asset, Date.now()),
    "APPROVAL_STALE",
    "The approved image is unavailable or expired.",
  );
  const retired = await ctx.db
    .query("objectDeletions")
    .withIndex("by_key", (q) => q.eq("key", asset.key))
    .unique();
  ensure(!retired, "APPROVAL_STALE", "The approved image was retired.");
  return descriptor(source, asset);
}

// The caller must first authorize the exact source/project task. This helper
// never acquires a URL, revives expired media or expands a shared-content grant.
export async function buildProjectSourceContent(
  ctx: QueryCtx,
  source: Doc<"sources">,
) {
  ensure(
    source.state === "ready" && source.rightsAttested && sourceRetained(source),
    "APPROVAL_STALE",
    "The retained source content is unavailable or changed.",
  );
  const warnings: string[] = [];
  let transcript: string | null = source.text || null;
  let caption: string | null = source.acquisition?.description || null;
  if (source.publicImportId) {
    transcript = null;
    caption = null;
    warnings.push(
      "A saved catalog copy does not include the original transcript or media. Its import description is not a transcript.",
    );
  } else if (
    transcript &&
    !source.speechProvenance &&
    source.coverage !== "audio_only" &&
    source.coverage !== "full_sampled"
  ) {
    warnings.push(
      "Retained source text is supplied text or captions, not verified original speech.",
    );
  }
  if (source.orderedMedia && !source.publicImportId) {
    const ordered = await currentOrderedSource(source);
    transcript =
      (ordered.prepared.post.schemaVersion === "work-cloud-observed-media-v1"
        ? ordered.prepared.post.segments
        : ordered.prepared.evidence.filter(
            (item) => item.basis === "transcript",
          )
      )
        .map((item) => item.text)
        .join("\n") || null;
    if (ordered.prepared.post.schemaVersion !== "work-cloud-observed-media-v1")
      warnings.push(
        "Ordered-media transcript coverage follows the retained observations; missing speech has not been recreated.",
      );
    caption = ordered.prepared.post.caption || caption;
  }
  ensure(
    (!transcript || transcript.length <= 60000) &&
      (!caption || caption.length <= 10000) &&
      !containsSecret(JSON.stringify({ transcript, caption })),
    "PROVIDER_LIMIT",
    "Source content exceeds this evaluation's bound or contains credentials. Review it before evaluation.",
  );
  const rows = source.publicImportId
    ? []
    : await ctx.db
        .query("assets")
        .withIndex("by_org_source", (q) =>
          q
            .eq("organizationId", source.organizationId)
            .eq("sourceId", source._id),
        )
        .take(150);
  ensure(
    rows.length < 150,
    "PROVIDER_LIMIT",
    "Review this source's media before evaluation.",
  );
  const images: ProjectSourceImage[] = [];
  const versions: { id: string; etag: string | null }[] = [];
  let bytes = 0;
  const now = Date.now();
  for (const asset of rows.sort((a, b) => a._id.localeCompare(b._id))) {
    if (
      asset.organizationId !== source.organizationId ||
      asset.sourceGeneration !== source.generation ||
      asset.kind !== "evidence" ||
      asset.type !== "image/jpeg" ||
      asset.state !== "complete" ||
      (asset.expiresAt !== undefined && asset.expiresAt <= now)
    )
      continue;
    ensure(
      Number.isSafeInteger(asset.size) &&
        asset.size > 0 &&
        asset.size <= 1000000,
      "PROVIDER_LIMIT",
      "A retained image exceeds the project evaluation limit.",
    );
    const retired = await ctx.db
      .query("objectDeletions")
      .withIndex("by_key", (q) => q.eq("key", asset.key))
      .unique();
    if (retired) {
      warnings.push(
        "A retired image was excluded; it has not been restored or fetched again.",
      );
      continue;
    }
    bytes += asset.size;
    images.push(descriptor(source, asset));
    versions.push({ id: asset._id, etag: asset.etag ?? null });
  }
  ensure(
    images.length <= 48 && bytes <= 12000000,
    "PROVIDER_LIMIT",
    "The retained images exceed this evaluation's limit. Turn off full source content or review a smaller source.",
  );
  const expectedFrames = new Set<string>(
    (source.mediaEvidence ?? [])
      .filter((item: { kind: string }) => item.kind === "frame")
      .map((item: { id: string }) => item.id),
  );
  const omittedFrames = [...expectedFrames].filter(
    (id) => !images.some((image) => image.id === id),
  ).length;
  if (omittedFrames)
    warnings.push(
      `${omittedFrames} previously cited images are unavailable or expired and have not been fetched again.`,
    );
  if (!transcript)
    warnings.push(
      "No retained transcript is available. It has not been recreated.",
    );
  if (!images.length)
    warnings.push(
      "No retained image pixels are available. Visual observations and citations are not image pixels; the original media has not been fetched again.",
    );
  warnings.push(
    "Only retained sampled images are included; this does not mean every video frame was reviewed.",
  );
  const contentHash = await digest(
    canonicalJson({ transcript, caption, images, versions }),
  );
  return {
    binding: {
      sourceId: source._id,
      generation: source.generation,
      revision: source.updatedAt,
      contentHash,
    },
    transcript,
    caption,
    images,
    warnings,
  };
}
