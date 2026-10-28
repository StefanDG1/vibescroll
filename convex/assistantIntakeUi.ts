import { query } from "./_generated/server";
import { mutation } from "./lib/projectedMutations";
import { v } from "convex/values";
import { access, writeAccess } from "./lib";
import { ensure } from "../packages/policy";
import {
  intakeReceipt,
  intakeAuthority,
  intakeNeedsSourceReview,
} from "./lib/assistantIntake";
import { startSource } from "./product";
import type { QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { savedCloudIntentCurrent } from "./lib/workCloudSave";
const sourceArgs = { sourceId: v.id("sources") };
async function cloudControlsCurrentSource(
  ctx: QueryCtx,
  actor: Doc<"users">,
  organization: Doc<"organizations">,
  source: Doc<"sources">,
) {
  if (
    source.personalAnalysis?.executor === "work_cloud" &&
    source.personalAnalysis.generation === source.generation
  )
    return true;
  const intent = source.workCloudSaveIntent;
  if (!intent) return false;
  const grant = await ctx.db.get(intent.grantId);
  return (
    !!grant && savedCloudIntentCurrent(ctx, actor, organization, grant, source)
  );
}
export const status = query({
  args: sourceArgs,
  handler: async (ctx, a) => {
    const source = await ctx.db.get(a.sourceId);
    ensure(
      source && source.state !== "deleted",
      "FORBIDDEN",
      "Source unavailable.",
    );
    const { actor, organization } = await access(ctx, source.organizationId);
    // The historical local intake cannot describe this generation's Cloud
    // executor, credit usage or controls. Its own Cloud panel owns that state.
    if (await cloudControlsCurrentSource(ctx, actor, organization, source))
      return null;
    const rows = await ctx.db
      .query("assistantIntakes")
      .withIndex("by_source", (q) => q.eq("sourceId", source._id))
      .take(51);
    const own = rows
      .filter((r) => r.actor === actor._id)
      .sort(
        (a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt),
      )[0];
    return own && (own.queueState || intakeNeedsSourceReview(source))
      ? intakeReceipt(ctx, own, source)
      : null;
  },
});
export const act = mutation({
  args: {
    ...sourceArgs,
    mode: v.union(v.literal("credits"), v.literal("cancel")),
    generation: v.number(),
    maxCredits: v.optional(v.number()),
  },
  handler: async (ctx, a) => {
    const source = await ctx.db.get(a.sourceId);
    ensure(
      source && source.state !== "deleted",
      "FORBIDDEN",
      "Source unavailable.",
    );
    const { actor, organization } = await writeAccess(
      ctx,
      source.organizationId,
      ["owner", "admin"],
    );
    ensure(
      !(await cloudControlsCurrentSource(ctx, actor, organization, source)),
      "APPROVAL_STALE",
      "Use the current Cloud request controls.",
    );
    const rows = await ctx.db
      .query("assistantIntakes")
      .withIndex("by_source", (q) => q.eq("sourceId", source._id))
      .take(51);
    if (a.mode === "credits" && intakeNeedsSourceReview(source)) {
      const own = rows
        .filter((r) => r.actor === actor._id)
        .sort(
          (x, y) => (y.updatedAt ?? y.createdAt) - (x.updatedAt ?? x.createdAt),
        )[0];
      ensure(own, "FORBIDDEN", "Submission unavailable.");
      return intakeReceipt(ctx, own, source);
    }
    const own = rows.filter(
      (r) => r.actor === actor._id && r.queueState === "waiting",
    );
    ensure(
      own.length === 1 && a.generation === source.generation,
      "APPROVAL_STALE",
      "Refresh this source's current waiting state.",
    );
    const intake = own[0];
    await intakeAuthority(ctx, intake, {
      allowSourceReview: a.mode === "cancel",
    });
    if (a.mode === "credits") {
      ensure(
        a.maxCredits === 10 && !intake.runId,
        "QUOTE_CHANGED",
        "Review the current 10-credit quote.",
      );
      await startSource(ctx, { id: source._id, maxCredits: 10 }, actor);
      const fresh = (await ctx.db.get(source._id))!;
      await ctx.db.patch(intake._id, {
        queueState: "credits",
        analysisGeneration: fresh.generation,
        updatedAt: Date.now(),
      });
    } else
      await ctx.db.patch(intake._id, {
        queueState: "cancelled",
        updatedAt: Date.now(),
      });
    return intakeReceipt(
      ctx,
      (await ctx.db.get(intake._id))!,
      (await ctx.db.get(source._id))!,
    );
  },
});
