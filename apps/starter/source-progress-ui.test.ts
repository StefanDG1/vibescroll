import { expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  sourceProgress,
  sourceProgressDeadline,
  sourceProgressSteps,
} from "../../packages/sources/progress";
import { SourceProgressPanel } from "./components/source-progress";

const waiting = {
  generation: 0,
  state: "needs_upload",
  workCloudSaveIntent: { generation: 0, expiresAt: 2000 },
  workCloudLinkSetup: { monitorReady: true },
};
const job = (state: string, extra = {}) => ({
  generation: 1,
  state: "processing",
  personalAnalysis: {
    executor: "work_cloud",
    state,
    stage: "acquiring",
    expiresAt: 2000,
    ...extra,
  },
});
const render = (source: Parameters<typeof sourceProgress>[0], now = 1000) =>
  renderToStaticMarkup(
    createElement(SourceProgressPanel, { source, now, organizationId: "org1" }),
  );

it("distinguishes saved intents, queued jobs and claimed processing without a fake percentage", () => {
  expect(render(waiting)).toContain("Waiting for ChatGPT");
  const queued = render(job("queued"));
  expect(queued).toContain("Waiting for Cloud");
  expect(queued).toContain("processing has not started");
  expect(queued).not.toContain("Preparing video");
  const running = render(job("running", { leaseUntil: 1500 }));
  expect(running).toContain("Preparing video and transcript");
  expect(running).toContain("<progress");
  expect(running).toContain('aria-label="Analysis progress"');
  expect(running).toContain('aria-live="polite"');
  expect(running).not.toMatch(/value=|\d+%/);
  expect(render(job("running", { stage: "analyzing" }))).toContain(
    "Analyzing the evidence",
  );
});
it("shows setup only when readiness is actually absent and keeps stale generations out", () => {
  const setup = render({
    ...waiting,
    workCloudLinkSetup: { monitorReady: false },
  });
  expect(setup).toContain("Cloud setup needs attention");
  expect(setup).toContain("/app/org1/connections");
  expect(setup).not.toContain("<progress");
  expect(
    render({ ...waiting, generation: 1, workCloudLinkSetup: undefined }),
  ).toBe("");
});
it("keeps expired requests visible as saved posts and never presents them as processing", () => {
  const expired = render(waiting, 2000);
  expect(expired).toContain("Analysis request expired");
  expect(expired).toContain("post is still saved");
  expect(expired).not.toContain("<progress");
  expect(render(job("queued"), 2000)).toContain("Cloud did not start");
  expect(sourceProgressDeadline(waiting)).toBe(2000);
  expect(sourceProgressDeadline(job("running", { leaseUntil: 1500 }))).toBe(
    1500,
  );
});
it("does not turn unknown outcomes or expired leases into a retry or completion claim", () => {
  for (const source of [job("unknown"), job("running", { leaseUntil: 1000 })]) {
    const html = render(source);
    expect(html).toContain("before");
    expect(html).toContain("#post-processing-options");
    expect(html).not.toContain("<progress");
    expect(html).not.toContain("<button");
  }
  expect(render(job("failed"))).toContain("Analysis stopped");
});

it("uses observed service stages and keeps waiting distinct from inference without numeric estimates", () => {
  const service = (stage: string) => ({
    state: "processing",
    personalMedia: {
      version: "service-preparation-progress-v1",
      stage,
    },
  });
  expect(
    sourceProgressSteps(service("queued"), 1000).map((s) => s.state),
  ).toEqual(["waiting", "pending", "pending", "pending"]);
  expect(
    sourceProgressSteps(service("transcribing"), 1000).map((s) => s.state),
  ).toEqual(["complete", "running", "pending", "pending"]);
  expect(
    sourceProgressSteps(service("waiting_for_assistant"), 1000).map(
      (s) => s.state,
    ),
  ).toEqual(["complete", "complete", "waiting", "pending"]);
  const html = render(service("analyzing"));
  expect(html).toContain('data-slot="agent-plan"');
  expect(html).toContain("Processing details");
  expect(html).not.toMatch(/aria-valuenow|\d+%|ETA|Thinking/);
  expect(sourceProgressSteps(service("failed"), 1000)).toEqual([]);
  expect(sourceProgress(service("__proto__"), 1000)).toBeNull();
});

it("renders a safe error state without auto retry and preserves incumbent versions on failure", () => {
  const html = render({
    state: "ready",
    pendingAnalysisAttemptState: "failed",
  });
  expect(html).toContain('data-slot="error-state"');
  expect(html).toContain('role="alert"');
  expect(html).toContain("current analysis is still available");
  expect(html).toContain("#post-processing-options");
  expect(html).not.toContain("<button");
  expect(html).not.toContain("<progress");
  expect(
    render({ state: "failed", pendingAnalysisAttemptState: "failed" }),
  ).not.toContain("current analysis is still available");
  const unknown = render(job("unknown"));
  expect(unknown).toContain('role="status"');
  expect(unknown).not.toContain('role="alert"');
  const steps = sourceProgressSteps(
    { state: "ready", pendingAnalysisAttemptState: "running" },
    1000,
  );
  expect(steps.map((s) => s.label)).toEqual([
    "Analyze saved evidence",
    "Save the new version",
  ]);
  expect(steps[0].state).toBe("running");
});
it("keeps incumbent results distinct from pending versions and ignores local executors", () => {
  expect(render({ state: "ready" })).toBe("");
  expect(
    render({ state: "ready", pendingAnalysisAttemptState: "running" }),
  ).toContain("current analysis stays available");
  expect(
    render({ state: "ready", pendingAnalysisAttemptState: "unknown" }),
  ).toContain("no confirmed outcome");
  expect(
    render({ personalAnalysis: { executor: "personal", state: "running" } }),
  ).toBe("");
  expect(
    render({
      state: "needs_upload",
      workCloudLinkSetup: { monitorReady: true },
    }),
  ).toContain("Saved, not analyzing");
});
