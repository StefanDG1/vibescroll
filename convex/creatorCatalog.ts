import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { catalogConfiguration, currentCloudArtifact } from "./lib/cloudCatalog";
import { creatorProfileUrl } from "../packages/social/creator-identity";
import { PolicyError } from "../packages/policy";
import type { Id } from "./_generated/dataModel";
import { preparedMediaContentKey } from "../packages/social/prepared-post";
import { makeRepostSignature } from "../packages/social/repost-signature";

export const indexFamily = internalMutation({
  args: { familyId: v.id("catalogFamilies") },
  returns: v.boolean(),
  handler: async (ctx, { familyId }) => {
    if (process.env.RESTORE_LOCK === "true") return false;
    const family = await ctx.db.get(familyId),
      old = await ctx.db
        .query("creatorCatalogPosts")
        .withIndex("by_family", (q) => q.eq("familyId", familyId))
        .unique();
    let current;
    try {
      if (family?.selectedArtifactId)
        current = await currentCloudArtifact(ctx, family.selectedArtifactId);
    } catch (error) {
      if (!(error instanceof PolicyError)) throw error;
    }
    const post = current?.prepared.post;
    if (
      !current ||
      !post?.authorId ||
      !post.authorHandle ||
      !/^[0-9]{1,30}$/.test(post.authorId)
    ) {
      if (old) await ctx.db.delete(old._id);
      return false;
    }
    const platform =
        post.version === "x-post-evidence-v1" ? "x" : post.platform,
      creatorKey = `${platform}:${post.authorId}`;
    creatorProfileUrl(creatorKey, post.authorHandle);
    const publishedAt = "publishedAt" in post ? post.publishedAt : null;
    const values = {
      creatorKey,
      handle: post.authorHandle,
      familyId,
      artifactId: current.artifact._id,
      canonical: current.family.canonical,
      title: current.artifact.postMetadata?.title ?? "Shared post",
      publishedAt,
      sortAt: publishedAt ?? Math.floor(current.family.createdAt),
      contentKey: await preparedMediaContentKey(post),
      signature: await makeRepostSignature(post),
      updatedAt: Date.now(),
    };
    if (old) await ctx.db.patch(old._id, values);
    else await ctx.db.insert("creatorCatalogPosts", values);
    return true;
  },
});

// A bounded metadata migration. It does not touch private sources, pixels or model jobs.
export const backfill = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.object({
    done: v.boolean(),
    next: v.union(v.string(), v.null()),
    visited: v.number(),
  }),
  handler: async (ctx, { cursor }) => {
    const config = catalogConfiguration();
    if (process.env.RESTORE_LOCK === "true" || !config)
      return { done: true, next: null, visited: 0 };
    const page = await ctx.db
      .query("catalogFamilies")
      .withIndex("by_org", (q) =>
        q.eq(
          "organizationId",
          config.serviceOrganizationId as Id<"organizations">,
        ),
      )
      .paginate({ numItems: 8, cursor, maximumBytesRead: 1024 * 1024 });
    for (const family of page.page)
      if (family.selectedArtifactId && family.state === "active")
        await ctx.scheduler.runAfter(0, internal.creatorCatalog.indexFamily, {
          familyId: family._id,
        });
    return {
      done: page.isDone,
      next: page.isDone ? null : page.continueCursor,
      visited: page.page.length,
    };
  },
});
