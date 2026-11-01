import { convexTest } from "convex-test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import {
  candidateCreditPolicy,
  paidCandidateWindow,
  resolveCreditPolicy,
} from "../packages/billing/credit-policy";
import { proCandidateVersion } from "../packages/billing/pro-migration-preview";
import { reserve, settle } from "../convex/product";

const mocks = vi.hoisted(() => ({
  account: vi.fn(),
  customer: vi.fn(),
  subscriptions: vi.fn(),
  dispute: vi.fn(),
  warning: vi.fn(),
  charge: vi.fn(),
  invoicePayments: vi.fn(),
  invoice: vi.fn(),
}));
vi.mock("stripe", async (original) => {
  const actual = await original<typeof import("stripe")>();
  return {
    ...actual,
    default: class {
      constructor(key: string) {
        const stripe = new actual.default(key);
        Object.assign(stripe, {
          accounts: { retrieve: mocks.account },
          customers: { retrieve: mocks.customer },
          subscriptions: { list: mocks.subscriptions },
          disputes: { retrieve: mocks.dispute },
          radar: { earlyFraudWarnings: { retrieve: mocks.warning } },
          charges: { retrieve: mocks.charge },
          invoicePayments: { list: mocks.invoicePayments },
          invoices: { retrieve: mocks.invoice },
        });
        return stripe;
      }
    },
  };
});
const modules = import.meta.glob("../convex/**/*.ts");
const start = Date.UTC(2026, 10, 30, 12);
const now = start + 2000;
const config = {
  version: proCandidateVersion,
  mode: "test",
  accountId: "acct_synthetic",
  activation: "sandbox",
  prices: {
    weekly: "price_new_week",
    monthly: "price_new_month",
    annual: "price_new_year",
  },
};
const env = {
  STRIPE_MODE: "test",
  STRIPE_ACCOUNT_ID: "acct_synthetic",
  STRIPE_PRO_MONTHLY_PRICE_ID: "price_legacy_month",
  STRIPE_PRO_CREDIT_POLICY_V2_JSON: JSON.stringify(config),
};
const intervalInfo = {
  weekly: { provider: "week", amount: 1700, end: start + 7 * 86400000 },
  monthly: { provider: "month", amount: 3500, end: Date.UTC(2026, 11, 31, 12) },
  annual: { provider: "year", amount: 35000, end: Date.UTC(2027, 10, 30, 12) },
};
function subscription(interval: keyof typeof intervalInfo = "monthly") {
  const info = intervalInfo[interval];
  const price = {
    id: config.prices[interval],
    active: true,
    livemode: false,
    currency: "eur",
    unit_amount: info.amount,
    tax_behavior: "inclusive",
    recurring: { interval: info.provider, interval_count: 1 },
    metadata: {
      product: "vibescroller",
      policy: proCandidateVersion,
      tier: "pro",
      interval,
    },
  };
  const item = {
    id: "si_synthetic",
    price,
    quantity: 1,
    current_period_start: start / 1000,
    current_period_end: info.end / 1000,
  };
  const invoice = {
    id: "in_synthetic",
    customer: "cus_synthetic",
    livemode: false,
    status: "paid",
    currency: "eur",
    amount_paid: info.amount,
    amount_remaining: 0,
    parent: {
      type: "subscription_details",
      subscription_details: { subscription: "sub_synthetic" },
    },
    lines: {
      has_more: false,
      data: [
        {
          quantity: 1,
          amount: info.amount,
          currency: "eur",
          period: {
            start: item.current_period_start,
            end: item.current_period_end,
          },
          pricing: { price_details: { price: price.id } },
          parent: {
            subscription_item_details: {
              subscription: "sub_synthetic",
              proration: false,
            },
          },
        },
      ],
    },
  };
  return {
    id: "sub_synthetic",
    customer: "cus_synthetic",
    status: "active",
    livemode: false,
    metadata: { product: "vibescroller" },
    created: start / 1000,
    items: { data: [item] },
    latest_invoice: invoice,
  };
}
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetAllMocks();
});

