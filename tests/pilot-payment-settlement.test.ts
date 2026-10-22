import { afterEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import type { PilotProviderEvent } from "../convex/lib/pilotPayments";
const mocks = vi.hoisted(() => ({
  account: vi.fn(),
  customer: vi.fn(),
  subscriptions: vi.fn(),
  session: vi.fn(),
}));
vi.mock("stripe", () => ({
  default: class {
    accounts = { retrieve: mocks.account };
    customers = { retrieve: mocks.customer };
    subscriptions = { list: mocks.subscriptions };
    checkout = { sessions: { retrieve: mocks.session } };
    webhooks = {
      constructEvent: (body: string, signature: string) => {
        if (signature !== "synthetic_verified_signature")
          throw Error("Invalid signature");
        return JSON.parse(body);
      },
    };
  },
}));
const modules = import.meta.glob("../convex/**/*.ts");
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});
async function setup(consented = true) {
  const now = Date.now();
  vi.stubEnv("STRIPE_MODE", "test");
  vi.stubEnv("STRIPE_ACCOUNT_ID", "acct_pilot_synthetic");
  vi.stubEnv("STRIPE_SECRET_KEY", "rk_test_synthetic");
  vi.stubEnv("STRIPE_V1_WEBHOOK_SECRET", "whsec_synthetic");
  vi.stubEnv("STRIPE_STARTER_MONTHLY_PRICE_ID", "price_monthly_synthetic");
  vi.stubEnv("STRIPE_TOPUP_200_PRICE_ID", "price_topup_synthetic");
  vi.stubEnv("PILOT_PAYMENT_MEASUREMENT_ENABLED", "true");
  vi.stubEnv("PILOT_PAYMENT_MEASUREMENT_START_AT_MS", String(now - 60000));
  const t = convexTest(schema, modules);
  await t.mutation(internal.accounts.syncUser, {
    subject: "pilot-owner",
    email: "pilot@example.test",
    name: "Synthetic pilot",
  });
  const user = t.withIdentity({ subject: "pilot-owner" });
  const organizationId = await user.mutation(api.organizations.create, {
    name: "Synthetic pilot",
  });
  vi.stubEnv(
    "PILOT_PAYMENT_ORGANIZATIONS_JSON",
    JSON.stringify([organizationId]),
  );
  await t.mutation(internal.billing.attach, {
    organizationId,
    customerId: "cus_pilot_synthetic",
  });
  await t.mutation(internal.billing.apply, {
    customerId: "cus_pilot_synthetic",
    subscriptionId: "sub_pilot_synthetic",
    status: "active",
    periodEnd: now + 31 * 86400000,
    revision: 0,
  });
  await t.run((ctx) =>
    ctx.db.insert("preferences", {
      organizationId,
      email: false,
      telegram: false,
      analytics: consented,
      legalVersion: "synthetic",
      createdAt: now - 10000,
      updatedAt: now - 10000,
      acceptedAt: now - 10000,
    }),
  );
  const evidence: PilotProviderEvent = {
    eventId: "evt_paid_synthetic",
    accountId: "acct_pilot_synthetic",
    mode: "test",
    paymentId: "in_paid_synthetic",
    eventType: "invoice.paid",
    occurredAt: now - 1000,
    settlement: "settled",
  };
  const grant = {
    organizationId,
    subscription: "sub_pilot_synthetic",
    tier: "starter" as const,
    interval: "monthly" as const,
    start: now - 1000,
    end: now + 31 * 86400000,
    verifiedPayment: true,
    invoiceId: "in_paid_synthetic",
    billingRevision: 0,
    pilotEvent: evidence,
  };
  mocks.account.mockResolvedValue({ id: "acct_pilot_synthetic" });
  mocks.customer.mockResolvedValue({
    id: "cus_pilot_synthetic",
    deleted: false,
  });
  mocks.subscriptions.mockResolvedValue({ data: [] });
  return { t, user, organizationId, evidence, grant, now };
}
it("atomically records one minimal observation for an accepted monthly ledger settlement, including concurrent/replayed events", async () => {
  const { t, grant } = await setup();
  await Promise.all([
    t.mutation(internal.commerce.grantPeriod, grant),
    t.mutation(internal.commerce.grantPeriod, grant),
  ]);
  await t.mutation(internal.commerce.grantPeriod, {
    ...grant,
    pilotEvent: {
      ...grant.pilotEvent,
      eventId: "evt_duplicate_provider_delivery",
    },
  });
  const rows = await t.run((ctx) =>
    ctx.db.query("pilotPaymentObservations").collect(),
  );
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    state: "pending",
    event: "payment_verified",
    mode: "test",
    purchaseKind: "monthly_subscription",
    properties: {
      schema_version: "1",
      mode: "test",
      purchase_kind: "monthly_subscription",
    },
  });
  expect(rows[0].key).toMatch(/^pilot-payment:test:[a-f0-9]{64}$/);
  expect(JSON.stringify(rows[0])).not.toContain("in_paid_synthetic");
  expect(JSON.stringify(rows[0].properties)).not.toContain("organization");
  expect(
    await t.run((ctx) => ctx.db.query("creditFunding").collect()),
  ).toHaveLength(1);
});
it("does not count rejected or stale grants, missing verification, pending/failed/refunded evidence, or mismatched identities", async () => {
  for (const change of [{ verifiedPayment: false }, { billingRevision: 99 }]) {
    const { t, grant } = await setup();
    if (change.verifiedPayment === false)
      await expect(
        t.mutation(internal.commerce.grantPeriod, { ...grant, ...change }),
      ).rejects.toThrow("Verified payment");
    else
      await t.mutation(internal.commerce.grantPeriod, { ...grant, ...change });
    expect(
      await t.run((ctx) => ctx.db.query("pilotPaymentObservations").collect()),
    ).toEqual([]);
  }
  for (const evidenceChange of [
    { settlement: "pending" as const },
    { settlement: "failed" as const },
    { settlement: "refunded" as const },
    { accountId: "acct_foreign" },
    { mode: "live" as const },
    { paymentId: "in_other" },
  ]) {
    const { t, grant } = await setup();
    await t.mutation(internal.commerce.grantPeriod, {
      ...grant,
      pilotEvent: { ...grant.pilotEvent, ...evidenceChange },
    });
    expect(
      await t.run((ctx) => ctx.db.query("pilotPaymentObservations").collect()),
    ).toEqual([]);
  }
  const { t, grant } = await setup();
  await t.mutation(internal.commerce.grantPeriod, {
    ...grant,
    pilotEvent: undefined,
  });
  expect(
    await t.run((ctx) => ctx.db.query("pilotPaymentObservations").collect()),
  ).toEqual([]);
});
it("requires pre-existing analytics consent, current cohort enrollment and the closed-by-default server measurement gate", async () => {
  for (const flag of [
    "unconsented",
    "not-in-cohort",
    "disabled",
    "late-consent",
  ]) {
    const { t, grant, organizationId } = await setup(flag !== "unconsented");
    if (flag === "not-in-cohort")
      vi.stubEnv("PILOT_PAYMENT_ORGANIZATIONS_JSON", "[]");
    if (flag === "disabled")
      vi.stubEnv("PILOT_PAYMENT_MEASUREMENT_ENABLED", "false");
    if (flag === "late-consent")
      await t.run(async (ctx) => {
        const row = await ctx.db
          .query("preferences")
          .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
          .unique();
        await ctx.db.patch(row!._id, { updatedAt: Date.now() });
      });
    await t.mutation(internal.commerce.grantPeriod, grant);
    expect(
      await t.run((ctx) => ctx.db.query("pilotPaymentObservations").collect()),
    ).toEqual([]);
  }
});
it("withdraws pending observations on refund or consent revocation and retains replay tombstones", async () => {
  const { t, user, organizationId, evidence } = await setup();
  const topup = {
    organizationId,
    paymentId: "pi_topup_synthetic",
    credits: 200,
    pilotEvent: {
      ...evidence,
      paymentId: "pi_topup_synthetic",
      eventType: "checkout.session.completed" as const,
    },
  };
  await t.mutation(internal.commerce.grantTopup, topup);
  await t.mutation(internal.commerce.grantTopup, topup);
  expect(
    await t.run((ctx) => ctx.db.query("pilotPaymentObservations").collect()),
  ).toHaveLength(1);
  await t.mutation(internal.commerce.reversePayment, {
    organizationId,
    paymentId: topup.paymentId,
    refunded: 100,
    total: 1000,
  });
  await t.mutation(internal.commerce.grantTopup, topup);
  let rows = await t.run((ctx) =>
    ctx.db.query("pilotPaymentObservations").collect(),
  );
  expect(rows).toHaveLength(1);
  expect(rows[0].state).toBe("withdrawn");
  const second = {
    ...topup,
    paymentId: "pi_second_synthetic",
    pilotEvent: { ...topup.pilotEvent, paymentId: "pi_second_synthetic" },
  };
  await t.mutation(internal.commerce.grantTopup, second);
  await user.mutation(api.commerce.preferences, {
    organizationId,
    email: false,
    telegram: false,
    analytics: false,
    legalVersion: "synthetic",
  });
  rows = await t.run((ctx) =>
    ctx.db.query("pilotPaymentObservations").collect(),
  );
  expect(rows).toHaveLength(2);
  expect(rows.every((row) => row.state === "withdrawn")).toBe(true);
});
it("wires only the signature/account/mode-verified paid monthly webhook to the actual accepted entitlement transaction", async () => {
  const { t, now } = await setup();
  mocks.subscriptions.mockResolvedValue({
    data: [
      {
        id: "sub_pilot_synthetic",
        created: Math.floor(now / 1000) - 100,
        livemode: false,
        status: "active",
        metadata: { product: "vibescroller", billingRoute: "managed_payments" },
        items: {
          data: [
            {
              current_period_start: Math.floor(now / 1000) - 1,
              current_period_end: Math.floor(now / 1000) + 31 * 86400,
              price: {
                id: "price_monthly_synthetic",
                metadata: { tier: "starter", interval: "monthly" },
              },
            },
          ],
        },
        latest_invoice: {
          id: "in_paid_synthetic",
          status: "paid",
          amount_paid: 1900,
          livemode: false,
        },
      },
    ],
  });
  const event = {
    id: "evt_actual_pipeline",
    created: Math.floor((now - 1000) / 1000),
    livemode: false,
    account: "acct_pilot_synthetic",
    type: "invoice.paid",
    data: {
      object: {
        id: "in_paid_synthetic",
        customer: "cus_pilot_synthetic",
        status: "paid",
      },
    },
  };
  expect(
    await t.action(internal.reconciliation.stripeEvent, {
      body: JSON.stringify(event),
      signature: "unverified",
    }),
  ).toEqual({ status: 400 });
  expect(
    await t.run((ctx) => ctx.db.query("pilotPaymentObservations").collect()),
  ).toEqual([]);
  expect(
    await t.action(internal.reconciliation.stripeEvent, {
      body: JSON.stringify({ ...event, account: "acct_foreign" }),
      signature: "synthetic_verified_signature",
    }),
  ).toEqual({ status: 400 });
  expect(
    await t.action(internal.reconciliation.stripeEvent, {
      body: JSON.stringify({ ...event, livemode: true }),
      signature: "synthetic_verified_signature",
    }),
  ).toEqual({ status: 400 });
  for (let i = 0; i < 2; i++)
    expect(
      await t.action(internal.reconciliation.stripeEvent, {
        body: JSON.stringify(event),
        signature: "synthetic_verified_signature",
      }),
    ).toEqual({ status: 200 });
  expect(
    await t.run((ctx) => ctx.db.query("pilotPaymentObservations").collect()),
  ).toHaveLength(1);
});
it("records a verified positive paid topup once and excludes unpaid or zero-amount checkouts", async () => {
  for (const scenario of [
    { status: "paid", amount: 1000, count: 1 },
    { status: "unpaid", amount: 1000, count: 0 },
    { status: "paid", amount: 0, count: 0 },
  ]) {
    const { t, organizationId, now } = await setup();
    mocks.session.mockResolvedValue({
      payment_status: scenario.status,
      metadata: { product: "vibescroller", organizationId, credits: "200" },
      customer: "cus_pilot_synthetic",
      livemode: false,
      payment_intent: "pi_webhook_synthetic",
      amount_total: scenario.amount,
      line_items: {
        has_more: false,
        data: [{ quantity: 1, price: { id: "price_topup_synthetic" } }],
      },
    });
    const event = {
      id: "evt_topup_pipeline",
      created: Math.floor((now - 1000) / 1000),
      livemode: false,
      account: "acct_pilot_synthetic",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_synthetic",
          mode: "payment",
          customer: "cus_pilot_synthetic",
        },
      },
    };
    for (let i = 0; i < 2; i++)
      expect(
        await t.action(internal.reconciliation.stripeEvent, {
          body: JSON.stringify(event),
          signature: "synthetic_verified_signature",
        }),
      ).toEqual({ status: 200 });
    const rows = await t.run((ctx) =>
      ctx.db.query("pilotPaymentObservations").collect(),
    );
    expect(rows).toHaveLength(scenario.count);
    if (rows.length) expect(rows[0].properties.purchase_kind).toBe("topup");
  }
});
it("withdraws monthly invoice observations on a verified refund without recounting the paid replay", async () => {
  const { t, organizationId, grant } = await setup();
  await t.mutation(internal.commerce.grantPeriod, grant);
  await t.mutation(internal.commerce.reversePayment, {
    organizationId,
    paymentId: "pi_monthly_refund",
    invoiceId: grant.invoiceId,
    invoiceTotal: 1900,
    refunded: 1900,
    total: 1900,
  });
  await t.mutation(internal.commerce.grantPeriod, grant);
  const rows = await t.run((ctx) =>
    ctx.db.query("pilotPaymentObservations").collect(),
  );
  expect(rows).toHaveLength(1);
  expect(rows[0].state).toBe("withdrawn");
});
