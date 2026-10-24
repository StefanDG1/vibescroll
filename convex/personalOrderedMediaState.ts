import { internalQuery } from "./_generated/server";
import { internalMutation } from "./lib/projectedMutations";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { settle } from "./product";
import { releaseUnstarted } from "./personalMediaState";
import { sourceCapabilityCurrent } from "./personalAnalysis";
import { pairedPersonalJob } from "./personalAnalysisSchema";
import { personalAllowed } from "./lib/personalAccess";
import { workspaceReadable } from "./lib/workspacePrivacy";
import {
  orderedInput,
  orderedInputHash,
  orderedPrepared,
  personalOrderedMediaSchema,
} from "./lib/personalOrdered";
import { socialHash } from "../packages/social/contracts";
import { canonicalJson } from "../packages/contracts/canonical-json.mjs";
import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

export async function currentPersonalOrdered(
  ctx: QueryCtx,
  a: { id: Id<"sources">; generation: number },
) {
  const source = await ctx.db.get(a.id),
    j = source?.personalAnalysis;
  if (
    !source ||
    source.generation !== a.generation ||
    source.state !== "processing" ||
    !pairedPersonalJob(j) ||
    j.state !== "preparing" ||
    j.ordered?.phase !== "preparing" ||
    !j.ordered.preflightHash ||
    j.expiresAt <= Date.now() ||
    process.env.RESTORE_LOCK === "true" ||
    process.env.MEDIA_VERIFIED !== "true" ||
    process.env.ORDERED_MEDIA_VERIFIED !== "true"
  )
    return null;
  const actor = await ctx.db.get(j.actor),
    device = await ctx.db.get(j.deviceId),
    org = await ctx.db.get(source.organizationId),
    member = await ctx.db
      .query("memberships")
      .withIndex("by_pair", (q) =>
        q.eq("organizationId", source.organizationId).eq("userId", j.actor),
      )
      .unique();
  if (
    actor?.status !== "active" ||
    !personalAllowed(actor.subject) ||
    !workspaceReadable(org, j.actor) ||
    !member ||
    !["owner", "admin", "member"].includes(member.role) ||
    device?.state !== "paired" ||
    device.owner !== j.actor ||
    device.organizationId !== source.organizationId ||
    device.personalProfileBinding !== j.profileBinding ||
    !device.personalInputProtocols?.includes("ordered-personal-v1") ||
    !j.capabilityHash ||
    !sourceCapabilityCurrent(
      device,
      j.model,
      j.effort,
      j.profileBinding,
      true,
      j.capabilityHash,
    )
  )
    return null;
  const bound = await orderedInput(ctx, source);
  if (
    j.ordered.inputBinding !==
    (await orderedInputHash(source, bound.input, bound.rows))
  )
    return null;
  return { source, ...bound };
}
export const snapshot = internalQuery({
  args: { id: v.id("sources"), generation: v.number() },
  handler: currentPersonalOrdered,
});
export const bindObject = internalMutation({
  args: {
    id: v.id("sources"),
    generation: v.number(),
    assetId: v.id("assets"),
    expiresAt: v.number(),
  },
  handler: async (ctx, a) => {
    const value = await currentPersonalOrdered(ctx, a),
      row = await ctx.db.get(a.assetId);
    if (
      !value ||
      !row ||
      row.sourceId !== a.id ||
      row.organizationId !== value.source.organizationId ||
      row.sourceGeneration !== a.generation ||
      row.state !== "complete" ||
      !Number.isSafeInteger(a.expiresAt) ||
      a.expiresAt <= Date.now() ||
      a.expiresAt > Date.now() + 3600000 ||
      a.expiresAt > (value.source.sourceRetentionUntil ?? Infinity)
    )
      throw Error("PERSONAL_ORDERED_EVIDENCE_CHANGED");
    const expiresAt = Math.min(a.expiresAt, row.expiresAt ?? Infinity);
    await ctx.db.patch(row._id, { expiresAt });
    await ctx.scheduler.runAfter(
      Math.max(0, expiresAt - Date.now()),
      internal.assets.expireAsset,
      { id: row._id },
    );
    return row._id;
  },
});
export const begin = internalMutation({
  args: { id: v.id("sources"), generation: v.number() },
  handler: async (ctx, a) => {
    const value = await currentPersonalOrdered(ctx, a).catch(() => null);
    if (!value) {
      const source = await ctx.db.get(a.id);
      if (source)
        await releaseUnstarted(ctx, source.organizationId, a.id, a.generation);
      return null;
    }
    const reservation = await ctx.db
      .query("reservations")
      .withIndex("by_key", (q) =>
        q
          .eq("organizationId", value.source.organizationId)
          .eq("key", `personal-media:${a.id}:${a.generation}`),
      )
      .unique();
    if (
      !reservation ||
      reservation.state !== "active" ||
      reservation.max !== 10 ||
      reservation.dispatchedAt !== undefined
    )
      return null;
    await ctx.db.patch(reservation._id, { dispatchedAt: Date.now() });
    return value;
  },
});
export const finish = internalMutation({
  args: {
    id: v.id("sources"),
    generation: v.number(),
    organizationId: v.id("organizations"),
    computeCredits: v.optional(v.number()),
    media: v.optional(v.any()),
  },
  handler: async (ctx, a) => {
    if (a.computeCredits !== undefined)
      await settle(
        ctx,
        a.organizationId,
        `personal-media:${a.id}:${a.generation}`,
        a.computeCredits,
      );
    const value = await currentPersonalOrdered(ctx, a).catch(() => null),
      source = await ctx.db.get(a.id),
      j = source?.personalAnalysis;
    if (
      !source ||
      source.organizationId !== a.organizationId ||
      source.generation !== a.generation ||
      !pairedPersonalJob(j) ||
      j.ordered?.phase !== "preparing" ||
      j.state !== "preparing"
    )
      return false;
    if (!value || a.computeCredits === undefined || !a.media) {
      await settle(ctx, a.organizationId, `source:${a.id}:${a.generation}`, 0);
      await ctx.db.patch(a.id, {
        state: "failed",
        personalAnalysis: { ...j, state: "failed" },
        error:
          a.computeCredits === undefined
            ? "Ordered preparation stopped with unconfirmed compute usage. Review before retrying."
            : "Ordered preparation stopped or its authority changed. No AI provider fallback was used.",
        updatedAt: Date.now(),
      });
      return false;
    }
    const media = personalOrderedMediaSchema.parse(a.media),
      preparedHash = await socialHash(canonicalJson(media));
    await ctx.db.patch(a.id, {
      personalMedia: media,
      personalAnalysis: {
        ...j,
        ordered: {
          ...j.ordered,
          phase: "analysis",
          leaseToken: undefined,
          preparedHash,
        },
      },
    });
    await orderedPrepared(ctx, (await ctx.db.get(a.id))!);
    await ctx.db.patch(a.id, {
      state: "queued",
      personalAnalysis: {
        ...j,
        state: "queued",
        stage: "analyzing",
        leaseUntil: 0,
        deadline: 0,
        ordered: {
          ...j.ordered,
          phase: "analysis",
          leaseToken: undefined,
          preparedHash,
        },
      },
      updatedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(
      Math.max(0, j.expiresAt - Date.now()),
      internal.personalMediaState.expire,
      { id: a.id, generation: a.generation },
    );
    return true;
  },
});
