import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import {
  assistantClients,
  assistantGrantActive,
} from "../../packages/policy/assistant";
import { workspaceReadable } from "./workspacePrivacy";
import { sourceWithinAssistantScope } from "./assistantSourceScope";
import { workCloudSourceEligible } from "./workCloudSourceAccess";
import { workCloudMediaAllowed, workCloudTextAllowed } from "./personalAccess";
import { workCloudRequestPolicies } from "../../packages/contracts/work-cloud-text";
import { canonicalJson } from "../../packages/contracts/canonical-json.mjs";
import { internal } from "../_generated/api";
export async function cloudProfileEligible(
  ctx: QueryCtx,
  actor: Doc<"users">,
  organization: Doc<"organizations">,
  grant: Doc<"assistantGrants">,
) {
  const client = assistantClients().find((c) => c.id === grant.clientId);
  const scopes = [
    "events:subscribe",
    "analysis:request",
    "analysis:execute",
  ] as const;
  const policyHashes = await Promise.all(
    workCloudRequestPolicies.map(async (policy) =>
      Array.from(
        new Uint8Array(
          await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(canonicalJson(policy)),
          ),
        ),
        (b) => b.toString(16).padStart(2, "0"),
      ).join(""),
    ),
  );
  return (
    eventsEnabled() &&
    actor.status === "active" &&
    grant.organizationId === organization._id &&
    grant.actor === actor._id &&
    assistantGrantActive(grant) &&
    grant.libraryScope === "all" &&
    grant.cloudRequestPolicy === "explicit_per_source_v1" &&
    policyHashes.includes(grant.cloudRequestPolicyHash ?? "") &&
    !grant.analysisDefaults?.enabled &&
    scopes.every(
      (scope) => grant.scopes.includes(scope) && client?.scopes.includes(scope),
    ) &&
    (workCloudMediaAllowed(actor.subject) ||
      workCloudTextAllowed(actor.subject)) &&
    (await workCloudSourceEligible(ctx, organization, actor._id))
  );
}
export const eventsEnabled = () =>
  process.env.MCP_ENABLED === "true" &&
  process.env.MCP_EVENTS_ENABLED === "true" &&
  process.env.RESTORE_LOCK !== "true";
