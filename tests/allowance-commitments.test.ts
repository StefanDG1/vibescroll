import { afterEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import type Stripe from "stripe";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { monthlyAnchor, pricing } from "../packages/policy";
import {
  resolveAllowancePolicy,
  type AllowanceInterval,
  type AllowanceTier,
} from "../packages/billing/allowance-policy";

const mocks = vi.hoisted(() => ({
  account: vi.fn(),
  customer: vi.fn(),
  subscriptions: vi.fn(),
  price: vi.fn(),
  invoice: vi.fn(),
  checkout: vi.fn(),
  subscription: vi.fn(),
  updateSubscription: vi.fn(),
  preview: vi.fn(),
  schedule: vi.fn(),
  updateSchedule: vi.fn(),
}));
vi.mock("stripe", () => ({
  default: class {
    accounts = { retrieve: mocks.account };
    customers = { retrieve: mocks.customer };
    subscriptions = {
      list: mocks.subscriptions,
      retrieve: mocks.subscription,
      update: mocks.updateSubscription,
    };
    prices = { retrieve: mocks.price };
    invoices = { retrieve: mocks.invoice, createPreview: mocks.preview };
    subscriptionSchedules = {
      create: mocks.schedule,
      update: mocks.updateSchedule,
    };
    checkout = { sessions: { create: mocks.checkout } };
  },
}));
const modules = import.meta.glob("../convex/**/*.ts");
const initialTime = Date.UTC(2026, 0, 31, 12);
const originalProCredits = pricing.tiers.pro.monthly_credits;
afterEach(() => {
  pricing.tiers.pro.monthly_credits = originalProCredits;
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});
function price(
  tier: AllowanceTier = "pro",
  interval: AllowanceInterval = "annual",
) {
  return {
    id: `price_${tier}_${interval}`,
    active: true,
    livemode: false,
    currency: "eur",
    tax_behavior: "inclusive",
    unit_amount:
      tier === "pro"
        ? interval === "weekly"
          ? 1199
          : interval === "monthly"
            ? 3900
            : 39000
        : interval === "weekly"
          ? 599
          : interval === "monthly"
            ? 1900
            : 19000,
    recurring: {
      interval:
        interval === "weekly"
          ? "week"
          : interval === "annual"
            ? "year"
            : "month",
      interval_count: 1,
    },
    metadata: { product: "vibescroller", catalogue: "1.1.0", tier, interval },
  } as unknown as Stripe.Price;
}
function invoice(
  p: Stripe.Price,
  start: number,
  end: number,
  id = "in_base",
  proration = false,
) {
  return {
    id,
    status: "paid",
    livemode: false,
    customer: "cus_source",
    currency: "eur",
    amount_paid: p.unit_amount,
    parent: {
      type: "subscription_details",
      subscription_details: { subscription: "sub_source" },
    },
    lines: {
      has_more: false,
      data: [
        {
          amount: p.unit_amount,
          quantity: 1,
          parent: {
            type: "subscription_item_details",
            subscription_item_details: {
              subscription: "sub_source",
              subscription_item: "si_source",
              proration,
            },
          },
          pricing: { type: "price_details", price_details: { price: p.id } },
          period: { start: start / 1000, end: end / 1000 },
        },
      ],
    },
  } as unknown as Stripe.Invoice;
}
async function setup(
  tier: AllowanceTier = "pro",
  interval: AllowanceInterval = "annual",
  at = initialTime,
) {
  vi.useFakeTimers();
  vi.setSystemTime(at);
  vi.stubEnv("STRIPE_MODE", "test");
  vi.stubEnv("STRIPE_SECRET_KEY", "rk_test_synthetic");
  vi.stubEnv("STRIPE_ACCOUNT_ID", "acct_source");
  vi.stubEnv("STRIPE_BILLING_ROUTE", "managed_payments");
  vi.stubEnv("APP_URL", "https://example.test");
  for (const t of ["starter", "pro"] as const)
    for (const i of ["weekly", "monthly", "annual"] as const)
      vi.stubEnv(
        `STRIPE_${t.toUpperCase()}_${i.toUpperCase()}_PRICE_ID`,
        price(t, i).id,
      );
  mocks.account.mockResolvedValue({ id: "acct_source" });
  mocks.customer.mockResolvedValue({ id: "cus_source" });
  mocks.price.mockImplementation(async (id: string) => {
    const found = (["starter", "pro"] as const)
      .flatMap((t) =>
        (["weekly", "monthly", "annual"] as const).map((i) => price(t, i)),
      )
      .find((p) => p.id === id);
    if (!found) throw Error("Unknown synthetic price");
    return found;
  });
  const t = convexTest(schema, modules);
  await t.mutation(internal.accounts.syncUser, {
    subject: "allowance-owner",
    email: "allowance@example.test",
    name: "Owner",
  });
  const user = t.withIdentity({ subject: "allowance-owner" });
  const organizationId = await user.mutation(api.organizations.create, {
    name: "Allowance",
  });
  await t.mutation(internal.billing.attach, {
    organizationId,
    customerId: "cus_source",
  });
  const start = at,
    end =
      interval === "annual"
        ? monthlyAnchor(start, 12)
        : interval === "monthly"
          ? monthlyAnchor(start, 1)
          : start + 7 * 86400000;
  const p = price(tier, interval),
    paid = invoice(p, start, end);
  const invoices = new Map([[paid.id, paid]]);
  mocks.invoice.mockImplementation(async (id: string) => {
    const inv = invoices.get(id);
    if (!inv) throw Error("Unknown synthetic invoice");
    return inv;
  });
  const sub = {
    id: "sub_source",
    customer: "cus_source",
    livemode: false,
    status: "active",
    created: start / 1000,
    billing_cycle_anchor: start / 1000,
    cancel_at_period_end: false,
    pending_update: null,
    schedule: null,
    metadata: { product: "vibescroller" } as Record<string, string>,
    latest_invoice: paid,
    items: {
      has_more: false,
      data: [
        {
          id: "si_source",
          quantity: 1,
          current_period_start: start / 1000,
          current_period_end: end / 1000,
          price: p,
        },
      ],
    },
  };
  mocks.subscriptions.mockImplementation(async () => ({
    data: [sub],
    has_more: false,
  }));
  mocks.subscription.mockImplementation(async () => sub);
  const refresh = () =>
    t.action(internal.reconciliation.customer, { customerId: "cus_source" });
  const pools = () => t.run((ctx) => ctx.db.query("creditPools").collect());
  return {
    t,
    user,
    organizationId,
    start,
    end,
    p,
    paid,
    invoices,
    sub,
    refresh,
    pools,
  };
}

it("freezes reviewed quantities independently of presentation edits and rejects the future unapproved price", () => {
  pricing.tiers.pro.monthly_credits = 1;
  expect(
    resolveAllowancePolicy(price(), price().id, {
      kind: "legacy_not_reconstructed",
    }).creditsPerGrant,
  ).toBe(600);
  expect(
    resolveAllowancePolicy(price("starter"), price("starter").id, {
      kind: "legacy_not_reconstructed",
    }).creditsPerGrant,
  ).toBe(250);
  expect(() =>
    resolveAllowancePolicy({ ...price(), unit_amount: 35000 }, price().id, {
      kind: "legacy_not_reconstructed",
    }),
  ).toThrow("reviewed allowance");
});
it("preserves every remaining monthly annual grant, anchor and legacy evidence after a global edit and price-config rotation", async () => {
  const s = await setup();
  await s.refresh();
  pricing.tiers.pro.monthly_credits = 2;
  vi.stubEnv("STRIPE_PRO_ANNUAL_PRICE_ID", "price_future_unapproved");
  for (let month = 1; month < 12; month++) {
    vi.setSystemTime(monthlyAnchor(s.start, month));
    await s.refresh();
    await s.refresh();
  }
  const periods = await s.t.run((ctx) =>
    ctx.db.query("billingPeriods").collect(),
  );
  expect(periods).toHaveLength(12);
  expect(
    periods.every(
      (p) =>
        p.credits === 600 &&
        p.allowancePolicy?.creditsPerGrant === 600 &&
        p.allowancePolicy.acceptance.kind === "legacy_not_reconstructed",
    ),
  ).toBe(true);
  expect(
    (await s.pools())
      .filter((p) => p.kind === "included")
      .reduce((n, p) => n + p.granted, 0),
  ).toBe(7200);
  s.sub.items.data[0].current_period_start = s.end / 1000;
  s.sub.items.data[0].current_period_end = monthlyAnchor(s.end, 12) / 1000;
  s.sub.latest_invoice = invoice(
    s.p,
    s.end,
    monthlyAnchor(s.end, 12),
    "in_renewal",
  );
  vi.setSystemTime(s.end);
  await s.refresh();
  expect(
    (await s.pools()).filter((p) => p.kind === "included").at(-1)?.granted,
  ).toBe(600);
});
it.each(["weekly", "monthly"] as const)(
  "preserves the %s Starter contract",
  async (interval) => {
    const s = await setup("starter", interval);
    await s.refresh();
    await s.refresh();
    expect(
      (await s.pools()).filter((p) => p.kind === "included"),
    ).toMatchObject([
      { granted: interval === "weekly" ? 65 : 250, expiresAt: s.end },
    ]);
  },
);
it.each([
  "multiple_items",
  "wrong_quantity",
  "partial_items",
  "partial_subscriptions",
  "wrong_customer",
  "wrong_mode",
  "wrong_price_mode",
  "wrong_catalogue",
  "wrong_recurrence",
  "unknown_price",
  "unpaid_invoice",
  "partial_invoice",
  "wrong_line_price",
  "wrong_line_period",
])("holds %s without changing issued pools", async (scenario) => {
  const s = await setup();
  await s.refresh();
  const before = await s.pools();
  if (scenario === "multiple_items")
    s.sub.items.data.push({ ...s.sub.items.data[0] });
  if (scenario === "wrong_quantity") s.sub.items.data[0].quantity = 2;
  if (scenario === "partial_items") s.sub.items.has_more = true;
  if (scenario === "partial_subscriptions")
    mocks.subscriptions.mockResolvedValue({ data: [s.sub], has_more: true });
  if (scenario === "wrong_customer") s.sub.customer = "cus_other";
  if (scenario === "wrong_mode") s.sub.livemode = true;
  if (scenario === "wrong_price_mode")
    s.sub.items.data[0].price.livemode = true;
  if (scenario === "wrong_catalogue")
    s.sub.items.data[0].price.metadata.catalogue = "unknown";
  if (scenario === "wrong_recurrence")
    s.sub.items.data[0].price.recurring!.interval_count = 2;
  if (scenario === "unknown_price")
    s.sub.items.data[0].price.id = "price_unknown";
  if (scenario === "unpaid_invoice") s.paid.status = "open";
  if (scenario === "partial_invoice") s.paid.lines.has_more = true;
  if (scenario === "wrong_line_price")
    s.paid.lines.data[0].pricing!.price_details!.price = "price_other";
  if (scenario === "wrong_line_period") s.paid.lines.data[0].period.end--;
  vi.setSystemTime(monthlyAnchor(s.start, 1));
  await s.refresh();
  expect(await s.pools()).toEqual(before);
});

async function upgradedAnnual() {
  const s = await setup("starter");
  await s.refresh();
  const at = s.start + (monthlyAnchor(s.start, 1) - s.start) / 2;
  vi.setSystemTime(at);
  const sourcePolicy = resolveAllowancePolicy(s.p, s.p.id, {
    kind: "legacy_not_reconstructed",
  });
  const targetPolicy = resolveAllowancePolicy(
    price(),
    price().id,
    sourcePolicy.acceptance,
  );
  const id = await s.user.mutation(internal.billingChanges.create, {
    organizationId: s.organizationId,
    subscriptionId: "sub_source",
    itemId: "si_source",
    oldPrice: s.p.id,
    newPrice: price().id,
    tier: "pro",
    interval: "annual",
    prorationDate: at / 1000,
    periodStart: s.start / 1000,
    periodEnd: s.end / 1000,
    amount: 10000,
    currency: "eur",
    sourcePolicy,
    targetPolicy,
  });
  await s.user.mutation(internal.billingChanges.claim, { id });
  await s.t.mutation(internal.billingChanges.finish, {
    id,
    state: "applied",
    invoiceId: "in_upgrade",
  });
  const upgraded = invoice(price(), at, s.end, "in_upgrade", true);
  s.invoices.set(upgraded.id, upgraded);
  s.sub.items.data[0].price = price();
  s.sub.latest_invoice = upgraded;
  await s.refresh();
  return { ...s, id };
}
it("preserves annual base and paid upgrade funding across later grants and reordered full refunds", async () => {
  const s = await upgradedAnnual();
  expect((await s.pools()).find((p) => p.kind === "included")?.granted).toBe(
    425,
  );
  await s.refresh();
  vi.setSystemTime(monthlyAnchor(s.start, 1));
  await s.refresh();
  const funding = await s.t.run((ctx) =>
    ctx.db.query("creditFunding").collect(),
  );
  const second = (await s.pools()).filter((p) => p.kind === "included").at(-1)!;
  expect(
    funding
      .filter((f) => f.poolId === second._id)
      .map((f) => [f.invoiceId, f.credits]),
  ).toEqual([
    ["in_base", 250],
    ["in_upgrade", 350],
  ]);
  for (const [paymentId, invoiceId] of [
    ["pi_upgrade", "in_upgrade"],
    ["pi_base", "in_base"],
  ])
    await s.t.mutation(internal.commerce.reversePayment, {
      organizationId: s.organizationId,
      paymentId,
      invoiceId,
      refunded: 10000,
      total: 10000,
      invoiceTotal: 10000,
    });
  vi.setSystemTime(monthlyAnchor(s.start, 2));
  await s.refresh();
  expect(
    (await s.pools())
      .filter((p) => p.kind === "included")
      .every((p) => p.revoked === p.granted),
  ).toBe(true);
  const billing = await s.t.query(internal.billing.byCustomer, {
    customerId: "cus_source",
  });
  expect(billing?.paidAllowance?.base.invoiceId).toBe("in_base");
  expect(billing?.paidAllowance?.upgradeChangeId).toBe(s.id);
});
it("does not erase confirmed paid-change evidence when a later refresh fails", async () => {
  const s = await upgradedAnnual();
  await s.t.mutation(internal.billingChanges.finish, {
    id: s.id,
    state: "needs_reconciliation",
  });
  expect(
    await s.t.query(internal.billingChanges.byId, { id: s.id }),
  ).toMatchObject({ state: "applied", invoiceId: "in_upgrade" });
});
it("keeps purchased pools and in-flight reservations through snapshot refresh and restore hold", async () => {
  const s = await setup();
  await s.refresh();
  await s.t.mutation(internal.commerce.grantTopup, {
    organizationId: s.organizationId,
    paymentId: "pi_topup",
    credits: 200,
  });
  await s.t.run(async (ctx) => {
    const pool = await ctx.db
      .query("creditPools")
      .filter((q) => q.eq(q.field("kind"), "included"))
      .first();
    await ctx.db.patch(pool!._id, { reserved: 17, spent: 23 });
  });
  const before = await s.pools();
  await s.refresh();
  expect(await s.pools()).toEqual(before);
  vi.stubEnv("RESTORE_LOCK", "true");
  await s.refresh();
  expect(await s.pools()).toEqual(before);
  expect(mocks.subscriptions).toHaveBeenCalledTimes(2);
});
it("rejects an unproved new grant without creating a wallet or altering an issued balance", async () => {
  const s = await setup();
  await s.t.mutation(internal.billing.apply, {
    customerId: "cus_source",
    subscriptionId: "sub_source",
    status: "active",
    periodEnd: s.end,
    revision: 0,
  });
  await expect(
    s.t.mutation(internal.commerce.grantPeriod, {
      organizationId: s.organizationId,
      subscription: "sub_source",
      tier: "pro",
      interval: "monthly",
      start: s.start,
      end: monthlyAnchor(s.start, 1),
      verifiedPayment: true,
      billingRevision: 0,
    }),
  ).rejects.toThrow("no verified commitment");
  expect(await s.pools()).toHaveLength(0);
});
it("retains the first checkout acceptance through retry, expiry and price-config rotation before delayed payment", async () => {
  const s = await setup("pro", "monthly");
  mocks.subscriptions.mockResolvedValue({ data: [], has_more: false });
  mocks.checkout.mockResolvedValue({
    url: "https://checkout.stripe.com/synthetic",
  });
  const args = {
    organizationId: s.organizationId,
    tier: "pro" as const,
    interval: "monthly" as const,
    termsAccepted: true,
    immediateService: false,
    country: "RO",
  };
  await s.user.action(api.billingV1.checkout, args);
  await s.user.action(api.billingV1.checkout, args);
  const first = mocks.checkout.mock.calls[0][0].subscription_data.metadata;
  expect(mocks.checkout.mock.calls[1][0].subscription_data.metadata).toEqual(
    first,
  );
  vi.setSystemTime(s.start + 32 * 60000);
  await s.user.action(api.billingV1.checkout, args);
  expect(
    mocks.checkout.mock.calls[2][0].subscription_data.metadata.checkoutKey,
  ).not.toBe(first.checkoutKey);
  vi.stubEnv("STRIPE_PRO_MONTHLY_PRICE_ID", "price_new_unapproved");
  s.sub.metadata = first;
  mocks.subscriptions.mockResolvedValue({ data: [s.sub], has_more: false });
  await s.refresh();
  const billing = await s.t.query(internal.billing.byCustomer, {
    customerId: "cus_source",
  });
  expect(billing?.paidAllowance?.base.policy.acceptance).toMatchObject({
    kind: "recorded",
    acceptanceId: first.allowanceAcceptanceId,
  });
  expect((await s.pools()).filter((p) => p.kind === "included")).toHaveLength(
    1,
  );
  expect(
    await s.t.run((ctx) => ctx.db.get(first.allowanceAcceptanceId)),
  ).toMatchObject({
    paidSubscriptionId: "sub_source",
    checkoutKey: first.checkoutKey,
  });
});
it("runs the existing quoted paid upgrade and scheduled downgrade actions without reducing the current paid allowance", async () => {
  const s = await setup("starter");
  await s.refresh();
  vi.setSystemTime(s.start + (monthlyAnchor(s.start, 1) - s.start) / 2);
  mocks.preview.mockResolvedValue({ amount_due: 10000, currency: "eur" });
  mocks.updateSubscription.mockImplementation(async (_id, request) => {
    const paid = invoice(
      price(),
      request.proration_date * 1000,
      s.end,
      "in_upgrade",
      true,
    );
    s.invoices.set(paid.id, paid);
    s.sub.items.data[0].price = price();
    s.sub.latest_invoice = paid;
    return s.sub;
  });
  const id = await s.user.action(api.billingV1.quoteChange, {
    organizationId: s.organizationId,
    tier: "pro",
  });
  await expect(
    s.user.action(api.billingV1.applyChange, { id: id as any }),
  ).resolves.toHaveProperty("message");
  expect((await s.pools()).find((p) => p.kind === "included")?.granted).toBe(
    425,
  );
  const downgrade = await s.user.action(api.billingV1.quoteChange, {
    organizationId: s.organizationId,
    tier: "starter",
  });
  mocks.schedule.mockResolvedValue({ id: "schedule_source" });
  mocks.updateSchedule.mockResolvedValue({});
  await expect(
    s.user.action(api.billingV1.applyChange, { id: downgrade as any }),
  ).resolves.toMatchObject({ message: expect.stringContaining("scheduled") });
  expect(mocks.updateSchedule.mock.calls[0][1].phases[1].items[0].price).toBe(
    price("starter").id,
  );
  expect((await s.pools()).find((p) => p.kind === "included")?.granted).toBe(
    425,
  );
});
it("reconstructs a legacy upgraded annual term only from its original funding and two complete paid invoices", async () => {
  const s = await upgradedAnnual();
  await s.t.run(async (ctx) => {
    const bill = (await ctx.db.query("billing").first())!;
    await ctx.db.patch(bill._id, { paidAllowance: undefined });
    await ctx.db.patch(s.id, {
      sourcePolicy: undefined,
      targetPolicy: undefined,
    });
  });
  vi.setSystemTime(monthlyAnchor(s.start, 1));
  await s.refresh();
  const bill = await s.t.query(internal.billing.byCustomer, {
    customerId: "cus_source",
  });
  expect(bill?.paidAllowance?.base).toMatchObject({
    invoiceId: "in_base",
    policy: {
      creditsPerGrant: 250,
      acceptance: { kind: "legacy_not_reconstructed" },
    },
  });
  expect(
    (await s.pools()).filter((p) => p.kind === "included").at(-1)?.granted,
  ).toBe(600);
});
it("reconstructs an upgraded term from its captured source policy after the Starter price configuration rotates", async () => {
  const s = await upgradedAnnual();
  await s.t.run(async (ctx) => {
    const bill = (await ctx.db.query("billing").first())!;
    await ctx.db.patch(bill._id, { paidAllowance: undefined });
  });
  vi.stubEnv("STRIPE_STARTER_ANNUAL_PRICE_ID", "price_new_starter");
  vi.setSystemTime(monthlyAnchor(s.start, 1));
  await s.refresh();
  expect(
    (await s.pools()).filter((p) => p.kind === "included").at(-1)?.granted,
  ).toBe(600);
  expect(
    (await s.t.query(internal.billing.byCustomer, { customerId: "cus_source" }))
      ?.paidAllowance?.base,
  ).toMatchObject({
    invoiceId: "in_base",
    policy: {
      priceId: price("starter").id,
      creditsPerGrant: 250,
      acceptance: { kind: "legacy_not_reconstructed" },
    },
  });
});
it("settles an annual upgrade quoted before the monthly boundary into the already-issued next-month pool", async () => {
  const s = await setup("starter");
  await s.refresh();
  const boundary = monthlyAnchor(s.start, 1);
  vi.setSystemTime(boundary - 60000);
  mocks.preview.mockResolvedValue({ amount_due: 10000, currency: "eur" });
  const id = await s.user.action(api.billingV1.quoteChange, {
    organizationId: s.organizationId,
    tier: "pro",
  });
  vi.setSystemTime(boundary + 60000);
  await s.refresh();
  expect(
    (await s.pools()).filter((p) => p.kind === "included").at(-1)?.granted,
  ).toBe(250);
  mocks.updateSubscription.mockImplementation(async (_id, request) => {
    const paid = invoice(
      price(),
      request.proration_date * 1000,
      s.end,
      "in_upgrade",
      true,
    );
    s.invoices.set(paid.id, paid);
    s.sub.items.data[0].price = price();
    s.sub.latest_invoice = paid;
    return s.sub;
  });
  await s.user.action(api.billingV1.applyChange, { id: id as any });
  await s.refresh();
  const pool = (await s.pools()).find(
    (p) => p.key === `sub_source:${boundary}`,
  )!;
  expect(pool.granted).toBe(600);
  const funding = await s.t.run((ctx) =>
    ctx.db.query("creditFunding").collect(),
  );
  expect(
    funding
      .filter((f) => f.poolId === pool._id)
      .map((f) => [f.invoiceId, f.credits]),
  ).toEqual([
    ["in_base", 250],
    ["in_upgrade", 350],
  ]);
  await s.t.mutation(internal.commerce.reversePayment, {
    organizationId: s.organizationId,
    paymentId: "pi_upgrade",
    invoiceId: "in_upgrade",
    refunded: 10000,
    total: 10000,
    invoiceTotal: 10000,
  });
  expect((await s.pools()).find((p) => p._id === pool._id)).toMatchObject({
    granted: 600,
    revoked: 350,
  });
});
it.each(["before", "at_end"])(
  "rejects an upgrade proration date %s its original paid term",
  async (when) => {
    const s = await upgradedAnnual();
    const before = await s.pools();
    await s.t.run((ctx) =>
      ctx.db.patch(s.id, {
        prorationDate: (when === "before" ? s.start - 1000 : s.end) / 1000,
      }),
    );
    const bill = (await s.t.query(internal.billing.byCustomer, {
      customerId: "cus_source",
    }))!;
    await expect(
      s.t.mutation(internal.commerce.grantPeriod, {
        organizationId: s.organizationId,
        subscription: "sub_source",
        tier: "pro",
        interval: "monthly",
        start: s.start,
        end: monthlyAnchor(s.start, 1),
        verifiedPayment: true,
        billingRevision: bill.appliedRevision,
      }),
    ).rejects.toThrow("upgrade contribution");
    await s.refresh();
    expect(await s.pools()).toEqual(before);
  },
);
async function scheduledDowngrade() {
  const s = await setup();
  await s.refresh();
  const id = await s.user.action(api.billingV1.quoteChange, {
    organizationId: s.organizationId,
    tier: "starter",
  });
  mocks.schedule.mockResolvedValue({ id: "schedule_source" });
  mocks.updateSchedule.mockResolvedValue({});
  await s.user.action(api.billingV1.applyChange, { id: id as any });
  const end = monthlyAnchor(s.start, 24);
  s.sub.items.data[0].price = price("starter");
  s.sub.items.data[0].current_period_start = s.end / 1000;
  s.sub.items.data[0].current_period_end = end / 1000;
  s.sub.latest_invoice = invoice(
    price("starter"),
    s.end,
    end,
    "in_starter_renewal",
  );
  vi.stubEnv("STRIPE_STARTER_ANNUAL_PRICE_ID", "price_rotated_starter");
  vi.setSystemTime(s.end);
  return { ...s, id };
}
it("honors the exact scheduled downgrade policy after environment rotation, including later monthly grants", async () => {
  const s = await scheduledDowngrade();
  await s.refresh();
  expect(
    (await s.pools()).filter((p) => p.kind === "included").at(-1)?.granted,
  ).toBe(250);
  await s.refresh();
  expect((await s.pools()).filter((p) => p.kind === "included")).toHaveLength(
    2,
  );
  vi.setSystemTime(monthlyAnchor(s.start, 13));
  await s.refresh();
  expect((await s.pools()).filter((p) => p.kind === "included")).toHaveLength(
    3,
  );
  const bill = await s.t.query(internal.billing.byCustomer, {
    customerId: "cus_source",
  });
  expect(bill?.paidAllowance?.base.policy).toMatchObject({
    priceId: price("starter").id,
    creditsPerGrant: 250,
  });
});
it("holds an ambiguous scheduled downgrade instead of choosing a matching historical row", async () => {
  const s = await scheduledDowngrade();
  await s.t.run(async (ctx) => {
    const row = (await ctx.db.query("billingChanges").first())!;
    const { _id, _creationTime, ...copy } = row;
    void _id;
    void _creationTime;
    await ctx.db.insert("billingChanges", copy);
  });
  const before = await s.pools();
  await s.refresh();
  expect(await s.pools()).toEqual(before);
});
it("holds a change-history overflow even when the current paid policy and upgrade are otherwise proved", async () => {
  const s = await upgradedAnnual();
  await s.t.run(async (ctx) => {
    const row = (await ctx.db.query("billingChanges").first())!;
    const { _id, _creationTime, ...copy } = row;
    void _id;
    void _creationTime;
    for (let i = 0; i < 100; i++)
      await ctx.db.insert("billingChanges", { ...copy, state: "quoted" });
  });
  const before = await s.pools();
  vi.setSystemTime(monthlyAnchor(s.start, 1));
  await s.refresh();
  expect(await s.pools()).toEqual(before);
});
it.each(["discounted", "zero_paid"])(
  "reconciles an archived recognized price with a %s paid invoice",
  async (kind) => {
    const s = await setup();
    s.sub.items.data[0].price.active = false;
    s.paid.amount_paid = kind === "zero_paid" ? 0 : 10000;
    s.paid.lines.data[0].amount = s.paid.amount_paid;
    await s.refresh();
    expect(
      (await s.pools()).filter((p) => p.kind === "included"),
    ).toMatchObject([{ granted: 600 }]);
    expect(
      (
        await s.t.query(internal.billing.byCustomer, {
          customerId: "cus_source",
        })
      )?.paidAllowance?.base.invoiceId,
    ).toBe("in_base");
  },
);
it("holds an unknown legacy base invoice without changing an existing upgraded pool", async () => {
  const s = await upgradedAnnual();
  await s.t.run(async (ctx) => {
    const bill = (await ctx.db.query("billing").first())!;
    await ctx.db.patch(bill._id, { paidAllowance: undefined });
    for (const row of await ctx.db.query("creditFunding").collect())
      if (row.invoiceId === "in_base") await ctx.db.delete(row._id);
  });
  const before = await s.pools();
  vi.setSystemTime(monthlyAnchor(s.start, 1));
  await s.refresh();
  expect(await s.pools()).toEqual(before);
  expect(
    (await s.t.query(internal.billing.byCustomer, { customerId: "cus_source" }))
      ?.status,
  ).toBe("active");
});
it("applies partial base and full upgrade refunds independently to future annual grants", async () => {
  const s = await upgradedAnnual();
  await s.t.mutation(internal.commerce.reversePayment, {
    organizationId: s.organizationId,
    paymentId: "pi_base",
    invoiceId: "in_base",
    refunded: 5000,
    total: 10000,
    invoiceTotal: 10000,
  });
  vi.setSystemTime(monthlyAnchor(s.start, 1));
  await s.refresh();
  expect(
    (await s.pools()).filter((p) => p.kind === "included").at(-1),
  ).toMatchObject({ granted: 600, revoked: 125 });
  await s.t.mutation(internal.commerce.reversePayment, {
    organizationId: s.organizationId,
    paymentId: "pi_upgrade",
    invoiceId: "in_upgrade",
    refunded: 10000,
    total: 10000,
    invoiceTotal: 10000,
  });
  vi.setSystemTime(monthlyAnchor(s.start, 2));
  await s.refresh();
  expect(
    (await s.pools()).filter((p) => p.kind === "included").at(-1),
  ).toMatchObject({ granted: 600, revoked: 475 });
});
it("ignores an older observation and cannot revive a provider-deleted commitment", async () => {
  const s = await setup();
  await s.refresh();
  const bill = (await s.t.query(internal.billing.byCustomer, {
    customerId: "cus_source",
  }))!;
  const first = (await s.t.mutation(internal.billing.reserveRefresh, {
    customerId: "cus_source",
  }))!;
  const second = (await s.t.mutation(internal.billing.reserveRefresh, {
    customerId: "cus_source",
  }))!;
  await s.t.mutation(internal.billing.apply, {
    customerId: "cus_source",
    subscriptionId: "sub_source",
    status: "past_due",
    periodEnd: s.end,
    revision: second.revision,
  });
  await s.t.mutation(internal.billing.apply, {
    customerId: "cus_source",
    subscriptionId: "sub_source",
    status: "active",
    periodEnd: s.end,
    revision: first.revision,
    paidAllowance: bill.paidAllowance,
  });
  expect(
    (await s.t.query(internal.billing.byCustomer, { customerId: "cus_source" }))
      ?.status,
  ).toBe("past_due");
  await s.t.mutation(internal.commerce.grantTopup, {
    organizationId: s.organizationId,
    paymentId: "pi_topup",
    credits: 200,
  });
  await s.t.mutation(internal.billing.providerDeleted, {
    customerId: "cus_source",
    revision: second.revision,
  });
  const pools = await s.pools();
  await s.t.mutation(internal.billing.apply, {
    customerId: "cus_source",
    subscriptionId: "sub_source",
    status: "active",
    periodEnd: s.end,
    revision: second.revision + 10,
    paidAllowance: bill.paidAllowance,
  });
  await s.t.mutation(internal.commerce.grantPeriod, {
    organizationId: s.organizationId,
    subscription: "sub_source",
    tier: "pro",
    interval: "monthly",
    start: monthlyAnchor(s.start, 1),
    end: monthlyAnchor(s.start, 2),
    verifiedPayment: true,
    billingRevision: second.revision + 10,
  });
  expect(await s.pools()).toEqual(pools);
  expect(pools.find((p) => p.kind === "purchased")).toMatchObject({
    granted: 200,
  });
});
it("honors cancellation through the paid year and creates no next-year allowance", async () => {
  const s = await setup();
  await s.refresh();
  s.sub.cancel_at_period_end = true;
  vi.setSystemTime(monthlyAnchor(s.start, 1));
  await s.refresh();
  expect((await s.pools()).filter((p) => p.kind === "included")).toHaveLength(
    2,
  );
  s.sub.status = "canceled";
  vi.setSystemTime(s.end);
  await expect(s.refresh()).resolves.toEqual({ allowance: "not_due" });
  expect((await s.pools()).filter((p) => p.kind === "included")).toHaveLength(
    2,
  );
});
it("reports no subscription as not due without creating an allowance", async () => {
  const s = await setup();
  mocks.subscriptions.mockResolvedValue({ data: [], has_more: false });
  await expect(s.refresh()).resolves.toEqual({ allowance: "not_due" });
  expect(await s.pools()).toHaveLength(0);
});
it("retains the verified February 29 calendar reference through non-leap annual renewal", async () => {
  const anchor = Date.UTC(2024, 1, 29, 12);
  const s = await setup("pro", "annual", anchor);
  await s.refresh();
  const renewalStart = monthlyAnchor(anchor, 12),
    renewalEnd = monthlyAnchor(anchor, 24);
  s.sub.items.data[0].current_period_start = renewalStart / 1000;
  s.sub.items.data[0].current_period_end = renewalEnd / 1000;
  s.sub.latest_invoice = invoice(
    s.p,
    renewalStart,
    renewalEnd,
    "in_nonleap_renewal",
  );
  vi.setSystemTime(renewalStart);
  await s.refresh();
  const first = await s.t.run((ctx) =>
    ctx.db
      .query("billingPeriods")
      .withIndex("by_key", (q) => q.eq("key", `sub_source:${renewalStart}`))
      .unique(),
  );
  expect(first?.end).toBe(Date.UTC(2025, 2, 29, 12));
  vi.setSystemTime(Date.UTC(2025, 2, 29, 12));
  await s.refresh();
  const bill = await s.t.query(internal.billing.byCustomer, {
    customerId: "cus_source",
  });
  expect(bill?.paidAllowance?.anchor).toBe(anchor);
  const last = (await s.pools()).filter((p) => p.kind === "included").at(-1)!;
  expect(last.key).toBe(`sub_source:${Date.UTC(2025, 2, 29, 12)}`);
  expect(last.expiresAt).toBe(Date.UTC(2025, 3, 29, 12));
});
it("preserves January 31 clamping across successive monthly renewals", async () => {
  const s = await setup("pro", "monthly");
  await s.refresh();
  const second = monthlyAnchor(s.start, 1),
    third = monthlyAnchor(s.start, 2);
  expect(new Date(second).getUTCDate()).toBe(28);
  expect(new Date(third).getUTCDate()).toBe(31);
  s.sub.items.data[0].current_period_start = second / 1000;
  s.sub.items.data[0].current_period_end = third / 1000;
  s.sub.latest_invoice = invoice(s.p, second, third, "in_february");
  vi.setSystemTime(second);
  await s.refresh();
  expect(
    (await s.pools()).filter((p) => p.kind === "included").at(-1)?.expiresAt,
  ).toBe(third);
});
it.each(["missing", "misaligned", "changed", "unlicensed_term_end"])(
  "holds a %s billing anchor or term without altering issued pools",
  async (scenario) => {
    const s = await setup();
    if (scenario !== "missing") await s.refresh();
    const before = await s.pools();
    if (scenario === "missing")
      Reflect.deleteProperty(s.sub, "billing_cycle_anchor");
    if (scenario === "misaligned") {
      await s.t.run(async (ctx) => {
        const bill = (await ctx.db.query("billing").first())!;
        await ctx.db.patch(bill._id, { paidAllowance: undefined });
      });
      s.sub.billing_cycle_anchor -= 86400;
    }
    if (scenario === "changed") s.sub.billing_cycle_anchor -= 1;
    if (scenario === "unlicensed_term_end") {
      s.sub.items.data[0].current_period_end--;
      s.paid.lines.data[0].period.end--;
    }
    vi.setSystemTime(monthlyAnchor(s.start, 1));
    await s.refresh();
    expect(await s.pools()).toEqual(before);
    expect(
      (
        await s.t.query(internal.billing.byCustomer, {
          customerId: "cus_source",
        })
      )?.status,
    ).toBe("active");
  },
);
it("holds a metadata acceptance locator without its exact server binding", async () => {
  const s = await setup();
  s.sub.metadata.allowanceAcceptanceId = "not-a-record";
  s.sub.metadata.checkoutKey = "unproved";
  await s.refresh();
  expect(await s.pools()).toHaveLength(0);
  expect(
    (await s.t.query(internal.billing.byCustomer, { customerId: "cus_source" }))
      ?.paidAllowance,
  ).toBeUndefined();
});
it("blocks a presentation-only allowance edit from creating a new checkout", async () => {
  const s = await setup("pro", "monthly");
  pricing.tiers.pro.monthly_credits = 1;
  await expect(
    s.user.action(api.billingV1.checkout, {
      organizationId: s.organizationId,
      tier: "pro",
      interval: "monthly",
      country: "RO",
      termsAccepted: true,
      immediateService: false,
    }),
  ).rejects.toThrow("displayed allowance");
  expect(mocks.checkout).not.toHaveBeenCalled();
  expect(
    await s.t.run((ctx) => ctx.db.query("legalAcceptances").collect()),
  ).toHaveLength(0);
});
it("binds a completed acceptance to its first verified provider subscription and refuses locator replay", async () => {
  const s = await setup("pro", "monthly");
  mocks.subscriptions.mockResolvedValue({ data: [], has_more: false });
  mocks.checkout.mockResolvedValue({
    url: "https://checkout.stripe.com/synthetic",
  });
  await s.user.action(api.billingV1.checkout, {
    organizationId: s.organizationId,
    tier: "pro",
    interval: "monthly",
    country: "RO",
    termsAccepted: true,
    immediateService: false,
  });
  const metadata = mocks.checkout.mock.calls[0][0].subscription_data.metadata;
  s.sub.metadata = metadata;
  mocks.subscriptions.mockResolvedValue({ data: [s.sub], has_more: false });
  await s.refresh();
  await s.t.mutation(internal.billing.checkoutCompleted, {
    customerId: "cus_source",
    key: metadata.checkoutKey,
    subscriptionId: "sub_source",
  });
  const bill = await s.t.query(internal.billing.byCustomer, {
    customerId: "cus_source",
  });
  expect(bill?.checkoutKey).toBeUndefined();
  const before = await s.pools();
  s.sub.id = "sub_replayed";
  s.paid.parent!.subscription_details!.subscription = "sub_replayed";
  s.paid.lines.data[0].parent!.subscription_item_details!.subscription =
    "sub_replayed";
  await s.refresh();
  expect(await s.pools()).toEqual(before);
  expect(
    await s.t.run((ctx) => ctx.db.get(metadata.allowanceAcceptanceId)),
  ).toMatchObject({ paidSubscriptionId: "sub_source" });
});
it("does not install a commitment if restore starts after the provider observation was reserved", async () => {
  const s = await setup();
  mocks.subscriptions.mockImplementation(async () => {
    vi.stubEnv("RESTORE_LOCK", "true");
    return { data: [s.sub], has_more: false };
  });
  await s.refresh();
  expect(await s.pools()).toHaveLength(0);
  expect(
    (await s.t.query(internal.billing.byCustomer, { customerId: "cus_source" }))
      ?.paidAllowance,
  ).toBeUndefined();
});
it.each([
  ["paid", "account"],
  ["paid", "mode"],
  ["pending", "account"],
  ["pending", "mode"],
] as const)(
  "holds %s authority on provider %s rotation before looking up or deleting the customer",
  async (kind, rotation) => {
    const s = await setup();
    await s.refresh();
    await s.t.mutation(internal.commerce.grantTopup, {
      organizationId: s.organizationId,
      paymentId: "pi_retained",
      credits: 200,
    });
    if (kind === "pending") {
      // An existing issued legacy pool can coexist with a new unpaid checkout
      // before the older purchase has a reconstructed commitment.
      await s.t.run(async (ctx) => {
        const bill = (await ctx.db.query("billing").first())!;
        await ctx.db.patch(bill._id, { paidAllowance: undefined });
      });
      mocks.subscriptions.mockResolvedValue({ data: [], has_more: false });
      mocks.checkout.mockResolvedValue({
        url: "https://checkout.stripe.com/synthetic",
      });
      await s.user.action(api.billingV1.checkout, {
        organizationId: s.organizationId,
        tier: "pro",
        interval: "annual",
        country: "RO",
        termsAccepted: true,
        immediateService: false,
      });
    }
    const pools = await s.pools();
    const before = (await s.t.query(internal.billing.byCustomer, {
      customerId: "cus_source",
    }))!;
    const acceptances = await s.t.run((ctx) =>
      ctx.db.query("legalAcceptances").collect(),
    );
    if (rotation === "account") {
      vi.stubEnv("STRIPE_ACCOUNT_ID", "acct_rotated");
      mocks.account.mockResolvedValue({ id: "acct_rotated" });
    } else {
      vi.stubEnv("STRIPE_MODE", "live");
      vi.stubEnv("STRIPE_SECRET_KEY", ["rk", "live", "synthetic"].join("_"));
    }
    mocks.customer.mockResolvedValue({ id: "cus_source", deleted: true });
    mocks.customer.mockClear();
    mocks.subscriptions.mockClear();
    mocks.account.mockClear();
    await expect(s.refresh()).resolves.toEqual({ allowance: "held" });
    expect(mocks.customer).not.toHaveBeenCalled();
    expect(mocks.subscriptions).not.toHaveBeenCalled();
    expect(mocks.account).not.toHaveBeenCalled();
    expect(await s.pools()).toEqual(pools);
    expect(
      await s.t.run((ctx) => ctx.db.query("legalAcceptances").collect()),
    ).toEqual(acceptances);
    const after = (await s.t.query(internal.billing.byCustomer, {
      customerId: "cus_source",
    }))!;
    expect(after).toMatchObject({
      status: before.status,
      periodEnd: before.periodEnd,
      verifiedAt: before.verifiedAt,
      appliedRevision: before.appliedRevision,
    });
    expect(after.providerDeletedAt).toBeUndefined();
    expect(after.paidAllowance).toEqual(before.paidAllowance);
    expect(after.checkoutAllowance).toEqual(before.checkoutAllowance);
    expect(after.checkoutKey).toBe(before.checkoutKey);
  },
);
it("holds a partially restored upgrade ledger instead of granting its contribution twice", async () => {
  const s = await upgradedAnnual();
  await s.t.run(async (ctx) => {
    const period = (await ctx.db.query("billingPeriods").first())!;
    await ctx.db.patch(period._id, { allowanceCeiling: 250 });
  });
  const before = await s.pools();
  await expect(s.refresh()).rejects.toThrow(
    "funding and period snapshots disagree",
  );
  expect(await s.pools()).toEqual(before);
});
