import { query } from "./_generated/server";
import { mutation } from "./lib/projectedMutations";
import { v } from "convex/values";
import { access, limit } from "./lib";
import { ensure } from "../packages/policy";
import { personalAllowed, workCloudTextAllowed } from "./lib/personalAccess";
import { hostedMediaAllowed } from "./lib/hostedMediaAccess";
import { privateLibrary } from "./librarySpaces";
import { pairingConfiguration } from "../packages/onboarding/pairing-configuration";
import { parsePreflightReport } from "../packages/onboarding/preflight-report";
import { advanceJourney } from "../packages/onboarding/project-builder-journey";
import { recommendProjectSkills } from "../packages/onboarding/skill-catalog";
import { savedCloudRoute } from "./lib/workCloudSave";

export const status = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, a) => {
    const { actor, organization } = await access(ctx, a.organizationId);
    if (organization.privateOwnerId !== actor._id) return null;
    const setup = await ctx.db
      .query("librarySetup")
      .withIndex("by_org", (q) => q.eq("organizationId", a.organizationId))
      .unique();
    const devices = await ctx.db
      .query("devices")
      .withIndex("by_org", (q) => q.eq("organizationId", a.organizationId))
      .take(30);
    const owned = devices.filter(
      (d) => d.owner === actor._id && d.state === "paired",
    );
    const active = owned.filter(
      (d) => (d.personalSeenAt ?? 0) > Date.now() - 60000,
    );
    const sources = await ctx.db
      .query("sources")
      .withIndex("by_org_created", (q) =>
        q.eq("organizationId", a.organizationId),
      )
      .order("desc")
      .take(30);
    const repositories = await ctx.db
      .query("repositories")
      .withIndex("by_org", (q) => q.eq("organizationId", a.organizationId))
      .take(30);
    const grants = await ctx.db
      .query("assistantGrants")
      .withIndex("by_org", (q) => q.eq("organizationId", a.organizationId))
      .take(30);
    const workCloud = await savedCloudRoute(ctx, actor, organization);
    return {
      workCloud,
      version: setup?.version ?? 0,
      journey: setup?.journey ?? null,
      // Only owner-authored metadata is matched locally. Repository text,
      // names and manifests are not explicit framework declarations.
      skillRecommendations: recommendProjectSkills(
        setup?.confirmed ? [setup.goal, setup.role, ...setup.interests] : [],
      ),
      pairingConfiguration: pairingConfiguration(
        process.env.CONVEX_CLOUD_URL,
        process.env.CONVEX_SITE_URL,
        a.organizationId,
      ),
      localPreflight: setup?.localPreflight
        ? {
            ...setup.localPreflight,
            provenance: "user_provided",
            processingReady: "unverified",
          }
        : null,
      snapshot: {
        workCloudAvailable: workCloud?.available ?? false,
        purposeSaved: setup?.confirmed === true,
        sourceSaved: sources.some((s) => s.state !== "deleted"),
        route: setup?.processingRoute,
        cloudAvailable: hostedMediaAllowed(actor.subject),
        workCloudTextState: workCloudTextAllowed(actor.subject)
          ? ("available_unverified" as const)
          : ("unavailable" as const),
        localEligible: personalAllowed(actor.subject),
        // The web has no trusted local prerequisite/startup bridge. A heartbeat
        // proves availability only; it never certifies a local installation.
        prerequisitesChecked:
          setup?.localPreflight?.passed === true &&
          setup.localPreflight.reportedAt > Date.now() - 86400000,
        connectionPrerequisitesChecked:
          setup?.localPreflight?.readyToConnect === true &&
          setup.localPreflight.reportedAt > Date.now() - 86400000,
        paired: owned.length > 0,
        accountConnected: active.some(
          (d) => (d.personalModels?.length ?? 0) > 0,
        ),
        workerAvailable: active.length > 0,
        sampleCited: sources.some(
          (s) =>
            s.state === "ready" &&
            (!s.sourceRetentionUntil || s.sourceRetentionUntil > Date.now()) &&
            s.analysis?.insights?.some((i: any) => i.evidence?.length),
        ),
        assistantReviewed: grants.some((g) => g.actor === actor._id),
        projectConfirmed: repositories.some((r) => r.confirmed),
        importReviewed: setup?.importReviewed === true,
        preferencesReviewed: setup?.preferencesReviewed === true,
        paused: false,
        startupEnabled: false,
      },
    };
  },
});
export const save = mutation({
  args: {
    organizationId: v.id("organizations"),
    expectedVersion: v.number(),
    route: v.optional(
      v.union(
        v.literal("local"),
        v.literal("cloud"),
        v.literal("save_only"),
        v.literal("work_cloud"),
      ),
    ),
    importReviewed: v.optional(v.boolean()),
    preferencesReviewed: v.optional(v.boolean()),
    preflightReport: v.optional(v.any()),
    journeyAction: v.optional(v.any()),
  },
  handler: async (ctx, a) => {
    const { actor, organization } = await privateLibrary(ctx, a.organizationId);
    if (a.route === "work_cloud")
      ensure(
        (await savedCloudRoute(ctx, actor, organization))?.available,
        "SETUP_REQUIRED",
        "Finish the reviewed ChatGPT saved-link setup before selecting automatic Cloud analysis.",
      );
    await limit(ctx, `setup-journey:${actor._id}`, 30);
    const old = await ctx.db
      .query("librarySetup")
      .withIndex("by_org", (q) => q.eq("organizationId", a.organizationId))
      .unique();
    ensure(
      old && old.version === a.expectedVersion,
      "APPROVAL_STALE",
      "Save your purpose, then reload setup before changing its route.",
    );
    const fields = {
      version: old.version + 1,
      updatedAt: Math.max(Date.now(), old.updatedAt + 1),
      ...(a.journeyAction !== undefined
        ? { journey: advanceJourney(old.journey, a.journeyAction, Date.now()) }
        : {}),
      ...(a.route ? { processingRoute: a.route } : {}),
      ...(a.importReviewed !== undefined
        ? { importReviewed: a.importReviewed }
        : {}),
      ...(a.preferencesReviewed !== undefined
        ? { preferencesReviewed: a.preferencesReviewed }
        : {}),
      ...(a.preflightReport !== undefined
        ? {
            localPreflight: {
              ...parsePreflightReport(a.preflightReport),
              reportedAt: Date.now(),
            },
          }
        : {}),
    };
    await ctx.db.patch(old._id, fields);
    return fields;
  },
});
