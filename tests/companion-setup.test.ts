import { expect, it } from "vitest";
import {
  companionSetupSteps,
  type SetupSnapshot,
} from "../packages/onboarding/companion-setup";
const snapshot: SetupSnapshot = {
  purposeSaved: true,
  sourceSaved: true,
  route: "local",
  cloudAvailable: false,
  localEligible: true,
  prerequisitesChecked: true,
  paired: true,
  accountConnected: true,
  workerAvailable: true,
  sampleCited: false,
  assistantReviewed: false,
  projectConfirmed: false,
  importReviewed: false,
  preferencesReviewed: false,
  paused: false,
  startupEnabled: false,
};
it("keeps first-result setup separate from optional project, import and assistant authority", () => {
  expect(companionSetupSteps(snapshot).map((s) => s.action)).toEqual([
    "purpose",
    "source",
    "route",
    "preflight",
    "pair",
    "account",
    "worker",
    "sample",
  ]);
  expect(
    companionSetupSteps(snapshot, true)
      .slice(-4)
      .map((s) => s.action),
  ).toEqual(["assistant", "project", "import", "preferences"]);
  expect(
    companionSetupSteps(snapshot).find((s) => s.action === "sample"),
  ).toMatchObject({ complete: false, blocked: false });
});
it("cannot count paired, cached-login or online badges as a cited result and fences unavailable local work", () => {
  for (const change of [
    { paired: false },
    { localEligible: false },
    { accountConnected: false },
    { workerAvailable: false },
    { paused: true },
    { prerequisitesChecked: false },
  ]) {
    const steps = companionSetupSteps({ ...snapshot, ...change });
    expect(steps.find((s) => s.action === "sample")).toMatchObject({
      complete: false,
      blocked: true,
    });
  }
});
it("supports cloud without requiring a computer and keeps save-only complete without processing", () => {
  const cloud = companionSetupSteps({
    ...snapshot,
    route: "cloud",
    cloudAvailable: true,
    paired: false,
    accountConnected: false,
    workerAvailable: false,
  });
  expect(cloud.map((s) => s.action)).toEqual([
    "purpose",
    "source",
    "route",
    "sample",
  ]);
  expect(cloud.at(-1)).toMatchObject({ blocked: false, complete: false });
  expect(
    companionSetupSteps({
      ...snapshot,
      route: "cloud",
      cloudAvailable: false,
    }).find((s) => s.action === "route")?.blocked,
  ).toBe(true);
  const saved = companionSetupSteps({ ...snapshot, route: "save_only" });
  expect(saved.every((s) => s.complete && !s.blocked)).toBe(true);
  expect(saved.some((s) => s.action === "sample")).toBe(false);
});
