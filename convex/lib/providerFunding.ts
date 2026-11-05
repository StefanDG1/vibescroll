import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import {
  paidProcessingConfiguration,
  type MonetaryProcessingPolicy,
} from "../../packages/contracts/paid-processing";
import { ensure } from "../../packages/policy";

// One lifetime Gateway pool. A configuration ID rollover never creates new money.
const pool = "paid-vercel-gateway-v1";
export async function providerFundingInitialized(ctx: QueryCtx) {
  return !!(await ctx.db
    .query("providerFundingPools")
    .withIndex("by_pool", (q) => q.eq("pool", pool))
    .unique());
}
export function safeNanoUsd(value: number): number {
  ensure(
    Number.isSafeInteger(value) && value >= 0,
    "BUDGET_EXCEEDED",
    "Provider accounting needs exact bounded integer amounts.",
  );
  return value;
}
async function fundingState(ctx: QueryCtx, policy: MonetaryProcessingPolicy) {
  const legacy = await ctx.db
    .query("proposalServiceCounters")
    .withIndex("by_policy", (q) =>
      q.gte("policyId", "paid-funding:").lt("policyId", "paid-funding;"),
    )
    .take(65);
  ensure(
    legacy.length < 65,
    "COST_RECONCILIATION_REQUIRED",
    "Legacy provider exposure needs a bounded review.",
  );
  let legacyExposureNanoUsd = policy.priorExposureNanoUsd;
  for (const counter of legacy)
    legacyExposureNanoUsd = safeNanoUsd(
      legacyExposureNanoUsd + safeNanoUsd(counter.jobs) * 50000000,
    );
  const account = await ctx.db
    .query("providerFundingPools")
    .withIndex("by_pool", (q) => q.eq("pool", pool))
    .unique();
  legacyExposureNanoUsd = Math.max(
    safeNanoUsd(account?.legacyExposureNanoUsd ?? 0),
    legacyExposureNanoUsd,
  );
  const limitNanoUsd = Math.min(
    policy.verifiedProviderCreditNanoUsd,
    policy.providerKeyBudgetNanoUsd,
    safeNanoUsd(policy.priorExposureNanoUsd + policy.operatingPoolNanoUsd),
    safeNanoUsd(account?.limitNanoUsd ?? Number.MAX_SAFE_INTEGER),
  );
  const heldNanoUsd = safeNanoUsd(account?.heldNanoUsd ?? 0);
  const spentNanoUsd = safeNanoUsd(account?.spentNanoUsd ?? 0);
  const exposureNanoUsd = safeNanoUsd(
    legacyExposureNanoUsd + heldNanoUsd + spentNanoUsd,
  );
  return {
    account,
    limitNanoUsd,
    legacyExposureNanoUsd,
    heldNanoUsd,
    spentNanoUsd,
    blocked: !!account?.blocked || exposureNanoUsd > limitNanoUsd,
    availableNanoUsd: Math.max(0, limitNanoUsd - exposureNanoUsd),
  };
}
export async function providerFundingCapacity(
  ctx: QueryCtx,
  policy: MonetaryProcessingPolicy,
  requiredNanoUsd = policy.maximumJobNanoUsd,
) {
  safeNanoUsd(requiredNanoUsd);
  const state = await fundingState(ctx, policy);
  return {
    available: !state.blocked && state.availableNanoUsd >= requiredNanoUsd,
    availableNanoUsd: state.availableNanoUsd,
    blocked: state.blocked,
  };
}
export async function reserveProviderExposure(
  ctx: MutationCtx,
  policy: MonetaryProcessingPolicy,
  input: {
    operationKey: string;
    requestHash: string;
    maximumNanoUsd: number;
  },
) {
  ensure(
    input.operationKey.length > 0 &&
      input.operationKey.length <= 300 &&
      /^[a-f0-9]{64}$/.test(input.requestHash),
    "INVALID_INPUT",
    "Use the existing operation binding for provider admission.",
  );
  safeNanoUsd(input.maximumNanoUsd);
  ensure(
    input.maximumNanoUsd > 0 &&
      input.maximumNanoUsd <= policy.maximumJobNanoUsd,
    "BUDGET_EXCEEDED",
    "The provider quote exceeds its funded envelope.",
  );
  const prior = await ctx.db
    .query("providerFundingReservations")
    .withIndex("by_pool_operation", (q) =>
      q.eq("pool", pool).eq("operationKey", input.operationKey),
    )
    .unique();
  if (prior) {
    ensure(
      prior.requestHash === input.requestHash &&
        prior.maximumNanoUsd === input.maximumNanoUsd,
      "IDEMPOTENCY_CONFLICT",
      "The provider operation binding changed.",
    );
    return prior._id;
  }
  const state = await fundingState(ctx, policy);
  ensure(
    !state.blocked && state.availableNanoUsd >= input.maximumNanoUsd,
    "BUDGET_EXCEEDED",
    "Verified provider capacity cannot cover this reservation.",
  );
  const now = Date.now();
  const updated = {
    pool,
    limitNanoUsd: state.limitNanoUsd,
    legacyExposureNanoUsd: state.legacyExposureNanoUsd,
    heldNanoUsd: safeNanoUsd(state.heldNanoUsd + input.maximumNanoUsd),
    spentNanoUsd: state.spentNanoUsd,
    blocked: state.blocked,
    updatedAt: now,
  };
  if (state.account) await ctx.db.patch(state.account._id, updated);
  else await ctx.db.insert("providerFundingPools", updated);
  return ctx.db.insert("providerFundingReservations", {
    pool,
    ...input,
    policyId: policy.id,
    state: "reserved",
    dispatches: [],
    createdAt: now,
    updatedAt: now,
  });
}
export async function markProviderDispatch(
  ctx: MutationCtx,
  reservationId: Id<"providerFundingReservations">,
  component: "analysis" | "transcription" | "proposal",
) {
  const row = await ctx.db.get(reservationId);
  const policy = paidProcessingConfiguration();
  ensure(
    row && policy?.version === "paid-processing-monetary-v2",
    "SETUP_REQUIRED",
    "Current provider funding authority is unavailable.",
  );
  const state = await fundingState(ctx, policy);
  ensure(
    !state.blocked,
    "BUDGET_EXCEEDED",
    "Provider exposure requires reconciliation before another dispatch.",
  );
  ensure(
    ["reserved", "dispatched"].includes(row.state) &&
      !row.dispatches.includes(component) &&
      row.dispatches.length < 2 &&
      (component === "proposal"
        ? row.dispatches.length === 0
        : !row.dispatches.includes("proposal")),
    "SOURCE_BUSY",
    "This provider dispatch is already used or uncertain.",
  );
  if (state.account)
    await ctx.db.patch(state.account._id, {
      limitNanoUsd: state.limitNanoUsd,
      legacyExposureNanoUsd: state.legacyExposureNanoUsd,
      updatedAt: Date.now(),
    });
  await ctx.db.patch(reservationId, {
    state: "dispatched",
    dispatches: [...row.dispatches, component],
    updatedAt: Date.now(),
  });
}
export async function settleProviderExposure(
  ctx: MutationCtx,
  reservationId: Id<"providerFundingReservations">,
  outcome:
    | {
        state: "known";
        actualNanoUsd: number;
        receiptHash: string;
        basis: "reported_tariff_usage";
      }
    | { state: "unused"; receiptHash: string }
    | { state: "unknown"; block?: boolean },
) {
  const row = await ctx.db.get(reservationId);
  ensure(
    row,
    "COST_RECONCILIATION_REQUIRED",
    "Provider reservation is unavailable.",
  );
  if (outcome.state === "unknown") {
    if (outcome.block) {
      const account = await ctx.db
        .query("providerFundingPools")
        .withIndex("by_pool", (q) => q.eq("pool", row.pool))
        .unique();
      if (account)
        await ctx.db.patch(account._id, {
          blocked: true,
          updatedAt: Date.now(),
        });
    }
    if (!["settled", "released"].includes(row.state))
      await ctx.db.patch(row._id, {
        state: "unknown",
        basis: "unknown",
        updatedAt: Date.now(),
      });
    return;
  }
  ensure(
    /^[a-f0-9]{64}$/.test(outcome.receiptHash),
    "INVALID_INPUT",
    "Provider reconciliation needs a bounded receipt hash.",
  );
  const actualNanoUsd =
    outcome.state === "known" ? safeNanoUsd(outcome.actualNanoUsd) : 0;
  if (["settled", "released"].includes(row.state)) {
    ensure(
      row.actualNanoUsd === actualNanoUsd &&
        row.receiptHash === outcome.receiptHash,
      "COST_RECONCILIATION_REQUIRED",
      "A terminal provider receipt cannot change.",
    );
    return;
  }
  if (outcome.state === "unused" && row.dispatches.length !== 0) {
    await ctx.db.patch(row._id, {
      state: "unknown",
      basis: "unknown",
      updatedAt: Date.now(),
    });
    return;
  }
  ensure(
    outcome.state !== "known" || row.dispatches.length > 0,
    "COST_RECONCILIATION_REQUIRED",
    "Known usage needs a committed dispatch binding.",
  );
  const account = await ctx.db
    .query("providerFundingPools")
    .withIndex("by_pool", (q) => q.eq("pool", row.pool))
    .unique();
  ensure(
    account && account.heldNanoUsd >= row.maximumNanoUsd,
    "COST_RECONCILIATION_REQUIRED",
    "Provider exposure totals require reconciliation.",
  );
  const heldNanoUsd = safeNanoUsd(
    safeNanoUsd(account.heldNanoUsd) - safeNanoUsd(row.maximumNanoUsd),
  );
  const spentNanoUsd = safeNanoUsd(account.spentNanoUsd + actualNanoUsd);
  await ctx.db.patch(account._id, {
    heldNanoUsd,
    spentNanoUsd,
    blocked:
      account.blocked ||
      actualNanoUsd > row.maximumNanoUsd ||
      safeNanoUsd(heldNanoUsd + spentNanoUsd + account.legacyExposureNanoUsd) >
        account.limitNanoUsd,
    updatedAt: Date.now(),
  });
  await ctx.db.patch(row._id, {
    state: outcome.state === "unused" ? "released" : "settled",
    actualNanoUsd,
    receiptHash: outcome.receiptHash,
    basis: outcome.state === "unused" ? "confirmed_zero" : outcome.basis,
    updatedAt: Date.now(),
  });
}
