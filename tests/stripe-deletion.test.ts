import { convexTest } from "convex-test";
import { grantPaidPeriod } from "./allowance-fixture";
import { monthlyAnchor } from "../packages/policy";
import { afterEach, expect, it, vi } from "vitest";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { missingStripeCustomer } from "../packages/providers/stripe-deletion";

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
    webhooks = { constructEvent: (body: string) => JSON.parse(body) };
  },
}));
const modules = import.meta.glob("../convex/**/*.ts");
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});
async function setup() {
  vi.stubEnv("STRIPE_SECRET_KEY", "rk_test_synthetic");
  vi.stubEnv("STRIPE_ACCOUNT_ID", "acct_synthetic");
  mocks.account.mockResolvedValue({ id: "acct_synthetic" });
  const t = convexTest(schema, modules);
  await t.mutation(internal.accounts.syncUser, {
    subject: "synthetic-deletion",
    email: "deletion@example.test",
    name: "Synthetic",
  });
  const user = t.withIdentity({ subject: "synthetic-deletion" });
  const organizationId = await user.mutation(api.organizations.create, {
    name: "Synthetic",
  });
  await t.mutation(internal.billing.attach, {
    organizationId,
    customerId: "cus_synthetic",
  });
  await t.mutation(internal.billing.apply, {
    customerId: "cus_synthetic",
    subscriptionId: "sub_synthetic",
    status: "active",
    periodEnd: Date.now() + 86400000,
    revision: 0,
  });
  return { t, organizationId, user };
}

it("recognizes only a provider-confirmed missing customer, not permissions or outages", () => {
  expect(
    missingStripeCustomer({
      code: "resource_missing",
      statusCode: 404,
      param: "customer",
    }),
  ).toBe(true);
  for (const error of [
    null,
    { statusCode: 404 },
    { code: "resource_missing", statusCode: 403, param: "customer" },
    { code: "resource_missing", statusCode: 404, param: "invoice" },
  ])
    expect(missingStripeCustomer(error)).toBe(false);
});

it("ends included credits on deletion, preserves purchased credits and membership, ignores stale grants, and can relink", async () => {
  const { t, organizationId, user } = await setup();
  const start = Date.now() - 1000,
    end = monthlyAnchor(start, 1);
  await grantPaidPeriod(t, {
    organizationId,
    subscription: "sub_synthetic",
    tier: "pro",
    interval: "monthly",
    start,
    end,
    verifiedPayment: true,
    invoiceId: "in_synthetic",
  });
  await t.mutation(internal.commerce.grantTopup, {
    organizationId,
    paymentId: "pi_synthetic",
    credits: 200,
  });
  mocks.customer.mockResolvedValue({ id: "cus_synthetic", deleted: true });
  await t.action(internal.reconciliation.customer, {
    customerId: "cus_synthetic",
  });
  const row = await t.query(internal.billing.byCustomer, {
    customerId: "cus_synthetic",
  });
  expect(row).toMatchObject({ status: "free", periodEnd: 0 });
  expect(row?.providerDeletedAt).toBeGreaterThan(0);
  expect(row?.subscriptionId).toBeUndefined();
  expect(mocks.subscriptions).not.toHaveBeenCalled();
  const before = await t.run(
    async (ctx) => await ctx.db.query("creditPools").collect(),
  );
  expect(
    before.find((p) => p.kind === "included")?.expiresAt,
  ).toBeLessThanOrEqual(Date.now());
  expect(before.find((p) => p.kind === "purchased")?.granted).toBe(200);
  await t.mutation(internal.billing.apply, {
    customerId: "cus_synthetic",
    status: "active",
    subscriptionId: "sub_synthetic",
    periodEnd: end,
    revision: 99,
  });
  await t.mutation(internal.commerce.grantPeriod, {
    organizationId,
    subscription: "sub_synthetic",
    tier: "pro",
    interval: "monthly",
    start: end,
    end: end + 86400000,
    verifiedPayment: true,
    billingRevision: 99,
  });
  expect(
    (
      await t.query(internal.billing.byCustomer, {
        customerId: "cus_synthetic",
      })
    )?.status,
  ).toBe("free");
  expect(
    await t.run(async (ctx) => await ctx.db.query("creditPools").collect()),
  ).toEqual(before);
  expect(
    (await user.query(api.billing.authorize, { organizationId })).name,
  ).toBe("Synthetic");
  await t.action(internal.reconciliation.customer, {
    customerId: "cus_synthetic",
  });
  expect(mocks.customer).toHaveBeenCalledTimes(1);
  expect(
    await t.mutation(internal.billing.attach, {
      organizationId,
      customerId: "cus_relinked",
    }),
  ).toBe("cus_relinked");
  expect(
    await t.query(internal.billing.byCustomer, { customerId: "cus_synthetic" }),
  ).toBeNull();
  expect(
    await t.query(internal.billing.byCustomer, { customerId: "cus_relinked" }),
  ).toMatchObject({ status: "free" });
});