it("keeps legacy credits with no new policy, and refuses cross-mode/account/colliding candidate mappings", () => {
  const legacy = {
    id: "price_legacy_month",
    metadata: { tier: "pro", interval: "monthly" },
  };
  expect(
    resolveCreditPolicy(
      { ...env, STRIPE_PRO_CREDIT_POLICY_V2_JSON: "" },
      legacy,
    ),
  ).toMatchObject({ credits: 600, candidate: false });
  expect(
    resolveCreditPolicy(
      { ...env, STRIPE_PRO_CREDIT_POLICY_V2_JSON: "invalid" },
      legacy,
    ),
  ).toMatchObject({ credits: 600 });
  expect(
    candidateCreditPolicy(
      { ...env, STRIPE_PRO_CREDIT_POLICY_V2_JSON: "" },
      "price_new_month",
    ),
  ).toBeNull();
  for (const changed of [
    { mode: "live" },
    { accountId: "acct_other" },
    { prices: { ...config.prices, monthly: "price_legacy_month" } },
    { activation: "reviewed_live" },
  ])
    expect(() =>
      candidateCreditPolicy(
        {
          ...env,
          STRIPE_PRO_CREDIT_POLICY_V2_JSON: JSON.stringify({
            ...config,
            ...changed,
          }),
        },
        "price_new_month",
      ),
    ).toThrow();
});

it("uses exact paid graph periods, retains retired prices, and refuses foreign or partial invoice evidence", () => {
  const sub = subscription();
  const policy = resolveCreditPolicy(env, {
    ...sub.items.data[0].price,
    active: false,
  })!;
  expect(
    paidCandidateWindow(policy, sub, sub.latest_invoice, {
      now,
      customerId: "cus_synthetic",
    }),
  ).toEqual({
    start,
    end: intervalInfo.monthly.end,
  });
  for (const change of [
    (s: typeof sub) => {
      s.latest_invoice.customer = "cus_other";
    },
    (s: typeof sub) => {
      s.latest_invoice.lines.data[0].pricing.price_details.price =
        "price_other";
    },
    (s: typeof sub) => {
      s.latest_invoice.lines.data[0].period.end--;
    },
    (s: typeof sub) => {
      s.latest_invoice.amount_paid--;
    },
    (s: typeof sub) => {
      s.latest_invoice.lines.has_more = true;
    },
    (s: typeof sub) => {
      s.latest_invoice.lines.data[0].parent.subscription_item_details.proration = true;
    },
    (s: typeof sub) => {
      s.livemode = true;
    },
  ]) {
    const changed = structuredClone(sub);
    change(changed);
    expect(() =>
      paidCandidateWindow(policy, changed, changed.latest_invoice, {
        now,
        customerId: "cus_synthetic",
      }),
    ).toThrow();
  }
});

