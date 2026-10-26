import { query } from "./_generated/server";
import { mutation } from "./lib/projectedMutations";
import { v } from "convex/values";
import { access } from "./lib";
import { personalAllowed } from "./lib/personalAccess";
import { freeWorkersConfigured } from "../packages/providers/workers-plan";
import { hostedMediaAllowed } from "./lib/hostedMediaAccess";
import { googleConfigured } from "../packages/providers/google-inference";
export const read = query({
  args: { organizationId: v.id("organizations") },
  returns: v.object({
    preferChatGPTPlan: v.boolean(),
    hostedStatus: v.literal("awaiting_commercial_access"),
    active: v.literal(false),
    personalAlphaEnabled: v.boolean(),
    cloudAnalysisEnabled: v.boolean(),
    linkAnalysisEnabled: v.boolean(),
    processingRoute: v.union(
      v.literal("local"),
      v.literal("cloud"),
      v.literal("save_only"),
      v.null(),
    ),
  }),
  handler: async (ctx, args) => {
    const { actor, organization } = await access(ctx, args.organizationId);
    const setup =
      organization.privateOwnerId === actor._id
        ? await ctx.db
            .query("librarySetup")
            .withIndex("by_org", (q) =>
              q.eq("organizationId", args.organizationId),
            )
            .unique()
        : null;
    return {
      processingRoute:
        setup?.actor === actor._id ? (setup.processingRoute ?? null) : null,
      preferChatGPTPlan: actor.preferChatGPTPlan ?? false,
      hostedStatus: "awaiting_commercial_access" as const,
      active: false as const,
      personalAlphaEnabled: personalAllowed(actor.subject),
      cloudAnalysisEnabled:
        process.env.DISABLE_INFERENCE !== "true" &&
        ((process.env.MANAGED_INFERENCE_ROUTE === "cloudflare_free" &&
          freeWorkersConfigured()) ||
          (process.env.MANAGED_INFERENCE_ROUTE === "google_metered" &&
            googleConfigured())) &&
        process.env.MEDIA_VERIFIED === "true" &&
        hostedMediaAllowed(actor.subject),
      linkAnalysisEnabled:
        process.env.ACQUISITION_VERIFIED === "true" &&
        process.env.MEDIA_VERIFIED === "true",
    };
  },
});
export const save = mutation({
  args: {
    organizationId: v.id("organizations"),
    preferChatGPTPlan: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { actor } = await access(ctx, args.organizationId);
    await ctx.db.patch(actor._id, {
      preferChatGPTPlan: args.preferChatGPTPlan,
    });
    // This is a personal preference, not provider consent or execution approval.
    return { preferChatGPTPlan: args.preferChatGPTPlan, active: false };
  },
});
