import { v } from "convex/values";
import { query, type QueryCtx } from "./_generated/server";
import { mutation } from "./lib/projectedMutations";
import type { Id } from "./_generated/dataModel";
import { ensure, PolicyError } from "../packages/policy";
import { requireFullCatalog } from "./lib/fullCatalogAccess";
import {
  catalogConfiguration,
  currentCloudArtifactHeader,
  currentCloudArtifact,
} from "./lib/cloudCatalog";
import { knowledgeReadContext } from "./lib/knowledgeReadContext";

const scope = { organizationId: v.id("organizations") };
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

const metadata = v.object({
  familyId: v.id("catalogFamilies"),
  artifactId: v.id("publicArtifacts"),
  versionId: v.id("analysisVersions"),
  canonical: v.string(),
  title: v.string(),
  authorName: v.union(v.string(), v.null()),
  durationSeconds: v.union(v.number(), v.null()),
  insightCount: v.number(),
  updatedAt: v.number(),
  thumbnailReference: v.union(v.string(), v.null()),
});

export const list = query({
  args: { ...scope, cursor: v.optional(v.string()) },
  returns: v.object({
    items: v.array(metadata),
    next: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, { organizationId, cursor }) => {
    ctx = knowledgeReadContext(ctx);
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
        numItems: 20,
        cursor: cursor ?? null,
        maximumBytesRead: 4 * 1024 * 1024,
      });
    const items = [];
    // Skip unavailable records only within this page, never scan ahead to fill it.
    for (const family of page.page) {
      if (family.state !== "active" || !family.selectedArtifactId) continue;
      try {
        const { artifact } = await currentCloudArtifactHeader(
          ctx,
          family.selectedArtifactId,
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
  },
});

export const detail = mutation({
  args: { ...scope, familyId: v.id("catalogFamilies") },
  returns: v.any(),
  handler: async (mutationCtx, { organizationId, familyId }) => {
    const ctx = knowledgeReadContext(mutationCtx);
    await requireFullCatalog(ctx, organizationId);
    const family = await selected(ctx, familyId),
      shared = await currentCloudArtifact(ctx, family.selectedArtifactId!);
    // Browsing never creates a personal source, import, credit hold or job.
    return {
      familyId,
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
  },
});

// Byte disclosure rechecks server time and current grants without a query cache.
export const frame = mutation({
  args: {
    ...scope,
    familyId: v.id("catalogFamilies"),
    artifactId: v.id("publicArtifacts"),
    frameId: v.string(),
  },
  returns: v.object({
    key: v.string(),
    size: v.number(),
    sha256: v.string(),
    width: v.number(),
    height: v.number(),
  }),
  handler: async (mutationCtx, args) => {
    const ctx = knowledgeReadContext(mutationCtx);
    await requireFullCatalog(ctx, args.organizationId);
    await selected(ctx, args.familyId, args.artifactId);
    const shared = await currentCloudArtifact(ctx, args.artifactId);
    const frame = shared.evidence.frames.find(
      (f) => f.frameId === args.frameId,
    );
    ensure(frame, "SOURCE_UNAVAILABLE", "This screenshot is unavailable.");
    return {
      key: frame.key,
      size: frame.size,
      sha256: frame.sha256,
      width: frame.width,
      height: frame.height,
    };
  },
});