export async function eventSubscriptionCurrent(
  ctx: QueryCtx,
  s: Doc<"assistantSubscriptions">,
  knownSource?: Doc<"sources">,
) {
  if (!eventsEnabled() || s.state !== "active" || s.expiresAt <= Date.now())
    return false;
  const [actor, organization, grant] = await Promise.all([
    ctx.db.get(s.actor),
    ctx.db.get(s.organizationId),
    ctx.db.get(s.grantId),
  ]);
  const member = await ctx.db
    .query("memberships")
    .withIndex("by_pair", (q) =>
      q.eq("organizationId", s.organizationId).eq("userId", s.actor),
    )
    .unique();
  const client = assistantClients().find((c) => c.id === s.clientId);
  if (
    actor?.status !== "active" ||
    !workspaceReadable(organization, s.actor) ||
    !member ||
    !client?.scopes.includes("events:subscribe") ||
    grant?.organizationId !== s.organizationId ||
    grant.actor !== s.actor ||
    grant.clientId !== s.clientId ||
    grant.version !== s.grantVersion ||
    !assistantGrantActive(grant) ||
    !grant.scopes.includes("events:subscribe")
  )
    return false;
  if (!("sourceId" in s))
    return cloudProfileEligible(ctx, actor, organization!, grant);
  const source = knownSource ?? (await ctx.db.get(s.sourceId));
  if (
    source?.organizationId !== s.organizationId ||
    source.state === "deleted" ||
    !source.rightsAttested ||
    source.generation !== s.generation
  )
    return false;
  if (grant.libraryScope)
    return await sourceWithinAssistantScope(
      ctx,
      grant,
      organization!,
      s.actor,
      source,
      false,
    );
  const selected = grant.sources.some(
    (r) => r.sourceId === s.sourceId && r.generation === s.generation,
  );
  if (selected) return true;
  const intake = await ctx.db
    .query("assistantIntakes")
    .withIndex("by_pair", (q) =>
      q
        .eq("actor", s.actor)
        .eq("clientId", s.clientId)
        .eq("sourceId", s.sourceId),
    )
    .unique();
  return (
    intake?.grantId === s.grantId &&
    intake.grantVersion === s.grantVersion &&
    intake.generation === s.generation
  );
}
export async function cloudWaitingCurrent(
  ctx: QueryCtx,
  s: Doc<"assistantSubscriptions">,
  source: Doc<"sources"> | null,
  occurrence?: {
    generation: number;
    completedRevision: number;
    analysisAttemptId?: Id<"analysisAttempts">;
  },
) {
  if (
    s.eventName !== "work_cloud_waiting" ||
    !source ||
    !(await eventSubscriptionCurrent(ctx, s))
  )
    return false;
  if (occurrence?.analysisAttemptId) {
    const attempt = await ctx.db.get(occurrence.analysisAttemptId);
    const evidence = attempt ? await ctx.db.get(attempt.evidenceId) : null;
    const actor = await ctx.db.get(s.actor);
    const grant = await ctx.db.get(s.grantId);
    const organization = await ctx.db.get(s.organizationId);
    return !!(
      attempt &&
      evidence &&
      actor &&
      grant &&
      organization &&
      source.organizationId === s.organizationId &&
      source.state === "ready" &&
      source.rightsAttested &&
      (!source.sourceRetentionUntil ||
        source.sourceRetentionUntil > Date.now()) &&
      source.pendingAnalysisAttemptId === attempt._id &&
      source.generation === attempt.sourceGeneration &&
      source.canonical === attempt.canonical &&
      attempt.sourceId === source._id &&
      attempt.state === "queued" &&
      !attempt.taskId &&
      attempt.expiresAt > Date.now() &&
      evidence.state === "retained" &&
      evidence.retainUntil > Date.now() &&
      attempt.actor === s.actor &&
      attempt.grantId === s.grantId &&
      attempt.grantVersion === s.grantVersion &&
      attempt.clientId === s.clientId &&
      attempt.createdAt === occurrence.completedRevision &&
      occurrence.generation === attempt.sourceGeneration &&
      workCloudMediaAllowed(actor.subject) &&
      (await sourceWithinAssistantScope(
        ctx,
        grant,
        organization,
        actor._id,
        source,
      ))
    );
  }
  const job = source.personalAnalysis;
  if (
    source.organizationId !== s.organizationId ||
    source.state !== "queued" ||
    !source.rightsAttested ||
    job?.executor !== "work_cloud" ||
    job.state !== "queued" ||
    job.actor !== s.actor ||
    source.generation !== job.generation ||
    job.expiresAt <= Date.now() ||
    job.cloud.grantId !== s.grantId ||
    job.cloud.grantVersion !== s.grantVersion ||
    job.cloud.clientId !== s.clientId ||
    job.cloud.taskId ||
    job.cloud.leaseTokenHash ||
    job.cloud.claimedAt !== undefined ||
    job.cloud.consentId ||
    job.cloud.funding !== "own_subscription" ||
    job.cloud.maxApiUsd !== 0 ||
    !Number.isSafeInteger(job.approvedAt) ||
    (occurrence &&
      (occurrence.generation !== job.generation ||
        occurrence.completedRevision !== job.approvedAt))
  )
    return false;
  const actor = await ctx.db.get(s.actor);
  if (
    !actor ||
    !(job.cloud.media
      ? workCloudMediaAllowed(actor.subject)
      : workCloudTextAllowed(actor.subject))
  )
    return false;
  const grant = await ctx.db.get(s.grantId);
  const organization = await ctx.db.get(s.organizationId);
  return (
    !!grant &&
    !!organization &&
    (await sourceWithinAssistantScope(
      ctx,
      grant,
      organization,
      s.actor,
      source,
      false,
    ))
  );
}
export async function eventDeliveryCurrent(
  ctx: QueryCtx,
  s: Doc<"assistantSubscriptions">,
  d: Doc<"assistantDeliveries">,
) {
  if (d.subscriptionId !== s._id || d.organizationId !== s.organizationId)
    return false;
  if (
    (s.eventName ?? "analysis_completed") !==
    (d.eventName ?? "analysis_completed")
  )
    return false;
  if (d.eventName === "work_cloud_connection_verified")
    return eventSubscriptionCurrent(ctx, s);
  const source = await ctx.db.get(d.sourceId);
  if (d.eventName === "video_link_saved")
    return videoLinkSavedCurrent(ctx, s, source, d);
  if (d.eventName === "work_cloud_waiting")
    return cloudWaitingCurrent(ctx, s, source, d);
  return (
    "sourceId" in s &&
    source?.state === "ready" &&
    source.generation === d.generation &&
    s.sourceId === d.sourceId &&
    (await eventSubscriptionCurrent(ctx, s, source))
  );
}
async function videoLinkSavedCurrent(
  ctx: QueryCtx,
  s: Doc<"assistantSubscriptions">,
  source: Doc<"sources"> | null,
  occurrence?: { generation: number; completedRevision: number },
) {
  if (
    s.eventName !== "video_link_saved" ||
    !source ||
    source.organizationId !== s.organizationId ||
    source.state === "deleted" ||
    !source.rightsAttested ||
    source.kind !== "url" ||
    (source.sourceType ?? "media") !== "media" ||
    (occurrence &&
      (source.generation !== occurrence.generation ||
        source.createdAt !== occurrence.completedRevision)) ||
    !(await eventSubscriptionCurrent(ctx, s))
  )
    return false;
  const grant = await ctx.db.get(s.grantId);
  const organization = await ctx.db.get(s.organizationId);
  return (
    !!grant &&
    !!organization &&
    (await sourceWithinAssistantScope(
      ctx,
      grant,
      organization,
      s.actor,
      source,
      false,
    ))
  );
}
// Capture is the only caller. No library scan or analysis request follows.
// The existing occurrence index stores the immutable creation time for this
// event, so metadata previews and retries coalesce while the delivery is retained.
export async function notifyVideoLinkSaved(
  ctx: MutationCtx,
  source: Doc<"sources">,
  actor: Id<"users">,
) {
  if (
    !eventsEnabled() ||
    source.kind !== "url" ||
    (source.sourceType ?? "media") !== "media"
  )
    return;
  // Profile installation already caps the organization at 20 subscriptions.
  const subscriptions = await ctx.db
    .query("assistantSubscriptions")
    .withIndex("by_org", (q) => q.eq("organizationId", source.organizationId))
    .take(21);
  for (const s of subscriptions) {
    if (s.actor !== actor || !(await videoLinkSavedCurrent(ctx, s, source)))
      continue;
    const existing = await ctx.db
      .query("assistantDeliveries")
      .withIndex("by_source_occurrence", (q) =>
        q
          .eq("subscriptionId", s._id)
          .eq("sourceId", source._id)
          .eq("generation", source.generation)
          .eq("completedRevision", source.createdAt),
      )
      .unique();
    if (existing) continue;
    const now = Date.now();
    const id = await ctx.db.insert("assistantDeliveries", {
      organizationId: s.organizationId,
      subscriptionId: s._id,
      eventName: "video_link_saved",
      sourceId: source._id,
      generation: source.generation,
      completedRevision: source.createdAt,
      state: "pending",
      attempts: 0,
      dueAt: now,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.assistantEventRuntime.deliver, {
      id,
    });
  }
}
// Only approval and exact unclaimed-request reuse call this. Subscription creation
// deliberately performs no retrospective source scan and grants no execution.
export async function notifyCloudWaiting(
  ctx: MutationCtx,
  source: Doc<"sources">,
) {
  const job = source.personalAnalysis;
  if (!eventsEnabled() || job?.executor !== "work_cloud") return;
  const subscriptions = await ctx.db
    .query("assistantSubscriptions")
    .withIndex("by_actor_client", (q) =>
      q.eq("actor", job.actor).eq("clientId", job.cloud.clientId),
    )
    .take(21);
  for (const s of subscriptions) {
    if (!(await cloudWaitingCurrent(ctx, s, source))) continue;
    const existing = await ctx.db
      .query("assistantDeliveries")
      .withIndex("by_source_occurrence", (q) =>
        q
          .eq("subscriptionId", s._id)
          .eq("sourceId", source._id)
          .eq("generation", job.generation)
          .eq("completedRevision", job.approvedAt),
      )
      .unique();
    if (existing) continue;
    const now = Date.now();
    const id = await ctx.db.insert("assistantDeliveries", {
      organizationId: s.organizationId,
      subscriptionId: s._id,
      eventName: "work_cloud_waiting",
      sourceId: source._id,
      generation: job.generation,
      completedRevision: job.approvedAt,
      state: "pending",
      attempts: 0,
      dueAt: now,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.assistantEventRuntime.deliver, {
      id,
    });
  }
}
/** A fresh explicit version request uses the existing profile waiting event. */
export async function notifyVersionWaiting(
  ctx: MutationCtx,
  source: Doc<"sources">,
  attempt: Doc<"analysisAttempts">,
) {
  if (!eventsEnabled()) return;
  const subscriptions = await ctx.db
    .query("assistantSubscriptions")
    .withIndex("by_actor_client", (q) =>
      q.eq("actor", attempt.actor).eq("clientId", attempt.clientId),
    )
    .take(21);
  for (const s of subscriptions) {
    const occurrence = {
      generation: attempt.sourceGeneration,
      completedRevision: attempt.createdAt,
      analysisAttemptId: attempt._id,
    };
    if (!(await cloudWaitingCurrent(ctx, s, source, occurrence))) continue;
    const existing = await ctx.db
      .query("assistantDeliveries")
      .withIndex("by_source_occurrence", (q) =>
        q
          .eq("subscriptionId", s._id)
          .eq("sourceId", source._id)
          .eq("generation", occurrence.generation)
          .eq("completedRevision", occurrence.completedRevision),
      )
      .unique();
    if (existing) continue;
    const now = Date.now();
    const id = await ctx.db.insert("assistantDeliveries", {
      organizationId: source.organizationId,
      subscriptionId: s._id,
      eventName: "work_cloud_waiting",
      sourceId: source._id,
      ...occurrence,
      state: "pending",
      attempts: 0,
      dueAt: now,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.assistantEventRuntime.deliver, {
      id,
    });
  }
}
export async function queueSourceCompletion(
  ctx: MutationCtx,
  source: Doc<"sources">,
  previous: Doc<"sources"> | null,
) {
  if (
    !eventsEnabled() ||
    source.state !== "ready" ||
    previous?.state === "ready" ||
    !source.rightsAttested
  )
    return [];
  const subscriptions = await ctx.db
    .query("assistantSubscriptions")
    .withIndex("by_source", (q) => q.eq("sourceId", source._id))
    .take(21);
  const queued = [];
  for (const s of subscriptions) {
    if (!("sourceId" in s)) continue;
    if (!(await eventSubscriptionCurrent(ctx, s, source))) continue;
    const existing = await ctx.db
      .query("assistantDeliveries")
      .withIndex("by_occurrence", (q) =>
        q
          .eq("subscriptionId", s._id)
          .eq("generation", source.generation)
          .eq("completedRevision", source.updatedAt),
      )
      .unique();
    if (existing) continue;
    const now = Date.now();
    queued.push(
      await ctx.db.insert("assistantDeliveries", {
        organizationId: s.organizationId,
        subscriptionId: s._id,
        sourceId: source._id,
        generation: source.generation,
        completedRevision: source.updatedAt,
        state: "pending",
        attempts: 0,
        dueAt: now,
        createdAt: now,
        updatedAt: now,
      }),
    );
  }
  return queued;
}
