import { storageUsage, insertAsset, deleteAsset } from "./lib/storageUsage";
import { query } from "./_generated/server";
import { mutation, internalMutation } from "./lib/projectedMutations";
import { v } from "convex/values";
import { sourceRetained } from "./lib/sourceAuthority";
import { access, limit, fail, writeAccess } from "./lib";
import { ensure } from "../packages/policy";
import { internal } from "./_generated/api";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { cloudFrameAssetCurrent } from "../packages/media/cloud-frames";
import { wallet } from "./product";
import { hostedSourceAllowed } from "./lib/hostedMediaAccess";
export async function queueDeletion(ctx: MutationCtx, key: string) {
  await dispatchDeletion(ctx, key, false);
}
async function dispatchDeletion(
  ctx: MutationCtx,
  key: string,
  recheck: boolean,
) {
  const old = await ctx.db
    .query("objectDeletions")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  if (recheck && !old) return;
  recheck ||= old?.state === "deferred_recheck";
  const attempts = old?.attempts ?? 0;
  if (
    !Number.isSafeInteger(attempts) ||
    attempts < 0 ||
    attempts >= (recheck ? 5 : 3) ||
    (!recheck && (old?.state === "deleted" || old?.state === "failed"))
  ) {
    if (old && !["deleted", "failed"].includes(old.state))
      await ctx.db.patch(old._id, {
        state: "failed",
        updatedAt: Math.max(Date.now(), old.updatedAt + 1),
      });
    return;
  }
  const scheduleRechecks = old?.rechecksScheduledAt === undefined;
  const locked = process.env.RESTORE_LOCK === "true";
  const nextAttempts = attempts + Number(!locked);
  const updatedAt = Math.max(Date.now(), (old?.updatedAt ?? 0) + 1);
  const update = {
    // Exhausted normal retries leave the pending scan even while a final
    // reserved attempt is running. Only its physical deletion receipt clears it.
    state: locked
      ? recheck
        ? "deferred_recheck"
        : "deferred"
      : nextAttempts >= 3
        ? "failed"
        : "pending",
    attempts: nextAttempts,
    updatedAt,
    ...(scheduleRechecks ? { rechecksScheduledAt: Date.now() } : {}),
  };
  if (old) await ctx.db.patch(old._id, update);
  else
    await ctx.db.insert("objectDeletions", {
      key,
      createdAt: Date.now(),
      ...update,
    });
  // A previously issued PUT can finish after an immediate deletion. Retired
  // keys cannot be reused, and delayed checks close that bounded upload race.
  if (scheduleRechecks)
    for (const delay of [20 * 60000, 86400000])
      await ctx.scheduler.runAfter(delay, internal.assets.recheckDeletion, {
        key,
      });
  if (!locked)
    await ctx.scheduler.runAfter(0, internal.integrations.deleteObject, {
      key,
      attempt: nextAttempts,
      reservedAt: updatedAt,
      recheck,
    });
}
// A lock race still consumes its scheduled action budget. Preserve resumable
// intent only within that finite budget; a stale callback cannot replace it.
export const deferDeletion = internalMutation({
  args: {
    key: v.string(),
    attempt: v.optional(v.number()),
    reservedAt: v.optional(v.number()),
    recheck: v.optional(v.boolean()),
  },
  handler: async (ctx, a) => {
    const old = await ctx.db
      .query("objectDeletions")
      .withIndex("by_key", (q) => q.eq("key", a.key))
      .unique();
    if (
      !old ||
      a.attempt !== old.attempts ||
      a.reservedAt !== old.updatedAt ||
      !Number.isSafeInteger(a.attempt) ||
      a.attempt! < 1
    )
      return;
    const recheck = a.recheck || old.state === "deferred_recheck";
    await ctx.db.patch(old._id, {
      state:
        old.attempts >= (recheck ? 5 : 3)
          ? "failed"
          : recheck
            ? "deferred_recheck"
            : "deferred",
      updatedAt: Math.max(Date.now(), old.updatedAt + 1),
    });
  },
});
export const recheckDeletion = internalMutation({
  args: { key: v.string() },
  handler: (ctx, { key }) => dispatchDeletion(ctx, key, true),
});
export const grant = mutation({
  args: {
    organizationId: v.id("organizations"),
    key: v.string(),
    size: v.number(),
    type: v.string(),
  },
  handler: async (ctx, a) => {
    const u = await writeAccess(ctx, a.organizationId);
    await limit(ctx, `upload:${u.actor._id}`, 10);
    const entitlement = await wallet(ctx, a.organizationId);
    const retainedBytes = (await storageUsage(ctx, a.organizationId)).bytes;
    ensure(
      Number.isSafeInteger(a.size) &&
        retainedBytes + a.size <=
          (entitlement.tier === "pro" ? 5 : 1) * 1000000000,
      "STORAGE_LIMIT",
      "Your retained storage allowance is full. Delete sources or wait for temporary uploads to expire.",
    );
    ensure(
      a.size > 0 &&
        a.size <= 250000000 &&
        ["video/mp4", "video/webm", "audio/mpeg", "audio/wav"].includes(a.type),
      "UNSUPPORTED_UPLOAD",
      "Use permitted video or audio within 250 MB.",
    );
    ensure(
      a.key.startsWith(`${a.organizationId}/`) && a.key.split("/").length === 2,
      "INVALID_INPUT",
      "Invalid object key.",
    );
    ensure(
      !(await ctx.db
        .query("objectDeletions")
        .withIndex("by_key", (q) => q.eq("key", a.key))
        .unique()),
      "UPLOAD_INVALID",
      "Retired upload keys cannot be reused.",
    );
    ensure(
      !(await ctx.db
        .query("assets")
        .withIndex("by_key", (q) => q.eq("key", a.key))
        .unique()),
      "UPLOAD_INVALID",
      "Upload keys cannot be reused.",
    );
    const id = await insertAsset(ctx, {
      ...a,
      state: "pending",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      expiresAt: Date.now() + 86400000,
    });
    await ctx.scheduler.runAfter(86400000, internal.assets.expireAsset, { id });
    return id;
  },
});
// One bounded submission consumes one request from the existing upload limit.
// All rows and their storage reservation commit together, or none do.
export const grantBatch = mutation({
  args: {
    organizationId: v.id("organizations"),
    files: v.array(
      v.object({ key: v.string(), size: v.number(), type: v.string() }),
    ),
  },
  handler: async (ctx, a) => {
    const u = await writeAccess(ctx, a.organizationId);
    ensure(
      process.env.DISABLE_CAPTURE !== "true",
      "CAPTURE_DISABLED",
      "Capture is paused.",
    );
    ensure(
      a.files.length >= 1 &&
        a.files.length <= 35 &&
        new Set(a.files.map((file) => file.key)).size === a.files.length,
      "INVALID_INPUT",
      "Choose between 1 and 35 distinct files.",
    );
    const total = a.files.reduce((sum, file) => sum + file.size, 0);
    ensure(
      Number.isSafeInteger(total) &&
        total > 0 &&
        total <= 250_000_000 &&
        a.files.every(
          (file) =>
            Number.isSafeInteger(file.size) &&
            file.size > 0 &&
            [
              "image/jpeg",
              "image/png",
              "image/webp",
              "video/mp4",
              "video/webm",
            ].includes(file.type) &&
            file.key.startsWith(`${a.organizationId}/`) &&
            file.key.length <= 1024 &&
            file.key.split("/").length === 2 &&
            /^[a-zA-Z0-9_-]+$/.test(file.key.split("/")[1]),
        ),
      "UNSUPPORTED_UPLOAD",
      "Use JPEG, PNG, WebP, MP4 or WebM files within 250 MB together.",
    );
    await limit(ctx, `upload:${u.actor._id}`, 10);
    const entitlement = await wallet(ctx, a.organizationId);
    const retainedBytes = (await storageUsage(ctx, a.organizationId)).bytes;
    ensure(
      retainedBytes + total <=
        (entitlement.tier === "pro" ? 5 : 1) * 1_000_000_000,
      "STORAGE_LIMIT",
      "Your retained storage allowance is full. Delete sources or wait for temporary uploads to expire.",
    );
    for (const file of a.files) {
      ensure(
        !(await ctx.db
          .query("objectDeletions")
          .withIndex("by_key", (q) => q.eq("key", file.key))
          .unique()) &&
          !(await ctx.db
            .query("assets")
            .withIndex("by_key", (q) => q.eq("key", file.key))
            .unique()),
        "UPLOAD_INVALID",
        "Upload keys cannot be reused.",
      );
    }
    const now = Date.now();
    for (const file of a.files) {
      const id = await insertAsset(ctx, {
        ...file,
        organizationId: a.organizationId,
        state: "pending",
        createdAt: now,
        updatedAt: now,
        expiresAt: now + 86400000,
      });
      await ctx.scheduler.runAfter(86400000, internal.assets.expireAsset, {
        id,
      });
    }
    return { count: a.files.length };
  },
});
export const complete = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    key: v.string(),
    size: v.number(),
    type: v.string(),
    etag: v.string(),
  },
  handler: async (ctx, a) => {
    const asset = await ctx.db
      .query("assets")
      .withIndex("by_key", (q) => q.eq("key", a.key))
      .unique();
    ensure(
      asset &&
        asset.organizationId === a.organizationId &&
        asset.expiresAt !== undefined &&
        asset.expiresAt > Date.now() &&
        asset.size === a.size &&
        asset.type === a.type,
      "UPLOAD_INVALID",
      "Upload metadata does not match the grant.",
    );
    await ctx.db.patch(asset._id, {
      state: "complete",
      etag: a.etag,
      updatedAt: Date.now(),
    });
  },
});
export const deleteReceipt = internalMutation({
  args: {
    key: v.string(),
    attempt: v.optional(v.number()),
    reservedAt: v.optional(v.number()),
    recheck: v.optional(v.boolean()),
  },
  handler: async (ctx, a) => {
    const asset = await ctx.db
      .query("assets")
      .withIndex("by_key", (q) => q.eq("key", a.key))
      .unique();
    if (asset) await deleteAsset(ctx, asset);
    const job = await ctx.db
      .query("objectDeletions")
      .withIndex("by_key", (q) => q.eq("key", a.key))
      .unique();
    if (job && a.attempt === job.attempts && a.reservedAt === job.updatedAt)
      await ctx.db.patch(job._id, {
        state: "deleted",
        updatedAt: Math.max(Date.now(), job.updatedAt + 1),
      });
    if (
      !(await ctx.db
        .query("webhookReceipts")
        .withIndex("by_key", (q) =>
          q.eq("provider", "object_deletion").eq("key", a.key),
        )
        .unique())
    )
      await ctx.db.insert("webhookReceipts", {
        provider: "object_deletion",
        key: a.key,
        at: Date.now(),
        state: "deleted",
      });
  },
});
export const evidence = query({
  args: { id: v.id("assets") },
  handler: async (ctx, a) => {
    const asset = await ctx.db.get(a.id);
    if (
      !asset ||
      asset.state !== "complete" ||
      (asset.expiresAt !== undefined && asset.expiresAt < Date.now())
    )
      fail("Evidence unavailable.");
    await access(ctx, asset.organizationId);
    if (asset.sourceId) {
      const source = await ctx.db.get(asset.sourceId);
      if (
        !source ||
        source.organizationId !== asset.organizationId ||
        !sourceRetained(source) ||
        source.state === "deleted" ||
        (asset.kind === "work_cloud_frame" &&
          !cloudFrameAssetCurrent(source, asset))
      )
        fail("Evidence unavailable.");
    }
    return { key: asset.key, type: asset.type };
  },
});

