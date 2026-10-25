import { storageUsage, insertAsset } from "./lib/storageUsage";
import { internalMutation } from "./lib/projectedMutations";
import { v } from "convex/values";
import { syncCategories } from "./categories";
import { wallet } from "./product";
import { queueDeletion } from "./assets";
import { containsSecret, ensure } from "../packages/policy";
import { sourceRetained } from "./lib/sourceAuthority";
export const begin = internalMutation({
  args: { id: v.id("sources") },
  handler: async (ctx, { id }) => {
    const s = await ctx.db.get(id);
    if (
      !s ||
      s.state === "deleted" ||
      !s.url ||
      !s.rightsAttested ||
      !sourceRetained(s.sourceRetentionUntil) ||
      s.linkPreview?.state !== "queued" ||
      process.env.LINK_PREVIEWS_ENABLED !== "true" ||
      process.env.RESTORE_LOCK === "true" ||
      process.env.DISABLE_CAPTURE === "true"
    )
      return null;
    const org = await ctx.db.get(s.organizationId);
    if (org?.status !== "active") return null;
    await ctx.db.patch(id, {
      linkPreview: {
        ...s.linkPreview,
        state: "loading",
        updatedAt: Date.now(),
      },
    });
    return {
      id: s._id,
      url: s.url,
      canonical: s.canonical,
      generation: s.generation,
      organizationId: s.organizationId,
    };
  },
});
export const finish = internalMutation({
  args: {
    id: v.id("sources"),
    canonical: v.string(),
    generation: v.optional(v.number()),
    key: v.optional(v.string()),
    size: v.optional(v.number()),
    etag: v.optional(v.string()),
    title: v.optional(v.string()),
    publishedAt: v.optional(v.number()),
    authorName: v.optional(v.string()),
    durationSeconds: v.optional(v.number()),
  },
  handler: async (ctx, a) => {
    const s = await ctx.db.get(a.id);
    if (!s) return false;
    if (a.key)
      ensure(
        a.key.startsWith(`${s.organizationId}/`) &&
          a.key.split("/").length === 2 &&
          a.key.split("/")[1] !== ".." &&
          /^[A-Za-z0-9._-]{1,120}$/.test(a.key.split("/")[1]),
        "INVALID_INPUT",
        "Preview object scope changed.",
      );
    const org = s ? await ctx.db.get(s.organizationId) : null;
    const valid =
      s.state !== "deleted" &&
      sourceRetained(s.sourceRetentionUntil) &&
      s.canonical === a.canonical &&
      (a.generation === undefined || s.generation === a.generation) &&
      s.linkPreview?.state === "loading" &&
      org?.status === "active" &&
      process.env.RESTORE_LOCK !== "true";
    if (!valid) {
      if (a.key) await queueDeletion(ctx, a.key);
      return false;
    }
    const candidate = {
      ...(a.title && !containsSecret(a.title)
        ? { title: a.title.slice(0, 160) }
        : {}),
      ...(a.authorName && !containsSecret(a.authorName)
        ? { authorName: a.authorName.slice(0, 160) }
        : {}),
      ...(a.durationSeconds &&
      Number.isFinite(a.durationSeconds) &&
      a.durationSeconds > 0 &&
      a.durationSeconds <= 600
        ? { durationSeconds: a.durationSeconds }
        : {}),
    };
    const metadata =
      s.linkPreview?.origin === "extractor"
        ? {
            ...candidate,
            ...Object.fromEntries(
              Object.entries({
                title: s.linkPreview.title,
                authorName: s.linkPreview.authorName,
                durationSeconds: s.linkPreview.durationSeconds,
              }).filter(([, value]) => value !== undefined),
            ),
            origin: "extractor" as const,
          }
        : { ...candidate, origin: "page" as const };
    const hasMetadata = Boolean(
      metadata.title || metadata.authorName || metadata.durationSeconds,
    );
    const textUpdate = {
      ...(metadata.title &&
      s.title === "Imported video link" &&
      !["queued", "running", "recovering"].includes(
        s.personalAnalysis?.state ?? "",
      )
        ? {
            title: metadata.title,
            searchable: [metadata.title, ...s.tags].join(" "),
          }
        : {}),
      ...(a.publishedAt &&
      Number.isSafeInteger(a.publishedAt) &&
      a.publishedAt > 0 &&
      a.publishedAt <= Date.now() + 86400000
        ? { publishedAt: a.publishedAt }
        : {}),
    };
    if (
      !a.key ||
      !a.size ||
      !Number.isSafeInteger(a.size) ||
      a.size <= 0 ||
      a.size > 1000000 ||
      !a.key.startsWith(`${s.organizationId}/`) ||
      a.key.split("/").length !== 2
    ) {
      if (a.key) await queueDeletion(ctx, a.key);
      await ctx.db.patch(s._id, {
        linkPreview: {
          ...metadata,
          state: hasMetadata ? "ready" : "unavailable",
          updatedAt: Date.now(),
        },
        ...textUpdate,
      });
      return false;
    }
    const tombstone = await ctx.db
      .query("objectDeletions")
      .withIndex("by_key", (q) => q.eq("key", a.key!))
      .unique();
    const entitlement = await wallet(ctx, s.organizationId);
    const bytes = (await storageUsage(ctx, s.organizationId)).bytes;
    if (
      tombstone ||
      bytes + a.size > (entitlement.tier === "pro" ? 5 : 1) * 1000000000
    ) {
      await queueDeletion(ctx, a.key);
      await ctx.db.patch(s._id, {
        linkPreview: {
          ...metadata,
          state: hasMetadata ? "ready" : "unavailable",
          updatedAt: Date.now(),
        },
        ...textUpdate,
      });
      return false;
    }
    const assetId = await insertAsset(ctx, {
      organizationId: s.organizationId,
      sourceId: s._id,
      sourceGeneration: s.generation,
      key: a.key,
      size: a.size,
      type: "image/jpeg",
      kind: "thumbnail",
      state: "complete",
      etag: a.etag,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await ctx.db.patch(s._id, {
      linkPreview: {
        ...metadata,
        state: "ready",
        assetId,
        updatedAt: Date.now(),
      },
      ...(a.publishedAt &&
      Number.isSafeInteger(a.publishedAt) &&
      a.publishedAt > 0 &&
      a.publishedAt <= Date.now() + 86400000
        ? { publishedAt: a.publishedAt }
        : {}),
      ...(a.title &&
      !containsSecret(a.title) &&
      s.title === "Imported video link"
        ? { title: a.title, searchable: [a.title, ...s.tags].join(" ") }
        : {}),
      updatedAt: Date.now(),
    });
    await syncCategories(ctx, (await ctx.db.get(a.id))!);
    return true;
  },
});
