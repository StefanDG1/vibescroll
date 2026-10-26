import { v } from "convex/values";
import { mutation } from "./lib/projectedMutations";
import { writeAccess, audit } from "./lib";
import { notifyVideoLinkSaved } from "./lib/assistantEvents";
import { ensure } from "../packages/policy";
import { captureOne, digest } from "./product";
import { canonicalJson } from "../packages/contracts/canonical-json.mjs";
import { workCloudMediaPolicy } from "../packages/contracts/work-cloud-text";
import { privateCloudMediaIdentity } from "../packages/social/contracts";
import { sourceRetained } from "./lib/sourceAuthority";
import {
  savedCloudGrantCurrent,
  savedCloudIntentCurrent,
  savedCloudSourceHash,
  cloudSaveIntentLifetimeMs,
  savedCloudMonitorCurrent,
} from "./lib/workCloudSave";

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
      v.literal("existing_work_preserved"),
    ),
    intentId: v.union(v.string(), v.null()),
    expiresAt: v.union(v.number(), v.null()),
  }),
  handler: async (ctx, a) => {
    const owner = await writeAccess(ctx, a.organizationId, ["owner"]);
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
    const requestedIdentity = privateCloudMediaIdentity(a.url);
    ensure(
      ["instagram", "tiktok"].includes(requestedIdentity.platform),
      "SOURCE_UNAVAILABLE",
      "Automatic Cloud saves currently accept single Instagram or TikTok videos.",
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
    // Never reanalyse an existing result, failed/unknown attempt, active work or
    // another executor. Re-saving cannot replace its evidence or funding route.
    if (
      !["saved", "needs_upload"].includes(source.state) ||
      source.generation !== 0 ||
      source.personalAnalysis ||
      source.analysis ||
      source.orderedMedia ||
      source.orderedPreparation ||
      source.serviceIntent ||
      source.publicImportId ||
      source.currentRevisionId ||
      source.creatorRights ||
      source.personalOrderedInput ||
      source.personalMedia ||
      source.text ||
      source.objectKey ||
      !sourceRetained(source)
    )
      return {
        sourceId,
        status: "existing_work_preserved" as const,
        intentId: null,
        expiresAt: null,
      };
    if (
      await savedCloudIntentCurrent(
        ctx,
        owner.actor,
        owner.organization,
        grant,
        source,
      )
    ) {
      await notifyVideoLinkSaved(ctx, source, owner.actor._id);
      return {
        sourceId,
        status: "waiting_for_cloud_setup" as const,
        intentId: source.workCloudSaveIntent!.id,
        expiresAt: source.workCloudSaveIntent!.expiresAt,
      };
    }
    // A stale intent requires explicit post review. Re-saving must not silently
    // extend an expired approval or replace a previous grant/default binding.
    if (source.workCloudSaveIntent)
      return {
        sourceId,
        status: "existing_work_preserved" as const,
        intentId: null,
        expiresAt: null,
      };
    const now = Date.now(),
      defaults = grant.cloudSaveDefaults!;
    const retainUntil = Math.min(
      now + defaults.retentionMs,
      source.sourceRetentionUntil ?? Infinity,
    );
    ensure(
      retainUntil > now,
      "SOURCE_UNAVAILABLE",
      "Source retention has ended.",
    );
    const values = {
      version: "app-save-cloud-v1" as const,
      actor: owner.actor._id,
      grantId: grant._id,
      grantVersion: grant.version,
      clientId: grant.clientId,
      generation: source.generation,
      revision: source.updatedAt,
      sourceHash: await savedCloudSourceHash(source),
      defaultsHash: await digest(canonicalJson(defaults)),
      policyHash: await digest(canonicalJson(workCloudMediaPolicy)),
      model: defaults.model,
      effort: defaults.effort,
      retainUntil,
      createdAt: now,
      expiresAt: Math.min(
        now + cloudSaveIntentLifetimeMs,
        retainUntil,
        grant.expiresAt ?? Infinity,
      ),
    };
    const id = await digest(canonicalJson({ sourceId, ...values }));
    await ctx.db.patch(sourceId, { workCloudSaveIntent: { ...values, id } });
    await notifyVideoLinkSaved(
      ctx,
      (await ctx.db.get(sourceId))!,
      owner.actor._id,
    );
    await audit(
      ctx,
      a.organizationId,
      owner.actor._id,
      "work_cloud.save_intent",
      `${sourceId}:${id}`,
    );
    return {
      sourceId,
      status: "waiting_for_cloud_setup" as const,
      intentId: id,
      expiresAt: values.expiresAt,
    };
  },
});
