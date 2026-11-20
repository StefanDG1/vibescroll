import { ClipboardCheck } from "lucide-react";
import { AccountSection, AccountStatus } from "./account-layout";
import { readLaunchChecks } from "../lib/launchproof";

export async function LaunchChecks({
  organizationId,
}: {
  organizationId: string;
}) {
  const status = await readLaunchChecks(organizationId);
  if (status.state === "disabled" || status.state === "hidden") return null;
  return (
    <AccountSection title="Latest test report" icon={ClipboardCheck}>
      {"label" in status && <AccountStatus>{status.label}</AccountStatus>}
      {status.state === "available" ? (
        <>
          <p>{status.summary.required} required checks in the declared scope</p>
          <dl className="account-quote">
            <div>
              <dt>Passed</dt>
              <dd>{status.summary.passed}</dd>
            </div>
            <div>
              <dt>Failed</dt>
              <dd>{status.summary.failed}</dd>
            </div>
            <div>
              <dt>Unverified</dt>
              <dd>{status.summary.unverified}</dd>
            </div>
          </dl>
          <details className="account-disclosure">
            <summary>Report details</summary>
            <dl className="account-record-details">
              <dt>Environment</dt>
              <dd>{status.environmentId}</dd>
              <dt>Target</dt>
              <dd>{status.targetOrigin}</dd>
              <dt>Commit</dt>
              <dd>{status.testedCommit ?? "Unavailable"}</dd>
              <dt>Deployment</dt>
              <dd>{status.testedDeploymentId ?? "Unavailable"}</dd>
              <dt>Uploaded, UTC</dt>
              <dd>
                <time dateTime={status.uploadedAt}>{status.uploadedAt}</time>
              </dd>
              <dt>Retained until, UTC</dt>
              <dd>
                <time dateTime={status.retainedUntil}>
                  {status.retainedUntil}
                </time>
              </dd>
              <dt>Fetched, UTC</dt>
              <dd>
                <time dateTime={status.fetchedAt}>{status.fetchedAt}</time>
              </dd>
              <dt>Executed in</dt>
              <dd>
                {status.execution === "customer_ci"
                  ? "Customer CI"
                  : "Local tooling"}
              </dd>
            </dl>
            {status.limitations.length > 0 && (
              <ul className="muted">
                {status.limitations.map((limit) => (
                  <li key={limit}>{limit}</li>
                ))}
              </ul>
            )}
          </details>
          <a
            className="button secondary"
            href={status.reportUrl}
            rel="noreferrer"
          >
            Open report in LaunchProof
          </a>
        </>
      ) : (
        <p className="muted">
          {status.state === "missing"
            ? "Run approved checks in your own local environment or CI, then upload the sanitized report to the mapped LaunchProof application."
            : "An owner can review the mapping and summary token in the application server settings. Your projects remain available."}
        </p>
      )}
    </AccountSection>
  );
}
