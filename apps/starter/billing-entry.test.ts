import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { isValidElement, type ReactElement } from "react";
const mock = vi.hoisted(() => ({
  mutation: vi.fn(),
  query: vi.fn(),
  cookie: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: mock.cookie }),
}));
vi.mock("@/lib/backend", () => ({
  backend: async () => mock,
  api: {
    organizations: { createPrivate: "personal", ensureDefault: "default" },
    billing: { authorize: "authorize" },
    commerce: { catalogue: "catalogue" },
    product: { usage: "usage" },
    onboarding: { status: "onboarding-status" },
  },
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));
vi.mock("./app/actions", () => ({
  startV1Checkout: vi.fn(),
  cancelV1Subscription: vi.fn(),
  buyV1Credits: vi.fn(),
  requestV1Refund: vi.fn(),
  billingPortal: vi.fn(),
  refreshBilling: vi.fn(),
}));
import Page from "./app/app/page";
import BillingPage from "./app/app/[org]/billing/page";
import { startV1Checkout, buyV1Credits, refreshBilling } from "./app/actions";
afterEach(() => vi.resetAllMocks());
beforeEach(() =>
  mock.query.mockResolvedValue({ legacy: true, paid: false, progress: null }),
);
it("opens personal Pro billing even when the selected workspace is a team", async () => {
  mock.mutation.mockResolvedValue("my-personal-account");
  await expect(
    Page({
      searchParams: Promise.resolve({
        view: "billing",
        workspace: "team-account",
      }),
    }),
  ).rejects.toThrow("redirect:/app/my-personal-account/billing?tier=pro");
  expect(mock.mutation).toHaveBeenCalledExactlyOnceWith("personal", {});
});

type Node = ReactElement<Record<string, any>>;
function nodes(value: any): Node[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!isValidElement(value)) return [];
  return [
    value as Node,
    ...nodes((value.props as any).children),
    ...nodes((value.props as any).action),
  ];
}
function billingData(
  billing: object | null,
  wallet: object | null = null,
  pools: object[] = [],
) {
  mock.query.mockImplementation(async (endpoint) =>
    endpoint === "onboarding-status"
      ? { legacy: true, paid: false, progress: null }
      : endpoint === "authorize"
        ? { personal: true, billing }
        : endpoint === "catalogue"
          ? {
              proOffer: { configured: true },
              liveEnabled: true,
              sandboxEnabled: false,
              billingCountryRequired: false,
              countries: [],
            }
          : { wallet, pools, entries: [], reservations: [] },
  );
}
it("offers read-only reconciliation rather than a second checkout after an unverified checkout return", async () => {
  billingData(null);
  const tree = nodes(
    await BillingPage({
      params: Promise.resolve({ org: "personal" }),
      searchParams: Promise.resolve({ checkout: "complete" }),
    }),
  );
  expect(tree.some((node) => node.props.action === startV1Checkout)).toBe(
    false,
  );
  expect(tree.some((node) => node.props.action === refreshBilling)).toBe(true);
  expect(
    tree.some(
      (node) => node.props.title === "Check payment and credit delivery",
    ),
  ).toBe(true);
  expect(mock.mutation).not.toHaveBeenCalled();
});
it("waits for the current subscription's allowance instead of offering another top-up against an old wallet", async () => {
  const end = Date.now() + 86400000;
  billingData(
    { subscriptionId: "sub_current", status: "active", periodEnd: end },
    { tier: "pro", granted: 300, spent: 0, reserved: 0, periodEnd: end },
    [
      {
        kind: "included",
        key: "sub_old:1",
        granted: 300,
        spent: 0,
        reserved: 0,
        expiresAt: end,
      },
    ],
  );
  const tree = nodes(
    await BillingPage({ params: Promise.resolve({ org: "personal" }) }),
  );
  expect(
    tree.some((node) => node.props.title === "Waiting for verified credits"),
  ).toBe(true);
  expect(tree.some((node) => node.props.action === buyV1Credits)).toBe(false);
  expect(tree.some((node) => node.props.action === refreshBilling)).toBe(true);
});
it("keeps ordinary app entry on its selected workspace", async () => {
  mock.mutation.mockResolvedValue("team-account");
  await expect(
    Page({ searchParams: Promise.resolve({ workspace: "team-account" }) }),
  ).rejects.toThrow("redirect:/app/team-account");
  expect(mock.mutation).toHaveBeenCalledExactlyOnceWith("default", {
    preferredId: "team-account",
  });
});
it("returns a new unpaid account directly to its saved paywall without changing workspaces", async () => {
  mock.query.mockResolvedValue({
    legacy: false,
    paid: false,
    progress: { stage: "paywall" },
  });
  await expect(Page({ searchParams: Promise.resolve({}) })).rejects.toThrow(
    "redirect:/onboarding/resume",
  );
  expect(mock.mutation).not.toHaveBeenCalled();
});
it("routes a new account's checkout return to verified onboarding recovery", async () => {
  mock.query.mockResolvedValue({
    legacy: false,
    paid: false,
    progress: { stage: "paywall" },
  });
  await expect(
    BillingPage({
      params: Promise.resolve({ org: "personal" }),
      searchParams: Promise.resolve({ checkout: "complete" }),
    }),
  ).rejects.toThrow("redirect:/onboarding/resume?checkout=complete");
  expect(mock.mutation).not.toHaveBeenCalled();
});

it("retains an exact pending team invitation after Pro without bypassing the unpaid funnel", async () => {
  const token = "a".repeat(64);
  mock.cookie.mockReturnValue({ value: token });
  mock.query.mockResolvedValue({
    legacy: false,
    paid: false,
    progress: { stage: "paywall" },
  });
  await expect(Page({ searchParams: Promise.resolve({}) })).rejects.toThrow(
    "redirect:/onboarding/resume",
  );
  mock.query.mockResolvedValue({
    legacy: false,
    paid: true,
    progress: { stage: "complete" },
  });
  await expect(Page({ searchParams: Promise.resolve({}) })).rejects.toThrow(
    `redirect:/join/${token}`,
  );
  expect(mock.mutation).not.toHaveBeenCalled();
});
