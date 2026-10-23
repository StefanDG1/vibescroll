// @vitest-environment node
import { expect, it } from "vitest";
import { createRequire } from "node:module";
import type { SetupSnapshot } from "../packages/onboarding/companion-setup";
// Resolve the application's exact React pair without installing test-only UI packages.
const requireApp = createRequire(
  new URL("../apps/starter/package.json", import.meta.url),
);
const { createElement } = requireApp("react");
const { renderToStaticMarkup } = requireApp("react-dom/server");
const receiptModule = "../apps/starter/components/assistant-intake-status.tsx";
const setupModule = "../apps/starter/components/companion-setup.tsx";
import {
  advanceJourney,
  instagramGuideSteps,
} from "../packages/onboarding/project-builder-journey";
const receipt = {
  status: "waiting_for_computer",
  processing_succeeded: false,
  generation: 1,
  balance: { available: 0, total: 0, reserved: 0 },
  credits: { state: "not_charged", actual_used: 0, reserved: 0 },
  credit_offer: null,
  follow_up: null,
  credit_route_note:
    "Cloud credits are unavailable. Keep waiting for your computer.",
};
const action = async () => {};
it("renders cancellation for a waiting source even when cloud credits are unavailable", async () => {
  const { AssistantIntakeReceipt } = await import(receiptModule);
  const html = renderToStaticMarkup(
    createElement(AssistantIntakeReceipt, {
      receipt,
      busy: false,
      error: "",
      onAct: action,
      onRefresh: action,
    }),
  );
  expect(html).toContain("Cancel waiting analysis");
  expect(html).toContain("Cloud credits are unavailable");
  expect(html).not.toContain("Run now using");
  const completed = renderToStaticMarkup(
    createElement(AssistantIntakeReceipt, {
      receipt: { ...receipt, status: "ready", processing_succeeded: true },
      busy: false,
      error: "",
      onAct: action,
      onRefresh: action,
    }),
  );
  expect(completed).not.toContain("Cancel waiting analysis");
});
it("renders an actionable initial status error and disables duplicate actions during a request", async () => {
  const { IntakeStatusMessage, AssistantIntakeReceipt } = await import(
    receiptModule
  );
  const html = renderToStaticMarkup(
    createElement(IntakeStatusMessage, {
      busy: false,
      error: "Status could not be checked.",
      onRefresh: action,
    }),
  );
  expect(html).toContain('role="alert"');
  expect(html).toContain("Try again");
  const waiting = renderToStaticMarkup(
    createElement(AssistantIntakeReceipt, {
      receipt,
      busy: true,
      error: "",
      onAct: action,
      onRefresh: action,
    }),
  );
  expect(waiting).toMatch(/disabled=""[^>]*>Cancel waiting analysis/);
});
it("keeps local startup unchecked and inactive until a user opts in", async () => {
  const { CompanionSetup } = await import(setupModule);
  const snapshot: SetupSnapshot = {
    purposeSaved: true,
    sourceSaved: true,
    route: "local",
    cloudAvailable: false,
    localEligible: true,
    prerequisitesChecked: true,
    paired: true,
    accountConnected: true,
    workerAvailable: false,
    sampleCited: false,
    assistantReviewed: false,
    projectConfirmed: false,
    importReviewed: false,
    preferencesReviewed: false,
    paused: true,
    startupEnabled: false,
  };
  const html = renderToStaticMarkup(
    createElement(CompanionSetup, { snapshot, onAction: action }),
  );
  expect(html).toContain("Resume companion");
  expect(html).toContain("Start my companion at Windows sign-in");
  expect(html).toMatch(/disabled=""[^>]*>Set up startup at sign-in/);
  expect(html).not.toContain('checked=""');
  expect(html).not.toContain("Your first result is ready");
});
it("renders mandatory text education with no archive/account requirement or premature export action", async () => {
  const { ProjectBuilderGuide } = await import(setupModule);
  const snapshot = {
    purposeSaved: true,
    sourceSaved: false,
    route: "save_only",
    cloudAvailable: false,
    localEligible: false,
    prerequisitesChecked: false,
    paired: false,
    accountConnected: false,
    workerAvailable: false,
    sampleCited: false,
    assistantReviewed: false,
    projectConfirmed: false,
    importReviewed: false,
    preferencesReviewed: false,
    paused: false,
    startupEnabled: false,
  };
  let journey = advanceJourney(undefined, { type: "start" }, 100);
  for (const type of ["next", "next", "defer", "defer", "next", "defer"])
    journey = advanceJourney(journey, { type }, journey.updatedAt + 1);
  const props = {
    journey,
    snapshot,
    onAction: action,
    onNavigate: () => {},
    onSave: () => {},
  };
  const first = renderToStaticMarkup(createElement(ProjectBuilderGuide, props));
  expect(first).toContain("Step 1 of 10");
  expect(first).toMatch(/disabled=""[^>]*>Continue</);
  expect(first).not.toContain("Record that I requested an export");
  expect(first).not.toContain("Insights ready");
  expect(first).toContain('href="/help/instagram-export-guide"');
  for (let step = 1; step < instagramGuideSteps.length; step++)
    journey = advanceJourney(
      journey,
      { type: "guide_next" },
      journey.updatedAt + 1,
    );
  const last = renderToStaticMarkup(
    createElement(ProjectBuilderGuide, { ...props, journey }),
  );
  expect(last).toContain("I&#x27;ve seen how it works");
  expect(last).not.toContain("Record that I requested an export");
  journey = advanceJourney(
    journey,
    { type: "guide_ack" },
    journey.updatedAt + 1,
  );
  const acknowledged = renderToStaticMarkup(
    createElement(ProjectBuilderGuide, { ...props, journey }),
  );
  expect(acknowledged).toContain("Record that I requested an export");
  expect(acknowledged).toContain("Do this later");
  expect(acknowledged).not.toMatch(/disabled=""[^>]*>Continue</);
});
it("does not invent skill recommendations or installation and rejects executable source links", async () => {
  const { ProjectBuilderGuide } = await import(setupModule);
  let journey = advanceJourney(undefined, { type: "start" }, 100);
  for (const type of ["next", "next", "defer"])
    journey = advanceJourney(journey, { type }, journey.updatedAt + 1);
  const props = {
    journey,
    snapshot: { sampleCited: false },
    onAction: action,
    onNavigate: () => {},
    onSave: () => {},
  };
  const missing = renderToStaticMarkup(
    createElement(ProjectBuilderGuide, props),
  );
  expect(missing).toContain("No verified recommendations are available");
  expect(missing).toContain("Decide on skills later");
  const card = {
    id: "synthetic-test-skill",
    name: "Synthetic reviewed skill",
    publisher: "Synthetic test publisher",
    sourceUrl: "https://example.test/skill",
    purpose: "Synthetic test only",
    fitReason: "Synthetic stated goal",
    destination: "codex",
    verifiedAt: 100,
    license: "MIT",
    installed: "unknown",
    installCommand: "reviewed-command & inspect",
  };
  const present = renderToStaticMarkup(
    createElement(ProjectBuilderGuide, {
      ...props,
      recommendationStatus: "ready",
      recommendations: [card],
    }),
  );
  expect(present).toContain("Only 1 verified recommendation");
  expect(present).toContain("unknown; not verified");
  expect(present).toContain("reviewed-command &amp; inspect");
  expect(present).not.toContain("verified by the available inventory");
  const unsafe = renderToStaticMarkup(
    createElement(ProjectBuilderGuide, {
      ...props,
      recommendationStatus: "ready",
      recommendations: [{ ...card, sourceUrl: "javascript:alert(1)" }],
    }),
  );
  expect(unsafe).not.toContain("javascript:");
  expect(unsafe).not.toContain("Synthetic reviewed skill");
});
