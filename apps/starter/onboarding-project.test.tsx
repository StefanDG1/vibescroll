import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ query: vi.fn(), mutation: vi.fn() }));
vi.mock("@/lib/backend", () => ({
  backend: async () => state,
  api: {
    onboarding: { status: "status" },
    organizations: { createPrivate: "workspace" },
    product: { repositories: "repositories", detail: "post" },
    profiles: { saveDraft: "saveDraft", confirmDraft: "confirmDraft" },
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/app/actions", () => ({ logout: vi.fn(), startV1Checkout: vi.fn() }));
vi.mock("@/lib/onboarding-server", () => ({}));
vi.mock("@/components/onboarding", () => ({ OnboardingShell: "section" }));
vi.mock("@/components/onboarding-milestone", () => ({
  OnboardingMilestone: "span",
}));
vi.mock("@/components/onboarding-proposal", () => ({
  OnboardingProposal: "proposal",
}));
vi.mock("@/components/action-form", () => ({ ActionForm: "form" }));
import Page from "./app/onboarding/project/page";
import { confirmFirstProject } from "./app/onboarding/actions";

const repo = {
  _id: "project",
  providerId: 9,
  fullName: "owner/project",
  enabled: true,
  status: "connected",
  confirmed: false,
  sha: "base",
  profileVersion: 0,
  selectionVersion: 1,
  profileDraft: "",
  profile: "",
};
function nodes(value: unknown): React.ReactElement<any>[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!React.isValidElement(value)) return [];
  return [value, ...nodes((value.props as any).children)];
}
beforeEach(() => {
  vi.stubGlobal("React", React);
  state.query.mockImplementation(async (op) => {
    if (op === "status")
      return {
        paid: true,
        progress: {
          stage: "complete",
          repository: { id: 9 },
          sourceId: "source",
          goal: "build_faster",
        },
      };
    if (op === "repositories") return [{ ...repo }];
    if (op === "post")
      return {
        _id: "source",
        title: "Concurrency",
        analysisVersion: { id: "version" },
        analysis: {
          insights: Array.from({ length: 4 }, (_, i) => ({
            id: `i${i}`,
            title: `Insight ${i}`,
            claim: "Retained claim",
          })),
        },
      };
    throw Error("Unexpected broad read");
  });
  state.mutation.mockResolvedValue("workspace");
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it("advances a connected snapshot to context confirmation without preparing it again", async () => {
  const tree = nodes(await Page());
  expect(tree.some((n) => n.props.label === "Confirm project context")).toBe(
    true,
  );
  expect(tree.some((n) => n.props.label === "Prepare my project")).toBe(false);
});
it("opens the proposal composer with all retained insights after context is confirmed", async () => {
  state.query.mockImplementationOnce(async () => ({
    paid: true,
    progress: { stage: "complete", repository: { id: 9 }, sourceId: "source" },
  }));
  state.query.mockImplementationOnce(async () => [
    { ...repo, confirmed: true },
  ]);
  const composer = nodes(await Page()).find((n) => n.type === "proposal");
  expect(composer?.props.insights).toHaveLength(4);
  expect(composer?.props.analysisVersionId).toBe("version");
});
it("does not offer confirmation while a repository is preparing", async () => {
  state.query.mockImplementationOnce(async () => ({
    paid: true,
    progress: { stage: "complete", repository: { id: 9 } },
  }));
  state.query.mockImplementationOnce(async () => [
    { ...repo, status: "preparing" },
  ]);
  const tree = nodes(await Page());
  expect(tree.some((n) => n.props.label === "Confirm project context")).toBe(
    false,
  );
});
it("confirms the actual connected snapshot and its current profile revision", async () => {
  const form = new FormData();
  form.set("profile", "Developer tool for saved insights and project plans.");
  expect(await confirmFirstProject({}, form)).toEqual({
    message: "Project context confirmed.",
  });
  expect(state.mutation.mock.calls.map(([op]) => op)).toEqual([
    "workspace",
    "saveDraft",
    "confirmDraft",
  ]);
  expect(state.mutation.mock.lastCall?.[1]).toMatchObject({
    id: "project",
    sha: "base",
    version: 0,
    selectionVersion: 1,
  });
});
