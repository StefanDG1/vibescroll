import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ query: vi.fn(), mutation: vi.fn() }));
vi.mock("@/lib/backend", () => ({
  backend: async () => state,
  api: {
    onboarding: {
      status: "status",
      assistantStatus: "assistant",
      chooseProject: "chooseProject",
    },
    organizations: { createPrivate: "workspace" },
    commerce: { catalogue: "catalogue" },
    githubLinks: { choices: "repositories" },
  },
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw Error(`REDIRECT:${path}`);
  },
}));
vi.mock("@/lib/onboarding-server", () => ({
  signedOnboardingDraft: async () => null,
}));
vi.mock("./app/onboarding/actions", () => ({
  chooseOnboardingProject: vi.fn(),
  finishOnboarding: vi.fn(),
  continueOnboardingProject: vi.fn(),
  refreshOnboardingRepositories: vi.fn(),
}));
vi.mock("@/app/actions", () => ({ logout: vi.fn() }));
vi.mock("@/components/onboarding", () => ({
  OnboardingShell: "shell",
  Onboarding: "quiz",
}));
vi.mock("@/components/onboarding-assistant", () => ({
  OnboardingAssistant: "assistant-step",
}));
vi.mock("@/components/onboarding-payment", () => ({
  OnboardingPayment: "payment-step",
}));
vi.mock("@/components/onboarding-milestone", () => ({
  OnboardingMilestone: "milestone",
}));
vi.mock("@/components/search-choices", () => ({
  SearchChoices: "repositories-step",
}));
vi.mock("@/components/action-form", () => ({ ActionForm: "action" }));
import Page from "./app/onboarding/resume/page";
function nodes(value: unknown): React.ReactElement<any>[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!React.isValidElement(value)) return [];
  return [value, ...nodes((value.props as any).children)];
}
function status(progress: object, paid = false) {
  state.query.mockImplementation(async (op) => {
    if (op === "status") return { legacy: false, paid, progress };
    if (op === "assistant") return { ready: false, client: null };
    if (op === "repositories") return [];
    if (op === "catalogue")
      return {
        countries: [],
        billingCountryRequired: false,
        proOffer: { configured: true },
        liveEnabled: true,
      };
    throw Error("Unexpected broad read");
  });
}
beforeEach(() => {
  vi.stubGlobal("React", React);
  state.mutation.mockResolvedValue("workspace");
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
it("offers assistant setup once after signup, before optional GitHub", async () => {
  status({ stage: "github" });
  expect(
    nodes(await Page({ searchParams: Promise.resolve({}) })).some(
      (n) => n.type === "assistant-step",
    ),
  ).toBe(true);
  expect(state.mutation).not.toHaveBeenCalledWith(
    "chooseProject",
    expect.anything(),
  );
});
it("returns a connect-later user to GitHub and then to their stored paywall", async () => {
  status({ stage: "github", assistantChoice: "later" });
  const github = nodes(
    await Page({ searchParams: Promise.resolve({ setup: "github" }) }),
  );
  expect(github.some((n) => n.type === "assistant-step")).toBe(false);
  expect(state.mutation).toHaveBeenCalledWith("chooseProject", {
    organizationId: "workspace",
  });
  status({ stage: "paywall", assistantChoice: "later", interval: "annual" });
  const payment = nodes(await Page({ searchParams: Promise.resolve({}) })).find(
    (n) => n.type === "payment-step",
  );
  expect(payment?.props.initialInterval).toBe("annual");
});
it("preserves a GitHub callback and permits assistant readiness to finish after payment", async () => {
  status({ stage: "github" });
  const callback = nodes(
    await Page({ searchParams: Promise.resolve({ github: "connected" }) }),
  );
  expect(callback.some((n) => n.type === "assistant-step")).toBe(false);
  status({ stage: "paywall", assistantChoice: "check" }, true);
  const ready = nodes(await Page({ searchParams: Promise.resolve({}) }));
  expect(
    ready.some((n) => n.type === "assistant-step" && n.props.compact),
  ).toBe(true);
  expect(ready.filter((n) => n.type === "form")).toHaveLength(2);
});
