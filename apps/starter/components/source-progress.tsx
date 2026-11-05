"use client";
import {
  sourceProgress,
  sourceProgressSteps,
} from "../../../packages/sources/progress";
import { AgentPlan } from "./assistant-elements/agent-plan";
import { ErrorState } from "./assistant-elements/error-state";
import type { ReactNode } from "react";

/** Shared presentation. Each transport supplies only currently observed states. */
export function ObservedSourceProgress({
  progress,
  steps,
  action,
  paused = false,
  observedAt,
}: {
  progress: NonNullable<ReturnType<typeof sourceProgress>>;
  steps: ReturnType<typeof sourceProgressSteps>;
  action?: ReactNode;
  paused?: boolean;
  observedAt?: number;
}) {
  if (progress.tone && !paused)
    return (
      <section className="source-progress" aria-label="Analysis progress">
        <ErrorState
          title={progress.title}
          detail={progress.description}
          tone={progress.tone}
          action={action}
        />
      </section>
    );
  return (
    <section
      className="panel source-progress"
      aria-label="Analysis progress"
      aria-live="polite"
      aria-atomic="true"
      data-observation-paused={paused || undefined}
    >
      <h2>{paused ? "Updates paused" : progress.title}</h2>
      {progress.busy && !paused && <progress aria-label={progress.title} />}
      <p>
        {paused
          ? "The request may still be running. Refresh to check its current status."
          : progress.description}
      </p>
      {observedAt !== undefined && (
        <p className="fine">
          Last checked{" "}
          {new Date(observedAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      )}
      {steps.length > 0 && (
        <details className="source-progress-details">
          <summary>Processing details</summary>
          {paused && <p className="fine">Last observed steps</p>}
          <AgentPlan steps={steps} />
        </details>
      )}
      {action}
    </section>
  );
}

export function SourceProgressPanel({
  source,
  now,
  organizationId,
  onReviewAnalysis,
}: {
  source: Parameters<typeof sourceProgress>[0];
  now: number;
  organizationId: string;
  onReviewAnalysis?: () => void;
}) {
  const progress = sourceProgress(source, now);
  if (!progress) return null;
  const steps = sourceProgressSteps(source, now);
  const action = progress.action && (
    <a
      href={
        progress.action === "setup"
          ? `/app/${organizationId}/connections`
          : "#post-processing-options"
      }
      onClick={(event) => {
        if (progress.action === "analysis" && onReviewAnalysis) {
          event.preventDefault();
          onReviewAnalysis();
        }
      }}
    >
      {progress.action === "setup"
        ? "Open Cloud setup"
        : "Review analysis options"}
    </a>
  );
  return (
    <div data-preparation-stage={source.personalMedia?.stage}>
      <ObservedSourceProgress
        progress={progress}
        steps={steps}
        action={action}
      />
    </div>
  );
}
