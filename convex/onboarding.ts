import { v } from "convex/values";
import { query } from "./_generated/server";
import { mutation } from "./lib/projectedMutations";
import { user, access, limit } from "./lib";
import { ensure, PolicyError } from "../packages/policy";
import { requireAccountPro } from "./lib/accountSubscription";
import { onboardingDraft } from "../packages/onboarding/journey";
import { onboardingState } from "./onboardingSchema";
import { starterFamily } from "./onboardingStarter";

export const authorizeGitHub = query({
  args: { organizationId: v.id("organizations") },
  returns: v.object({ actor: v.object({ _id: v.id("users") }) }),
  handler: async (ctx, args) => {
    const { actor } = await access(
      ctx,
      args.organizationId,
      ["owner", "admin"],
      true,
    );
    return { actor: { _id: actor._id } };
  },
});

export const status = query({
  args: {},
  returns: v.object({
    legacy: v.boolean(),
    paid: v.boolean(),
    progress: v.union(onboardingState, v.null()),
  }),
  handler: async (ctx) => {
    const actor = await user(ctx);
    let paid = false;
    if (actor.onboarding) {
      try {
        await requireAccountPro(ctx, actor);
        paid = true;
      } catch (error) {
        if (!(error instanceof PolicyError) || error.code !== "FORBIDDEN")
          throw error;
      }
    }
    return {
      legacy: !actor.onboarding,
      paid,
      progress: actor.onboarding ?? null,
    };
  },
});
export const save = mutation({
  args: { draft: v.any() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await user(ctx);
    ensure(actor.onboarding, "FORBIDDEN", "Your existing setup is unchanged.");
    await limit(ctx, `onboarding:${actor._id}`, 15);
    const draft = onboardingDraft.parse(args.draft);
    const family = draft.selectedFamilyId
      ? await starterFamily(ctx, draft.selectedFamilyId)
      : null;
    await ctx.db.patch(actor._id, {
      onboarding: {
        ...actor.onboarding,
        version: 1,
        stage:
          actor.onboarding.stage === "quiz" ? "github" : actor.onboarding.stage,
        goal: draft.goal,
        interests: draft.interests,
        customTopic: draft.customTopic,
        pendingUrl: draft.pendingUrl,
        ...(draft.team === undefined ? {} : { team: draft.team }),
        ...(draft.importRequested === undefined
          ? {}
          : { importRequested: draft.importRequested }),
        ...(family ? { selectedFamilyId: family.family._id } : {}),
        updatedAt: Date.now(),
      },
    });
    return null;
  },
});
export const chooseProject = mutation({
  args: {
    organizationId: v.id("organizations"),
    repositoryId: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { actor, organization } = await access(
      ctx,
      args.organizationId,
      ["owner"],
      true,
    );
    ensure(
      actor.onboarding &&
        actor.onboarding.stage !== "quiz" &&
        organization.privateOwnerId === actor._id,
      "FORBIDDEN",
      "Complete your interests first.",
    );
    const bindings = await ctx.db
      .query("githubBindings")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .take(20);
    const binding =
      args.repositoryId === undefined
        ? null
        : bindings.find(
            (row) =>
              row.status === "connected" &&
              row.repositories.some((repo) => repo.id === args.repositoryId),
          );
    const repo = binding?.repositories.find(
      (item) => item.id === args.repositoryId,
    );
    ensure(
      args.repositoryId === undefined || (repo && binding),
      "FORBIDDEN",
      "Choose a currently connected repository.",
    );
    await ctx.db.patch(actor._id, {
      onboarding: {
        ...actor.onboarding,
        stage: actor.onboarding.stage === "complete" ? "complete" : "paywall",
        repository:
          repo && binding
            ? {
                id: repo.id,
                fullName: repo.fullName,
                installationId: binding.installationId,
              }
            : undefined,
        updatedAt: Date.now(),
      },
    });
    return null;
  },
});
export const complete = mutation({
  args: { sourceId: v.optional(v.id("sources")) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await user(ctx);
    ensure(
      actor.onboarding && actor.onboarding.stage !== "quiz",
      "FORBIDDEN",
      "Complete your interests first.",
    );
    const personal = await requireAccountPro(ctx, actor);
    if (args.sourceId) {
      const source = await ctx.db.get(args.sourceId);
      const selected = actor.onboarding.selectedFamilyId
        ? await starterFamily(ctx, actor.onboarding.selectedFamilyId)
        : null;
      ensure(
        source?.organizationId === personal._id &&
          selected?.family.canonical === source.canonical &&
          source.state === "ready",
        "FORBIDDEN",
        "The selected ready post has changed.",
      );
    }
    await ctx.db.patch(actor._id, {
      onboarding: {
        ...actor.onboarding,
        stage: "complete",
        ...(args.sourceId ? { sourceId: args.sourceId } : {}),
        updatedAt: Date.now(),
      },
    });
    return null;
  },
});
export const selectPlan = mutation({
  args: {
    interval: v.union(
      v.literal("monthly"),
      v.literal("annual"),
      v.literal("weekly"),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await user(ctx);
    ensure(
      actor.onboarding && actor.onboarding.stage === "paywall",
      "FORBIDDEN",
      "Complete your setup before checkout.",
    );
    await limit(ctx, `onboarding-plan:${actor._id}`, 10);
    await ctx.db.patch(actor._id, {
      onboarding: {
        ...actor.onboarding,
        interval: args.interval,
        updatedAt: Date.now(),
      },
    });
    return null;
  },
});
