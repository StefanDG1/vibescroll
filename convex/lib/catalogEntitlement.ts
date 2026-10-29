import type { QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { billingFor } from "./billingAccess";
import { isPaid } from "../../packages/company-config";
import { ensure } from "../../packages/policy";
import { queryRead } from "./knowledgeReadContext";
import { cloudCatalogAlphaAccess } from "../../packages/contracts/cloud-catalog";

// Port the existing main candidate's verified Pro check. Call only after the
// caller's current workspace access has been established; a cache key is not access.
export async function requireProCatalogAccess(
  ctx: QueryCtx,
  organizationId: Id<"organizations">,
) {
  return queryRead(ctx, `catalog-entitlement:${organizationId}`, async () => {
    const now = Date.now();
    // A finite operator test entitlement is distinct from paid Pro. Never
    // manufacture a billing subscription or wallet to exercise shared reuse.
    if (process.env.RESTORE_LOCK !== "true") {
      let alpha;
      try {
        alpha = cloudCatalogAlphaAccess.parse(
          JSON.parse(process.env.CLOUD_CATALOG_ALPHA_ACCESS_JSON ?? "null"),
        );
      } catch {
        alpha = null;
      }
      if (
        alpha &&
        alpha.reviewedAt <= now &&
        alpha.expiresAt > now &&
        alpha.expiresAt - alpha.reviewedAt <= 90 * 86400000
      ) {
        const organization = await ctx.db.get(organizationId);
        const owner = organization?.privateOwnerId
          ? await ctx.db.get(organization.privateOwnerId)
          : null;
        if (
          organization?.status === "active" &&
          owner?.status === "active" &&
          owner.profileVerifiedAt !== undefined &&
          owner.profileVerifiedAt <= now &&
          alpha.subjects.includes(owner.subject)
        )
          return null;
      }
    }
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