async function setup(
  interval: keyof typeof intervalInfo = "monthly",
  personal = true,
) {
  vi.spyOn(Date, "now").mockReturnValue(now);
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  vi.stubEnv("STRIPE_SECRET_KEY", "rk_test_synthetic");
  vi.stubEnv("STRIPE_V1_WEBHOOK_SECRET", "whsec_synthetic_test_fixture");
  const t = convexTest(schema, modules);
  await t.mutation(internal.accounts.syncUser, {
    subject: "credit-owner",
    name: "Synthetic",
    email: "credit@example.test",
  });
  const user = t.withIdentity({ subject: "credit-owner" });
  const org = personal
    ? await user.mutation(api.organizations.createPrivate, {})
    : await user.mutation(api.organizations.create, { name: "Legacy team" });
  await t.mutation(internal.billing.attach, {
    organizationId: org,
    customerId: "cus_synthetic",
  });
  mocks.account.mockResolvedValue({ id: "acct_synthetic" });
  mocks.customer.mockResolvedValue({ id: "cus_synthetic", deleted: false });
  const sub = subscription(interval);
  mocks.subscriptions.mockImplementation(async () => ({
    data: [structuredClone(sub)],
    has_more: false,
  }));
  const { default: RealStripe } =
    await vi.importActual<typeof import("stripe")>("stripe");
  const stripe = new RealStripe("rk_test_synthetic");
  async function deliver(
    id = "evt_synthetic",
    type = "invoice.paid",
    signature?: string,
    eventCustomer?: string,
    eventObject?: Record<string, unknown>,
  ) {
    const payload = JSON.stringify({
      id,
      object: "event",
      created: Math.floor(Date.now() / 1000),
      livemode: false,
      type,
      data: {
        object: eventObject ?? {
          ...sub.latest_invoice,
          ...(eventCustomer ? { customer: eventCustomer } : {}),
        },
      },
    });
    const header =
      signature ??
      stripe.webhooks.generateTestHeaderString({
        payload,
        secret: "whsec_synthetic_test_fixture",
        timestamp: Math.floor(Date.now() / 1000),
      });
    return t.fetch("/stripe/v1/webhook", {
      method: "POST",
      body: payload,
      headers: { "stripe-signature": header },
    });
  }
  const ledger = () =>
    t.run(async (ctx) => ({
      wallets: await ctx.db.query("wallets").collect(),
      periods: await ctx.db.query("billingPeriods").collect(),
      pools: await ctx.db.query("creditPools").collect(),
    }));
  return { t, user, org, sub, deliver, ledger };
}

it("authenticates the actual HTTP webhook signature and grants only 300 on duplicate delivery", async () => {
  const s = await setup();
  expect(
    (await s.deliver("evt_bad", "invoice.paid", "t=1,v1=invalid")).status,
  ).toBe(400);
  expect((await s.ledger()).periods).toHaveLength(0);
  expect((await s.deliver()).status).toBe(200);
  expect((await s.deliver()).status).toBe(200);
  expect((await s.deliver("evt_other_delivery")).status).toBe(200);
  const state = await s.ledger();
  expect(state.periods).toHaveLength(1);
  expect(state.periods[0]).toMatchObject({
    credits: 300,
    end: intervalInfo.monthly.end,
  });
  expect(state.wallets[0].granted).toBe(300);
});

it("grants 75 weekly or only the current 300 annual credits, not the whole annual allowance", async () => {
  for (const interval of ["weekly", "annual"] as const) {
    const s = await setup(interval);
    expect((await s.deliver()).status).toBe(200);
    const state = await s.ledger();
    expect(state.periods).toHaveLength(1);
    expect(state.periods[0].credits).toBe(interval === "weekly" ? 75 : 300);
    expect(state.periods[0].end).toBe(
      interval === "weekly"
        ? intervalInfo.weekly.end
        : Date.UTC(2026, 11, 30, 12),
    );
    vi.restoreAllMocks();
    vi.resetAllMocks();
  }
});

it("does not grant an unpaid renewal and recovers exactly once without touching purchased or unknown reserved credits", async () => {
  const s = await setup();
  await s.t.mutation(internal.commerce.grantTopup, {
    organizationId: s.org,
    paymentId: "pi_topup",
    credits: 200,
  });
  await s.t.run(async (ctx) => {
    const w = (await ctx.db.query("wallets").collect())[0];
    await ctx.db.patch(w._id, { reserved: 10 });
    const pool = (await ctx.db.query("creditPools").collect()).find(
      (p) => p.kind === "purchased",
    )!;
    await ctx.db.patch(pool._id, { reserved: 10 });
  });
  s.sub.status = "past_due";
  s.sub.latest_invoice.status = "open";
  s.sub.latest_invoice.amount_paid = 0;
  s.sub.latest_invoice.amount_remaining = 3500;
  expect((await s.deliver("evt_failed", "invoice.payment_failed")).status).toBe(
    200,
  );
  expect((await s.ledger()).periods).toHaveLength(0);
  const before = await s.ledger();
  s.sub.status = "active";
  s.sub.latest_invoice.status = "paid";
  s.sub.latest_invoice.amount_paid = 3500;
  s.sub.latest_invoice.amount_remaining = 0;
  expect((await s.deliver("evt_recovered")).status).toBe(200);
  expect((await s.deliver("evt_recovered")).status).toBe(200);
  const after = await s.ledger();
  expect(after.periods).toHaveLength(1);
  expect(after.wallets[0].purchased).toBe(before.wallets[0].purchased);
  expect(after.wallets[0].reserved).toBe(10);
  expect(after.pools.find((p) => p.kind === "purchased")).toEqual(
    before.pools.find((p) => p.kind === "purchased"),
  );
});

