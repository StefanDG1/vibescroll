import { v } from "convex/values";
import { mutation } from "./lib/projectedMutations";
import { historySource } from "./lib/analysisHistory";
import { writeAccess } from "./lib";
import { ensure } from "../packages/policy";
import { captureOne, captureAuthorized } from "./product";
import { preparedPolicy, queuePreparedComparison } from "./preparedAnalysis";
import { queueAutomaticPreparedSource } from "./preparedService";
import { preparedServiceConfiguration } from "./lib/preparedServicePolicy";
import { privateCloudMediaIdentity } from "../packages/social/contracts";
import { cacheCandidate } from "./lib/cloudCatalog";
import { retrySavedCloudSource } from "./workCloudAnalysis";
import {
  savedCloudGrantCurrent,
  queueSavedCloudIntent,
  savedCloudMonitorCurrent,
  savedCloudRoute,
} from "./lib/workCloudSave";

export const analyzeSaved = mutation({
  args: { sourceId: v.id("sources") },
  returns: v.any(),
  handler: async (ctx, { sourceId }) => {
    const owner = await historySource(ctx, sourceId, true);
    ensure(
      !owner.grant,
      "FORBIDDEN",
      "Use the scoped MCP analysis action from a chat.",
    );
    const route = await savedCloudRoute(ctx, owner.actor, owner.organization);
    ensure(
      route?.available && route.grantId,
      "SETUP_REQUIRED",
      "Complete your one-time Cloud setup or resume the existing monitor in Connections.",
    );
    const grant = (await ctx.db.get(route.grantId))!;
    const prepared = await queueAutomaticPreparedSource(
      ctx,
      owner.source,
      owner.actor,
    );
    if (prepared) return prepared;
    return queueSavedCloudIntent(
      ctx,
      owner.actor,
      owner.organization,
      grant,
      owner.source,
      "app",
    );
  },
});

export const retrySaved = mutation({
  args: {
    sourceId: v.id("sources"),
    generation: v.number(),
    revision: v.number(),
    key: v.string(),
  },
  returns: v.object({
    sourceId: v.id("sources"),
    generation: v.number(),
    currentGeneration: v.optional(v.number()),
    status: v.string(),
    reusedRequest: v.boolean(),
    analysisStarted: v.literal(false),
    state: v.optional(v.literal("queued")),
    expiresAt: v.optional(v.number()),
    inputHash: v.optional(v.string()),
  }),
  handler: async (ctx, request) => {
    const owner = await historySource(ctx, request.sourceId, true);
    ensure(
      !owner.grant,
      "FORBIDDEN",
      "Use the scoped MCP retry action from a chat.",
    );
    const route = await savedCloudRoute(ctx, owner.actor, owner.organization);
    ensure(
      route?.grantId,
      "SETUP_REQUIRED",
      "Complete Cloud setup in Connections before retrying.",
    );
    const grant = (await ctx.db.get(route.grantId))!;
    const { sourceId: _sourceId, ...retry } = request;
    return retrySavedCloudSource(ctx, owner, grant, retry);
  },
});

