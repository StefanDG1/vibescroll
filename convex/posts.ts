import { v } from "convex/values";
import { query } from "./_generated/server";
import { access } from "./lib";
import { ensure } from "../packages/policy";
import { sourceRetained } from "./lib/sourceAuthority";
import { postDisplayTitle } from "../packages/sources/display";
import { postThumbnailCandidates } from "../packages/sources/thumbnail";
import { cloudSourceMetadata } from "./lib/cloudCatalog";
import { knowledgeReadContext } from "./lib/knowledgeReadContext";

const postMetadata = v.object({
  id: v.id("sources"),
  title: v.string(),
  authorName: v.union(v.string(), v.null()),
  kind: v.string(),
  state: v.string(),
  generation: v.number(),
  createdAt: v.number(),
  metadataUpdatedAt: v.number(),
  thumbnailAssetIds: v.array(v.string()),
});

export const recent = query({
  args: {
    organizationId: v.id("organizations"),
    cursor: v.optional(v.string()),
  },
  returns: v.object({
    items: v.array(postMetadata),
    next: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, { organizationId, cursor }) => {
    ctx = knowledgeReadContext(ctx);
    await access(ctx, organizationId);
    ensure(
      !cursor || cursor.length <= 4096,
      "INVALID_INPUT",
      "Invalid posts cursor.",
    );
    const result = await ctx.db
      .query("sources")
      .withIndex("by_org_created", (q) =>
        q.eq("organizationId", organizationId),
      )
      .order("desc")
      .paginate({
        numItems: 20,
        cursor: cursor ?? null,
        maximumBytesRead: 4 * 1024 * 1024,
      });
    // Filter this bounded page, never scan ahead to fill hidden/deleted rows.
    return {
      items: await Promise.all(
        result.page
          .filter(
            (source) =>
              source.state !== "deleted" &&
              sourceRetained(source.sourceRetentionUntil),
          )
          .map(async (source) => {
            const shared = source.publicImportId
              ? await cloudSourceMetadata(ctx, source)
              : null;
            const thumbnailAssetIds = postThumbnailCandidates(source);
            if (
              shared?.available &&
              "thumbnailReference" in shared &&
              shared.thumbnailReference
            )
              thumbnailAssetIds.push(shared.thumbnailReference);
            return {
              id: source._id,
              title: postDisplayTitle(source),
              authorName: source.linkPreview?.authorName ?? null,
              kind: source.kind,
              state:
                source.catalogWait && source.catalogWait.expiresAt > Date.now()
                  ? "waiting_for_shared_analysis"
                  : source.state,
              generation: source.generation,
              createdAt: source.createdAt,
              metadataUpdatedAt:
                source.linkPreview?.updatedAt ?? source.updatedAt,
              thumbnailAssetIds: [...new Set(thumbnailAssetIds)].slice(0, 3),
            };
          }),
      ),
      next: result.isDone ? null : result.continueCursor,
    };
  },
});