it("refuses candidate grants into a team wallet while preserving the legacy team subscription policy", async () => {
  const s = await setup("monthly", false);
  expect((await s.deliver()).status).toBe(503);
  expect((await s.ledger()).periods).toHaveLength(0);
  const price = s.sub.items.data[0].price;
  price.id = "price_legacy_month";
  expect((await s.deliver("evt_legacy")).status).toBe(200);
  expect((await s.ledger()).periods[0].credits).toBe(600);
});

function movePeriod(
  s: ReturnType<typeof subscription>,
  nextStart: number,
  nextEnd: number,
) {
  s.items.data[0].current_period_start = nextStart / 1000;
  s.items.data[0].current_period_end = nextEnd / 1000;
  s.latest_invoice.id = "in_renewed";
  s.latest_invoice.lines.data[0].period = {
    start: nextStart / 1000,
    end: nextEnd / 1000,
  };
}

it("handles concurrent, stale and cancelled deliveries without duplicate grants or losing existing balances", async () => {
  const s = await setup();
  const first = await Promise.all([
    s.deliver("evt_first"),
    s.deliver("evt_duplicate"),
  ]);
  expect(first.map((r) => r.status)).toEqual([200, 200]);
  const oldPool = (await s.ledger()).pools.find((p) => p.kind === "included")!;
  const next = intervalInfo.monthly.end;
  vi.mocked(Date.now).mockReturnValue(next + 2000);
  movePeriod(s.sub, next, Date.UTC(2027, 0, 31, 12));
  expect((await s.deliver("evt_renewal")).status).toBe(200);
  // An old event is only a wakeup: reconcile the current provider snapshot.
  expect((await s.deliver("evt_first")).status).toBe(200);
  expect((await s.ledger()).periods).toHaveLength(2);
  expect((await s.ledger()).pools.find((p) => p._id === oldPool._id)).toEqual(
    oldPool,
  );
  s.sub.status = "canceled";
  expect(
    (await s.deliver("evt_canceled", "customer.subscription.deleted")).status,
  ).toBe(200);
  expect((await s.ledger()).periods).toHaveLength(2);
});

it("keeps a paid legacy period intact and applies the smaller allowance only to the new renewal window", async () => {
  const s = await setup();
  await s.t.mutation(internal.commerce.grantPeriod, {
    organizationId: s.org,
    subscription: s.sub.id,
    tier: "pro",
    interval: "monthly",
    start,
    end: intervalInfo.monthly.end,
    verifiedPayment: true,
    invoiceId: "in_legacy",
  });
  const old = await s.ledger();
  expect(old.periods[0].credits).toBe(600);
  expect((await s.deliver("evt_reviewed_change")).status).toBe(200);
  expect((await s.ledger()).pools).toEqual(old.pools);
  expect((await s.ledger()).wallets[0].granted).toBe(old.wallets[0].granted);
  const next = intervalInfo.monthly.end;
  vi.mocked(Date.now).mockReturnValue(next + 2000);
  movePeriod(s.sub, next, Date.UTC(2027, 0, 31, 12));
  expect((await s.deliver("evt_new_terms_renewal")).status).toBe(200);
  const after = await s.ledger();
  expect(after.periods.map((p) => p.credits)).toEqual([600, 300]);
  expect(
    after.pools.filter((p) => old.pools.some((o) => o._id === p._id)),
  ).toEqual(old.pools);
});

