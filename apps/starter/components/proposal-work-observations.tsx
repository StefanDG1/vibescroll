import {
  githubWorkUrl,
  observationTime,
  proposalWorkView,
  type ProposalWorkHandoff,
} from "../lib/proposal-work-observations";
import styles from "./proposal-work-observations.module.css";

function ObservedTime({ at }: { at: number }) {
  const iso = observationTime(at);
  return iso ? (
    <time dateTime={iso}>{iso.replace("T", " ").replace(".000Z", " UTC")}</time>
  ) : null;
}

export function ProposalWorkObservations({
  handoff,
}: {
  handoff?: ProposalWorkHandoff | null;
}) {
  const { issue, pullRequests, reports } = proposalWorkView(handoff);
  if (!issue && !pullRequests.length && !reports.length) return null;
  const issueUrl = issue ? githubWorkUrl(issue.url, "issues") : null;
  return (
    <details className={styles.observations}>
      <summary>Work updates</summary>
      <div className={styles.content}>
        {issue && (
          <div className={styles.item}>
            <strong>GitHub observed</strong>
            <p>
              {issueUrl ? (
                <a href={issueUrl} target="_blank" rel="noopener noreferrer">
                  Issue #{issue.number}
                </a>
              ) : (
                `Issue #${issue.number}`
              )}{" "}
              ·{" "}
              {issue.state === "unknown"
                ? "state needs confirmation"
                : issue.state}
            </p>
            <small>
              Observed <ObservedTime at={issue.observedAt} />
              {!issue.bodyMatchesFrozen &&
                " · Issue body changed from the approved handoff"}
            </small>
          </div>
        )}
        {pullRequests.map((pr) => {
          const url = githubWorkUrl(pr.url, "pull");
          return (
            <div className={styles.item} key={pr.pullRequestId}>
              <strong>GitHub observed</strong>
              <p>
                {url ? (
                  <a href={url} target="_blank" rel="noopener noreferrer">
                    PR #{pr.number}
                  </a>
                ) : (
                  `PR #${pr.number}`
                )}{" "}
                ·{" "}
                {pr.state === "unknown" ? "state needs confirmation" : pr.state}
              </p>
              <small>
                Head <code>{pr.headSha.slice(0, 12)}</code> · Observed{" "}
                <ObservedTime at={pr.observedAt} />
              </small>
              {pr.checks.length ? (
                <ul
                  className={styles.checks}
                  aria-label={`Observed checks for PR ${pr.number}`}
                >
                  {pr.checks.map((check) => (
                    <li
                      key={`${check.appId}:${check.checkRunId}:${check.headSha}`}
                    >
                      Check #{check.checkRunId} ·{" "}
                      {check.conclusion.replaceAll("_", " ")} · App{" "}
                      {check.appId} · <code>{check.headSha.slice(0, 12)}</code>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No check results observed for this PR.</p>
              )}
            </div>
          );
        })}
        {reports.map((report) => (
          <div className={styles.item} key={report.key}>
            <strong>Assistant reported · {report.status}</strong>
            <p>{report.summary.slice(0, 2000)}</p>
            <small>
              Reported <ObservedTime at={report.reportedAt} />
            </small>
          </div>
        ))}
        <p className={styles.notice}>
          Each check result covers its recorded run and commit. Reported
          completion and merge observations need separate evidence of benefit.
        </p>
      </div>
    </details>
  );
}
