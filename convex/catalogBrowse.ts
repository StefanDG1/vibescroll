import { v } from "convex/values";
import { query } from "./_generated/server";
import { mutation } from "./lib/projectedMutations";
import { knowledgeReadContext } from "./lib/knowledgeReadContext";
import {
  catalogMetadataPage,
  catalogPostDetail,
  catalogFrameLocation,
} from "./lib/catalogBrowse";

const scope = { organizationId: v.id("organizations") };

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
  handler: async (ctx, { organizationId, cursor }) =>
    catalogMetadataPage(knowledgeReadContext(ctx), organizationId, cursor),
});

export const detail = mutation({
  args: { ...scope, familyId: v.id("catalogFamilies") },
  returns: v.any(),
  handler: async (mutationCtx, { organizationId, familyId }) =>
    catalogPostDetail(
      knowledgeReadContext(mutationCtx),
      organizationId,
      familyId,
    ),
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
  handler: async (mutationCtx, args) =>
    catalogFrameLocation(knowledgeReadContext(mutationCtx), args),
});