it("advances annual monthly grants without another invoice and stops at the paid yearly boundary", async () => {
  const s = await setup("annual");
  expect((await s.deliver()).status).toBe(200);
  vi.mocked(Date.now).mockReturnValue(Date.UTC(2026, 11, 30, 12) + 2000);
  expect(
    (await s.deliver("evt_monthly_reconcile", "customer.subscription.updated"))
      .status,
  ).toBe(200);
  expect((await s.ledger()).periods.map((p) => p.credits)).toEqual([300, 300]);
  vi.mocked(Date.now).mockReturnValue(intervalInfo.annual.end);
  expect(
    (await s.deliver("evt_stale_year_end", "customer.subscription.updated"))
      .status,
  ).toBe(200);
  expect((await s.ledger()).periods).toHaveLength(2);
});

it("rejects foreign paid graphs and wrong account or mode before funding a wallet", async () => {
  const s = await setup();
  s.sub.latest_invoice.customer = "cus_other";
  // Unmapped customers are ignored. A mapped customer whose provider snapshot
  // contains a foreign invoice is a reconciliation error, not a valid grant.
  expect((await s.deliver()).status).toBe(200);
  expect(
    (
      await s.deliver(
        "evt_foreign_graph",
        "invoice.paid",
        undefined,
        "cus_synthetic",
      )
    ).status,
  ).toBe(503);
  expect((await s.ledger()).periods).toHaveLength(0);
  s.sub.latest_invoice.customer = "cus_synthetic";
  mocks.account.mockResolvedValue({ id: "acct_other" });
  expect((await s.deliver("evt_other_account")).status).toBe(400);
  expect((await s.ledger()).periods).toHaveLength(0);
  mocks.account.mockResolvedValue({ id: "acct_synthetic" });
  vi.stubEnv("STRIPE_MODE", "live");
  expect((await s.deliver("evt_wrong_mode")).status).toBe(400);
  expect((await s.ledger()).periods).toHaveLength(0);
});

const providerReceipt = process.env.VIBESCROLL_PRO_POLICY_RECEIPT;
it("preserves status and existing balances for historical legacy IDs outside the current checkout catalogue", async () => {
  const s = await setup();
  await s.t.mutation(internal.commerce.grantPeriod, {
    organizationId: s.org,
    subscription: s.sub.id,
    tier: "pro",
    interval: "monthly",
    start,
    end: intervalInfo.monthly.end,
    verifiedPayment: true,
    invoiceId: "in_legacy_historical",
  });
  const before = await s.ledger();
  s.sub.items.data[0].price.id = "price_historical_legacy";
  delete (s.sub.items.data[0].price.metadata as Partial<Record<string, string>>)
    .policy;
  expect((await s.deliver("evt_historical_legacy")).status).toBe(200);
  expect(await s.ledger()).toEqual(before);
  expect(
    (
      await s.t.query(internal.billing.byCustomer, {
        customerId: "cus_synthetic",
      })
    )?.status,
  ).toBe("active");
});
it("persists a confirmed risk before enrichment outages and defers new included grants without deleting credits", async () => {
  const s = await setup();
  expect((await s.deliver()).status).toBe(200);
  const before = await s.ledger();
  mocks.dispute.mockResolvedValue({
    id: "dp_outage",
    charge: "ch_outage",
    payment_intent: "pi_outage",
    status: "needs_response",
  });
  mocks.charge.mockResolvedValue({
    id: "ch_outage",
    customer: "cus_synthetic",
    livemode: false,
  });
  mocks.invoicePayments.mockRejectedValue(
    new Error("Synthetic provider outage"),
  );
  expect(
    (
      await s.deliver(
        "evt_outage",
        "charge.dispute.created",
        undefined,
        undefined,
        { id: "dp_outage" },
      )
    ).status,
  ).toBe(503);
  expect(
    await s.t.run((ctx) => ctx.db.query("billingRiskHolds").collect()),
  ).toHaveLength(1);
  await expect(
    s.t.run((ctx) => reserve(ctx, s.org, "held_work", 1)),
  ).rejects.toThrow("payment review");
  const next = intervalInfo.monthly.end;
  vi.mocked(Date.now).mockReturnValue(next + 2000);
  movePeriod(s.sub, next, Date.UTC(2027, 0, 31, 12));
  expect((await s.deliver("evt_paid_while_held")).status).toBe(200);
  expect((await s.ledger()).periods).toHaveLength(1);
  expect((await s.ledger()).pools).toEqual(before.pools);
});

