import { beforeEach, expect, it, vi } from "vitest";
import { checkoutPaymentRoute } from "../../packages/providers/stripe-checkout";
const doubles = vi.hoisted(() => ({ action: vi.fn(), redirect: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: doubles.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@workos-inc/authkit-nextjs", () => ({ signOut: vi.fn() }));
vi.mock("@/lib/backend", () => ({
  backend: async () => ({ action: doubles.action }),
  api: {
    billingV1: { checkout: "checkout", topup: "topup" },
    payments: { refreshBilling: "refreshBilling" },
  },
}));
import { startV1Checkout, buyV1Credits, refreshBilling } from "./app/actions";
const tax = {
  domestic: "pending_evidence" as const,
  special317: false,
  registrations: [],
  countries: ["RO"],
  oss: false,
  reviewed: false,
};
beforeEach(() => {
  vi.clearAllMocks();
  doubles.action.mockImplementation(async (_endpoint, args) => {
    checkoutPaymentRoute({
      ...args,
      tax,
      route: "managed_payments",
      live: true,
      managedVerified: true,
      managedMarket: "tax_covered",
      managedMarketVerified: true,
    });
    return "https://checkout.stripe.com/synthetic";
  });
  doubles.redirect.mockImplementation(() => {
    throw new Error("REDIRECT");
  });
});
it("hands subscription and top-up forms without a country selector to verified provider address collection", async () => {
  for (const submit of [startV1Checkout, buyV1Credits]) {
    for (const country of [null, ""]) {
      const d = new FormData();
      d.set("organizationId", "synthetic");
      d.set("tier", "starter");
      d.set("interval", "weekly");
      d.set("pack", "200");
      d.set("terms", "on");
      if (country !== null) d.set("country", country);
      await expect(submit({}, d)).rejects.toThrow("REDIRECT");
      expect(doubles.action.mock.lastCall?.[1]).toMatchObject({
        country: undefined,
        termsAccepted: true,
        immediateService: false,
      });
    }
  }
});
it("does not erase an explicit excluded country or turn absent consent into permission", async () => {
  const d = new FormData();
  d.set("country", "CN");
  d.set("organizationId", "synthetic");
  const result = await startV1Checkout({}, d);
  expect(result).toHaveProperty("error");
  expect(doubles.redirect).not.toHaveBeenCalled();
  expect(doubles.action.mock.lastCall?.[1]).toMatchObject({
    country: "CN",
    termsAccepted: false,
    immediateService: false,
  });
});
it("does not broaden direct billing when a country is absent", async () => {
  doubles.action.mockImplementation(async (_endpoint, args) =>
    checkoutPaymentRoute({
      ...args,
      tax,
      route: "direct",
      live: true,
      managedVerified: true,
    }),
  );
  const result = await startV1Checkout({}, new FormData());
  expect(result).toHaveProperty("error");
  expect(doubles.redirect).not.toHaveBeenCalled();
});
it("explains an allowance reconciliation hold without inviting another purchase", async () => {
  doubles.action.mockResolvedValue({ allowance: "held" });
  const d = new FormData();
  d.set("organizationId", "synthetic");
  const result = await refreshBilling({}, d);
  expect(doubles.action).toHaveBeenCalledWith("refreshBilling", {
    organizationId: "synthetic",
  });
  expect(result).toEqual({
    message:
      "We could not verify a new allowance from the purchase records. Existing issued credits and saved work are unchanged. Contact support before buying again.",
  });
  expect(doubles.redirect).not.toHaveBeenCalled();
});
it("keeps the normal refresh result when reconciliation reports no hold", async () => {
  doubles.action.mockResolvedValue(undefined);
  expect(await refreshBilling({}, new FormData())).toEqual({
    message: "Billing refreshed from Stripe.",
  });
});
