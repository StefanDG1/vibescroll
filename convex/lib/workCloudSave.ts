import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import {
  assistantClients,
  assistantGrantActive,
} from "../../packages/policy/assistant";
import { canonicalJson } from "../../packages/contracts/canonical-json.mjs";
import { workCloudMediaPolicy } from "../../packages/contracts/work-cloud-text";
import { workCloudMediaAllowed } from "./personalAccess";
import { workCloudSourceEligible } from "./workCloudSourceAccess";
import { digest } from "../product";
import { sourceRetained } from "./sourceAuthority";
import { eventSubscriptionCurrent } from "./assistantEvents";
import { notifyVideoLinkSaved } from "./assistantEvents";
import { audit } from "../lib";
import { ensure } from "../../packages/policy";
import { privateCloudMediaIdentity } from "../../packages/social/contracts";
import { recordAutomaticCatalogIntent } from "./catalogPolicy";
import { reserveCatalogProducer } from "./cloudCatalog";

export const cloudSaveIntentLifetimeMs = 86400000;
export function savedCloudEnabled(subject: string) {
  return (
    workCloudMediaAllowed(subject) &&
    process.env.MCP_ENABLED === "true" &&
    process.env.MCP_EVENTS_ENABLED === "true" &&
    process.env.WORK_CLOUD_SAVED_LINKS_ENABLED === "true" &&
    process.env.WORK_CLOUD_SAVED_LINKS_VERIFIED === "true"
  );
}
export async function savedCloudMonitorCurrent(
  ctx: QueryCtx,
  grant: Doc<"assistantGrants">,
) {
  const rows = await ctx.db
    .query("assistantSubscriptions")
    .withIndex("by_org", (q) => q.eq("organizationId", grant.organizationId))
    .take(21);
  if (rows.length > 20) return false;
  for (const row of rows)
    if (
      row.eventName === "video_link_saved" &&
      row.grantId === grant._id &&
      row.grantVersion === grant.version &&
      row.actor === grant.actor &&
      row.clientId === grant.clientId &&
      (await eventSubscriptionCurrent(ctx, row))
    )
      return true;
  return false;
}
export async function savedCloudRoute(
  ctx: QueryCtx,
  actor: Doc<"users">,
  organization: Doc<"organizations">,
) {
  if (
    !savedCloudEnabled(actor.subject) ||
    !(await workCloudSourceEligible(ctx, organization, actor._id))
  )
    return null;
  const rows = await ctx.db
    .query("assistantGrants")
    .withIndex("by_actor_org", (q) =>
      q.eq("actor", actor._id).eq("organizationId", organization._id),
    )
    .take(5);
  if (rows.length > 4) return null;
  const current = [];
  for (const grant of rows)
    if (await savedCloudGrantCurrent(ctx, actor, organization, grant))
      current.push(grant);
  if (current.length !== 1)
    return {
      available: false,
      configured: current.length > 0,
      grantId: null,
      grantVersion: null,
    };
  const grant = current[0];
  return {
    available: await savedCloudMonitorCurrent(ctx, grant),
    configured: true,
    grantId: grant._id,
    grantVersion: grant.version,
  };
}
export async function savedCloudGrantCurrent(
  ctx: QueryCtx,
  actor: Doc<"users">,
  organization: Doc<"organizations">,
  grant: Doc<"assistantGrants">,
) {
  const client = assistantClients().find((c) => c.id === grant.clientId);
  const required = [
    "analysis:request",
    "analysis:execute",
    "events:subscribe",
    "jobs:read",
  ] as const;
  return (
    savedCloudEnabled(actor.subject) &&
    actor.status === "active" &&
    (await workCloudSourceEligible(ctx, organization, actor._id)) &&
    grant.organizationId === organization._id &&
    grant.actor === actor._id &&
    assistantGrantActive(grant) &&
    grant.libraryScope === "all" &&
    grant.cloudRequestPolicy === "explicit_per_source_v1" &&
    grant.cloudRequestPolicyHash ===
      (await digest(canonicalJson(workCloudMediaPolicy))) &&
    !!grant.cloudSaveDefaults &&
    !grant.analysisDefaults?.enabled &&
    required.every(
      (scope) => grant.scopes.includes(scope) && client?.scopes.includes(scope),
    )
  );
}
export function savedCloudSourceHash(source: Doc<"sources">) {
  return digest(
    canonicalJson({
      generation: source.generation,
      revision: source.updatedAt,
      canonical: source.canonical,
      url: source.url ?? null,
      kind: source.kind,
      sourceType: source.sourceType ?? "media",
      title: source.title,
      rightsAttested: source.rightsAttested,
      sourceRetentionUntil: source.sourceRetentionUntil ?? null,
    }),
  );
}
export async function savedCloudIntentCurrent(
  ctx: QueryCtx,
  actor: Doc<"users">,
  organization: Doc<"organizations">,
  grant: Doc<"assistantGrants">,
  source: Doc<"sources">,
) {
  const intent = source.workCloudSaveIntent;
  return (
    !!intent &&
    intent.version === grant.cloudSaveDefaults?.version &&
    (intent.version === "app-save-cloud-v1"
      ? intent.origin === undefined || intent.origin === "app"
      : intent.origin === "app" ||
        (intent.origin === "mcp" &&
          grant.intakePolicy === "explicit_links" &&
          grant.scopes.includes("links:save"))) &&
    intent.actor === actor._id &&
    intent.grantId === grant._id &&
    intent.grantVersion === grant.version &&
    intent.clientId === grant.clientId &&
    intent.expiresAt > Date.now() &&
    intent.retainUntil > Date.now() &&
    source.organizationId === organization._id &&
    source.rightsAttested &&
    source.state !== "deleted" &&
    sourceRetained(source.sourceRetentionUntil) &&
    (await savedCloudGrantCurrent(ctx, actor, organization, grant)) &&
    intent.defaultsHash ===
      (await digest(canonicalJson(grant.cloudSaveDefaults))) &&
    intent.policyHash === (await digest(canonicalJson(workCloudMediaPolicy))) &&
    (intent.analysisGeneration !== undefined
      ? intent.analysisGeneration === source.generation &&
        source.personalAnalysis?.executor === "work_cloud" &&
        source.personalAnalysis.generation === intent.analysisGeneration &&
        source.personalAnalysis.cloud.grantId === intent.grantId &&
        source.personalAnalysis.cloud.grantVersion === intent.grantVersion
      : intent.generation === source.generation &&
        intent.revision === source.updatedAt &&
        intent.sourceHash === (await savedCloudSourceHash(source)))
  );
}