// App-only authenticated capture. Shared/MCP/creator capture never calls this.
// An intent is not a job or lease. The native host prepares before consuming it.
export const capture = mutation({
  args: {
    organizationId: v.id("organizations"),
    key: v.string(),
    url: v.string(),
    title: v.string(),
    rightsAttested: v.literal(true),
    grantId: v.id("assistantGrants"),
    grantVersion: v.number(),
  },
  returns: v.object({
    sourceId: v.id("sources"),
    status: v.union(
      v.literal("waiting_for_cloud_setup"),
      v.literal("waiting_for_shared_analysis"),
      v.literal("existing_work_preserved"),
      v.literal("reused_shared_analysis"),
      v.literal("preparing_evidence"),
    ),
    intentId: v.union(v.string(), v.null()),
    expiresAt: v.union(v.number(), v.null()),
  }),
  handler: async (ctx, a) => {
    const owner = await writeAccess(ctx, a.organizationId, ["owner"]);
    const requestedIdentity = privateCloudMediaIdentity(a.url);
    ensure(
      ["instagram", "tiktok"].includes(requestedIdentity.platform),
      "SOURCE_UNAVAILABLE",
      "Automatic Cloud saves currently accept single Instagram or TikTok videos.",
    );
    const policy = preparedPolicy(owner.actor.subject, requestedIdentity.url);
    const servicePrepared = preparedServiceConfiguration(
      owner.actor.subject,
    )?.automaticOwnSubscriptionPreparation;
    if (policy?.executor === "work_cloud" || servicePrepared) {
      const grant = await ctx.db.get(a.grantId);
      ensure(
        grant &&
          grant.version === a.grantVersion &&
          (await savedCloudGrantCurrent(
            ctx,
            owner.actor,
            owner.organization,
            grant,
          )),
        "SETUP_REQUIRED",
        "The automatic Assistant setup changed.",
      );
      // Preparation runs first. Only evidence_ready emits the native
      // waiting event; an earlier saved-link event would start a second decoder.
      const sourceId = await captureAuthorized(
        ctx,
        {
          organizationId: a.organizationId,
          key: a.key,
          kind: "url",
          url: a.url,
          title: a.title,
          rightsAttested: true,
        },
        owner,
        false,
        true,
        true,
      );
      const source = (await ctx.db.get(sourceId))!;
      ensure(
        source.url &&
          privateCloudMediaIdentity(source.url).url === requestedIdentity.url,
        "APPROVAL_STALE",
        "This Save key belongs to another link.",
      );
      const service = servicePrepared
        ? await queueAutomaticPreparedSource(ctx, source, owner.actor)
        : null;
      if (!servicePrepared)
        await queuePreparedComparison(ctx, source, owner.actor, a.key);
      return {
        sourceId,
        status:
          service?.state === "ready"
            ? ("existing_work_preserved" as const)
            : service?.state === "waiting_for_shared_analysis"
              ? ("waiting_for_shared_analysis" as const)
              : ("preparing_evidence" as const),
        intentId: null,
        expiresAt: null,
      };
    }
    if (await cacheCandidate(ctx, a.organizationId, a.url)) {
      const sourceId = await captureOne(ctx, {
        organizationId: a.organizationId,
        key: a.key,
        kind: "url",
        url: a.url,
        title: a.title,
        rightsAttested: true,
      });
      const source = (await ctx.db.get(sourceId))!;
      ensure(
        source.url &&
          privateCloudMediaIdentity(source.url).url === requestedIdentity.url,
        "APPROVAL_STALE",
        "This save key belongs to another post.",
      );
      return {
        sourceId,
        status: source.publicImportId
          ? ("reused_shared_analysis" as const)
          : ("existing_work_preserved" as const),
        intentId: null,
        expiresAt: null,
      };
    }
    const grant = await ctx.db.get(a.grantId);
    ensure(
      grant &&
        grant.version === a.grantVersion &&
        (await savedCloudGrantCurrent(
          ctx,
          owner.actor,
          owner.organization,
          grant,
        )),
      "SETUP_REQUIRED",
      "Review automatic Cloud saves once in Connections after runtime verification.",
    );
    ensure(
      await savedCloudMonitorCurrent(ctx, grant),
      "SETUP_REQUIRED",
      "Complete or resume the saved-link monitor in ChatGPT before saving for Cloud analysis.",
    );
    const sourceId = await captureOne(ctx, {
      organizationId: a.organizationId,
      key: a.key,
      kind: "url",
      url: a.url,
      title: a.title,
      rightsAttested: true,
    });
    const source = (await ctx.db.get(sourceId))!;
    ensure(
      source.url &&
        privateCloudMediaIdentity(source.url).url === requestedIdentity.url,
      "APPROVAL_STALE",
      "This save key belongs to a different post. Review the link before continuing.",
    );
    return queueSavedCloudIntent(
      ctx,
      owner.actor,
      owner.organization,
      grant,
      source,
      "app",
    );
  },
});
