import { internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { assistantGrant, assistantPrincipal } from "./lib/assistantPrincipal";
import {
  cloudProfileEligible,
  eventDeliveryCurrent,
  eventSubscriptionCurrent,
  eventsEnabled,
} from "./lib/assistantEvents";
import { ensure } from "../packages/policy";
import { audit, limit } from "./lib";
import { internal } from "./_generated/api";
import { sourceWithinAssistantScope } from "./lib/assistantSourceScope";
const selected = {
  eventName: v.optional(
    v.union(
      v.literal("analysis_completed"),
      v.literal("work_cloud_waiting"),
      v.literal("work_cloud_connection_verified"),
      v.literal("video_link_saved"),
    ),
  ),
  profileId: v.id("organizations"),
  sourceId: v.optional(v.id("sources")),
  generation: v.optional(v.number()),
  grantVersion: v.number(),
};
async function reviewed(
  ctx: import("./_generated/server").QueryCtx,
  args: {
    profileId: import("./_generated/dataModel").Id<"organizations">;
    eventName?:
      | "analysis_completed"
      | "work_cloud_waiting"
      | "work_cloud_connection_verified"
      | "video_link_saved";
    sourceId?: import("./_generated/dataModel").Id<"sources">;
    generation?: number;
    grantVersion: number;
  },
) {
  ensure(eventsEnabled(), "FORBIDDEN", "Completion Events are unavailable.");
  const a = await assistantGrant(ctx, args.profileId, "events:subscribe");
  ensure(
    a.grant.version === args.grantVersion,
    "APPROVAL_STALE",
    "Review the current Events grant.",
  );
  if (args.eventName && args.eventName !== "analysis_completed") {
    ensure(
      args.sourceId === undefined &&
        args.generation === undefined &&
        ["analysis:request", "analysis:execute"].every((scope) =>
          a.scopes.includes(scope),
        ) &&
        (await cloudProfileEligible(ctx, a.actor, a.organization, a.grant)),
      "FORBIDDEN",
      "Review current owner Cloud policy and all-library execution scopes before subscribing to profile Events.",
    );
    return { ...a, source: null };
  }
  ensure(
    args.sourceId !== undefined &&
      Number.isSafeInteger(args.generation) &&
      args.generation! >= 0,
    "INVALID_INPUT",
    "Completion requires an exact source generation.",
  );
  const source = await ctx.db.get(args.sourceId);
  const scoped =
    !!a.grant.libraryScope &&
    (await sourceWithinAssistantScope(
      ctx,
      a.grant,
      a.organization,
      a.actor._id,
      source,
    ));
  const selected = a.grant.sources.find(
    (r) => r.sourceId === args.sourceId && r.generation === args.generation,
  );
  const intake = selected
    ? null
    : await ctx.db
        .query("assistantIntakes")
        .withIndex("by_pair", (q) =>
          q
            .eq("actor", a.actor._id)
            .eq("clientId", a.client.id)
            .eq("sourceId", args.sourceId!),
        )
        .unique();
  ensure(
    source &&
      source.organizationId === a.organization._id &&
      source.state !== "deleted" &&
      source.rightsAttested &&
      source.generation === args.generation &&
      (scoped ||
        (!a.grant.libraryScope &&
          (selected ||
            (intake?.grantId === a.grant._id &&
              intake.grantVersion === a.grant.version &&
              intake.generation === args.generation)))),
    "FORBIDDEN",
    "Select current work before subscribing to completion.",
  );
  return { ...a, source };
}
export const prepare = internalQuery({
  args: { ...selected, externalId: v.string() },
  handler: async (ctx, args) => {
    const a = await reviewed(ctx, args);
    const old = await ctx.db
      .query("assistantSubscriptions")
      .withIndex("by_external", (q) => q.eq("externalId", args.externalId))
      .unique();
    const actorRows = await ctx.db
      .query("assistantSubscriptions")
      .withIndex("by_actor_client", (q) =>
        q.eq("actor", a.actor._id).eq("clientId", a.client.id),
      )
      .take(21);
    const sourceRows = await (
      a.source
        ? ctx.db
            .query("assistantSubscriptions")
            .withIndex("by_source", (q) => q.eq("sourceId", a.source!._id))
        : ctx.db
            .query("assistantSubscriptions")
            .withIndex("by_org", (q) =>
              q.eq("organizationId", a.organization._id),
            )
    ).take(21);
    ensure(
      old || (actorRows.length < 20 && sourceRows.length < 20),
      "QUOTA_EXCEEDED",
      "Completion subscription limit reached. Remove an existing subscription or wait for expiry cleanup.",
    );
    ensure(
      !old ||
        (old.actor === a.actor._id &&
          old.clientId === a.client.id &&
          old.consentId === a.identity.sid),
      "FORBIDDEN",
      "Subscription ownership changed.",
    );
    return {
      principal: {
        subject: a.actor.subject,
        clientId: a.client.id,
        consentId: a.identity.sid as string,
      },
      issuer: a.identity.issuer,
      grantExpiresAt: a.grant.expiresAt,
      previous:
        old?.state === "active" && old.expiresAt > Date.now()
          ? {
              ciphertext: old.ciphertext,
              keyVersion: old.keyVersion,
              callbackVerifiedAt: old.callbackVerifiedAt,
            }
          : null,
    };
  },
});
export const install = internalMutation({
  args: {
    ...selected,
    externalId: v.string(),
    ciphertext: v.string(),
    keyVersion: v.string(),
    expiresAt: v.number(),
    callbackVerifiedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const a = await reviewed(ctx, args);
    ensure(
      Number.isSafeInteger(args.callbackVerifiedAt) &&
        args.callbackVerifiedAt <= Date.now() &&
        args.callbackVerifiedAt > Date.now() - 300000 &&
        /^sub_[a-f0-9]{64}$/.test(args.externalId) &&
        args.ciphertext.length <= 30000 &&
        /^[1-9][0-9]{0,2}$/.test(args.keyVersion) &&
        Number.isSafeInteger(args.expiresAt) &&
        args.expiresAt > Date.now() &&
        args.expiresAt <=
          Math.min(a.grant.expiresAt ?? Infinity, Date.now() + 1800000),
      "INVALID_INPUT",
      "Use bounded verified completion authority.",
    );
    await limit(ctx, `assistant-subscribe:${a.actor._id}:${a.client.id}`, 10);
    const old = await ctx.db
      .query("assistantSubscriptions")
      .withIndex("by_external", (q) => q.eq("externalId", args.externalId))
      .unique();
    ensure(
      !old ||
        (old.actor === a.actor._id &&
          old.clientId === a.client.id &&
          old.consentId === a.identity.sid &&
          old.organizationId === a.organization._id &&
          (old.eventName ?? "analysis_completed") ===
            (args.eventName ?? "analysis_completed") &&
          ("sourceId" in old ? old.sourceId === a.source?._id : !a.source)),
      "FORBIDDEN",
      "Subscription ownership changed.",
    );
    if (!old) {
      for (const rows of [
        await ctx.db
          .query("assistantSubscriptions")
          .withIndex("by_actor_client", (q) =>
            q.eq("actor", a.actor._id).eq("clientId", a.client.id),
          )
          .take(21),
        await (
          a.source
            ? ctx.db
                .query("assistantSubscriptions")
                .withIndex("by_source", (q) => q.eq("sourceId", a.source!._id))
            : ctx.db
                .query("assistantSubscriptions")
                .withIndex("by_org", (q) =>
                  q.eq("organizationId", a.organization._id),
                )
        ).take(21),
      ])
        ensure(
          rows.length < 20,
          "QUOTA_EXCEEDED",
          "Completion subscription limit reached.",
        );
    }
    const now = Date.now();
    const record = {
      organizationId: a.organization._id,
      actor: a.actor._id,
      clientId: a.client.id,
      consentId: a.identity.sid as string,
      grantId: a.grant._id,
      grantVersion: a.grant.version,
      ...(a.source
        ? {
            eventName: "analysis_completed" as const,
            sourceId: a.source._id,
            generation: a.source.generation,
            revision: a.source.updatedAt,
          }
        : {
            eventName: args.eventName as
              | "work_cloud_waiting"
              | "work_cloud_connection_verified"
              | "video_link_saved",
          }),
      externalId: args.externalId,
      ciphertext: args.ciphertext,
      keyVersion: args.keyVersion,
      previousCiphertext:
        old?.state === "active" && old.expiresAt > now
          ? old.ciphertext
          : undefined,
      previousKeyVersion:
        old?.state === "active" && old.expiresAt > now
          ? old.keyVersion
          : undefined,
      previousSecretExpiresAt:
        old?.state === "active" && old.expiresAt > now
          ? Math.min(now + 300000, old.expiresAt)
          : undefined,
      callbackVerifiedAt: args.callbackVerifiedAt,
      expiresAt: args.expiresAt,
      updatedAt: now,
      state: "active" as const,
    };
    const id = old
      ? old._id
      : await ctx.db.insert("assistantSubscriptions", {
          ...record,
          createdAt: now,
        });
    if (old) await ctx.db.patch(id, record);
    if (!old && args.eventName === "work_cloud_connection_verified") {
      const deliveryId = await ctx.db.insert("assistantDeliveries", {
        organizationId: a.organization._id,
        subscriptionId: id,
        eventName: "work_cloud_connection_verified",
        completedRevision: now,
        state: "pending",
        attempts: 0,
        dueAt: now,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.scheduler.runAfter(0, internal.assistantEventRuntime.deliver, {
        id: deliveryId,
      });
    }
    await ctx.scheduler.runAfter(
      args.expiresAt - now,
      internal.assistantEvents.expire,
      { id },
    );
    if (record.previousSecretExpiresAt)
      await ctx.scheduler.runAfter(
        record.previousSecretExpiresAt - now,
        internal.assistantEvents.expirePrevious,
        { id },
      );
    await audit(
      ctx,
      a.organization._id,
      a.actor._id,
      "assistant.events_subscribed",
      id,
    );
    return {
      id: args.externalId,
      cursor: null,
      truncated: false,
      expiresAt: new Date(args.expiresAt).toISOString(),
      refreshBefore: new Date(args.expiresAt).toISOString(),
    };
  },
});
export const unsubscribe = internalMutation({
  args: { subscriptionId: v.string() },
  handler: async (ctx, args) => {
    ensure(eventsEnabled(), "FORBIDDEN", "Completion Events are unavailable.");
    ensure(
      /^sub_[a-f0-9]{64}$/.test(args.subscriptionId),
      "INVALID_INPUT",
      "Use the returned subscription identifier.",
    );
    const p = await assistantPrincipal(ctx, "events:subscribe");
    const s = await ctx.db
      .query("assistantSubscriptions")
      .withIndex("by_external", (q) => q.eq("externalId", args.subscriptionId))
      .unique();
    if (!s) return {};
    ensure(
      s.actor === p.actor._id &&
        s.clientId === p.client.id &&
        s.consentId === p.identity.sid,
      "FORBIDDEN",
      "Subscription unavailable.",
    );
    await ctx.db.patch(s._id, {
      state: "cancelled",
      ciphertext: "",
      keyVersion: "",
      previousCiphertext: undefined,
      previousKeyVersion: undefined,
      previousSecretExpiresAt: undefined,
      expiresAt: Date.now(),
      updatedAt: Date.now(),
    });
    await audit(
      ctx,
      s.organizationId,
      p.actor._id,
      "assistant.events_unsubscribed",
      s._id,
    );
    return {};
  },
});
export const claim = internalMutation({
  args: { id: v.id("assistantDeliveries") },
  handler: async (ctx, { id }) => {
    const d = await ctx.db.get(id);
    if (!d || d.state !== "pending" || d.dueAt > Date.now()) return null;
    const s = await ctx.db.get(d.subscriptionId);
    if (!s || !(await eventDeliveryCurrent(ctx, s, d))) {
      await ctx.db.patch(id, { state: "cancelled", updatedAt: Date.now() });
      return null;
    }
    const actor = (await ctx.db.get(s.actor))!;
    const lease = crypto.randomUUID();
    await ctx.db.patch(id, {
      state: "delivering",
      attempts: d.attempts + 1,
      lease,
      leaseUntil: Date.now() + 60000,
      dueAt: Date.now() + 60000,
      updatedAt: Date.now(),
    });
    return {
      delivery: { ...d, attempts: d.attempts + 1, lease },
      subscription: s,
      principal: {
        subject: actor.subject,
        clientId: s.clientId,
        consentId: s.consentId,
      },
    };
  },
});
export const deliveryCurrent = internalQuery({
  args: { id: v.id("assistantDeliveries"), lease: v.string() },
  handler: async (ctx, { id, lease }) => {
    const d = await ctx.db.get(id);
    if (
      !d ||
      d.state !== "delivering" ||
      d.lease !== lease ||
      (d.leaseUntil ?? 0) <= Date.now()
    )
      return false;
    const s = await ctx.db.get(d.subscriptionId);
    return !!s && (await eventDeliveryCurrent(ctx, s, d));
  },
});
export const finish = internalMutation({
  args: {
    id: v.id("assistantDeliveries"),
    lease: v.string(),
    outcome: v.union(
      v.literal("received"),
      v.literal("retry"),
      v.literal("stop"),
    ),
    status: v.optional(v.number()),
  },
  handler: async (ctx, a) => {
    const d = await ctx.db.get(a.id);
    if (!d || d.state !== "delivering" || d.lease !== a.lease) return;
    ensure(
      a.status === undefined ||
        (Number.isSafeInteger(a.status) && a.status >= 100 && a.status <= 599),
      "INVALID_INPUT",
      "Use an observed HTTP status.",
    );
    ensure(
      a.outcome !== "received" ||
        (a.status !== undefined && a.status >= 200 && a.status < 300),
      "INVALID_INPUT",
      "Receipt requires observed HTTP success.",
    );
    const now = Date.now();
    const s = await ctx.db.get(d.subscriptionId);
    const current = !!s && (await eventDeliveryCurrent(ctx, s, d));
    if (a.outcome === "received") {
      await ctx.db.patch(d._id, {
        state: "delivered",
        receivedAt: now,
        httpStatus: a.status,
        lease: undefined,
        leaseUntil: undefined,
        updatedAt: now,
      });
      return;
    }
    if (!current || a.outcome === "stop" || d.attempts >= 5) {
      await ctx.db.patch(d._id, {
        state: current ? "failed" : "cancelled",
        lease: undefined,
        leaseUntil: undefined,
        updatedAt: now,
        httpStatus: a.status,
      });
      return;
    }
    const delay = [5000, 30000, 120000, 600000][Math.min(d.attempts - 1, 3)];
    await ctx.db.patch(d._id, {
      state: "pending",
      dueAt: now + delay,
      lease: undefined,
      leaseUntil: undefined,
      updatedAt: now,
      httpStatus: a.status,
    });
    await ctx.scheduler.runAfter(
      delay,
      internal.assistantEventRuntime.deliver,
      { id: d._id },
    );
  },
});

export const expirePrevious = internalMutation({
  args: { id: v.id("assistantSubscriptions") },
  handler: async (ctx, { id }) => {
    const s = await ctx.db.get(id);
    if (s?.previousSecretExpiresAt && s.previousSecretExpiresAt <= Date.now())
      await ctx.db.patch(id, {
        previousCiphertext: undefined,
        previousKeyVersion: undefined,
        previousSecretExpiresAt: undefined,
      });
  },
});
export const expire = internalMutation({
  args: { id: v.id("assistantSubscriptions") },
  handler: async (ctx, { id }) => {
    const s = await ctx.db.get(id);
    if (
      !s ||
      (s.expiresAt > Date.now() && (await eventSubscriptionCurrent(ctx, s)))
    )
      return;
    await ctx.db.patch(id, {
      state: "cancelled",
      ciphertext: "",
      keyVersion: "",
      previousCiphertext: undefined,
      previousKeyVersion: undefined,
      previousSecretExpiresAt: undefined,
      expiresAt: Date.now(),
      updatedAt: Date.now(),
    });
    const rows = await ctx.db
      .query("assistantDeliveries")
      .withIndex("by_subscription", (q) => q.eq("subscriptionId", id))
      .take(50);
    for (const d of rows) await ctx.db.delete(d._id);
    if (rows.length === 50)
      await ctx.scheduler.runAfter(0, internal.assistantEvents.expire, { id });
    else await ctx.db.delete(id);
  },
});
export const recover = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    for (const s of await ctx.db
      .query("assistantSubscriptions")
      .withIndex("by_expiry", (q) => q.lte("expiresAt", now))
      .take(25))
      await ctx.scheduler.runAfter(0, internal.assistantEvents.expire, {
        id: s._id,
      });
    for (const s of await ctx.db
      .query("assistantSubscriptions")
      .withIndex("by_previous_expiry", (q) =>
        q.gt("previousSecretExpiresAt", 0).lte("previousSecretExpiresAt", now),
      )
      .take(25))
      await ctx.scheduler.runAfter(0, internal.assistantEvents.expirePrevious, {
        id: s._id,
      });
    for (const state of ["delivered", "failed", "cancelled"] as const)
      for (const d of await ctx.db
        .query("assistantDeliveries")
        .withIndex("by_state_updated", (q) =>
          q.eq("state", state).lt("updatedAt", now - 86400000),
        )
        .take(25))
        await ctx.db.delete(d._id);
    if (!eventsEnabled()) return;
    for (const state of ["pending", "delivering"] as const)
      for (const d of await ctx.db
        .query("assistantDeliveries")
        .withIndex("by_state_due", (q) =>
          q.eq("state", state).lte("dueAt", now),
        )
        .take(25)) {
        if (state === "delivering") {
          await ctx.db.patch(d._id, {
            state: d.attempts >= 5 ? "failed" : "pending",
            lease: undefined,
            leaseUntil: undefined,
            updatedAt: now,
          });
          if (d.attempts >= 5) continue;
        }
        await ctx.scheduler.runAfter(
          0,
          internal.assistantEventRuntime.deliver,
          { id: d._id },
        );
      }
  },
});