it("a wrong account or provider outage never marks a customer deleted", async () => {
  const { t } = await setup();
  mocks.account.mockResolvedValue({ id: "acct_other" });
  await expect(
    t.action(internal.reconciliation.customer, { customerId: "cus_synthetic" }),
  ).rejects.toThrow("does not match");
  expect(mocks.customer).not.toHaveBeenCalled();
  mocks.account.mockResolvedValue({ id: "acct_synthetic" });
  mocks.customer.mockRejectedValue({ code: "api_connection_error" });
  await expect(
    t.action(internal.reconciliation.customer, { customerId: "cus_synthetic" }),
  ).rejects.toBeDefined();
  expect(
    (
      await t.query(internal.billing.byCustomer, {
        customerId: "cus_synthetic",
      })
    )?.status,
  ).toBe("active");
});

it("reconciles hard-deleted provider objects on polling without relying on a deletion webhook", async () => {
  const { t } = await setup();
  mocks.customer.mockRejectedValue({
    code: "resource_missing",
    statusCode: 404,
    param: "id",
  });
  await t.action(internal.reconciliation.customer, {
    customerId: "cus_synthetic",
  });
  expect(
    (
      await t.query(internal.billing.byCustomer, {
        customerId: "cus_synthetic",
      })
    )?.status,
  ).toBe("free");
});

it("grants a delayed top-up once after payment succeeds, never on an unpaid or wrong-price event", async () => {
  const { t } = await setup();
  vi.stubEnv("STRIPE_MODE", "test");
  vi.stubEnv("STRIPE_V1_WEBHOOK_SECRET", "whsec_synthetic");
  vi.stubEnv("STRIPE_TOPUP_200_PRICE_ID", "price_synthetic");
  const linked = await t.query(internal.billing.byCustomer, {
    customerId: "cus_synthetic",
  });
  mocks.customer.mockResolvedValue({ id: "cus_synthetic" });
  mocks.subscriptions.mockResolvedValue({ data: [], has_more: false });
  const session = {
    id: "cs_synthetic",
    customer: "cus_synthetic",
    payment_intent: "pi_syntheticAsync",
    livemode: false,
    payment_status: "unpaid",
    metadata: {
      product: "vibescroller",
      organizationId: linked!.organizationId,
      credits: "200",
    },
    line_items: {
      data: [{ quantity: 1, price: { id: "price_synthetic" } }],
      has_more: false,
    },
  };
  async function event(type: string, id: string) {
    mocks.session.mockResolvedValue(session);
    return t.action(internal.reconciliation.stripeEvent, {
      body: JSON.stringify({
        id,
        type,
        livemode: false,
        data: {
          object: {
            id: session.id,
            mode: "payment",
            customer: session.customer,
          },
        },
      }),
      signature: "synthetic-verified-fixture",
    });
  }
  await event("checkout.session.completed", "evt_syntheticUnpaid");
  expect(
    await t.run(async (ctx) => await ctx.db.query("creditPools").collect()),
  ).toHaveLength(0);
  session.payment_status = "paid";
  session.line_items.data[0].price.id = "price_other";
  await event(
    "checkout.session.async_payment_succeeded",
    "evt_syntheticWrongPrice",
  );
  expect(
    await t.run(async (ctx) => await ctx.db.query("creditPools").collect()),
  ).toHaveLength(0);
  session.line_items.data[0].price.id = "price_synthetic";
  await event("checkout.session.async_payment_succeeded", "evt_syntheticPaid");
  await event("checkout.session.async_payment_succeeded", "evt_syntheticPaid");
  const pools = await t.run(
    async (ctx) => await ctx.db.query("creditPools").collect(),
  );
  expect(pools).toHaveLength(1);
  expect(pools[0]).toMatchObject({ kind: "purchased", granted: 200 });
});
