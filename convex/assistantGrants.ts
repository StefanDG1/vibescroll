import { workCloudModelChoices } from "../packages/onboarding/work-cloud-models";
import {
  workCloudTextAllowed,
  workCloudMediaAllowed,
} from "./lib/personalAccess";
import { query, type MutationCtx } from "./_generated/server";
import { mutation, internalMutation } from "./lib/projectedMutations";
import { v, type Infer } from "convex/values";
import { assistantPrincipal } from "./lib/assistantPrincipal";
import { access, audit, limit } from "./lib";
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
      checkedAt: Date.now(),
      processingRoute:
        context?.actor === actor._id ? context.processingRoute : undefined,
      enabled:
        process.env.MCP_ENABLED === "true" &&
        !!assistantIssuer(process.env.MCP_AUTH_ISSUER),
      privateLibrary: organization.privateOwnerId === actor._id,
      modelChoices: workCloudModelChoices,
      workCloudTextEnabled:
        cloudEligible && workCloudTextAllowed(actor.subject),
      workCloudMediaEnabled:
        cloudEligible && workCloudMediaAllowed(actor.subject),
      eventsEnabled: process.env.MCP_EVENTS_ENABLED === "true",
      workCloudSavedEnabled: cloudEligible && savedCloudEnabled(actor.subject),
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
          contextScope: g.contextScope,
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
const saveArgs = v.object({
  organizationId: v.id("organizations"),
  clientId: v.string(),
  sources: v.array(binding),
  libraryScope: v.optional(
    v.union(v.literal("all"), v.literal("personal"), v.literal("business")),
  ),
  repositories: v.optional(v.array(assistantRepositoryBinding)),
  contextScope: v.optional(v.literal("all_confirmed")),
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
});
export const save = mutation({ args: saveArgs, handler: saveGrant });
async function saveGrant(
  ctx: MutationCtx,
  a: Infer<typeof saveArgs>,
  oauthOwner?: Awaited<ReturnType<typeof access>>,
  preserveIdentical = false,
) {
  const { actor, organization } =
    oauthOwner ??
    (await access(ctx, a.organizationId, ["owner", "admin", "member"]));
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
      repositories.length > 0 ||
      a.contextScope === "all_confirmed",
    "INVALID_INPUT",
    "Select the confirmed library context or a current project.",
  );
  ensure(
    !a.scopes.includes("suggestions:draft") ||
      (a.scopes.includes("context:read") &&
        (repositories.length > 0 || a.contextScope === "all_confirmed") &&
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
      a.cloudSaveDefaults.version !== "link-save-cloud-v2" ||
        (a.intakePolicy === "explicit_links" &&
          a.scopes.includes("links:save")),
      "SETUP_REQUIRED",
      "Automatic app and ChatGPT links need the one-time explicit-link saving permission.",
    );
    ensure(
      savedCloudEnabled(actor.subject) &&
        (await workCloudSourceEligible(ctx, organization, actor._id)) &&
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
        device.assistantProfileBinding === a.analysisDefaults.profileBinding &&
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
    contextScope: a.contextScope,
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
  if (
    preserveIdentical &&
    old &&
    (Object.keys(record) as (keyof typeof record)[])
      .filter((key) => key !== "version" && key !== "updatedAt")
      .every(
        (key) =>
          canonicalJson({ value: old[key] ?? null }) ===
          canonicalJson({ value: record[key] ?? null }),
      )
  )
    return { id: old._id, version: old.version };
  const id = old ? old._id : await ctx.db.insert("assistantGrants", record);
  if (old) await ctx.db.patch(id, record);
  await audit(ctx, a.organizationId, actor._id, "assistant.grant.saved", id);
  return { id, version: record.version };
}

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

// A single normal-session Continue sets the standard product defaults. Existing
// advanced restrictions are changed only by this explicit user action.
export const continueSetup = mutation({
  args: {
    organizationId: v.id("organizations"),
    clientId: v.string(),
    expectedVersion: v.number(),
    route: v.union(v.literal("work_cloud"), v.literal("local")),
    model: v.string(),
    effort: v.union(
      v.literal("low"),
      v.literal("medium"),
      v.literal("high"),
      v.literal("xhigh"),
    ),
    deviceId: v.optional(v.id("devices")),
  },
  returns: v.object({ id: v.id("assistantGrants"), version: v.number() }),
  handler: async (ctx, a) => {
    const { membership } = await access(ctx, a.organizationId, [
      "owner",
      "admin",
      "member",
    ]);
    const client = assistantClients().find((c) => c.id === a.clientId);
    ensure(client, "SETUP_REQUIRED", "Connect VibeScroll in ChatGPT first.");
    const scopes = client.scopes.filter(
      (s) =>
        s !== "suggestions:draft" ||
        ["owner", "admin"].includes(membership.role),
    );
    const device = a.deviceId ? await ctx.db.get(a.deviceId) : null;
    ensure(
      a.route !== "local" || device?.assistantProfileBinding,
      "SETUP_REQUIRED",
      "Pair your computer first.",
    );
    const result = await saveGrant(
      ctx,
      {
        organizationId: a.organizationId,
        clientId: a.clientId,
        expectedVersion: a.expectedVersion,
        sources: [],
        libraryScope: "all",
        scopes,
        contextScope: "all_confirmed",
        repositories: [],
        intakePolicy: scopes.includes("links:save")
          ? "explicit_links"
          : undefined,
        expiresAt: null,
        acknowledged: true,
        ...(a.route === "work_cloud"
          ? {
              cloudRequestPolicy: "explicit_per_source_v1" as const,
              cloudSaveDefaults: {
                version: "link-save-cloud-v2" as const,
                model: a.model,
                effort: a.effort,
                retentionMs: 7 * 86400000,
                resultRetention: "until_deleted" as const,
              },
            }
          : {
              analysisDefaults: {
                enabled: true,
                deviceId: device!._id,
                profileBinding: device!.assistantProfileBinding!,
              },
            }),
      },
      undefined,
      true,
    );
    const setup = await ctx.db
      .query("librarySetup")
      .withIndex("by_org", (q) => q.eq("organizationId", a.organizationId))
      .unique();
    if (setup && setup.processingRoute !== a.route)
      await ctx.db.patch(setup._id, {
        processingRoute: a.route,
        version: setup.version + 1,
        updatedAt: Math.max(Date.now(), setup.updatedAt + 1),
      });
    return result;
  },
});

// Official OAuth is already checked at the HTTP boundary. Bootstrap ordinary
// access once; never revive a revoked grant or widen existing custom settings.
export const ensureDefaults = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const p = await assistantPrincipal(ctx);
    const org = await ctx.db
      .query("organizations")
      .withIndex("by_private_owner", (q) => q.eq("privateOwnerId", p.actor._id))
      .unique();
    if (!org || org.status !== "active") return null;
    const old = await ctx.db
      .query("assistantGrants")
      .withIndex("by_pair", (q) =>
        q
          .eq("organizationId", org._id)
          .eq("actor", p.actor._id)
          .eq("clientId", p.client.id),
      )
      .unique();
    if (old) return null;
    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_pair", (q) =>
        q.eq("organizationId", org._id).eq("userId", p.actor._id),
      )
      .unique();
    if (!membership || membership.role !== "owner") return null;
    const scopes = p.client.scopes.filter((s) => p.scopes.includes(s));
    if (!scopes.includes("knowledge:read")) return null;
    const setup = await ctx.db
      .query("librarySetup")
      .withIndex("by_org", (q) => q.eq("organizationId", org._id))
      .unique();
    const cloud =
      (!setup?.processingRoute || setup.processingRoute === "work_cloud") &&
      savedCloudEnabled(p.actor.subject) &&
      (await workCloudSourceEligible(ctx, org, p.actor._id)) &&
      [
        "analysis:request",
        "analysis:execute",
        "links:save",
        "events:subscribe",
        "jobs:read",
      ].every((s) => scopes.includes(s as (typeof scopes)[number]));
    await saveGrant(
      ctx,
      {
        organizationId: org._id,
        clientId: p.client.id,
        sources: [],
        libraryScope: "all",
        scopes,
        contextScope: "all_confirmed",
        expectedVersion: 0,
        expiresAt: null,
        acknowledged: true,
        intakePolicy: scopes.includes("links:save")
          ? "explicit_links"
          : undefined,
        ...(cloud
          ? {
              cloudRequestPolicy: "explicit_per_source_v1" as const,
              cloudSaveDefaults: {
                version: "link-save-cloud-v2" as const,
                model: "gpt-6.1-sol",
                effort: "high" as const,
                retentionMs: 7 * 86400000,
                resultRetention: "until_deleted" as const,
              },
            }
          : {}),
      },
      { actor: p.actor, organization: org, membership },
    );
    return null;
  },
});
