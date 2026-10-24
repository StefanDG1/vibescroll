import { internalQuery } from "./_generated/server";
import { internalMutation } from "./lib/projectedMutations";
import { v } from "convex/values";
import {
  creatorConfiguration,
  creatorPermission,
  creatorBounds,
} from "./lib/creatorPolicy";
import { ensure } from "../packages/policy";
import { canonicalJson } from "../packages/contracts/canonical-json.mjs";
import { digest } from "./product";
import { writeCreatorPage } from "./creators";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import {
  creatorOperationLimits,
  type CreatorOperation,
} from "../packages/providers/creator-transport";

async function activeRecipient(ctx: QueryCtx, watch: Doc<"creatorWatches">) {
  const subscriptions = await ctx.db
    .query("creatorSubscriptions")
    .withIndex("by_watch", (q) =>
      q.eq("watchId", watch._id).eq("state", "active"),
    )
    .take(creatorBounds.recipients + 1);
  ensure(
    subscriptions.length <= creatorBounds.recipients,
    "QUOTA_EXCEEDED",
    "Review and reduce this watch's global delivery fanout before discovery.",
  );
  for (const sub of subscriptions) {
    const [actor, org, membership] = await Promise.all([
      ctx.db.get(sub.actor),
      ctx.db.get(sub.organizationId),
      ctx.db
        .query("memberships")
        .withIndex("by_pair", (q) =>
          q.eq("organizationId", sub.organizationId).eq("userId", sub.actor),
        )
        .unique(),
    ]);
    if (
      actor?.status === "active" &&
      org?.status === "active" &&
      org.privateOwnerId === sub.actor &&
      membership &&
      sub.rightsAttested
    )
      return true;
  }
  return false;
}
export const due = internalQuery({
  args: { transportOnly: v.optional(v.boolean()) },
  handler: async (ctx, a) => {
    const configuration = creatorConfiguration();
    if (!configuration || (a.transportOnly && !configuration.transport))
      return [];
    return (
      (
        await ctx.db
          .query("creatorWatches")
          .withIndex("by_due", (q) =>
            q.eq("state", "active").lte("nextCheckAt", Date.now()),
          )
          .take(5)
      )
        // Do not filter unsupported platforms after a bounded prefix read. Their
        // preflight pauses them without a reservation so later watches progress.
        .map((watch) => ({
          id: watch._id,
          version: watch.version,
          generation: watch.generation,
        }))
    );
  },
});
// A stale recipient or abandoned attempt must not remain the first due watch
// forever. This preflight never allocates or releases a funding reservation.
export const preflight = internalMutation({
  args: {
    id: v.id("creatorWatches"),
    expectedVersion: v.number(),
    expectedGeneration: v.number(),
  },
  handler: async (ctx, a) => {
    const watch = await ctx.db.get(a.id),
      now = Date.now();
    if (
      !watch ||
      watch.state !== "active" ||
      watch.version !== a.expectedVersion ||
      watch.generation !== a.expectedGeneration ||
      watch.nextCheckAt > now
    )
      return "stale" as const;
    // A second dispatcher must not cancel another still-current action.
    if (watch.lease && (watch.leaseUntil ?? 0) > now) return "busy" as const;
    const reservationKey =
      watch.reservationKey ?? watch.supplierAttempt?.reservationKey;
    const previous = reservationKey
      ? await ctx.db
          .query("inferenceReservations")
          .withIndex("by_key", (q) => q.eq("key", reservationKey))
          .unique()
      : null;
    const unknown = Boolean(
      watch.lease ||
      watch.reservationKey ||
      (watch.supplierAttempt &&
        (previous?.state !== "social_discovery_bounded_complete" ||
          ((watch.supplierOperations?.start ?? 0) > 0 &&
            watch.supplierCleanup !== "confirmed"))),
    );
    if (unknown) {
      if (previous?.state === "social_discovery_reserved")
        await ctx.db.patch(previous._id, { state: "social_discovery_unknown" });
      await ctx.db.patch(watch._id, {
        state: "paused",
        leaseUntil: 0,
        incomplete: true,
        version: watch.version + 1,
        updatedAt: now,
      });
      return "unknown" as const;
    }
    const policy = creatorPermission(watch.platform, watch.creatorId);
    if (
      !policy ||
      policy.provider !== watch.provider ||
      policy.rights.evidenceId !== watch.rightsEvidenceId ||
      !policy.transport?.actors.some(
        (actor) => actor.platform === watch.platform,
      ) ||
      !(await activeRecipient(ctx, watch))
    ) {
      await ctx.db.patch(watch._id, {
        state: "paused",
        version: watch.version + 1,
        updatedAt: now,
      });
      return "unavailable" as const;
    }
    return "ready" as const;
  },
});
export const claim = internalMutation({
  args: {
    id: v.id("creatorWatches"),
    expectedVersion: v.number(),
    expectedGeneration: v.optional(v.number()),
    requireTransport: v.optional(v.boolean()),
  },
  handler: async (ctx, a) => {
    const now = Date.now(),
      watch = await ctx.db.get(a.id);
    ensure(
      watch &&
        watch.state === "active" &&
        watch.version === a.expectedVersion &&
        (a.expectedGeneration === undefined ||
          watch.generation === a.expectedGeneration) &&
        watch.nextCheckAt <= now,
      "APPROVAL_STALE",
      "Creator discovery changed.",
    );
    const policy = creatorPermission(watch.platform, watch.creatorId);
    ensure(
      policy &&
        policy.provider === watch.provider &&
        policy.rights.evidenceId === watch.rightsEvidenceId &&
        (await activeRecipient(ctx, watch)),
      "POLICY_BLOCKED",
      "No current authorized recipient or discovery permission.",
    );
    ensure(
      !a.requireTransport ||
        !!policy.transport?.actors.some(
          (row) => row.platform === watch.platform,
        ),
      "POLICY_BLOCKED",
      "A reviewed platform transport is required before reserving discovery.",
    );
    // A lost acknowledgement cannot allocate a fresh paid attempt. Existing
    // supplier work and its full hold require explicit reconciliation first.
    ensure(
      !watch.lease && !watch.reservationKey,
      "COST_RECONCILIATION_REQUIRED",
      "Reconcile the previous discovery attempt before another dispatch.",
    );
    if (watch.supplierAttempt) {
      const previous = await ctx.db
        .query("inferenceReservations")
        .withIndex("by_key", (q) =>
          q.eq("key", watch.supplierAttempt!.reservationKey),
        )
        .unique();
      ensure(
        previous?.state === "social_discovery_bounded_complete" &&
          (!(watch.supplierOperations?.start ?? 0) ||
            watch.supplierCleanup === "confirmed"),
        "COST_RECONCILIATION_REQUIRED",
        "Restoring or resolving a watch cannot clear an unresolved supplier attempt.",
      );
    }
    let budget = await ctx.db
      .query("operatorBudgets")
      .withIndex("by_key", (q) => q.eq("key", policy.budgetKey))
      .unique();
    if (!budget) {
      const id = await ctx.db.insert("operatorBudgets", {
        key: policy.budgetKey,
        ceiling: policy.ceilingUsdMicros,
        reserved: 0,
        spent: 0,
        updatedAt: now,
      });
      budget = (await ctx.db.get(id))!;
    }
    ensure(
      budget.ceiling === policy.ceilingUsdMicros &&
        Number.isSafeInteger(budget.reserved) &&
        budget.reserved >= 0 &&
        Number.isSafeInteger(budget.spent) &&
        budget.spent >= 0 &&
        budget.reserved % policy.perCheckUsdMicros === 0 &&
        budget.spent % policy.perCheckUsdMicros === 0 &&
        budget.reserved + budget.spent + policy.perCheckUsdMicros <=
          budget.ceiling,
      "BUDGET_EXCEEDED",
      "The shared discovery ceiling cannot cover this complete check.",
    );
    const lease = crypto.randomUUID(),
      reservationKey = `social-discovery:${watch._id}:${watch.generation}:${lease}`;
    const policyHash = await digest(canonicalJson(policy));
    await ctx.db.insert("inferenceReservations", {
      key: reservationKey,
      budgetKey: policy.budgetKey,
      max: policy.perCheckUsdMicros,
      state: "social_discovery_reserved",
      createdAt: now,
      payloadDigest: policyHash,
      brokerConsumedAt: now,
    });
    await ctx.db.patch(budget._id, {
      reserved: budget.reserved + policy.perCheckUsdMicros,
      updatedAt: now,
    });
    await ctx.db.patch(watch._id, {
      lease,
      reservationKey,
      claimPosts: 0,
      claimBatches: 0,
      supplierOperations: {},
      supplierAttempt: {
        generation: watch.generation,
        lease,
        reservationKey,
        cleanupDeadline: now + 84_000,
      },
      supplierRun: undefined,
      supplierCleanup: undefined,
      leaseUntil: now + 60_000,
      updatedAt: now,
    });
    return {
      id: watch._id,
      generation: watch.generation,
      lease,
      reservationKey,
      deadline: now + 60_000,
      provider: watch.provider,
      platform: watch.platform,
      creatorId: watch.creatorId,
      canonical: watch.canonical,
      cursor: watch.checkpoint ?? null,
      rights: policy.rights,
      maximumUsdMicros: policy.perCheckUsdMicros,
      policyHash,
      transport: policy.transport ?? null,
    };
  },
});

