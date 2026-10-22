import { expect, it } from "vitest";
import manifest from "../docs/help/manifest.json";
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
it("resolves every setup repair to approved task help rather than the generic documentation index", () => {
  const approved = new Set(
    manifest.articles
      .filter((article) => article.status === "approved")
      .map((article) => `/help/${article.slug}`),
  );
  for (const step of companionSetupSteps(snapshot, true)) {
    expect(approved.has(step.help.split("#")[0])).toBe(true);
  }
});
it("keeps first-result setup separate from optional project, import and assistant authority", () => {
  expect(companionSetupSteps(snapshot).map((s) => s.action)).toEqual([
    "purpose",
    "source",
    "route",
    "pair",
    "preflight",
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
it("takes a fresh computer through pairing and connection checks without treating connectable as processing-ready", () => {
  const fresh = {
    ...snapshot,
    paired: false,
    prerequisitesChecked: false,
    accountConnected: false,
    workerAvailable: false,
  };
  const next = (state: SetupSnapshot) =>
    companionSetupSteps(state).find((step) => !step.complete || step.blocked);
  expect(next(fresh)?.action).toBe("pair");
  expect(next({ ...fresh, paired: true })?.action).toBe("preflight");
  const connectable = {
    ...fresh,
    paired: true,
    connectionPrerequisitesChecked: true,
  };
  expect(next(connectable)?.action).toBe("account");
  expect(
    companionSetupSteps(connectable).find((step) => step.action === "sample")
      ?.blocked,
  ).toBe(true);
  const connected = {
    ...connectable,
    accountConnected: true,
    workerAvailable: true,
  };
  expect(next(connected)?.action).toBe("preflight");
  expect(next({ ...connected, prerequisitesChecked: true })?.action).toBe(
    "sample",
  );
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
