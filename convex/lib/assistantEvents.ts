import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import {
  assistantClients,
  assistantGrantActive,
} from "../../packages/policy/assistant";
import { workspaceReadable } from "./workspacePrivacy";
import { sourceWithinAssistantScope } from "./assistantSourceScope";
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
  const [actor, organization, grant, source] = await Promise.all([
    ctx.db.get(s.actor),
    ctx.db.get(s.organizationId),
    ctx.db.get(s.grantId),
    knownSource ? Promise.resolve(knownSource) : ctx.db.get(s.sourceId),
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
    !grant.scopes.includes("events:subscribe") ||
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
