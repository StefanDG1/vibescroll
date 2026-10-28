import type { QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { billingFor } from "../lib";
import { isPaid } from "../../packages/company-config";
import { ensure } from "../../packages/policy";
import { queryRead } from "./knowledgeReadContext";

// Port the existing main candidate's verified Pro check. Call only after the
// caller's current workspace access has been established; a cache key is not access.
export async function requireProCatalogAccess(
  ctx: QueryCtx,
  organizationId: Id<"organizations">,
) {
  return queryRead(ctx, `catalog-entitlement:${organizationId}`, async () => {
    const now = Date.now();
    const billing = await billingFor(ctx, organizationId);
    const wallet = await ctx.db
      .query("wallets")
      .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
      .unique();
    const periods =
      billing?.subscriptionId && wallet
        ? await ctx.db
            .query("billingPeriods")
            .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
            .order("desc")
            .take(5)
        : [];
    const period = periods.find(
      (row) =>
        row.subscription === billing?.subscriptionId &&
        row.end === wallet?.periodEnd &&
        row.start <= now &&
        row.end > now,
    );
    ensure(
      isPaid(billing, now) &&
        billing!.verifiedAt <= now &&
        billing!.providerDeletedAt === undefined &&
        wallet?.tier === "pro" &&
        Number.isFinite(wallet.periodEnd) &&
        wallet.periodEnd > now &&
        wallet.periodEnd <= billing!.periodEnd &&
        !!period,
      "FORBIDDEN",
      "Current verified Pro access is required for the insight catalog.",
    );
    return null;
  });
}
