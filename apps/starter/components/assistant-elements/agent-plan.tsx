// Adapted from assistant-ui Elements at 3fa379f814dadb02b9f9ad04e31c2d2ba92df094.
// Copyright (c) 2026 AgentbaseAI Inc. MIT; see licenses/assistant-ui-elements-3fa379f.txt.
import { Check, Clock3, Loader2 } from "lucide-react";
import type { SourceProgressStep } from "../../../../packages/sources/progress";
import styles from "./analysis-elements.module.css";

const status = {
  complete: "Complete",
  running: "In progress",
  waiting: "Waiting",
  pending: "Not started",
};

/** States describe observed work. A step count is not a time or success estimate. */
export function AgentPlan({ steps }: { steps: readonly SourceProgressStep[] }) {
  return (
    <ol
      className={styles.steps}
      data-slot="agent-plan"
      aria-label="Analysis steps"
    >
      {steps.map((step) => (
        <li key={step.id} data-state={step.state}>
          <span className={styles.stepIcon} aria-hidden="true">
            {step.state === "complete" ? (
              <Check size={16} />
            ) : step.state === "running" ? (
              <Loader2 size={16} className="spinner" />
            ) : step.state === "waiting" ? (
              <Clock3 size={16} />
            ) : (
              <span className={styles.dot} />
            )}
          </span>
          <span>
            <span className={styles.stepLabel}>{step.label}</span>
            <span className={styles.stepStatus}>{status[step.state]}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