async function currentClaim(
  ctx: MutationCtx,
  a: {
    id: Doc<"creatorWatches">["_id"];
    generation: number;
    lease: string;
    reservationKey: string;
  },
) {
  const watch = await ctx.db.get(a.id),
    policy = watch && creatorPermission(watch.platform, watch.creatorId);
  ensure(
    watch &&
      watch.state === "active" &&
      watch.generation === a.generation &&
      watch.lease === a.lease &&
      watch.reservationKey === a.reservationKey &&
      (watch.leaseUntil ?? 0) > Date.now() &&
      policy &&
      policy.provider === watch.provider &&
      policy.rights.evidenceId === watch.rightsEvidenceId &&
      (await activeRecipient(ctx, watch)),
    "APPROVAL_STALE",
    "Discovery lease or recipient authority changed.",
  );
  const reservation = await ctx.db
    .query("inferenceReservations")
    .withIndex("by_key", (q) => q.eq("key", a.reservationKey))
    .unique();
  ensure(
    reservation?.state === "social_discovery_reserved" &&
      reservation.payloadDigest === (await digest(canonicalJson(policy))),
    "COST_RECONCILIATION_REQUIRED",
    "Discovery funding or permission changed.",
  );
  return { watch, reservation };
}
export const heartbeat = internalMutation({
  args: {
    id: v.id("creatorWatches"),
    generation: v.number(),
    lease: v.string(),
    reservationKey: v.string(),
  },
  handler: async (ctx, a) => {
    await currentClaim(ctx, a);
    return { current: true };
  },
});
export const commit = internalMutation({
  args: {
    id: v.id("creatorWatches"),
    generation: v.number(),
    lease: v.string(),
    reservationKey: v.string(),
    posts: v.array(v.any()),
    complete: v.boolean(),
    cursor: v.union(v.string(), v.null()),
    finalBatch: v.boolean(),
    pauseIncomplete: v.optional(v.boolean()),
  },
  handler: async (ctx, a) => {
    const { watch, reservation } = await currentClaim(ctx, a);
    ensure(
      a.finalBatch || !a.complete,
      "INVALID_INPUT",
      "Only the final bounded batch can complete a check.",
    );
    ensure(
      Number.isSafeInteger(watch.claimPosts ?? 0) &&
        Number.isSafeInteger(watch.claimBatches ?? 0) &&
        (watch.claimBatches ?? 0) < 11 &&
        (watch.claimPosts ?? 0) + a.posts.length <= creatorBounds.postsPerCheck,
      "QUOTA_EXCEEDED",
      "The complete discovery check reached its post bound.",
    );
    const result = await writeCreatorPage(
      ctx,
      watch,
      a.posts,
      a.complete,
      a.cursor,
      a.reservationKey,
    );
    await ctx.db.patch(watch._id, {
      claimPosts: (watch.claimPosts ?? 0) + a.posts.length,
      claimBatches: (watch.claimBatches ?? 0) + 1,
    });
    if (a.finalBatch) {
      ensure(
        !watch.supplierRun || watch.supplierCleanup === "confirmed",
        "COST_RECONCILIATION_REQUIRED",
        "Owned supplier storage cleanup must be confirmed before closing this attempt.",
      );
      const budget = await ctx.db
        .query("operatorBudgets")
        .withIndex("by_key", (q) => q.eq("key", reservation.budgetKey))
        .unique();
      ensure(
        budget && budget.reserved >= reservation.max,
        "COST_RECONCILIATION_REQUIRED",
        "Discovery reservation is inconsistent.",
      );
      // Charge the conservative full envelope locally. No unobserved actual
      // provider amount is invented and no difference is released for reuse.
      await ctx.db.patch(budget._id, {
        reserved: budget.reserved - reservation.max,
        spent: budget.spent + reservation.max,
        updatedAt: Date.now(),
      });
      await ctx.db.patch(reservation._id, {
        state: "social_discovery_bounded_complete",
      });
      await ctx.db.patch(watch._id, {
        ...(a.pauseIncomplete ? { state: "paused" as const } : {}),
        ...(watch.supplierRun ? { nextCheckAt: Date.now() + 86_400_000 } : {}),
        lease: undefined,
        leaseUntil: undefined,
        reservationKey: undefined,
        version: watch.version + 1,
      });
    }
    return result;
  },
});

