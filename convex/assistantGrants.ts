import {
  workCloudTextAllowed,
  workCloudMediaAllowed,
} from "./lib/personalAccess";
import { query } from "./_generated/server";
import { mutation } from "./lib/projectedMutations";
import { v } from "convex/values";
import { access, audit, limit, recentAuthentication } from "./lib";
import {
  assistantClients,
  assistantIssuer,
  assistantScopes,
} from "../packages/policy/assistant";
import { ensure, containsSecret } from "../packages/policy";
import { workCloudMediaPolicy } from "../packages/contracts/work-cloud-text";
import { cloudSaveDefaults } from "./workCloudSaveSchema";
import { savedCloudEnabled } from "./lib/workCloudSave";
const safeModel = (value: unknown) =>
  typeof value === "string" && /^[a-zA-Z0-9_.:-]{1,100}$/.test(value);
import { canonicalJson } from "../packages/contracts/canonical-json.mjs";
import { digest } from "./product";
import {
  assistantRepositoryBinding,
  assistantAnalysisDefaults,
} from "./assistantSchema";
import { snapshotScopeCurrent } from "../packages/repositories/scope";
import { workCloudSourceEligible } from "./lib/workCloudSourceAccess";
const binding = v.object({
  sourceId: v.id("sources"),
  generation: v.number(),
  revision: v.number(),
});
export const setup = query({
  args: {
    organizationId: v.id("organizations"),
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, a) => {
    const { actor, organization } = await access(ctx, a.organizationId);
    const grants = await ctx.db
      .query("assistantGrants")
      .withIndex("by_actor_org", (q) =>
        q.eq("actor", actor._id).eq("organizationId", a.organizationId),
      )
      .take(51);
    const context = await ctx.db
      .query("librarySetup")
      .withIndex("by_org", (q) => q.eq("organizationId", a.organizationId))
      .unique();
    const cloudEligible = await workCloudSourceEligible(
      ctx,
      organization,
      actor._id,
    );
    return {
      enabled:
        process.env.MCP_ENABLED === "true" &&
        !!assistantIssuer(process.env.MCP_AUTH_ISSUER),
      privateLibrary: organization.privateOwnerId === actor._id,
      workCloudTextEnabled:
        cloudEligible && workCloudTextAllowed(actor.subject),
      workCloudMediaEnabled:
        cloudEligible && workCloudMediaAllowed(actor.subject),
      eventsEnabled: process.env.MCP_EVENTS_ENABLED === "true",
      workCloudSavedEnabled:
        organization.privateOwnerId === actor._id &&
        savedCloudEnabled(actor.subject),
      devices: (
        await ctx.db
          .query("devices")
          .withIndex("by_org", (q) => q.eq("organizationId", a.organizationId))
          .take(21)
      )
        .filter((d) => d.owner === actor._id && d.state === "paired")
        .map((d) => ({
          id: d._id,
          name: d.name,
          profileBinding: d.assistantProfileBinding,
          online: (d.assistantSeenAt ?? 0) > Date.now() - 360000,
        })),
      sources: [],
      nextCursor: null,
      coverage:
        "Choose all posts or a private library space. No per-post selection is needed.",
      clients: assistantClients(),
      grants: grants
        .filter((g) => g.actor === actor._id)
        .map((g) => ({
          id: g._id,
          clientId: g.clientId,
          sources: g.sources,
          scopes: g.scopes,
          libraryScope: g.libraryScope,
          contextVersion: g.contextVersion,
          repositories: g.repositories ?? [],
          intakeSpace: g.intakeSpace,
          intakePolicy: g.intakePolicy,
          analysisDefaults: g.analysisDefaults,
          cloudRequestPolicy: g.cloudRequestPolicy,
          cloudSaveDefaults: g.cloudSaveDefaults,
          version: g.version,
          state: g.state,
          expiresAt: g.expiresAt,
        })),
      context: context?.confirmed
        ? {
            version: context.version,
            goal: context.goal,
            interests: context.interests,
            role: context.role,
          }
        : null,
    };
  },
});
export const projectChoices = query({
  args: {
    organizationId: v.id("organizations"),
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, a) => {
    await access(ctx, a.organizationId);
    const repositories = await ctx.db
      .query("repositories")
      .withIndex("by_org", (q) => q.eq("organizationId", a.organizationId))
      .paginate({ cursor: a.cursor ?? null, numItems: 20 });
    return {
      repositoryNextCursor: repositories.isDone
        ? null
        : repositories.continueCursor,
      repositories: repositories.page
        .filter(
          (r) =>
            r.enabled &&
            r.confirmed &&
            snapshotScopeCurrent(r) &&
            r.profile.length <= 8000 &&
            !containsSecret(r.profile),
        )
        .map((r) => ({
          repositoryId: r._id,
          name: r.fullName,
          baseSha: r.sha,
          profileVersion: r.profileVersion,
          selectionVersion: r.selectionVersion ?? 0,
        })),
    };
  },
});
export const save = mutation({
  args: {
    organizationId: v.id("organizations"),
    clientId: v.string(),
    sources: v.array(binding),
    libraryScope: v.optional(
      v.union(v.literal("all"), v.literal("personal"), v.literal("business")),
    ),
    repositories: v.optional(v.array(assistantRepositoryBinding)),
    scopes: v.array(v.string()),
    contextVersion: v.optional(v.number()),
    intakeSpace: v.optional(
      v.union(v.literal("personal"), v.literal("business")),
    ),
    intakePolicy: v.optional(v.literal("explicit_links")),
    analysisDefaults: v.optional(assistantAnalysisDefaults),
    cloudRequestPolicy: v.optional(v.literal("explicit_per_source_v1")),
    cloudSaveDefaults: v.optional(cloudSaveDefaults),
    expectedVersion: v.number(),
    expiresAt: v.union(v.number(), v.null()),
    acknowledged: v.literal(true),
  },
  handler: async (ctx, a) => {
    const { actor, organization } = await access(ctx, a.organizationId, [
      "owner",
      "admin",
      "member",
    ]);
    await recentAuthentication(ctx);
    await limit(ctx, `assistant-grant:${actor._id}`, 10);
    const client = assistantClients().find((c) => c.id === a.clientId);
    ensure(
      process.env.MCP_ENABLED === "true" && client,
      "FORBIDDEN",
      "This OAuth client is not configured.",
    );
    ensure(
      a.scopes.length > 0 &&
        a.scopes.length <= assistantScopes.length &&
        new Set(a.scopes).size === a.scopes.length &&
        a.scopes.every((s) =>
          client.scopes.includes(s as (typeof assistantScopes)[number]),
        ),
      "INVALID_INPUT",
      "Choose supported explicit scopes.",
    );
    ensure(
      !a.libraryScope ||
        (!a.sources.length &&
          (a.libraryScope === "all" ||
            organization.privateOwnerId === actor._id)),
      "INVALID_INPUT",
      "Personal and Business access require your private library; scope grants do not copy posts.",
    );
    ensure(
      a.sources.length <= 50 &&
        new Set(a.sources.map((s) => s.sourceId)).size === a.sources.length &&
        (a.sources.length > 0 ||
          a.libraryScope ||
          a.scopes.includes("links:save") ||
          a.scopes.includes("context:read")),
      "INVALID_INPUT",
      "Select a bounded source or context grant.",
    );
    ensure(
      a.expiresAt === null ||
        (Number.isSafeInteger(a.expiresAt) &&
          a.expiresAt > Date.now() &&
          a.expiresAt <= Date.now() + 30 * 86400000),
      "INVALID_INPUT",
      "Choose access until revoked or an expiry within 30 days.",
    );
    for (const ref of a.sources) {
      const source = await ctx.db.get(ref.sourceId);
      ensure(
        source &&
          source.organizationId === a.organizationId &&
          source.state !== "deleted" &&
          source.rightsAttested &&
          source.generation === ref.generation &&
          source.updatedAt === ref.revision,
        "STALE_APPROVAL",
        "A selected post changed. Review it again.",
      );
    }
    const repositories = a.repositories ?? [];
    ensure(
      repositories.length <= 5 &&
        new Set(repositories.map((r) => r.repositoryId)).size ===
          repositories.length,
      "INVALID_INPUT",
      "Select at most five distinct projects.",
    );
    ensure(
      !repositories.length || a.scopes.includes("context:read"),
      "INVALID_INPUT",
      "Selected project context requires its explicit read scope.",
    );
    for (const ref of repositories) {
      const r = await ctx.db.get(ref.repositoryId);
      ensure(
        r &&
          r.organizationId === a.organizationId &&
          r.enabled &&
          r.confirmed &&
          snapshotScopeCurrent(r) &&
          r.sha === ref.baseSha &&
          r.profileVersion === ref.profileVersion &&
          (r.selectionVersion ?? 0) === ref.selectionVersion &&
          r.profile.length <= 8000 &&
          !containsSecret(r.profile),
        "STALE_APPROVAL",
        "A selected project changed. Review its current context and snapshot.",
      );
    }
    if (a.contextVersion !== undefined) {
      const context = await ctx.db
        .query("librarySetup")
        .withIndex("by_org", (q) => q.eq("organizationId", a.organizationId))
        .unique();
      ensure(
        a.scopes.includes("context:read") &&
          context?.confirmed &&
          context.version === a.contextVersion,
        "STALE_APPROVAL",
        "Review the current stated context.",
      );
    }
    ensure(
      !a.scopes.includes("context:read") ||
        a.contextVersion !== undefined ||
        repositories.length > 0,
      "INVALID_INPUT",
      "Select the confirmed library context or a current project.",
    );
    ensure(
      !a.scopes.includes("suggestions:draft") ||
        (a.scopes.includes("context:read") &&
          repositories.length > 0 &&
          (a.sources.length > 0 || !!a.libraryScope) &&
          ["owner", "admin"].includes(
            (
              await ctx.db
                .query("memberships")
                .withIndex("by_pair", (q) =>
                  q
                    .eq("organizationId", a.organizationId)
                    .eq("userId", actor._id),
                )
                .unique()
            )?.role ?? "",
          )),
      "INVALID_INPUT",
      "Project suggestions require selected project context and evidence, and an owner or admin.",
    );
    ensure(
      !a.intakeSpace ||
        (organization.privateOwnerId === actor._id &&
          a.scopes.includes("links:save")),
      "INVALID_INPUT",
      "Choose intake filing only for your private library.",
    );
    ensure(
      !a.intakeSpace ||
        !a.libraryScope ||
        a.libraryScope === "all" ||
        a.intakeSpace === a.libraryScope,
      "INVALID_INPUT",
      "Choose an intake destination within the approved library scope.",
    );
    if (a.cloudRequestPolicy) {
      ensure(
        (await workCloudSourceEligible(ctx, organization, actor._id)) &&
          workCloudMediaAllowed(actor.subject) &&
          a.scopes.includes("analysis:request") &&
          a.scopes.includes("analysis:execute") &&
          !a.analysisDefaults?.enabled,
        "SETUP_REQUIRED",
        "Review your own private Cloud connection and turn off automatic local processing before allowing Cloud requests.",
      );
    }
    if (a.cloudSaveDefaults) {
      ensure(
        savedCloudEnabled(actor.subject) &&
          organization.privateOwnerId === actor._id &&
          a.cloudRequestPolicy === "explicit_per_source_v1" &&
          a.libraryScope === "all" &&
          !a.analysisDefaults?.enabled &&
          [
            "analysis:request",
            "analysis:execute",
            "events:subscribe",
            "jobs:read",
          ].every((scope) => a.scopes.includes(scope)) &&
          safeModel(a.cloudSaveDefaults.model) &&
          Number.isSafeInteger(a.cloudSaveDefaults.retentionMs) &&
          a.cloudSaveDefaults.retentionMs >= 3600000 &&
          a.cloudSaveDefaults.retentionMs <=
            workCloudMediaPolicy.maximumResultRetentionMs,
        "SETUP_REQUIRED",
        "Automatic app saves require verified private Cloud setup, reviewed defaults and finite retention.",
      );
    }
    if (a.analysisDefaults?.enabled) {
      const device = await ctx.db.get(a.analysisDefaults.deviceId);
      const membership = await ctx.db
        .query("memberships")
        .withIndex("by_pair", (q) =>
          q.eq("organizationId", a.organizationId).eq("userId", actor._id),
        )
        .unique();
      ensure(
        a.intakePolicy === "explicit_links" &&
          a.libraryScope &&
          a.scopes.includes("links:save") &&
          a.scopes.includes("analysis:request") &&
          device?.owner === actor._id &&
          device.organizationId === a.organizationId &&
          device.state === "paired" &&
          device.assistantProfileBinding ===
            a.analysisDefaults.profileBinding &&
          /^[a-f0-9]{64}$/.test(a.analysisDefaults.profileBinding) &&
          membership &&
          ["owner", "admin"].includes(membership.role),
        "SETUP_REQUIRED",
        "Connect your own local assistant runner and review automatic analysis.",
      );
    }
    const old = await ctx.db
      .query("assistantGrants")
      .withIndex("by_pair", (q) =>
        q
          .eq("organizationId", a.organizationId)
          .eq("actor", actor._id)
          .eq("clientId", a.clientId),
      )
      .unique();
    ensure(
      a.expectedVersion === (old?.version ?? 0),
      "STALE_APPROVAL",
      "The grant changed. Reload it.",
    );
    if (!old) {
      const count = await ctx.db
        .query("assistantGrants")
        .withIndex("by_org", (q) => q.eq("organizationId", a.organizationId))
        .take(51);
      ensure(
        count.length < 50,
        "QUOTA_EXCEEDED",
        "Workspace grant limit reached.",
      );
    }
    const record = {
      organizationId: a.organizationId,
      actor: actor._id,
      clientId: a.clientId,
      sources: a.sources,
      libraryScope: a.libraryScope,
      repositories,
      scopes: a.scopes,
      contextVersion: a.contextVersion,
      intakeSpace: a.intakeSpace,
      intakePolicy: a.intakePolicy,
      analysisDefaults: a.analysisDefaults,
      cloudRequestPolicy: a.cloudRequestPolicy,
      cloudRequestPolicyHash: a.cloudRequestPolicy
        ? await digest(canonicalJson(workCloudMediaPolicy))
        : undefined,
      cloudSaveDefaults: a.cloudSaveDefaults,
      version: (old?.version ?? 0) + 1,
      state: "active" as const,
      expiresAt: a.expiresAt,
      updatedAt: Date.now(),
    };
    const id = old ? old._id : await ctx.db.insert("assistantGrants", record);
    if (old) await ctx.db.patch(id, record);
    await audit(ctx, a.organizationId, actor._id, "assistant.grant.saved", id);
    return { id, version: record.version };
  },
});
export const revoke = mutation({
  args: { id: v.id("assistantGrants"), expectedVersion: v.number() },
  handler: async (ctx, a) => {
    const grant = await ctx.db.get(a.id);
    ensure(grant, "FORBIDDEN", "Grant unavailable.");
    const { actor } = await access(ctx, grant.organizationId);
    ensure(
      grant.actor === actor._id,
      "FORBIDDEN",
      "Only the grant owner can revoke it.",
    );
    ensure(
      grant.version === a.expectedVersion,
      "STALE_APPROVAL",
      "The grant changed. Reload it.",
    );
    await ctx.db.patch(grant._id, {
      state: "revoked",
      version: grant.version + 1,
      updatedAt: Date.now(),
    });
    await audit(
      ctx,
      grant.organizationId,
      actor._id,
      "assistant.grant.revoked",
      grant._id,
    );
    return { revoked: true };
  },
});
