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
