import { apiModelSelection } from "../packages/contracts/api-models";
import { ensure } from "../packages/policy";
import { query } from "./_generated/server";
import { mutation } from "./lib/projectedMutations";
import { v } from "convex/values";
import { access } from "./lib";
import { personalAllowed } from "./lib/personalAccess";
import { freeWorkersConfigured } from "../packages/providers/workers-plan";
import { hostedMediaAllowed } from "./lib/hostedMediaAccess";
import { googleConfigured } from "../packages/providers/google-inference";
import { savedCloudRoute } from "./lib/workCloudSave";
import { preparedServiceAvailable } from "./lib/preparedServicePolicy";
const managedDefaults = v.object({
  enabled: v.boolean(),
  model: v.string(),
  effort: v.optional(v.string()),
  maximumCredits: v.number(),
});

export const read = query({
  args: { organizationId: v.id("organizations") },
  returns: v.object({
    preferChatGPTPlan: v.boolean(),
    managedPostDefaults: v.optional(managedDefaults),
    hostedStatus: v.literal("awaiting_commercial_access"),
    active: v.literal(false),
    personalAlphaEnabled: v.boolean(),
    cloudAnalysisEnabled: v.boolean(),
    preparedAnalysisEnabled: v.boolean(),
    linkAnalysisEnabled: v.boolean(),
    workCloud: v.union(
      v.object({
        available: v.boolean(),
        configured: v.boolean(),
        grantId: v.union(v.id("assistantGrants"), v.null()),
        grantVersion: v.union(v.number(), v.null()),
      }),
      v.null(),
    ),
    processingRoute: v.union(
      v.literal("local"),
      v.literal("cloud"),
      v.literal("save_only"),
      v.literal("work_cloud"),
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
      workCloud: await savedCloudRoute(ctx, actor, organization),
      processingRoute:
        setup?.actor === actor._id ? (setup.processingRoute ?? null) : null,
      preferChatGPTPlan: actor.preferChatGPTPlan ?? false,
      ...(process.env.VIBESCROLL_MANAGED_AUTO_ENABLED === "true"
        ? {
            managedPostDefaults: actor.managedPostDefaults ?? {
              enabled: false,
              model: "auto",
              maximumCredits: 11,
            },
          }
        : {}),
      preparedAnalysisEnabled: await preparedServiceAvailable(
        ctx,
        actor,
        args.organizationId,
      ),
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

export const saveManagedPostDefaults = mutation({
  args: { organizationId: v.id("organizations"), defaults: managedDefaults },
  returns: managedDefaults,
  handler: async (ctx, { organizationId, defaults }) => {
    const { actor, organization } = await access(ctx, organizationId, [
      "owner",
    ]);
    ensure(
      organization.privateOwnerId === actor._id,
      "PERSONAL_FUNDING_REQUIRED",
      "Set automatic managed analysis in your own workspace.",
    );
    ensure(
      process.env.VIBESCROLL_MANAGED_AUTO_ENABLED === "true",
      "SETUP_REQUIRED",
      "Managed analysis defaults are currently unavailable.",
    );
    ensure(
      Number.isSafeInteger(defaults.maximumCredits) &&
        defaults.maximumCredits >= 1 &&
        defaults.maximumCredits <= 501,
      "INVALID_INPUT",
      "Set a valid credit limit.",
    );
    ensure(
      defaults.model === "auto" ||
        [
          "gpt-6.2-sol",
          "gpt-6-luna",
          "meta/muse-ember",
          "anthropic/claude-haiku-5.5",
        ].includes(defaults.model),
      "MODEL_UNAVAILABLE",
      "Choose an available managed model.",
    );
    ensure(
      defaults.model !== "auto" || !defaults.effort,
      "INVALID_INPUT",
      "Auto uses the reviewed effort for the selected provider.",
    );
    if (defaults.model !== "auto")
      apiModelSelection(defaults.model, defaults.effort);
    await ctx.db.patch(actor._id, { managedPostDefaults: defaults });
    return defaults;
  },
});
