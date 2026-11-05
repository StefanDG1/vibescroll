import type { QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { ensure, PolicyError } from "../../packages/policy";
import { requireFullCatalog } from "./fullCatalogAccess";
import {
  catalogConfiguration,
  currentCloudArtifactHeader,
  currentCloudArtifact,
} from "./cloudCatalog";

const reference = (
  organizationId: Id<"organizations">,
  familyId: Id<"catalogFamilies">,
  artifactId: Id<"publicArtifacts">,
  frameId: string,
) => `catalog-browse~${organizationId}~${familyId}~${artifactId}~${frameId}`;

async function selected(
  ctx: QueryCtx,
  familyId: Id<"catalogFamilies">,
  artifactId?: Id<"publicArtifacts">,
) {
  const family = await ctx.db.get(familyId),
    config = catalogConfiguration();
  ensure(
    config &&
      family?.organizationId === config.serviceOrganizationId &&
      family.state === "active" &&
      family.selectedArtifactId,
    "SOURCE_UNAVAILABLE",
    "This catalog post is unavailable.",
  );
  ensure(
    !artifactId || artifactId === family.selectedArtifactId,
    "SOURCE_UNAVAILABLE",
    "The selected catalog version changed.",
  );
  return family;
}

/** The website and MCP share selection, retention and entitlement checks. */
export async function catalogMetadataPage(
  ctx: QueryCtx,
  organizationId: Id<"organizations">,
  cursor?: string | null,
  pageSize: 10 | 20 = 20,
) {
  await requireFullCatalog(ctx, organizationId);
  const config = catalogConfiguration();
  ensure(config, "SOURCE_UNAVAILABLE", "The shared catalog is unavailable.");
  ensure(
    !cursor || cursor.length <= 4096,
    "INVALID_INPUT",
    "Invalid catalog cursor.",
  );
  const page = await ctx.db
    .query("catalogFamilies")
    .withIndex("by_org", (q) =>
      q.eq(
        "organizationId",
        config.serviceOrganizationId as Id<"organizations">,
      ),
    )
    .order("desc")
    .paginate({
      numItems: pageSize,
      cursor: cursor ?? null,
      maximumBytesRead: 4 * 1024 * 1024,
    });
  const items = [];
  // Filter this physical page only. Never scan ahead past omitted candidates.
  for (const family of page.page) {
    if (family.state !== "active" || !family.selectedArtifactId) continue;
    try {
      const { artifact, family: artifactFamily } =
        await currentCloudArtifactHeader(ctx, family.selectedArtifactId);
      ensure(
        artifactFamily._id === family._id,
        "SOURCE_UNAVAILABLE",
        "The selected catalog version changed.",
      );
      items.push({
        familyId: family._id,
        artifactId: artifact._id,
        versionId: artifact.versionId,
        canonical: family.canonical,
        title: artifact.postMetadata?.title ?? "Shared video",
        authorName: artifact.postMetadata?.authorName ?? null,
        durationSeconds: artifact.postMetadata?.durationSeconds ?? null,
        insightCount: artifact.insightCount,
        updatedAt: artifact.updatedAt,
        thumbnailReference: artifact.postMetadata?.thumbnailFrameId
          ? reference(
              organizationId,
              family._id,
              artifact._id,
              artifact.postMetadata.thumbnailFrameId,
            )
          : null,
      });
    } catch (error) {
      if (
        !(error instanceof PolicyError) ||
        !["SOURCE_UNAVAILABLE", "POLICY_BLOCKED"].includes(error.code)
      )
        throw error;
    }
  }
  return { items, next: page.isDone ? null : page.continueCursor };
}

export async function catalogPostDetail(
  ctx: QueryCtx,
  organizationId: Id<"organizations">,
  familyId: Id<"catalogFamilies">,
  artifactId?: Id<"publicArtifacts">,
) {
  await requireFullCatalog(ctx, organizationId);
  const family = await selected(ctx, familyId, artifactId),
    shared = await currentCloudArtifact(ctx, family.selectedArtifactId!);
  ensure(
    shared.family._id === familyId,
    "SOURCE_UNAVAILABLE",
    "The selected catalog version changed.",
  );
  // No personal association, import, credit hold or job is created by a read.
  return {
    familyId,
    artifactId: shared.artifact._id,
    versionId: shared.version._id,
    canonical: family.canonical,
    title: shared.artifact.postMetadata?.title ?? "Shared video",
    authorName: shared.artifact.postMetadata?.authorName ?? null,
    analysis: shared.output,
    transcript: shared.prepared.segments,
    provenance: shared.version.provenance,
    frames: shared.prepared.frames.map((frame) => ({
      id: frame.id,
      timestampMs: frame.timestampMs,
      width: frame.width,
      height: frame.height,
      reference: reference(
        organizationId,
        familyId,
        shared.artifact._id,
        frame.id,
      ),
    })),
  };
}

/** Private byte locator. Only the server-side byte handler may consume it. */
export async function catalogFrameLocation(
  ctx: QueryCtx,
  args: {
    organizationId: Id<"organizations">;
    familyId: Id<"catalogFamilies">;
    artifactId: Id<"publicArtifacts">;
    frameId: string;
  },
) {
  await requireFullCatalog(ctx, args.organizationId);
  await selected(ctx, args.familyId, args.artifactId);
  const shared = await currentCloudArtifact(ctx, args.artifactId);
  ensure(
    shared.family._id === args.familyId,
    "SOURCE_UNAVAILABLE",
    "The selected catalog version changed.",
  );
  const frame = shared.evidence.frames.find((f) => f.frameId === args.frameId);
  ensure(frame, "SOURCE_UNAVAILABLE", "This screenshot is unavailable.");
  return {
    key: frame.key,
    size: frame.size,
    sha256: frame.sha256,
    width: frame.width,
    height: frame.height,
  };
}