export const registerEvidence = internalMutation({
  args: {
    sourceId: v.id("sources"),
    generation: v.number(),
    key: v.string(),
    size: v.number(),
    etag: v.string(),
  },
  handler: (ctx, a) => registerEvidenceAsset(ctx, a),
});
export async function registerEvidenceAsset(
  ctx: MutationCtx,
  a: {
    sourceId: Id<"sources">;
    generation: number;
    key: string;
    size: number;
    etag: string;
  },
  options?: { kind: "work_cloud_frame"; expiresAt: number },
) {
  const source = await ctx.db.get(a.sourceId);
  if (
    !source ||
    source.state === "deleted" ||
    source.generation !== a.generation ||
    !sourceRetained(source) ||
    (source.managedAnalysisActor && !(await hostedSourceAllowed(ctx, source)))
  ) {
    await queueDeletion(ctx, a.key);
    return null;
  }
  ensure(
    a.key.startsWith(`${source.organizationId}/`) &&
      a.size > 0 &&
      a.size <= 1000000,
    "INVALID_EVIDENCE",
    "Invalid bounded frame object.",
  );
  if (
    await ctx.db
      .query("objectDeletions")
      .withIndex("by_key", (q) => q.eq("key", a.key))
      .unique()
  ) {
    await queueDeletion(ctx, a.key);
    return null;
  }
  const existing = await ctx.db
    .query("assets")
    .withIndex("by_key", (q) => q.eq("key", a.key))
    .unique();
  if (existing) {
    ensure(
      existing.sourceId === source._id &&
        existing.size === a.size &&
        existing.etag === a.etag &&
        existing.state === "complete",
      "INVALID_EVIDENCE",
      "Evidence key is already bound to different bytes.",
    );
    return existing._id;
  }
  const entitlement = await wallet(ctx, source.organizationId);
  const bytes = (await storageUsage(ctx, source.organizationId)).bytes;
  if (bytes + a.size > (entitlement.tier === "pro" ? 5 : 1) * 1000000000) {
    await queueDeletion(ctx, a.key);
    return null;
  }
  return insertAsset(ctx, {
    organizationId: source.organizationId,
    sourceId: source._id,
    sourceGeneration: source.generation,
    key: a.key,
    size: a.size,
    etag: a.etag,
    type: "image/jpeg",
    state: "complete",
    kind: options?.kind ?? "evidence",
    ...(options ? { expiresAt: options.expiresAt } : {}),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
}
export const registerNormalized = internalMutation({
  args: {
    sourceId: v.id("sources"),
    generation: v.number(),
    key: v.string(),
    size: v.number(),
    etag: v.string(),
  },
  handler: async (ctx, a) => {
    const source = await ctx.db.get(a.sourceId);
    if (
      !source ||
      source.state === "deleted" ||
      source.generation !== a.generation ||
      !sourceRetained(source)
    ) {
      await queueDeletion(ctx, a.key);
      return null;
    }
    ensure(
      a.key.startsWith(`${source.organizationId}/`) &&
        a.key.split("/").length === 2 &&
        a.size >= 44 &&
        a.size <= 19500000,
      "INVALID_EVIDENCE",
      "Invalid normalized audio.",
    );
    if (
      await ctx.db
        .query("objectDeletions")
        .withIndex("by_key", (q) => q.eq("key", a.key))
        .unique()
    ) {
      await queueDeletion(ctx, a.key);
      return null;
    }
    const existing = await ctx.db
      .query("assets")
      .withIndex("by_key", (q) => q.eq("key", a.key))
      .unique();
    if (existing) {
      ensure(
        existing.sourceId === source._id &&
          existing.size === a.size &&
          existing.etag === a.etag &&
          existing.state === "complete",
        "INVALID_EVIDENCE",
        "Evidence key is already bound to different bytes.",
      );
      return existing._id;
    }
    const entitlement = await wallet(ctx, source.organizationId);
    const bytes = (await storageUsage(ctx, source.organizationId)).bytes;
    if (bytes + a.size > (entitlement.tier === "pro" ? 5 : 1) * 1000000000) {
      await queueDeletion(ctx, a.key);
      return null;
    }
    const id = await insertAsset(ctx, {
      organizationId: source.organizationId,
      sourceId: source._id,
      sourceGeneration: source.generation,
      key: a.key,
      size: a.size,
      etag: a.etag,
      type: "audio/wav",
      kind: "normalized_audio",
      state: "complete",
      expiresAt: Date.now() + 3600000,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(3600000, internal.assets.expireAsset, { id });
    return id;
  },
});
export const queueEvidenceDeletion = internalMutation({
  args: { key: v.string() },
  handler: (ctx, a) => queueDeletion(ctx, a.key),
});
export const expireOriginal = internalMutation({
  args: { sourceId: v.id("sources"), generation: v.number() },
  handler: async (ctx, a) => {
    const source = await ctx.db.get(a.sourceId);
    if (
      !source ||
      source.state !== "ready" ||
      source.generation !== a.generation ||
      !source.objectKey
    )
      return;
    const asset = await ctx.db
      .query("assets")
      .withIndex("by_key", (q) => q.eq("key", source.objectKey!))
      .unique();
    if (asset) {
      await ctx.db.patch(asset._id, {
        expiresAt: Date.now() + 86400000,
        updatedAt: Date.now(),
      });
      await ctx.scheduler.runAfter(86400000, internal.assets.expireAsset, {
        id: asset._id,
      });
    }
  },
});
export const expireAsset = internalMutation({
  args: { id: v.id("assets") },
  handler: async (ctx, a) => {
    const asset = await ctx.db.get(a.id);
    if (!asset || asset.expiresAt === undefined || asset.expiresAt > Date.now())
      return;
    await ctx.db.patch(asset._id, { state: "deleting", updatedAt: Date.now() });
    await queueDeletion(ctx, asset.key);
  },
});
