"use client";
import {
  sourceProgress,
  sourceProgressSteps,
} from "../../../packages/sources/progress";
import { AgentPlan } from "./assistant-elements/agent-plan";
import { ErrorState } from "./assistant-elements/error-state";

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
  if (progress.tone)
    return (
      <section
        className="source-progress"
        aria-label="Analysis progress"
        data-preparation-stage={source.personalMedia?.stage}
      >
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
      data-preparation-stage={source.personalMedia?.stage}
    >
      <h2>{progress.title}</h2>
      {progress.busy && <progress aria-label={progress.title} />}
      <p>{progress.description}</p>
      {steps.length > 0 && (
        <details className="source-progress-details">
          <summary>Processing details</summary>
          <AgentPlan steps={steps} />
        </details>
      )}
      {action}
    </section>
  );
}
