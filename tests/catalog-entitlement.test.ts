import { afterEach, expect, it, vi } from "vitest";
import { analysisVersionFixture } from "./analysis-version-fixture";
import { requireProCatalogAccess } from "../convex/lib/catalogEntitlement";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
async function entitled() {
  const f = await analysisVersionFixture();
  const now = Date.now(),
    end = now + 86400000;
  const records = await f.t.run(async (ctx) => {
    const wallet = await ctx.db
      .query("wallets")
      .withIndex("by_org", (q) => q.eq("organizationId", f.org))
      .unique();
    const walletId = wallet
      ? wallet._id
      : await ctx.db.insert("wallets", {
          organizationId: f.org,
          createdAt: now,
          updatedAt: now,
          granted: 0,
          spent: 0,
          reserved: 0,
          periodEnd: end,
          tier: "pro",
          interval: "monthly",
          purchased: 0,
        });
    if (wallet) await ctx.db.patch(walletId, { tier: "pro", periodEnd: end });
    const billingId = await ctx.db.insert("billing", {
      organizationId: f.org,
      customerId: "synthetic-customer",
      subscriptionId: "synthetic-subscription",
      status: "active",
      periodEnd: end,
      verifiedAt: now,
      revision: 1,
    });
    const periodId = await ctx.db.insert("billingPeriods", {
      organizationId: f.org,
      createdAt: now,
      updatedAt: now,
      key: "synthetic-period",
      start: now - 1000,
      end,
      credits: 0,
      subscription: "synthetic-subscription",
    });
    return { walletId, billingId, periodId };
  });
  return { ...f, ...records, now, end };
}
it("requires fresh verified Pro billing, its wallet and the same current provider period", async () => {
  const f = await entitled();
  await expect(
    f.t.run((ctx) => requireProCatalogAccess(ctx, f.org)),
  ).resolves.toBeNull();
});
it.each([
  "stale",
  "future",
  "deleted",
  "cancelled",
  "expired",
  "free_wallet",
  "wallet_overrun",
  "missing_period",
  "wrong_subscription",
  "future_period",
  "mismatched_period",
])(
  "denies catalog reuse after %s without trusting an existing cached result",
  async (failure) => {
    const f = await entitled();
    await f.t.run(async (ctx) => {
      if (failure === "stale")
        await ctx.db.patch(f.billingId, { verifiedAt: f.now - 86400000 });
      if (failure === "future")
        await ctx.db.patch(f.billingId, { verifiedAt: f.now + 100000 });
      if (failure === "deleted")
        await ctx.db.patch(f.billingId, { providerDeletedAt: f.now });
      if (failure === "cancelled")
        await ctx.db.patch(f.billingId, { status: "canceled" });
      if (failure === "expired")
        await ctx.db.patch(f.billingId, { periodEnd: f.now - 1 });
      if (failure === "free_wallet")
        await ctx.db.patch(f.walletId, { tier: "free" });
      if (failure === "wallet_overrun")
        await ctx.db.patch(f.walletId, { periodEnd: f.end + 1000 });
      if (failure === "missing_period") await ctx.db.delete(f.periodId);
      if (failure === "wrong_subscription")
        await ctx.db.patch(f.periodId, {
          subscription: "another-subscription",
        });
      if (failure === "future_period")
        await ctx.db.patch(f.periodId, { start: f.now + 100000 });
      if (failure === "mismatched_period")
        await ctx.db.patch(f.periodId, { end: f.end - 1000 });
    });
    await expect(
      f.t.run((ctx) => requireProCatalogAccess(ctx, f.org)),
    ).rejects.toThrow(/FORBIDDEN/);
  },
);
