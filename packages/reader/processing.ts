import { sourceProgress, sourceProgressSteps } from "../sources/progress";
import { preparationStages } from "../contracts/prepared-evidence";

type Row = Record<string, unknown>;
const row = (value: unknown): Row =>
  value && typeof value === "object" ? (value as Row) : {};
const text = (value: unknown) =>
  typeof value === "string" ? value : undefined;
const active = new Set([
  ...preparationStages.filter(
    (stage) => !["ready", "failed", "unknown"].includes(stage),
  ),
  "queued",
  "claimed",
  "running",
  "processing",
  "waiting_for_cloud",
  "preparing",
  "acquiring",
  "analyzing",
  "extracting",
  "transcribing",
  "validating",
  "cancel_requested",
  "waiting_for_shared_analysis",
]);

/** Adapt observed MCP job fields to the website's existing progress presenter. */
export function observedProcessing(
  value: Row,
  sourceState: string,
  now: number,
) {
  const processing = row(value.processing);
  const pending = row(value.pending_analysis_version);
  const state = text(processing.state) ?? text(value.status) ?? sourceState;
  const pendingState = text(pending.state);
  const stage = text(processing.stage);
  const pendingActive = !!pendingState && active.has(pendingState);
  const isActive = pendingActive || active.has(state);
  const model = {
    state: text(value.source_status) ?? sourceState,
    // The backend's preparation stage is observed, not an estimate of progress.
    ...(stage && active.has(state)
      ? { personalMedia: { version: "service-preparation-progress-v1", stage } }
      : {}),
    ...(pendingState ? { pendingAnalysisAttemptState: pendingState } : {}),
    ...(state !== "ready" && state !== "completed"
      ? {
          personalAnalysis: {
            executor: "work_cloud",
            state: state === "waiting_for_cloud" ? "queued" : state,
            stage,
          },
        }
      : {}),
  };
  let progress = sourceProgress(model, now);
  if (state === "waiting_for_shared_analysis")
    progress = {
      title: "Waiting for shared analysis",
      description:
        "Another request is preparing this post. No new analysis was started for this save.",
      busy: true,
    };
  if (state === "processing_blocked") {
    const admission = row(row(value.account).processing);
    progress = {
      title:
        sourceState === "ready"
          ? "New analysis was not started"
          : "Saved, processing unavailable",
      description:
        text(admission.message) ??
        "No new analysis was started. Review current processing availability before trying again.",
      busy: false,
      tone: "attention",
    };
  }
  if (!progress && isActive)
    progress = {
      title: "Processing saved post",
      description: "Waiting for the next confirmed update.",
      busy: true,
    };
  if (!progress && ["unknown", "recovering"].includes(state))
    progress = {
      title: "Status needs checking",
      description:
        "Completion is not confirmed. Review the existing request before trying again.",
      busy: false,
      tone: "attention",
    };
  return {
    progress,
    steps:
      state === "waiting_for_shared_analysis"
        ? []
        : sourceProgressSteps(model, now),
    active: isActive,
    versionId:
      typeof value.selected_analysis_version_id === "string"
        ? value.selected_analysis_version_id
        : null,
    pendingActive,
  };
}
