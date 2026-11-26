import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { catalogConfiguration, currentCloudArtifact } from "./lib/cloudCatalog";
import { creatorProfileUrl } from "../packages/social/creator-identity";
import { PolicyError } from "../packages/policy";
import type { Id } from "./_generated/dataModel";
import { preparedMediaContentKey } from "../packages/social/prepared-post";
import { makeRepostSignature } from "../packages/social/repost-signature";
import { postAuthorProofValue } from "./creatorIdentitySchema";
import {
  validPostAuthorProof,
  postAuthorMatchesUrl,
} from "../packages/social/post-author-proof";
import { readPublicPostAuthor } from "../packages/social/post-author";
import { sourceRetained } from "./lib/sourceAuthority";
import { selectedAnalysis } from "./lib/analysisHistory";
import { enqueueCreatorMatching } from "./lib/creatorMatching";

export const indexFamily = internalMutation({
  args: {
    familyId: v.id("catalogFamilies"),
    identityProof: v.optional(postAuthorProofValue),
  },
  returns: v.boolean(),
  handler: async (ctx, { familyId, identityProof }) => {
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
    const proof = current
      ? validPostAuthorProof(
          identityProof ?? old?.identityProof,
          current.family.canonical,
        )
      : null;
    if (
      identityProof &&
      (!proof ||
        proof.observedAt > Date.now() + 5000 ||
        proof.observedAt < Date.now() - 40000)
    )
      throw Error("POST_AUTHOR_IDENTITY_CHANGED");
    const hasAuthor = !!(
      post?.authorId &&
      post.authorHandle &&
      /^[0-9]{1,30}$/.test(post.authorId)
    );
    if (!current || (!hasAuthor && !proof)) {
      if (old) await ctx.db.delete(old._id);
      if (current)
        await ctx.scheduler.runAfter(0, internal.creatorCatalog.repairFamily, {
          familyId,
        });
      return false;
    }
    const creatorKey = hasAuthor
        ? `${post!.version === "x-post-evidence-v1" ? "x" : post!.platform}:${post!.authorId}`
        : proof!.creatorKey,
      handle = hasAuthor ? post!.authorHandle! : proof!.handle;
    if (
      identityProof &&
      (proof!.creatorKey !== creatorKey ||
        proof!.handle.toLowerCase() !== handle.toLowerCase())
    )
      throw Error("POST_AUTHOR_IDENTITY_CHANGED");
    creatorProfileUrl(creatorKey, handle);
    const publishedAt = post && "publishedAt" in post ? post.publishedAt : null;
    const values = {
      creatorKey,
      handle,
      familyId,
      artifactId: current.artifact._id,
      canonical: current.family.canonical,
      title: current.artifact.postMetadata?.title ?? "Shared post",
      publishedAt,
      sortAt: publishedAt ?? Math.floor(current.family.createdAt),
      contentKey: post ? await preparedMediaContentKey(post) : "",
      signature: post ? await makeRepostSignature(post) : null,
      ...(proof ? { identityProof: proof } : {}),
      updatedAt: Date.now(),
    };
    if (old) await ctx.db.patch(old._id, values);
    else await ctx.db.insert("creatorCatalogPosts", values);
    if (proof)
      await ctx.scheduler.runAfter(
        0,
        internal.creatorCatalog.repairAssociations,
        { familyId, artifactId: current.artifact._id, cursor: null },
      );
    return true;
  },
});

export const metadataTarget = internalQuery({
  args: { familyId: v.id("catalogFamilies") },
  returns: v.union(v.null(), v.object({ canonical: v.string() })),
  handler: async (ctx, { familyId }) => {
    if (process.env.RESTORE_LOCK === "true") return null;
    const family = await ctx.db.get(familyId);
    if (!family?.selectedArtifactId) return null;
    try {
      const current = await currentCloudArtifact(
        ctx,
        family.selectedArtifactId,
      );
      const post = current.prepared.post;
      if (post?.authorId && post.authorHandle) return null;
      const old = await ctx.db
        .query("creatorCatalogPosts")
        .withIndex("by_family", (q) => q.eq("familyId", familyId))
        .unique();
      if (
        old?.artifactId === current.artifact._id &&
        validPostAuthorProof(old.identityProof, family.canonical)
      )
        return null;
      return { canonical: family.canonical };
    } catch (error) {
      if (error instanceof PolicyError) return null;
      throw error;
    }
  },
});