/** Exact finite intent shared by app saves and separately reviewed MCP saves. */
export async function queueSavedCloudIntent(
  ctx: MutationCtx,
  actor: Doc<"users">,
  organization: Doc<"organizations">,
  grant: Doc<"assistantGrants">,
  source: Doc<"sources">,
  origin: "app" | "mcp",
) {
  ensure(
    await savedCloudGrantCurrent(ctx, actor, organization, grant),
    "SETUP_REQUIRED",
    "Review automatic Cloud setup once in Connections.",
  );
  ensure(
    origin !== "mcp" ||
      (grant.cloudSaveDefaults?.version === "link-save-cloud-v2" &&
        grant.intakePolicy === "explicit_links" &&
        grant.scopes.includes("links:save")),
    "SETUP_REQUIRED",
    "Your current automatic setting covers app saves. Review app and ChatGPT links once to enable this default.",
  );
  ensure(
    await savedCloudMonitorCurrent(ctx, grant),
    "SETUP_REQUIRED",
    "Complete or resume your Cloud monitor once. No per-post app review is needed.",
  );
  const identity = privateCloudMediaIdentity(source.url ?? source.canonical);
  ensure(
    source.organizationId === organization._id &&
      source.rightsAttested &&
      ["instagram", "tiktok"].includes(identity.platform),
    "SOURCE_UNAVAILABLE",
    "Use a permitted Instagram or TikTok video in the current library.",
  );
  const preserved = {
    sourceId: source._id,
    status: "existing_work_preserved" as const,
    intentId: null,
    expiresAt: null,
  };
  if (
    source.catalogWait?.expiresAt &&
    source.catalogWait.expiresAt > Date.now()
  )
    return {
      sourceId: source._id,
      status: "waiting_for_shared_analysis" as const,
      intentId: null,
      expiresAt: source.catalogWait.expiresAt,
    };
  if (
    !["saved", "needs_upload"].includes(source.state) ||
    source.generation !== 0 ||
    source.personalAnalysis ||
    source.analysis ||
    source.orderedMedia ||
    source.publicImportId ||
    source.currentRevisionId ||
    source.personalMedia ||
    source.text ||
    source.objectKey ||
    !sourceRetained(source.sourceRetentionUntil)
  )
    return preserved;
  if (await savedCloudIntentCurrent(ctx, actor, organization, grant, source)) {
    await notifyVideoLinkSaved(ctx, source, actor._id);
    return {
      sourceId: source._id,
      status: "waiting_for_cloud_setup" as const,
      intentId: source.workCloudSaveIntent!.id,
      expiresAt: source.workCloudSaveIntent!.expiresAt,
    };
  }
  if (source.workCloudSaveIntent) return preserved;
  const automaticCatalog = await recordAutomaticCatalogIntent(
    ctx,
    source,
    actor,
  );
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
    version: defaults.version,
    origin,
    actor: actor._id,
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
    ...(defaults.resultRetention
      ? { resultRetention: defaults.resultRetention }
      : {}),
    createdAt: now,
    expiresAt: Math.min(
      now + cloudSaveIntentLifetimeMs,
      retainUntil,
      grant.expiresAt ?? Infinity,
    ),
  };
  const id = await digest(canonicalJson({ sourceId: source._id, ...values }));
  if (automaticCatalog) {
    const producer = await reserveCatalogProducer(
      ctx,
      source,
      actor,
      automaticCatalog,
      id,
      values.expiresAt,
      retainUntil,
    );
    if (producer.waiting)
      return {
        sourceId: source._id,
        status: "waiting_for_shared_analysis" as const,
        intentId: null,
        expiresAt: values.expiresAt,
      };
  }
  await ctx.db.patch(source._id, { workCloudSaveIntent: { ...values, id } });
  await notifyVideoLinkSaved(ctx, (await ctx.db.get(source._id))!, actor._id);
  await audit(
    ctx,
    organization._id,
    actor._id,
    "work_cloud.save_intent",
    `${source._id}:${id}:${origin}`,
  );
  return {
    sourceId: source._id,
    status: "waiting_for_cloud_setup" as const,
    intentId: id,
    expiresAt: values.expiresAt,
  };
}
