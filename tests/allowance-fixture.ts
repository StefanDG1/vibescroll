import type { TestConvex } from "convex-test";
import type { FunctionArgs } from "convex/server";
import type Stripe from "stripe";
import { vi } from "vitest";
import schema from "../convex/schema";
import { internal } from "../convex/_generated/api";
import { resolveAllowancePolicy } from "../packages/billing/allowance-policy";

type Grant = FunctionArgs<typeof internal.commerce.grantPeriod>;
export function allowanceFixturePolicy(
  tier: Grant["tier"],
  interval: Grant["interval"],
) {
  const cents =
    tier === "pro"
      ? interval === "weekly"
        ? 1199
        : 3900
      : interval === "weekly"
        ? 599
        : 1900;
  return resolveAllowancePolicy(
    {
      id: `price_fixture_${tier}_${interval}`,
      currency: "eur",
      tax_behavior: "inclusive",
      unit_amount: cents,
      recurring: {
        interval: interval === "weekly" ? "week" : "month",
        interval_count: 1,
      },
      metadata: { product: "vibescroller", catalogue: "1.1.0", tier, interval },
    } as unknown as Stripe.Price,
    `price_fixture_${tier}_${interval}`,
    { kind: "legacy_not_reconstructed" },
  );
}
// Test setup only: replace the old bare verifiedPayment boolean with explicit
// synthetic server-owned purchase evidence. Production has no fixture endpoint.
export async function preparePaidGrant<G extends Grant>(
  t: TestConvex<typeof schema>,
  a: G,
): Promise<G & { billingRevision: number | undefined }> {
  const account = process.env.STRIPE_ACCOUNT_ID || "acct_allowance_fixture";
  vi.stubEnv("STRIPE_ACCOUNT_ID", account);
  const mode = process.env.STRIPE_MODE === "live" ? "live" : "test";
  const interval = a.interval;
  const policy = allowanceFixturePolicy(a.tier, interval);
  const prepared = await t.run(async (ctx) => {
    let bill = await ctx.db
      .query("billing")
      .withIndex("by_org", (q) => q.eq("organizationId", a.organizationId))
      .unique();
    if (!bill) {
      const id = await ctx.db.insert("billing", {
        organizationId: a.organizationId,
        customerId: `cus_fixture_${a.organizationId}`,
        subscriptionId: a.subscription,
        status: "active",
        periodEnd: a.end,
        verifiedAt: Date.now(),
        revision: 0,
        appliedRevision: 0,
      });
      bill = (await ctx.db.get(id))!;
    }
    let commitment = bill.paidAllowance;
    if (
      !commitment ||
      commitment.subscriptionId !== a.subscription ||
      commitment.paidStart !== a.start ||
      commitment.paidEnd !== a.end
    ) {
      commitment = {
        version: "paid-allowance-v1",
        providerAccountId: account,
        mode,
        subscriptionId: a.subscription,
        itemId: "si_fixture",
        paidStart: a.start,
        paidEnd: a.end,
        anchor: a.start,
        base: {
          policy,
          invoiceId: a.invoiceId ?? `in_fixture_${a.subscription}_${a.start}`,
        },
      };
    } else if (
      policy.creditsPerGrant > commitment.base.policy.creditsPerGrant &&
      !commitment.upgradeChangeId
    ) {
      if (a.upgradeAt === undefined || !a.invoiceId)
        throw Error("Synthetic upgrade requires its paid quote");
      const id = await ctx.db.insert("billingChanges", {
        organizationId: a.organizationId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        subscriptionId: a.subscription,
        itemId: commitment.itemId,
        oldPrice: commitment.base.policy.priceId,
        newPrice: policy.priceId,
        tier: a.tier,
        interval,
        prorationDate: a.upgradeAt / 1000,
        periodStart: a.start / 1000,
        periodEnd: a.end / 1000,
        amount: 1000,
        currency: "eur",
        expiresAt: a.end,
        state: "applied",
        invoiceId: a.invoiceId,
        sourcePolicy: commitment.base.policy,
        targetPolicy: policy,
      });
      commitment = { ...commitment, upgradeChangeId: id };
    } else if (
      policy.creditsPerGrant <
      (commitment.upgradeChangeId
        ? (await ctx.db.get(commitment.upgradeChangeId))!.targetPolicy!
            .creditsPerGrant
        : commitment.base.policy.creditsPerGrant)
    ) {
      return { ...a, billingRevision: undefined };
    }
    const revision = a.billingRevision ?? bill.appliedRevision ?? 0;
    await ctx.db.patch(bill._id, {
      subscriptionId: a.subscription,
      status: "active",
      periodEnd: a.end,
      paidAllowance: commitment,
      verifiedAt: Date.now(),
      appliedRevision: revision,
    });
    return { ...a, billingRevision: revision };
  });
  return prepared as G & { billingRevision: number | undefined };
}
export async function grantPaidPeriod(t: TestConvex<typeof schema>, a: Grant) {
  const at = Math.max(Date.now(), a.start, a.upgradeAt ?? 0);
  const clock =
    at > Date.now() ? vi.spyOn(Date, "now").mockReturnValue(at) : null;
  try {
    return await t.mutation(
      internal.commerce.grantPeriod,
      await preparePaidGrant(t, a),
    );
  } finally {
    clock?.mockRestore();
  }
}
