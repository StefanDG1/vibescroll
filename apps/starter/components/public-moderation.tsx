"use client";
import {
  redirectForAuthentication,
  SignInRedirect,
} from "../lib/authentication";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ListChecks } from "lucide-react";
import { AccountSection, AccountStatus } from "./account-layout";
import { LibrarySkeleton } from "./library-skeleton";
import {
  publicCitationUrl,
  publicSlug,
  type PublicEdition,
} from "../lib/public-knowledge-display";

export type ModerationReport = {
  _id: string;
  editionId: string;
  reason: string;
  state: "open";
  createdAt: number;
  updatedAt: number;
};
type Decision = "dismiss" | "remove";
type Operation = "queue" | "inspection" | "decision";
type Requester = (input: string, init: RequestInit) => Promise<Response>;
const reportDate = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});
export class ModerationError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export async function moderationRequest(
  operation: string,
  args: Record<string, unknown>,
  request: Requester = fetch,
): Promise<unknown> {
  const response = await request("/api/product", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify({ operation, args }),
  });
  const body = await response.json();
  if (!response.ok) {
    const code =
      response.status === 401
        ? "ACCESS_LOST"
        : typeof body?.code === "string"
          ? body.code
          : "UNAVAILABLE";
    throw new ModerationError(
      code,
      code === "REAUTH_REQUIRED" ||
        code === "ACCESS_LOST" ||
        response.status === 401
        ? "Sign in again, then load reports and review your decision."
        : code === "FORBIDDEN"
          ? "This account does not have moderator access. Ask the operator to check its moderator allowlist."
          : "The request could not be confirmed. Load reports to check the current status before trying again.",
    );
  }
  return body.result;
}
export async function inspectModerationReport(
  id: string,
  request?: Requester,
): Promise<PublicEdition | null> {
  const result = await moderationRequest(
    "publicModerationInspect",
    { id },
    request,
  );
  if (
    !result ||
    typeof result !== "object" ||
    !("reportId" in result) ||
    result.reportId !== id ||
    !("edition" in result)
  )
    throw new ModerationError(
      "INVALID_RESPONSE",
      "The edition could not be inspected. Load reports to check its status.",
    );
  const edition = result.edition as PublicEdition | null;
  if (
    edition !== null &&
    (!edition ||
      !publicSlug(edition.slug) ||
      typeof edition.title !== "string" ||
      typeof edition.summary !== "string" ||
      !Array.isArray(edition.insights))
  )
    throw new ModerationError(
      "INVALID_RESPONSE",
      "The edition could not be inspected. Load reports to check its status.",
    );
  return edition;
}
export async function loadModerationReports(
  request?: Requester,
): Promise<ModerationReport[]> {
  const rows = await moderationRequest("publicModerationReports", {}, request);
  if (!Array.isArray(rows) || rows.length > 50)
    throw new ModerationError(
      "INVALID_RESPONSE",
      "Reports could not be read. Try loading them again.",
    );
  return rows.map((row) => {
    if (
      !row ||
      typeof row._id !== "string" ||
      typeof row.editionId !== "string" ||
      typeof row.reason !== "string" ||
      row.reason.length > 2000 ||
      row.state !== "open" ||
      !Number.isFinite(row.createdAt) ||
      !Number.isFinite(row.updatedAt)
    )
      throw new ModerationError(
        "INVALID_RESPONSE",
        "Reports could not be read. Try loading them again.",
      );
    return {
      _id: row._id,
      editionId: row.editionId,
      reason: row.reason,
      state: "open",
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  });
}
export async function reviewModerationReport(
  reportId: string,
  action: Decision,
  confirmed: boolean,
  request?: Requester,
) {
  if (!confirmed || !reportId || !["dismiss", "remove"].includes(action))
    throw new ModerationError(
      "CONFIRMATION_REQUIRED",
      "Review and confirm this decision first.",
    );
  const result = await moderationRequest(
    "publicModerateReport",
    { reportId, action },
    request,
  );
  if (
    !result ||
    typeof result !== "object" ||
    !("reviewed" in result) ||
    result.reviewed !== true
  )
    throw new ModerationError(
      "INVALID_RESPONSE",
      "The decision could not be confirmed. Load reports to check its status.",
    );
}

export function PublicModeration() {
  const [reports, setReports] = useState<ModerationReport[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [decision, setDecision] = useState<Decision>("dismiss");
  const [confirmed, setConfirmed] = useState(false);
  const [operation, setOperation] = useState<Operation | null>(null);
  const [error, setError] = useState<ModerationError | null>(null);
  const [notice, setNotice] = useState("");
  const [inspection, setInspection] = useState<{
    id: string;
    edition: PublicEdition | null;
  } | null>(null);
  const pending = useRef(false);
  const queueControl = useRef<HTMLButtonElement>(null);
  const decisionControl = useRef<HTMLSelectElement>(null);
  const reviewTrigger = useRef<string | null>(null);
  const busy = operation !== null;

  useEffect(() => {
    if (selected) {
      decisionControl.current?.focus();
    } else if (reviewTrigger.current) {
      document.getElementById(reviewTrigger.current)?.focus();
      reviewTrigger.current = null;
    }
  }, [selected]);

  useEffect(() => {
    if (!busy && (notice || error)) queueControl.current?.focus();
  }, [busy, notice, error]);

  async function run(operation: Operation, action: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true;
    setOperation(operation);
    setError(null);
    setNotice("");
    try {
      await action();
    } catch (caught) {
      if (
        caught instanceof ModerationError &&
        caught.code === "REAUTH_REQUIRED"
      ) {
        try {
          redirectForAuthentication();
        } catch (redirect) {
          if (!(redirect instanceof SignInRedirect)) throw redirect;
        }
        return;
      }
      setReports(null);
      setSelected(null);
      setInspection(null);
      setConfirmed(false);
      setError(
        caught instanceof ModerationError
          ? caught
          : new ModerationError(
              "UNAVAILABLE",
              "The request could not be confirmed. Load reports to check the current status.",
            ),
      );
    } finally {
      pending.current = false;
      setOperation(null);
    }
  }
  return (
    <div className="account-content" aria-busy={busy}>
      <AccountSection
        title="Open reports"
        description="Shows up to 50 open reports, newest first."
        icon={ListChecks}
        trailing={
          reports?.length ? (
            <AccountStatus>
              {reports.length} {reports.length === 1 ? "report" : "reports"}
            </AccountStatus>
          ) : null
        }
      >
        <button
          ref={queueControl}
          type="button"
          className="button primary"
          disabled={busy}
          onClick={() =>
            void run("queue", async () => {
              setSelected(null);
              setConfirmed(false);
              setInspection(null);
              setReports(await loadModerationReports());
            })
          }
        >
          {operation === "queue"
            ? "Loading reports…"
            : reports
              ? "Refresh reports"
              : "Load reports"}
        </button>
        {error && (
          <div role="alert" className="notice">
            <p>{error.message}</p>
            {["REAUTH_REQUIRED", "ACCESS_LOST"].includes(error.code) && (
              <Link
                className="button secondary"
                href="/sign-in?reauth=true&returnTo=%2Fapp%2Fmoderation"
                prefetch={false}
              >
                Sign in again
              </Link>
            )}
          </div>
        )}
        {notice && <output>{notice}</output>}
        {reports?.length === 0 && (
          <output>No open reports were returned.</output>
        )}
      </AccountSection>
      {operation === "queue" && !reports && (
        <LibrarySkeleton kind="page" rows={2} />
      )}
      {reports?.map((report) => (
        <AccountSection
          key={report._id}
          title={
            inspection?.id === report._id && inspection.edition
              ? inspection.edition.title
              : `Edition ${report.editionId}`
          }
          description={
            <>
              Reported{" "}
              <time dateTime={new Date(report.createdAt).toISOString()}>
                {reportDate.format(report.createdAt)} UTC
              </time>
            </>
          }
          className="moderation-entry"
        >
          <p className="moderation-reason">{report.reason}</p>
          <p className="fine">
            Report {report._id}
            {report.createdAt !== report.updatedAt && (
              <>
                {" "}
                · Updated{" "}
                <time dateTime={new Date(report.updatedAt).toISOString()}>
                  {reportDate.format(report.updatedAt)} UTC
                </time>
              </>
            )}
          </p>
          <div className="account-actions">
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              aria-expanded={inspection?.id === report._id}
              aria-controls={
                inspection?.id === report._id
                  ? `moderation-edition-${report._id}`
                  : undefined
              }
              onClick={() => {
                if (inspection?.id === report._id) {
                  setInspection(null);
                  return;
                }
                void run("inspection", async () => {
                  setInspection(null);
                  setSelected(null);
                  setConfirmed(false);
                  setInspection({
                    id: report._id,
                    edition: await inspectModerationReport(report._id),
                  });
                });
              }}
            >
              {inspection?.id === report._id
                ? "Hide edition"
                : "Inspect public edition"}
            </button>
            {selected !== report._id && (
              <button
                id={`review-${report._id}`}
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={(event) => {
                  reviewTrigger.current = event.currentTarget.id;
                  setSelected(report._id);
                  setDecision("dismiss");
                  setConfirmed(false);
                  setError(null);
                  setNotice("");
                }}
              >
                Review decision
              </button>
            )}
          </div>
          {inspection?.id === report._id && (
            <div
              id={`moderation-edition-${report._id}`}
              className="moderation-details"
            >
              {inspection.edition ? (
                <>
                  <h3>Public edition</h3>
                  <p>{inspection.edition.summary}</p>
                  <p>
                    Public version {inspection.edition.version}.{" "}
                    <a
                      href={`/editions/${inspection.edition.slug}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open public edition in a new tab
                    </a>
                  </p>
                  {inspection.edition.insights.map((insight) => (
                    <section key={insight.id}>
                      <h4>{insight.title}</h4>
                      <p>{insight.claim}</p>
                      <p>{insight.interpretation}</p>
                      <ul>
                        {insight.citations.map((citation, index) => (
                          <li key={index}>
                            {publicCitationUrl(citation.url) ? (
                              <a
                                href={publicCitationUrl(citation.url)!}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {citation.label}
                              </a>
                            ) : (
                              citation.label
                            )}
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </>
              ) : (
                <p>
                  This edition is no longer available publicly. Its private
                  source content is not shown.
                </p>
              )}
            </div>
          )}
          {selected === report._id && (
            <fieldset
              id={`moderation-decision-${report._id}`}
              className="moderation-details form-grid"
              disabled={busy}
            >
              <legend>Record a decision</legend>
              <label htmlFor={`decision-${report._id}`}>Action</label>{" "}
              <select
                ref={decisionControl}
                id={`decision-${report._id}`}
                value={decision}
                onChange={(event) => {
                  setDecision(event.target.value as Decision);
                  setConfirmed(false);
                }}
              >
                <option value="dismiss">Dismiss report</option>
                <option value="remove">
                  Remove edition from public access
                </option>
              </select>
              <p>
                {decision === "remove"
                  ? "This removes the reported edition from public access."
                  : "This closes the report and leaves the edition's publication state unchanged."}
              </p>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />
                <span>
                  I reviewed this report and confirm this{" "}
                  {decision === "remove" ? "removal" : "dismissal"}.
                </span>
              </label>
              <div className="account-actions">
                <button
                  type="button"
                  className="button"
                  disabled={!confirmed || busy}
                  onClick={() =>
                    void run("decision", async () => {
                      await reviewModerationReport(
                        report._id,
                        decision,
                        confirmed,
                      );
                      setInspection(null);
                      setReports(
                        (current) =>
                          current?.filter((row) => row._id !== report._id) ??
                          null,
                      );
                      setSelected(null);
                      setConfirmed(false);
                      setNotice(
                        decision === "remove"
                          ? "Edition removed from public access."
                          : "Report dismissed.",
                      );
                    })
                  }
                >
                  {operation === "decision"
                    ? "Recording decision…"
                    : decision === "remove"
                      ? "Confirm removal"
                      : "Confirm dismissal"}
                </button>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => {
                    setSelected(null);
                    setConfirmed(false);
                  }}
                >
                  Cancel decision
                </button>
              </div>
            </fieldset>
          )}
        </AccountSection>
      ))}
    </div>
  );
}