export const repairFamily = internalAction({
  args: { familyId: v.id("catalogFamilies") },
  returns: v.object({
    state: v.union(
      v.literal("indexed"),
      v.literal("skipped"),
      v.literal("unavailable"),
    ),
  }),
  handler: async (
    ctx,
    { familyId },
  ): Promise<{ state: "indexed" | "skipped" | "unavailable" }> => {
    const target = await ctx.runQuery(internal.creatorCatalog.metadataTarget, {
      familyId,
    });
    if (!target) return { state: "skipped" as const };
    let proof;
    try {
      proof = await readPublicPostAuthor(target.canonical);
    } catch {
      return { state: "unavailable" as const };
    }
    const indexed: boolean = await ctx.runMutation(
      internal.creatorCatalog.indexFamily,
      {
        familyId,
        identityProof: proof,
      },
    );
    return { state: indexed ? ("indexed" as const) : ("skipped" as const) };
  },
});

// Current selected-artifact associations only. Never scan another user's library.
export const repairAssociations = internalMutation({
  args: {
    familyId: v.id("catalogFamilies"),
    artifactId: v.id("publicArtifacts"),
    cursor: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, { familyId, artifactId, cursor }) => {
    if (process.env.RESTORE_LOCK === "true") return null;
    const family = await ctx.db.get(familyId),
      row = await ctx.db
        .query("creatorCatalogPosts")
        .withIndex("by_family", (q) => q.eq("familyId", familyId))
        .unique();
    if (
      !family ||
      family.selectedArtifactId !== artifactId ||
      row?.artifactId !== artifactId
    )
      return null;
    const proof = validPostAuthorProof(row.identityProof, family.canonical);
    if (
      !proof ||
      proof.creatorKey !== row.creatorKey ||
      proof.handle !== row.handle
    )
      return null;
    let current;
    try {
      current = await currentCloudArtifact(ctx, artifactId);
    } catch (error) {
      if (error instanceof PolicyError) return null;
      throw error;
    }
    const page = await ctx.db
      .query("publicImports")
      .withIndex("by_artifact", (q) => q.eq("artifactId", artifactId))
      .paginate({ cursor, numItems: 8, maximumBytesRead: 256000 });
    for (const layer of page.page) {
      if (
        !("origin" in layer) ||
        layer.origin !== "cloud" ||
        layer.familyId !== familyId ||
        layer.compatibilityKey !== family.key ||
        layer.notesVersionId !== current.version._id ||
        !postAuthorMatchesUrl(proof, layer.inputCanonical)
      )
        continue;
      const source = await ctx.db.get(layer.sourceId);
      if (
        !source ||
        source.publicImportId !== layer._id ||
        source.organizationId !== layer.organizationId ||
        source.generation !== layer.sourceGeneration ||
        source.state !== "ready" ||
        !source.rightsAttested ||
        !sourceRetained(source.sourceRetentionUntil) ||
        !postAuthorMatchesUrl(proof, source.url ?? source.canonical)
      )
        continue;
      const org = await ctx.db.get(source.organizationId);
      if (
        org?.status !== "active" ||
        (source.creator?.generation === source.generation &&
          source.creator.key !== proof.creatorKey)
      )
        continue;
      try {
        if (!(await selectedAnalysis(ctx, source))) continue;
      } catch (error) {
        if (error instanceof PolicyError) continue;
        throw error;
      }
      // A metadata repair must not invalidate analysis approvals or change results.
      await ctx.db.patch(source._id, {
        platformPostKey: proof.postKey,
        creator: {
          ...(source.creator?.generation === source.generation
            ? source.creator
            : {}),
          key: proof.creatorKey,
          handle: proof.handle,
          generation: source.generation,
        },
      });
      if (
        source.creator?.generation !== source.generation ||
        source.creator.key !== proof.creatorKey ||
        source.creator.handle !== proof.handle
      )
        await enqueueCreatorMatching(ctx, source._id);
    }
    if (!page.isDone)
      await ctx.scheduler.runAfter(
        0,
        internal.creatorCatalog.repairAssociations,
        { familyId, artifactId, cursor: page.continueCursor },
      );
    return null;
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