const attemptArgs = {
  id: v.id("creatorWatches"),
  generation: v.number(),
  lease: v.string(),
  reservationKey: v.string(),
};
// Cleanup may outlive content authority. It remains bound to the original
// attempt and cannot allocate funds, start a run, or touch another run's IDs.
async function cleanupAttempt(
  ctx: MutationCtx,
  a: {
    id: Doc<"creatorWatches">["_id"];
    generation: number;
    lease: string;
    reservationKey: string;
  },
) {
  const watch = await ctx.db.get(a.id);
  ensure(
    watch &&
      watch.supplierAttempt?.generation === a.generation &&
      watch.supplierAttempt.lease === a.lease &&
      watch.supplierAttempt.reservationKey === a.reservationKey &&
      watch.reservationKey === a.reservationKey &&
      watch.supplierAttempt.cleanupDeadline > Date.now(),
    "APPROVAL_STALE",
    "Discovery attempt changed or cleanup window ended.",
  );
  const reservation = await ctx.db
    .query("inferenceReservations")
    .withIndex("by_key", (q) => q.eq("key", a.reservationKey))
    .unique();
  ensure(
    reservation &&
      ["social_discovery_reserved", "social_discovery_unknown"].includes(
        reservation.state,
      ),
    "COST_RECONCILIATION_REQUIRED",
    "Discovery hold is unavailable.",
  );
  return watch;
}
export const operation = internalMutation({
  args: { ...attemptArgs, operation: v.string() },
  handler: async (ctx, a) => {
    const cleanup = [
      "abort",
      "delete_dataset",
      "delete_store",
      "delete_queue",
      "delete_run",
    ].includes(a.operation);
    const watch = cleanup
      ? await cleanupAttempt(ctx, a)
      : (await currentClaim(ctx, a)).watch;
    ensure(
      Object.hasOwn(creatorOperationLimits, a.operation),
      "INVALID_INPUT",
      "Unknown supplier operation.",
    );
    const kind = a.operation as CreatorOperation;
    const counts = watch.supplierOperations ?? {};
    const count = counts[kind] ?? 0;
    ensure(
      Number.isSafeInteger(count) &&
        count >= 0 &&
        count < creatorOperationLimits[kind],
      "QUOTA_EXCEEDED",
      "The supplier attempt reached its physical request bound.",
    );
    ensure(
      kind === "start" ? !watch.supplierRun : !!watch.supplierRun,
      "APPROVAL_STALE",
      "Supplier run binding is unavailable.",
    );
    await ctx.db.patch(watch._id, {
      supplierOperations: { ...counts, [kind]: count + 1 },
      supplierCleanup: "pending",
    });
  },
});
export const recordRun = internalMutation({
  args: {
    ...attemptArgs,
    run: v.object({
      id: v.string(),
      actorId: v.string(),
      buildId: v.string(),
      datasetId: v.string(),
      storeId: v.string(),
      queueId: v.string(),
      status: v.string(),
    }),
  },
  handler: async (ctx, a) => {
    const watch = await cleanupAttempt(ctx, a);
    const prior = watch.supplierRun;
    ensure(
      Object.values(a.run).every((value) =>
        /^[a-zA-Z0-9_-]{1,100}$/.test(value),
      ) &&
        (!prior ||
          ["id", "actorId", "buildId", "datasetId", "storeId", "queueId"].every(
            (key) =>
              prior[key as keyof typeof prior] ===
              a.run[key as keyof typeof a.run],
          )),
      "POLICY_BLOCKED",
      "Supplier run identity changed.",
    );
    ensure(
      (watch.supplierOperations?.start ?? 0) === 1,
      "POLICY_BLOCKED",
      "A supplier run needs its durable dispatch receipt.",
    );
    await ctx.db.patch(watch._id, {
      supplierRun: a.run,
      supplierCleanup: "pending",
    });
  },
});
export const recordCleanup = internalMutation({
  args: { ...attemptArgs, confirmed: v.boolean() },
  handler: async (ctx, a) => {
    const watch = await cleanupAttempt(ctx, a);
    const counts = watch.supplierOperations ?? {};
    ensure(
      !a.confirmed ||
        (watch.supplierRun &&
          [
            "delete_dataset",
            "delete_store",
            "delete_queue",
            "delete_run",
          ].every((kind) => counts[kind as CreatorOperation] === 1)),
      "POLICY_BLOCKED",
      "Cleanup confirmation needs every owned storage deletion.",
    );
    await ctx.db.patch(watch._id, {
      supplierCleanup: a.confirmed ? "confirmed" : "unknown",
    });
  },
});
export const retainUnknown = internalMutation({
  args: {
    id: v.id("creatorWatches"),
    generation: v.number(),
    lease: v.string(),
    reservationKey: v.string(),
  },
  handler: async (ctx, a) => {
    const watch = await ctx.db.get(a.id);
    if (
      !watch ||
      (watch.supplierAttempt
        ? watch.supplierAttempt.generation !== a.generation ||
          watch.supplierAttempt.lease !== a.lease
        : watch.generation !== a.generation || watch.lease !== a.lease) ||
      watch.reservationKey !== a.reservationKey
    )
      return;
    const reservation = await ctx.db
      .query("inferenceReservations")
      .withIndex("by_key", (q) => q.eq("key", a.reservationKey))
      .unique();
    if (reservation?.state === "social_discovery_reserved")
      await ctx.db.patch(reservation._id, {
        state: "social_discovery_unknown",
      });
    await ctx.db.patch(watch._id, {
      state: "paused",
      leaseUntil: 0,
      incomplete: true,
      updatedAt: Date.now(),
    });
    return { usage: "unknown_retained", automaticRetry: false };
  },
});
