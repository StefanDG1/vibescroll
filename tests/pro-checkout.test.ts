import { convexTest } from "convex-test";
import { afterEach, expect, it, vi } from "vitest";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { wallet } from "../convex/product";
import { proOffer } from "../packages/billing/pro-offer";
import { billingReadiness } from "../packages/providers/billing-readiness";
import { policyRelease } from "../packages/policy/publication";

const mocks = vi.hoisted(() => ({
  account: vi.fn(),
  price: vi.fn(),
  subscriptions: vi.fn(),
  checkout: vi.fn(),
  portalConfig: vi.fn(),
  portalSession: vi.fn(),
}));
vi.mock("stripe", () => ({
  default: class {
    accounts = { retrieve: mocks.account };
    prices = { retrieve: mocks.price };
    subscriptions = { list: mocks.subscriptions };
    checkout = { sessions: { create: mocks.checkout } };
    billingPortal = {
      configurations: { retrieve: mocks.portalConfig },
      sessions: { create: mocks.portalSession },
    };
  },
}));
const modules = import.meta.glob("../convex/**/*.ts");
const config = {
  version: proOffer.version,
  mode: "test",
  accountId: "acct_pro_test",
  activation: "sandbox",
  prices: {
    weekly: "price_week",
    monthly: "price_month",
    annual: "price_year",
  },
};
const env = {
  STRIPE_MODE: "test",
  STRIPE_ACCOUNT_ID: config.accountId,
  STRIPE_SECRET_KEY: "rk_test_synthetic",
  STRIPE_BILLING_ROUTE: "managed_payments",
  STRIPE_V1_WEBHOOK_SECRET: "whsec_synthetic",
  STRIPE_PORTAL_CONFIG_ID: "bpc_synthetic",
  STRIPE_PRO_PORTAL_CONFIG_ID: "bpc_pro_synthetic",
  APP_URL: "https://example.test",
  STRIPE_PRO_CREDIT_POLICY_V2_JSON: JSON.stringify(config),
};
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});
async function setup(
  interval: "weekly" | "monthly" | "annual" = "monthly",
  personal = true,
) {
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  const t = convexTest(schema, modules);
  await t.mutation(internal.accounts.syncUser, {
    subject: "pro-checkout",
    email: "pro@example.test",
    name: "Synthetic",
  });
  const user = t.withIdentity({ subject: "pro-checkout" });
  const organizationId = personal
    ? await user.mutation(api.organizations.createPrivate, {})
    : await user.mutation(api.organizations.create, { name: "Synthetic team" });
  await t.mutation(internal.billing.attach, {
    organizationId,
    customerId: "cus_synthetic",
  });
  mocks.account.mockResolvedValue({ id: config.accountId });
  mocks.portalConfig.mockResolvedValue({
    active: true,
    livemode: false,
    features: {
      subscription_update: { enabled: false },
      subscription_cancel: { enabled: true },
      payment_method_update: { enabled: true },
      invoice_history: { enabled: true },
    },
  });
  mocks.portalSession.mockResolvedValue({
    url: "https://billing.stripe.com/synthetic",
  });
  const price = {
    id: config.prices[interval],
    active: true,
    livemode: false,
    currency: "eur",
    unit_amount: proOffer[interval].amountCents,
    tax_behavior: "inclusive",
    recurring: {
      interval:
        interval === "weekly"
          ? "week"
          : interval === "annual"
            ? "year"
            : "month",
      interval_count: 1,
    },
    metadata: {
      product: "vibescroller",
      tier: "pro",
      interval,
      policy: proOffer.version,
    },
  };
  mocks.price.mockResolvedValue(price);
  mocks.subscriptions.mockResolvedValue({ data: [], has_more: false });
  mocks.checkout.mockResolvedValue({
    url: "https://checkout.stripe.com/synthetic",
  });
  return {
    t,
    user,
    price,
    organizationId,
    args: {
      organizationId,
      tier: "pro" as const,
      interval,
      country: "RO",
      termsAccepted: true,
      immediateService: false,
    },
  };
}

it("allows a new unpaid onboarding account to open checkout without granting Pro or processing", async () => {
  const { t, user, args } = await setup();
  await t.run(async (ctx) => {
    const actor = await ctx.db.query("users").withIndex("by_subject", (q) => q.eq("subject", "pro-checkout")).unique();
    await ctx.db.patch(actor!._id, { onboarding: { version: 1, stage: "paywall", goal: "build_faster", interests: ["coding"], updatedAt: Date.now() } });
  });
  await expect(user.action(api.billingV1.checkout, args)).resolves.toBe("https://checkout.stripe.com/synthetic");
  expect(mocks.checkout).toHaveBeenCalledTimes(1);
  expect((await user.query(api.onboarding.status, {})).paid).toBe(false);
  expect(await t.run((ctx) => ctx.db.query("billingPeriods").first())).toBeNull();
  expect(await t.run((ctx) => ctx.db.query("reservations").first())).toBeNull();
});
it.each(["weekly", "monthly", "annual"] as const)(
  "opens exact %s Pro checkout and reuses its intent",
  async (interval) => {
    const { t, user, args } = await setup(interval);
    const catalogue = await user.query(api.commerce.catalogue, {});
    expect(catalogue.proOffer.configured).toBe(true);
    expect(catalogue.sandboxEnabled).toBe(true);
    await user.action(api.billingV1.checkout, args);
    await user.action(api.billingV1.checkout, args);
    const [request, options] = mocks.checkout.mock.calls[0];
    expect(request.line_items).toEqual([
      { price: config.prices[interval], quantity: 1 },
    ]);
    expect(request.managed_payments).toEqual({ enabled: true });
    expect(request.metadata.creditPolicy).toBe(proOffer.version);
    expect(request.metadata.termsVersion).toBe(policyRelease.id);
    expect(request.subscription_data.metadata.creditPolicy).toBe(
      proOffer.version,
    );
    expect(request.metadata.checkoutKey).toBe(options.idempotencyKey);
    expect(mocks.checkout.mock.calls[1][1].idempotencyKey).toBe(
      options.idempotencyKey,
    );
    expect(
      await t.run(async (ctx) => ctx.db.query("billingPeriods").first()),
    ).toBeNull();
  },
);