export const catalog = internalQuery({
  args: {},
  handler: async (ctx) => {
    ensure(eventsEnabled(), "FORBIDDEN", "Completion Events are unavailable.");
    await assistantPrincipal(ctx, "events:subscribe");
    return {};
  },
});

export const invalidate = internalMutation({
  args: {
    organizationId: v.optional(v.id("organizations")),
    actor: v.optional(v.id("users")),
    sourceId: v.optional(v.id("sources")),
    grantId: v.optional(v.id("assistantGrants")),
    cursor: v.union(v.string(), v.null()),
  },
  handler: async (ctx, a) => {
    ensure(
      [a.organizationId, a.actor, a.sourceId, a.grantId].filter(Boolean)
        .length === 1,
      "INVALID_INPUT",
      "Use one invalidation scope.",
    );
    const q = ctx.db.query("assistantSubscriptions");
    const query = a.organizationId
      ? q.withIndex("by_org", (r) => r.eq("organizationId", a.organizationId!))
      : a.actor
        ? q.withIndex("by_actor", (r) => r.eq("actor", a.actor!))
        : a.sourceId
          ? q.withIndex("by_source", (r) => r.eq("sourceId", a.sourceId!))
          : q.withIndex("by_grant", (r) => r.eq("grantId", a.grantId!));
    const page = await query.paginate({ cursor: a.cursor, numItems: 25 });
    for (const s of page.page)
      if (!(await eventSubscriptionCurrent(ctx, s)))
        await ctx.scheduler.runAfter(0, internal.assistantEvents.expire, {
          id: s._id,
        });
    if (!page.isDone)
      await ctx.scheduler.runAfter(0, internal.assistantEvents.invalidate, {
        ...a,
        cursor: page.continueCursor,
      });
  },
});
