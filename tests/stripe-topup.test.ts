import { convexTest } from "convex-test";
import { afterEach, expect, it, vi } from "vitest";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
const mocks = vi.hoisted(() => ({
  account: vi.fn(),
  price: vi.fn(),
  checkout: vi.fn(),
}));
vi.mock("stripe", () => ({
  default: class {
    accounts = { retrieve: mocks.account };
    prices = { retrieve: mocks.price };
    checkout = { sessions: { create: mocks.checkout } };
  },
}));
const modules = import.meta.glob("../convex/**/*.ts");
afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});
async function setup() {
  vi.stubEnv("STRIPE_MODE", "test");
  vi.stubEnv("STRIPE_SECRET_KEY", "rk_test_synthetic");
  vi.stubEnv("STRIPE_ACCOUNT_ID", "acct_vibe_synthetic");
  vi.stubEnv("STRIPE_BILLING_ROUTE", "managed_payments");
  vi.stubEnv("STRIPE_TOPUP_200_PRICE_ID", "price_synthetic200");
  mocks.account.mockResolvedValue({ id: "acct_vibe_synthetic" });
  mocks.price.mockResolvedValue({
    id: "price_synthetic200",
    active: true,
    recurring: null,
    unit_amount: 1700,
    currency: "eur",
    tax_behavior: "inclusive",
    metadata: { product: "vibescroller" },
  });
  mocks.checkout.mockResolvedValue({
    url: "https://checkout.stripe.com/synthetic-test",
  });
  vi.stubEnv("APP_URL", "https://example.test");
  const t = convexTest(schema, modules);
  await t.mutation(internal.accounts.syncUser, {
    subject: "topup-test",
    email: "topup@example.test",
    name: "Synthetic",
  });
  const user = t.withIdentity({ subject: "topup-test" });
  const organizationId = await user.mutation(api.organizations.create, {
    name: "Synthetic topup",
  });
  await t.mutation(internal.billing.attach, {
    organizationId,
    customerId: "cus_synthetic",
  });
  return {
    t,
    user,
    args: {
      organizationId,
      pack: "200" as const,
      country: "RO",
      termsAccepted: true,
      immediateService: false,
    },
  };
}
it("uses the selected MoR route with required terms and an identical-session retry", async () => {
  const { user, args } = await setup();
  await user.action(api.billingV1.topup, args);
  await user.action(api.billingV1.topup, args);
  const [request, options] = mocks.checkout.mock.calls[0];
  expect(request.managed_payments).toEqual({ enabled: true });
  expect(request.automatic_tax).toBeUndefined();
  expect(request.adaptive_pricing).toBeUndefined();
  expect(request.customer_update).toBeUndefined();
  expect(request.consent_collection).toEqual({ terms_of_service: "required" });
  expect(request.billing_address_collection).toBe("required");
  expect(request.metadata.checkoutKey).toBe(options.idempotencyKey);
  expect(mocks.checkout.mock.calls[1][1].idempotencyKey).toBe(
    options.idempotencyKey,
  );
});
it("rejects missing consent, disabled countries and wrong provider accounts before creating a session", async () => {
  const { user, args } = await setup();
  await expect(
    user.action(api.billingV1.topup, { ...args, termsAccepted: false }),
  ).rejects.toThrow("Accept the displayed terms");
  await expect(
    user.action(api.billingV1.topup, { ...args, country: "US" }),
  ).rejects.toThrow("unavailable in this country");
  mocks.account.mockResolvedValue({ id: "acct_other_synthetic" });
  await expect(user.action(api.billingV1.topup, args)).rejects.toThrow(
    "does not match",
  );
  expect(mocks.checkout).not.toHaveBeenCalled();
});

it("refuses a missing return origin before provider calls or billing-intent writes", async () => {
  const { t, user, args } = await setup();
  vi.stubEnv("APP_URL", "");
  await expect(user.action(api.billingV1.topup, args)).rejects.toThrow(
    "return origin is not configured",
  );
  expect(mocks.account).not.toHaveBeenCalled();
  expect(mocks.price).not.toHaveBeenCalled();
  expect(mocks.checkout).not.toHaveBeenCalled();
  const billing = await t.run(
    async (ctx) => await ctx.db.query("billing").first(),
  );
  expect(billing).not.toBeNull();
  expect(billing?.checkoutIntent).toBeUndefined();
});

it.each([
  ["200", 1700],
  ["500", 3500],
] as const)(
  "quotes the approved %s-credit pack and refuses its old price",
  async (pack, amount) => {
    const { user, args } = await setup();
    vi.stubEnv(`STRIPE_TOPUP_${pack}_PRICE_ID`, `price_synthetic${pack}`);
    mocks.price.mockResolvedValue({
      id: `price_synthetic${pack}`,
      active: true,
      recurring: null,
      unit_amount: amount,
      currency: "eur",
      tax_behavior: "inclusive",
      metadata: { product: "vibescroller" },
    });
    await user.action(api.billingV1.topup, { ...args, pack });
    expect(mocks.checkout.mock.calls[0][0].metadata.credits).toBe(pack);
    expect(mocks.checkout.mock.calls[0][0].line_items[0].price).toBe(
      `price_synthetic${pack}`,
    );
    mocks.price.mockResolvedValue({
      active: true,
      recurring: null,
      unit_amount: pack === "200" ? 1000 : 2500,
      currency: "eur",
      tax_behavior: "inclusive",
      metadata: { product: "vibescroller" },
    });
    await expect(
      user.action(api.billingV1.topup, { ...args, pack }),
    ).rejects.toThrow("catalogue mismatch");
    expect(mocks.checkout).toHaveBeenCalledTimes(1);
  },
);
