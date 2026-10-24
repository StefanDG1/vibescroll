import { workspaceReadable } from "./lib/workspacePrivacy";
import { internalQuery } from "./_generated/server";
import { internalMutation } from "./lib/projectedMutations";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { ensure } from "../packages/policy";
import { settle } from "./product";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { personalAllowed } from "./lib/personalAccess";
import {
  acquisitionManifest,
  acquisitionMessage,
} from "../packages/media/acquisition";

async function current(
  ctx: QueryCtx,
  a: { id: Id<"sources">; generation: number },
) {
  const s = await ctx.db.get(a.id),
    j = s?.personalAnalysis;
  if (
    !s ||
    s.state !== "processing" ||
    s.generation !== a.generation ||
    j?.executor === "work_cloud" ||
    j?.state !== "preparing" ||
    j.expiresAt <= Date.now()
  )
    return null;
  const actor = await ctx.db.get(j.actor),
    device = await ctx.db.get(j.deviceId),
    org = await ctx.db.get(s.organizationId);
  const membership = await ctx.db
    .query("memberships")
    .withIndex("by_pair", (q) =>
      q.eq("organizationId", s.organizationId).eq("userId", j.actor),
    )
    .unique();
  if (
    actor?.status !== "active" ||
    !personalAllowed(actor.subject) ||
    !workspaceReadable(org, j.actor) ||
    !membership ||
    !["owner", "admin", "member"].includes(membership.role) ||
    device?.state !== "paired" ||
    device.owner !== j.actor ||
    device.organizationId !== s.organizationId ||
    device.personalProfileBinding !== j.profileBinding ||
    process.env.RESTORE_LOCK === "true"
  )
    return null;
  return s;
}
export const pending = internalQuery({
  args: { id: v.id("sources"), generation: v.number() },
  handler: current,
});
export async function releaseUnstarted(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  id: Id<"sources">,
  generation: number,
) {
  const key = `personal-media:${id}:${generation}`;
  const reservation = await ctx.db
    .query("reservations")
    .withIndex("by_key", (q) =>
      q.eq("organizationId", organizationId).eq("key", key),
    )
    .unique();
  if (reservation?.state === "active" && reservation.dispatchedAt === undefined)
    await settle(ctx, organizationId, key, 0);
}
export const begin = internalMutation({
  args: { id: v.id("sources"), generation: v.number() },
  handler: async (ctx, a) => {
    const source = await current(ctx, a);
    if (!source) {
      const old = await ctx.db.get(a.id);
      if (old)
        await releaseUnstarted(ctx, old.organizationId, a.id, a.generation);
      return null;
    }
    const key = `personal-media:${a.id}:${a.generation}`;
    const reservation = await ctx.db
      .query("reservations")
      .withIndex("by_key", (q) =>
        q.eq("organizationId", source.organizationId).eq("key", key),
      )
      .unique();
    if (
      !reservation ||
      reservation.state !== "active" ||
      reservation.dispatchedAt !== undefined
    )
      return null;
    await ctx.db.patch(reservation._id, { dispatchedAt: Date.now() });
    return source;
  },
});
export const finish = internalMutation({
  args: {
    id: v.id("sources"),
    generation: v.number(),
    organizationId: v.id("organizations"),
    computeCredits: v.optional(v.number()),
    media: v.optional(v.any()),
    acquisition: v.optional(v.any()),
  },
  handler: async (ctx, a) => {
    // Settle the independently reserved compute even if cancellation changed the source generation.
    if (a.computeCredits !== undefined)
      await settle(
        ctx,
        a.organizationId,
        `personal-media:${a.id}:${a.generation}`,
        a.computeCredits,
      );
    const s = await ctx.db.get(a.id),
      j = s?.personalAnalysis;
    if (
      !s ||
      s.organizationId !== a.organizationId ||
      s.generation !== a.generation ||
      s.state !== "processing" ||
      j?.state !== "preparing"
    )
      return false;
    if (!(await current(ctx, a))) {
      await settle(ctx, a.organizationId, `source:${a.id}:${a.generation}`, 0);
      await ctx.db.patch(a.id, {
        state: "failed",
        personalAnalysis: { ...j, state: "expired" },
        error:
          "Your analysis permission expired or was disconnected. Review the connection before retrying.",
        updatedAt: Date.now(),
      });
      return false;
    }
    const acquisition = a.acquisition
      ? acquisitionManifest.parse(a.acquisition)
      : undefined;
    if (acquisition) {
      const { schemaVersion: _schemaVersion, ...metadata } = acquisition;
      await ctx.db.patch(a.id, {
        acquisition: {
          ...metadata,
          basis: "permitted_public_fetch",
          acquiredAt: Date.now(),
        },
        ...(acquisition.title ? { title: acquisition.title } : {}),
        ...(acquisition.publishedAt
          ? { publishedAt: acquisition.publishedAt }
          : {}),
      });
    }
    if (!a.media || a.computeCredits === undefined) {
      await settle(ctx, a.organizationId, `source:${a.id}:${a.generation}`, 0);
      await ctx.db.patch(a.id, {
        state: "failed",
        personalAnalysis: { ...j, state: "failed" },
        error:
          acquisition && acquisition.status !== "acquired"
            ? acquisitionMessage(acquisition.status)
            : a.computeCredits === undefined
              ? "Media preparation stopped. Compute usage needs reconciliation before retrying. No alternate AI provider was used."
              : "Media preparation did not complete. No alternate AI provider was used.",
        updatedAt: Date.now(),
      });
      return false;
    }
    ensure(
      a.media.durationMs > 0 &&
        a.media.durationMs <= 600000 &&
        a.media.frames.length <= 48,
      "INVALID_EVIDENCE",
      "Invalid prepared media.",
    );
    const next = { ...j, state: "queued" };
    await ctx.db.patch(a.id, {
      state: "queued",
      personalAnalysis: next,
      personalMedia: a.media,
      updatedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(900000, internal.personalMediaState.expire, {
      id: a.id,
      generation: a.generation,
    });
    return true;
  },
});
export const expire = internalMutation({
  args: { id: v.id("sources"), generation: v.number() },
  handler: async (ctx, a) => {
    const s = await ctx.db.get(a.id),
      j = s?.personalAnalysis;
    if (
      !s ||
      s.generation !== a.generation ||
      !j ||
      !["queued", "preparing"].includes(j.state) ||
      j.expiresAt > Date.now()
    )
      return;
    await settle(ctx, s.organizationId, `source:${s._id}:${a.generation}`, 0);
    await ctx.db.patch(s._id, {
      state: "failed",
      personalAnalysis: { ...j, state: "expired" },
      error:
        "Your analysis approval expired. Start the laptop and review the source again.",
      updatedAt: Date.now(),
    });
  },
});
