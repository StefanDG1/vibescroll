"use client";
import { useRef, useState } from "react";
import { Check, Minus } from "lucide-react";
import type {
  TopicFit,
  ProjectHistory,
  ProjectPriority,
} from "../../lib/project-suggestions";
import styles from "./project-fit.module.css";

/** ScoreBreakdown-style disclosure. A topic discovery hint, not a benefit prediction. */
export function ProjectFitBreakdown({
  fit,
  projectName,
  history,
  priority = "normal",
  priorityRevision = 0,
  onPriorityChange,
  proposalBase,
}: {
  fit: TopicFit;
  projectName: string;
  history?: ProjectHistory;
  priority?: ProjectPriority;
  priorityRevision?: number;
  onPriorityChange?: (
    priority: ProjectPriority,
    expectedRevision: number,
  ) => Promise<{ priority: ProjectPriority; revision: number }>;
  proposalBase?: string;
}) {
  const [acknowledged, setAcknowledged] = useState({
    priority,
    revision: priorityRevision,
  });
  const current =
    priorityRevision > acknowledged.revision
      ? { priority, revision: priorityRevision }
      : acknowledged;
  const [pending, setPending] = useState<ProjectPriority | null>(null);
  const flight = useRef(false);
  const busy = pending !== null;
  const [error, setError] = useState("");
  if (
    !Number.isSafeInteger(fit.total) ||
    !Number.isSafeInteger(fit.matched) ||
    fit.total < 1 ||
    fit.matched < 0 ||
    fit.matched > fit.total
  )
    return null;
  // Round only the displayed aggregate. The ordered candidates use integer match counts.
  const score = Math.round((100 * fit.matched) / fit.total);
  return (
    <details className={styles.breakdown} data-slot="score-breakdown">
      <summary
        aria-label={`Topic fit for ${projectName}: ${score} out of 100. Show breakdown`}
      >
        <span>Topic fit</span>
        <strong>
          {score}
          <span>/100</span>
        </strong>
      </summary>
      <div className={styles.content}>
        <p>
          {fit.matched} of {fit.total} post topics match this project’s
          confirmed context.
        </p>
        <ul>
          {fit.criteria.map((criterion) => (
            <li key={criterion.category}>
              {criterion.matched ? (
                <Check size={15} aria-hidden="true" />
              ) : (
                <Minus size={15} aria-hidden="true" />
              )}
              <span>
                {criterion.category.replaceAll("_", " ")}
                <small>
                  {criterion.matched
                    ? `Matched: ${criterion.terms.join(", ")}`
                    : "No matching terms"}
                </small>
              </span>
              <span>{criterion.matched ? "1/1" : "0/1"}</span>
            </li>
          ))}
        </ul>
        {history && (
          <>
            <p className={styles.note}>
              {history.relatedPosts} related posts used in sampled plans ·{" "}
              {history.relatedAccepted} approved plans
            </p>
            {proposalBase &&
              history.samePost.map((plan) => (
                <a key={plan.id} href={`${proposalBase}/${plan.id}`}>
                  Open existing plan · {plan.title}
                  {plan.current ? "" : " (earlier context)"}
                  {plan.outcome?.githubIssueState && (
                    <small>
                      GitHub observed: {plan.outcome.githubIssueState}
                    </small>
                  )}
                  {plan.outcome?.modelReportedStatus && (
                    <small>
                      Agent reported: {plan.outcome.modelReportedStatus};
                      benefit unmeasured
                    </small>
                  )}
                </a>
              ))}
            {history.samePostLimited && (
              <p className={styles.note}>Showing the latest 20 post plans.</p>
            )}
            {onPriorityChange && (
              <label>
                Your project priority
                <select
                  aria-label={`Your priority for ${projectName}`}
                  value={pending ?? current.priority}
                  disabled={busy}
                  onChange={async (event) => {
                    if (flight.current) return;
                    flight.current = true;
                    const next = event.target.value as ProjectPriority;
                    setPending(next);
                    setError("");
                    try {
                      setAcknowledged(
                        await onPriorityChange(next, current.revision),
                      );
                    } catch {
                      setError(
                        "Priority was not confirmed. Refresh before trying again.",
                      );
                    } finally {
                      flight.current = false;
                      setPending(null);
                    }
                  }}
                >
                  <option value="high">High</option>
                  <option value="normal">Normal</option>
                  <option value="low">Low</option>
                </select>
              </label>
            )}
            {error && <p role="alert">{error}</p>}
          </>
        )}
        <p className={styles.note}>
          {history
            ? "Topics rank first; your priority, sampled approvals and plan activity break ties. Outcomes are not measured yet."
            : "Based on this post’s topics, not a code review. Proposal history and expected benefit are not scored yet."}
        </p>
      </div>
    </details>
  );
}
