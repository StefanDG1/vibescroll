import { assistantGrant } from "./assistantPrincipal";
import { isAssistantIdentity } from "../../packages/policy/assistant";
import type { QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { ensure } from "../../packages/policy";
import { usageOverview } from "../../packages/billing/usage-overview";
import { processingAccountOutput } from "../../packages/contracts/processing-account";
import {
  readAdminProcessingAllowance,
  adminProcessingAllowancePeriod,
} from "./adminProcessingAllowance";
import { preparedServiceConfiguration } from "./preparedServicePolicy";
import { requireAccountPro } from "./accountSubscription";
import { paidProcessingCapacity } from "./paidProcessing";
import { processingAdmission } from "./processingAdmission";

export async function processingAccountSummary(
  ctx: QueryCtx,
  actor: Doc<"users">,
) {
  const admin = await readAdminProcessingAllowance(ctx, actor);
  const config = preparedServiceConfiguration(actor.subject, true);
  const legacy = config?.legacyOwnerFundingOrganizationId
    ? ctx.db.normalizeId(
        "organizations",
        config.legacyOwnerFundingOrganizationId,
      )
    : null;
  const organization = admin
    ? await ctx.db.get(admin.organizationId)
    : legacy
      ? await ctx.db.get(legacy)
      : await requireAccountPro(ctx, actor);
  ensure(
    organization?.status === "active" &&
      organization.createdBy === actor._id &&
      organization.memberSubscriptionPolicy !== "individual_pro_v1",
    "PERSONAL_FUNDING_REQUIRED",
    "Use your own processing account.",
  );
  const membership = await ctx.db
    .query("memberships")
    .withIndex("by_pair", (q) =>
      q.eq("organizationId", organization._id).eq("userId", actor._id),
    )
    .unique();
  ensure(
    membership?.role === "owner" &&
      (organization.privateOwnerId === actor._id ||
        (!organization.privateOwnerId &&
          (legacy === organization._id ||
            admin?.organizationId === organization._id))),
    "PERSONAL_FUNDING_REQUIRED",
    "Your current owned processing account is required.",
  );
  const [wallet, pools] = await Promise.all([
    ctx.db
      .query("wallets")
      .withIndex("by_org", (q) => q.eq("organizationId", organization._id))
      .unique(),
    ctx.db
      .query("creditPools")
      .withIndex("by_org", (q) => q.eq("organizationId", organization._id))
      .take(257),
  ]);
  ensure(
    pools.length < 257,
    "COST_RECONCILIATION_REQUIRED",
    "The account summary needs bounded reconciliation.",
  );
  const usage = usageOverview({ wallet, pools, entries: [] });
  ensure(
    usage,
    "COST_RECONCILIATION_REQUIRED",
    "The current credit balance is unavailable.",
  );
  let processing = await processingAdmission(ctx, actor, organization._id);
  if (processing.allowed && usage.available < 1)
    processing = {
      allowed: false,
      reason: "INSUFFICIENT_CREDITS",
      message: "No unexpired credits are available for fresh preparation.",
      dimension: "credits",
      retryAt: admin ? adminProcessingAllowancePeriod().end : null,
      limit: null,
      used: null,
    };
  if (
    processing.allowed &&
    (admin || config?.paidCustomer) &&
    !(
      await paidProcessingCapacity(
        ctx,
        Math.ceil((config?.maximumDurationMs ?? 600000) * 27.78),
      )
    )?.available
  )
    processing = {
      allowed: false,
      reason: "BUDGET_EXCEEDED",
      message:
        "Provider processing capacity is temporarily unavailable. Existing credits and saved results are preserved.",
      dimension: "provider",
      retryAt: null,
      limit: null,
      used: null,
    };
  return processingAccountOutput.parse({
    version: "processing-account-v1",
    availableCredits: usage.available,
    reservedCredits: usage.reserved,
    expiredReservedCredits: usage.expiredReserved,
    observedAt: Date.now(),
    nextExpiry: usage.nextExpiry,
    allowanceKind: admin ? "admin" : wallet?.tier === "pro" ? "paid" : "legacy",
    monthlyAllowance: admin?.monthlyCredits ?? null,
    nextRenewal: admin ? adminProcessingAllowancePeriod().end : null,
    processing,
    reviewUrl: `https://scroll.companynerve.com/app/${organization._id}/usage`,
  });
}

// Optional presentation data must never break job status or widen a library-only
// grant. The dedicated account tool requires the same processing scope.
export async function optionalProcessingAccountSummary(
  ctx: QueryCtx,
  actor: Doc<"users">,
  organizationId: Doc<"organizations">["_id"],
) {
  try {
    if (isAssistantIdentity(await ctx.auth.getUserIdentity()))
      await assistantGrant(ctx, organizationId, "analysis:request");
    return await processingAccountSummary(ctx, actor);
  } catch {
    return null;
  }
}