it("holds only the mapped account on dispute/fraud risk, preserves existing work and resolves risks independently", async () => {
  const s = await setup();
  expect((await s.deliver()).status).toBe(200);
  await s.t.run((ctx) => reserve(ctx, s.org, "already_running", 10));
  const before = await s.ledger();
  mocks.dispute.mockResolvedValue({
    id: "dp_synthetic",
    charge: "ch_synthetic",
    payment_intent: "pi_synthetic",
    status: "needs_response",
  });
  mocks.warning.mockResolvedValue({
    id: "issfr_synthetic",
    charge: "ch_synthetic",
    payment_intent: "pi_synthetic",
    actionable: true,
  });
  mocks.charge.mockResolvedValue({
    id: "ch_synthetic",
    customer: "cus_synthetic",
    payment_intent: "pi_synthetic",
    livemode: false,
  });
  mocks.invoicePayments.mockResolvedValue({
    has_more: false,
    data: [{ invoice: s.sub.latest_invoice.id }],
  });
  mocks.invoice.mockImplementation(async () =>
    structuredClone(s.sub.latest_invoice),
  );
  const risk = (id: string, type: string, providerId: string) =>
    s.deliver(id, type, undefined, undefined, { id: providerId });
  expect(
    (await risk("evt_dispute", "charge.dispute.created", "dp_synthetic"))
      .status,
  ).toBe(200);
  expect(
    (await risk("evt_dispute", "charge.dispute.created", "dp_synthetic"))
      .status,
  ).toBe(200);
  expect(
    (
      await risk(
        "evt_warning",
        "radar.early_fraud_warning.created",
        "issfr_synthetic",
      )
    ).status,
  ).toBe(200);
  expect((await s.ledger()).pools).toEqual(before.pools);
  await expect(
    s.t.run((ctx) => reserve(ctx, s.org, "new_work", 1)),
  ).rejects.toThrow("payment review");
  await expect(
    s.t.mutation(internal.billing.reserveCheckout, { organizationId: s.org }),
  ).rejects.toThrow("payment review");
  // Reusing and settling existing work remains possible, with no lost hold.
  expect(
    await s.t.run((ctx) => reserve(ctx, s.org, "already_running", 10)),
  ).toBeDefined();
  await s.t.run((ctx) => settle(ctx, s.org, "already_running", 5));
  mocks.dispute.mockResolvedValue({
    id: "dp_synthetic",
    charge: "ch_synthetic",
    payment_intent: "pi_synthetic",
    status: "won",
  });
  expect(
    (await risk("evt_won", "charge.dispute.closed", "dp_synthetic")).status,
  ).toBe(200);
  await expect(
    s.t.run((ctx) => reserve(ctx, s.org, "still_held", 1)),
  ).rejects.toThrow("payment review");
  await expect(s.user.query(api.billingRisk.reviewQueue, {})).rejects.toThrow(
    "Invoice operator",
  );
  vi.stubEnv(
    "INVOICE_OPERATOR_SUBJECTS_JSON",
    JSON.stringify(["credit-owner"]),
  );
  const queue = await s.user.query(api.billingRisk.reviewQueue, {});
  expect(queue).toHaveLength(1);
  expect(queue[0].kind).toBe("fraud_warning");
  await s.user.mutation(api.billingRisk.releaseReviewed, {
    id: queue[0].id,
    reason: "Synthetic operator verified the payment and resolved the warning.",
  });
  // A delayed creation event cannot reopen either resolved provider risk.
  expect(
    (
      await risk(
        "evt_late_warning",
        "radar.early_fraud_warning.created",
        "issfr_synthetic",
      )
    ).status,
  ).toBe(200);
  await expect(
    s.t.run((ctx) => reserve(ctx, s.org, "after_review", 1)),
  ).resolves.toBeDefined();
  expect(
    (await s.t.run((ctx) => ctx.db.query("billingRiskHolds").collect())).map(
      (r) => r.state,
    ),
  ).toEqual(["released", "released"]);
});

