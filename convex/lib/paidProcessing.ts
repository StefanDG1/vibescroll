import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { paidProcessingConfiguration } from "../../packages/contracts/paid-processing";
import { ensure } from "../../packages/policy";
import { requireAccountPro } from "./accountSubscription";
import {
  providerFundingCapacity,
  providerFundingInitialized,
  reserveProviderExposure,
} from "./providerFunding";

export async function requirePaidProcessing(
  ctx: QueryCtx,
  actor: Doc<"users">,
  fundingOrganizationId?: Id<"organizations">,
) {
  const personal = await requireAccountPro(ctx, actor, true);
  ensure(
    !fundingOrganizationId || personal._id === fundingOrganizationId,
    "PERSONAL_FUNDING_REQUIRED",
    "Use your own Pro credit account.",
  );
  return personal;
}

export async function paidProcessingCapacity(
  ctx: QueryCtx,
  requiredNanoUsd?: number,
) {
  const p = paidProcessingConfiguration();
  if (!p || !process.env.VERCEL_AI_GATEWAY_API_KEY) return null;
  try {
    const media = JSON.parse(
      process.env.PREPARED_ANALYSIS_CONFIGURATION_JSON ?? "null",
    );
    const plans = JSON.parse(
      process.env.PROPOSAL_SERVICE_CONFIGURATION_JSON ?? "null",
    );
    if (
      media?.version !== "prepared-service-v1" ||
      !media.enabled ||
      !media.contributorAllowed ||
      !media.providerPermissionReference ||
      plans?.version !== "proposal-service-v1" ||
      !plans.enabled ||
      !plans.privateProjectContextAllowed ||
      !plans.permissionReference
    )
      return null;
  } catch {
    return null;
  }
  if (p.version === "paid-processing-monetary-v2") {
    const monetary = await providerFundingCapacity(ctx, p, requiredNanoUsd);
    return { policy: p, counter: null, ...monetary };
  }
  const counter = await ctx.db
    .query("proposalServiceCounters")
    .withIndex("by_policy", (q) => q.eq("policyId", `paid-funding:${p.id}`))
    .unique();
  return {
    policy: p,
    counter,
    // Once monetary accounting is live, downgrade cannot forget its exposure.
    available:
      !(await providerFundingInitialized(ctx)) &&
      (counter?.jobs ?? 0) < p.maximumJobs,
  };
}

export async function reservePaidProcessing(
  ctx: MutationCtx,
  binding?: {
    operationKey: string;
    requestHash: string;
    maximumNanoUsd: number;
  },
) {
  // Retained OpenAI/host routes can need no Gateway work. Their own authority
  // remains checked by that route and never draws from this Gateway pool.
  if (
    binding?.maximumNanoUsd === 0 &&
    paidProcessingConfiguration()?.version === "paid-processing-monetary-v2"
  )
    return null;
  const capacity = await paidProcessingCapacity(ctx);
  if (capacity?.policy.version === "paid-processing-monetary-v2") {
    ensure(
      binding,
      "INVALID_INPUT",
      "Monetary provider admission needs its existing operation binding.",
    );
    return reserveProviderExposure(ctx, capacity.policy, binding);
  }
  ensure(
    capacity?.available,
    "BUDGET_EXCEEDED",
    "Processing capacity is temporarily unavailable. Your credits have not been spent.",
  );
  if (capacity.counter)
    await ctx.db.patch(capacity.counter._id, {
      jobs: capacity.counter.jobs + 1,
    });
  else
    await ctx.db.insert("proposalServiceCounters", {
      policyId: `paid-funding:${capacity.policy.id}`,
      jobs: 1,
    });
  return null;
}