it("refuses Starter, team funding, duplicate subscriptions, partial snapshots and missing terms", async () => {
  const { user, args } = await setup();
  await expect(
    user.action(api.billingV1.checkout, { ...args, tier: "starter" }),
  ).rejects.toThrow("personal account");
  await expect(
    user.action(api.billingV1.checkout, { ...args, termsAccepted: false }),
  ).rejects.toThrow("Accept the displayed");
  mocks.subscriptions.mockResolvedValue({
    data: [{ status: "active" }],
    has_more: false,
  });
  await expect(user.action(api.billingV1.checkout, args)).rejects.toThrow(
    "current subscription",
  );
  mocks.subscriptions.mockResolvedValue({ data: [], has_more: true });
  await expect(user.action(api.billingV1.checkout, args)).rejects.toThrow(
    "existing subscriptions",
  );
  const team = await setup("monthly", false);
  await expect(
    team.user.action(api.billingV1.checkout, team.args),
  ).rejects.toThrow("personal account");
  expect(mocks.checkout).not.toHaveBeenCalled();
});

it("refuses wrong provider, mode, amount, policy and inactive prices before a session", async () => {
  const { user, args, price } = await setup();
  mocks.account.mockResolvedValueOnce({ id: "acct_other" });
  await expect(user.action(api.billingV1.checkout, args)).rejects.toThrow(
    "does not match",
  );
  for (const replacement of [
    { ...price, livemode: true },
    { ...price, unit_amount: 3900 },
    { ...price, metadata: { ...price.metadata, policy: "unreviewed" } },
    { ...price, active: false },
  ]) {
    mocks.price.mockResolvedValueOnce(replacement);
    await expect(user.action(api.billingV1.checkout, args)).rejects.toThrow();
  }
  expect(mocks.checkout).not.toHaveBeenCalled();
});

it("does not mint a hosted trial after activation and preserves an existing wallet exactly", async () => {
  const { t, organizationId } = await setup();
  const fresh = await t.run((ctx) => wallet(ctx, organizationId));
  expect(fresh.granted).toBe(0);
  expect(fresh.purchased).toBe(0);
  await t.run((ctx) =>
    ctx.db.patch(fresh._id, {
      granted: 600,
      purchased: 211,
      spent: 12,
      reserved: 10,
    }),
  );
  const before = await t.run((ctx) => ctx.db.get(fresh._id));
  expect(await t.run((ctx) => wallet(ctx, organizationId))).toEqual(before);
});

it("retains legacy checkout before activation and needs no six legacy prices for the new offer", async () => {
  const { t, user, args, price } = await setup();
  expect(billingReadiness(env).sandboxEnabled).toBe(true);
  vi.stubEnv("STRIPE_PRO_CREDIT_POLICY_V2_JSON", "");
  expect((await t.query(api.commerce.catalogue, {})).proOffer.configured).toBe(
    false,
  );
  vi.stubEnv("STRIPE_PRO_MONTHLY_PRICE_ID", "price_legacy");
  mocks.price.mockResolvedValue({
    ...price,
    id: "price_legacy",
    unit_amount: 3900,
  });
  await user.action(api.billingV1.checkout, args);
  expect(mocks.checkout.mock.calls[0][0].line_items).toEqual([
    { price: "price_legacy", quantity: 1 },
  ]);
});

it("leaves live new-offer checkout closed without existing publication checks", () => {
  const live = {
    ...env,
    STRIPE_MODE: "live",
    STRIPE_SECRET_KEY: "rk_live_synthetic",
    STRIPE_PRO_CREDIT_POLICY_V2_JSON: JSON.stringify({
      ...config,
      mode: "live",
      activation: "reviewed_live",
    }),
  };
  expect(billingReadiness(live).catalogueConfigured).toBe(true);
  expect(billingReadiness(live).liveEnabled).toBe(false);
});

it("uses a separate safe portal and refuses obsolete-price switching before checkout", async () => {
  const { user, args } = await setup();
  await user.action(api.payments.portal, {
    organizationId: args.organizationId,
  });
  expect(mocks.portalSession.mock.calls[0][0].configuration).toBe(
    env.STRIPE_PRO_PORTAL_CONFIG_ID,
  );
  mocks.portalConfig.mockResolvedValue({
    active: true,
    livemode: false,
    features: {
      subscription_update: { enabled: true },
      subscription_cancel: { enabled: true },
      payment_method_update: { enabled: true },
      invoice_history: { enabled: true },
    },
  });
  await expect(user.action(api.billingV1.checkout, args)).rejects.toThrow(
    "preserve the selected offer",
  );
  await expect(
    user.action(api.payments.portal, { organizationId: args.organizationId }),
  ).rejects.toThrow("preserve the selected offer");
  expect(mocks.checkout).not.toHaveBeenCalled();
  vi.stubEnv("STRIPE_PRO_PORTAL_CONFIG_ID", "");
  expect(billingReadiness(process.env).sandboxEnabled).toBe(false);
});
