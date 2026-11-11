import { v } from "convex/values";
import { query } from "./_generated/server";
import { mutation, internalMutation } from "./lib/projectedMutations";
import { user, short } from "./lib";
import { ensure } from "../packages/policy";
import { catalogViewer, fullCatalogEntitled } from "./lib/fullCatalogAccess";
import { catalogConfiguration } from "./lib/cloudCatalog";

export const status = query({
  args: { organizationId: v.id("organizations") },
  returns: v.object({
    entitled: v.boolean(),
    enabled: v.boolean(),
    available: v.boolean(),
    source: v.union(
      v.literal("operator"),
      v.literal("billing_addon"),
      v.null(),
    ),
  }),
  handler: async (ctx, { organizationId }) => {
    const { actor } = await catalogViewer(ctx, organizationId);
    const entitled = await fullCatalogEntitled(ctx, actor);
    return {
      entitled,
      enabled: entitled && actor.fullCatalogEnabled === true,
      available: !!catalogConfiguration(),
      source: entitled ? actor.fullCatalogGrant!.source : null,
    };
  },
});

export const setEnabled = mutation({
  args: { enabled: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { enabled }) => {
    const actor = await user(ctx);
    if (enabled)
      ensure(
        await fullCatalogEntitled(ctx, actor),
        "FORBIDDEN",
        "Full catalog access is not included in your current account.",
      );
    await ctx.db.patch(actor._id, { fullCatalogEnabled: enabled });
    // This changes a view preference, never sources, imports, jobs or credits.
    return null;
  },
});

export const grantOperatorAccess = internalMutation({
  args: { subject: v.string(), enabled: v.boolean(), reason: v.string() },
  returns: v.id("users"),
  handler: async (ctx, args) => {
    ensure(
      process.env.RESTORE_LOCK !== "true",
      "POLICY_BLOCKED",
      "Recovery is in progress.",
    );
    const actor = await ctx.db
      .query("users")
      .withIndex("by_subject", (q) => q.eq("subject", args.subject))
      .unique();
    ensure(
      actor?.status === "active",
      "SOURCE_UNAVAILABLE",
      "The target account is unavailable.",
    );
    await ctx.db.patch(actor._id, {
      fullCatalogEnabled: args.enabled,
      fullCatalogGrant: {
        source: "operator",
        grantedAt: Date.now(),
        reason: short(args.reason, 200),
      },
    });
    return actor._id;
  },
});

export const revokeOperatorAccess = internalMutation({
  args: { subject: v.string() },
  returns: v.null(),
  handler: async (ctx, { subject }) => {
    ensure(
      process.env.RESTORE_LOCK !== "true",
      "POLICY_BLOCKED",
      "Recovery is in progress.",
    );
    const actor = await ctx.db
      .query("users")
      .withIndex("by_subject", (q) => q.eq("subject", subject))
      .unique();
    if (actor?.fullCatalogGrant?.source === "operator")
      await ctx.db.patch(actor._id, {
        fullCatalogEnabled: false,
        fullCatalogGrant: { ...actor.fullCatalogGrant, revokedAt: Date.now() },
      });
    return null;
  },
});