it("does not place a financial hold on another workspace from an unrelated provider customer", async () => {
  const s = await setup();
  mocks.dispute.mockResolvedValue({
    id: "dp_other",
    charge: "ch_other",
    payment_intent: "pi_other",
    status: "needs_response",
  });
  mocks.charge.mockResolvedValue({
    id: "ch_other",
    customer: "cus_unmapped",
    livemode: false,
  });
  expect(
    (
      await s.deliver(
        "evt_other_risk",
        "charge.dispute.created",
        undefined,
        undefined,
        { id: "dp_other" },
      )
    ).status,
  ).toBe(200);
  expect(
    await s.t.run((ctx) => ctx.db.query("billingRiskHolds").collect()),
  ).toHaveLength(0);
  expect(mocks.invoicePayments).not.toHaveBeenCalled();
});

it("preserves the current wallet and entitlement if an activated price loses its policy mapping", async () => {
  const s = await setup();
  expect((await s.deliver()).status).toBe(200);
  const before = await s.ledger();
  vi.stubEnv("STRIPE_PRO_CREDIT_POLICY_V2_JSON", "");
  expect((await s.deliver("evt_missing_mapping")).status).toBe(503);
  expect(await s.ledger()).toEqual(before);
  expect(
    (
      await s.t.query(internal.billing.byCustomer, {
        customerId: "cus_synthetic",
      })
    )?.status,
  ).toBe("active");
});
it.skipIf(!providerReceipt)(
  "accepts retained actual sandbox shapes through locally signed HTTP delivery without live wallet writes",
  async () => {
    const path = resolve(providerReceipt!);
    expect(path).toBe(
      resolve(
        "outputs/credit-policy-private-20261101/current-provider-shapes.private.json",
      ),
    );
    const receipt = JSON.parse(readFileSync(path, "utf8"));
    expect(receipt).toMatchObject({
      sandboxOnly: true,
      readOnly: true,
      providerWrites: 0,
    });
    expect(receipt.records).toHaveLength(3);
    for (const record of receipt.records) {
      const s = await setup();
      const item = record.subscription.items.data[0];
      vi.mocked(Date.now).mockReturnValue(
        item.current_period_start * 1000 + 2000,
      );
      vi.stubEnv("STRIPE_ACCOUNT_ID", receipt.config.accountId);
      vi.stubEnv(
        "STRIPE_PRO_CREDIT_POLICY_V2_JSON",
        JSON.stringify(receipt.config),
      );
      mocks.account.mockResolvedValue({ id: receipt.config.accountId });
      mocks.customer.mockResolvedValue({
        id: record.subscription.customer,
        deleted: false,
      });
      const provider = {
        ...record.subscription,
        latest_invoice: record.invoice,
      };
      mocks.subscriptions.mockResolvedValue({
        data: [provider],
        has_more: false,
      });
      // Bind an isolated synthetic account to the retained sandbox object graph.
      // No real app account or Stripe Customer record is modified.
      await s.t.run(async (ctx) => {
        const row = (await ctx.db.query("billing").collect())[0];
        await ctx.db.patch(row._id, {
          customerId: record.subscription.customer,
        });
      });
      Object.assign(s.sub.latest_invoice, record.invoice);
      expect((await s.deliver("evt_provider_shape")).status).toBe(200);
      const periods = (await s.ledger()).periods;
      if (provider.status === "active") {
        expect(periods).toHaveLength(1);
        expect(periods[0].credits).toBe(record.interval === "week" ? 75 : 300);
        expect(periods[0].end).toBeLessThanOrEqual(
          item.current_period_end * 1000,
        );
      } else expect(periods).toHaveLength(0);
      vi.restoreAllMocks();
      vi.resetAllMocks();
    }
  },
);
