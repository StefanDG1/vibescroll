import { Check, Minus } from "lucide-react";
import type { TopicFit } from "../../lib/project-suggestions";
import styles from "./project-fit.module.css";

/** ScoreBreakdown-style disclosure. A topic discovery hint, not a benefit prediction. */
export function ProjectFitBreakdown({
  fit,
  projectName,
}: {
  fit: TopicFit;
  projectName: string;
}) {
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
        <p className={styles.note}>
          Based on this post’s topics, not a code review. Proposal history and
          expected benefit are not scored yet.
        </p>
      </div>
    </details>
  );
}
