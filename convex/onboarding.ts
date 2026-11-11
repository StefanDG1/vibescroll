import { v } from "convex/values";
import { query, type QueryCtx } from "./_generated/server";
import { mutation, internalMutation } from "./lib/projectedMutations";
import type { Doc } from "./_generated/dataModel";
import { assistantPrincipal, assistantGrant } from "./lib/assistantPrincipal";
import {
  assistantGrantActive,
  assistantClients,
} from "../packages/policy/assistant";
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
        ...(draft.workStage === undefined
          ? {}
          : { workStage: draft.workStage }),
        ...(draft.obstacle === undefined ? {} : { obstacle: draft.obstacle }),
        ...(draft.projectDescription === undefined
          ? {}
          : { projectDescription: draft.projectDescription }),
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

async function observedConnection(ctx: QueryCtx, actor: Doc<"users">) {
  const proof = actor.onboarding?.assistantConnection;
  if (!proof || process.env.MCP_ENABLED !== "true") return null;
  const grant = await ctx.db.get(proof.grantId);
  const client = assistantClients().find((item) => item.id === proof.clientId);
  if (!grant) return null;
  const organization = await ctx.db.get(grant.organizationId);
  const membership = await ctx.db
    .query("memberships")
    .withIndex("by_pair", (q) =>
      q.eq("organizationId", grant.organizationId).eq("userId", actor._id),
    )
    .unique();
  if (
    !organization ||
    organization.status !== "active" ||
    organization.privateOwnerId !== actor._id ||
    membership?.role !== "owner"
  )
    return null;
  try {
    await requireAccountPro(ctx, actor);
  } catch (error) {
    if (error instanceof PolicyError && error.code === "FORBIDDEN") return null;
    throw error;
  }
  return grant &&
    client &&
    grant.actor === actor._id &&
    grant.clientId === proof.clientId &&
    grant.version === proof.grantVersion &&
    assistantGrantActive(grant) &&
    grant.scopes.includes("context:read")
    ? { client: client.name, checkedAt: proof.checkedAt }
    : null;
}

export const assistantStatus = query({
  args: {},
  returns: v.object({
    ready: v.boolean(),
    client: v.union(v.string(), v.null()),
    oauthClient: v.union(
      v.object({ id: v.string(), name: v.string() }),
      v.null(),
    ),
  }),
  handler: async (ctx) => {
    const proof = await observedConnection(ctx, await user(ctx));
    const clients = assistantClients();
    const selected = process.env.MCP_ONBOARDING_CLIENT_ID
      ? clients.find(
          (client) => client.id === process.env.MCP_ONBOARDING_CLIENT_ID,
        )
      : clients.length === 1
        ? clients[0]
        : null;
    return {
      ready: !!proof,
      client: proof?.client ?? null,
      oauthClient: selected ? { id: selected.id, name: selected.name } : null,
    };
  },
});

export const chooseAssistant = mutation({
  args: {
    choice: v.union(
      v.literal("later"),
      v.literal("check"),
      v.literal("connected"),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await user(ctx);
    ensure(
      actor.onboarding && actor.onboarding.stage !== "quiz",
      "FORBIDDEN",
      "Complete your questions first.",
    );
    await limit(ctx, `onboarding-assistant:${actor._id}`, 15);
    ensure(
      args.choice !== "connected" || (await observedConnection(ctx, actor)),
      "FORBIDDEN",
      "Check the connection from your assistant first.",
    );
    await ctx.db.patch(actor._id, {
      onboarding: {
        ...actor.onboarding,
        assistantChoice: args.choice,
        updatedAt: Date.now(),
      },
    });
    return null;
  },
});

// Called only after a successful authenticated MCP get_profile. No model or
// source write is needed, and an app button cannot manufacture this receipt.
export const recordAssistantConnection = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const principal = await assistantPrincipal(ctx, "context:read");
    const actor = principal.actor;
    if (!actor.onboarding) return null;
    const organization = await ctx.db
      .query("organizations")
      .withIndex("by_private_owner", (q) => q.eq("privateOwnerId", actor._id))
      .unique();
    if (!organization) return null;
    // A valid profile read may contain only joined teams. Optional onboarding
    // bookkeeping must not reject it when personal access was turned off.
    let authorized;
    try {
      authorized = await assistantGrant(ctx, organization._id, "context:read");
    } catch (error) {
      if (error instanceof PolicyError && error.code === "FORBIDDEN")
        return null;
      throw error;
    }
    const { grant } = authorized;
    const old = actor.onboarding.assistantConnection;
    if (
      old?.grantId === grant._id &&
      old.grantVersion === grant.version &&
      actor.onboarding.assistantChoice === "connected"
    )
      return null;
    await ctx.db.patch(actor._id, {
      onboarding: {
        ...actor.onboarding,
        assistantChoice: "connected",
        assistantConnection: {
          clientId: principal.client.id,
          grantId: grant._id,
          grantVersion: grant.version,
          checkedAt: Date.now(),
        },
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
