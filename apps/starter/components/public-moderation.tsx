"use client";

import { useRef, useState } from "react";
import Link from "next/link";
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
type ModerationBlock = {
  _id: string;
  reportId?: string;
  reason: string;
  state: "active";
  version: number;
  createdAt: number;
  updatedAt: number;
};
type Requester = (input: string, init: RequestInit) => Promise<Response>;
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
export async function loadModerationBlocks(
  cursor: string | null,
  request?: Requester,
) {
  const result: any = await moderationRequest(
    "publicModerationBlocks",
    { cursor },
    request,
  );
  if (
    !result ||
    !Array.isArray(result.page) ||
    result.page.length > 25 ||
    typeof result.isDone !== "boolean" ||
    typeof result.continueCursor !== "string" ||
    result.continueCursor.length > 2000
  )
    throw new ModerationError(
      "INVALID_RESPONSE",
      "Restrictions could not be read. Load them again.",
    );
  const page: ModerationBlock[] = result.page.map((row: any) => {
    if (
      !row ||
      typeof row._id !== "string" ||
      !row._id ||
      row._id.length > 100 ||
      (row.reportId !== undefined &&
        (typeof row.reportId !== "string" || row.reportId.length > 100)) ||
      !["copyright", "privacy", "inaccuracy", "abuse"].includes(row.reason) ||
      row.state !== "active" ||
      !Number.isSafeInteger(row.version) ||
      row.version < 1 ||
      !Number.isFinite(row.createdAt) ||
      !Number.isFinite(row.updatedAt)
    )
      throw new ModerationError(
        "INVALID_RESPONSE",
        "Restrictions could not be read. Load them again.",
      );
    return {
      _id: row._id,
      ...(row.reportId ? { reportId: row.reportId } : {}),
      reason: row.reason,
      state: "active",
      version: row.version,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  });
  return {
    page,
    isDone: result.isDone as boolean,
    continueCursor: result.continueCursor as string,
  };
}
export async function releaseModerationRestriction(
  block: Pick<ModerationBlock, "_id" | "version">,
  note: string,
  confirmed: boolean,
  request?: Requester,
) {
  if (
    !confirmed ||
    !block._id ||
    !Number.isSafeInteger(block.version) ||
    block.version < 1 ||
    !note.trim() ||
    note.length > 500
  )
    throw new ModerationError(
      "CONFIRMATION_REQUIRED",
      "Review the restriction and record a reason before confirming release.",
    );
  const result: any = await moderationRequest(
    "publicReleaseModerationBlock",
    {
      id: block._id,
      expectedVersion: block.version,
      note: note.trim(),
      explicitlyApproved: true,
    },
    request,
  );
  if (result?.released !== true)
    throw new ModerationError(
      "INVALID_RESPONSE",
      "Release was not confirmed. Reload restrictions before retrying.",
    );
}
export async function repairModerationIdentity(
  input: {
    editionId: string;
    reportId?: string;
    expectedEditionVersion: number;
    canonicalHash: string;
    note: string;
  },
  confirmed: boolean,
  request?: Requester,
) {
  if (
    !confirmed ||
    !input.editionId ||
    input.editionId.length > 100 ||
    (input.reportId !== undefined &&
      (!input.reportId || input.reportId.length > 100)) ||
    !Number.isSafeInteger(input.expectedEditionVersion) ||
    input.expectedEditionVersion < 1 ||
    !/^[a-f0-9]{64}$/.test(input.canonicalHash) ||
    !input.note.trim() ||
    input.note.length > 500
  )
    throw new ModerationError(
      "CONFIRMATION_REQUIRED",
      "Review the recovered identity and repair evidence before confirming.",
    );
  const result: any = await moderationRequest(
    "publicRepairLegacyModeration",
    { ...input, note: input.note.trim(), explicitlyApproved: true },
    request,
  );
  if (result?.repaired !== true)
    throw new ModerationError(
      "INVALID_RESPONSE",
      "Repair was not confirmed. Check current moderation state before retrying.",
    );
}

function ModerationRestrictions() {
  const [rows, setRows] = useState<Awaited<
      ReturnType<typeof loadModerationBlocks>
    > | null>(null),
    [selected, setSelected] = useState<ModerationBlock | null>(null),
    [note, setNote] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<ModerationError | null>(null),
    [notice, setNotice] = useState("");
  const pending = useRef(false);
  async function run(action: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    setNotice("");
    try {
      await action();
    } catch (caught) {
      setRows(null);
      setSelected(null);
      setConfirmed(false);
      setNote("");
      setError(
        caught instanceof ModerationError
          ? caught
          : new ModerationError(
              "UNAVAILABLE",
              "The action was not confirmed. Reload current restrictions before retrying.",
            ),
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function load(cursor: string | null) {
    setRows(null);
    setSelected(null);
    setConfirmed(false);
    setNote("");
    setRows(await loadModerationBlocks(cursor));
  }
  return (
    <section aria-labelledby="moderation-restrictions" aria-busy={busy}>
      <h2 id="moderation-restrictions">Publication restrictions</h2>
      <p>
        Removal restricts the source, this publisher's matching sources across
        workspaces, and matching sources in the original workspace. A publisher
        cannot clear it by withdrawing or choosing a new URL name.
      </p>
      <button
        className="button secondary"
        disabled={busy}
        onClick={() => void run(() => load(null))}
      >
        Load active restrictions
      </button>
      {error && (
        <div role="alert">
          <p>{error.message}</p>
          {["REAUTH_REQUIRED", "ACCESS_LOST"].includes(error.code) && (
            <Link
              href="/sign-in?reauth=true&returnTo=%2Fapp%2Fmoderation"
              prefetch={false}
            >
              Sign in again
            </Link>
          )}
        </div>
      )}
      {notice && <output>{notice}</output>}
      {rows?.page.length === 0 && <p>No active restrictions were returned.</p>}
      {rows?.page.map((block) => (
        <article
          className="card"
          key={block._id}
          style={{ marginTop: 16, overflowWrap: "anywhere" }}
        >
          <h3>Restriction {block._id}</h3>
          <p>
            {block.reason}. Version {block.version}.
          </p>
          <p>
            {block.reportId
              ? `Report ${block.reportId}`
              : "Original legacy report identity is unavailable."}
          </p>
          {selected?._id !== block._id ? (
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => {
                setSelected(block);
                setNote("");
                setConfirmed(false);
                setNotice("");
              }}
            >
              Review release
            </button>
          ) : (
            <fieldset disabled={busy}>
              <legend>Release restriction {block._id}</legend>
              <p>
                Release does not publish anything. The publisher must prepare
                and approve a new exact edition with current rights.
              </p>
              <label>
                Reason for release, without source text or credentials
                <textarea
                  value={note}
                  maxLength={500}
                  onChange={(event) => {
                    setNote(event.target.value);
                    setConfirmed(false);
                  }}
                />
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />
                I reviewed this restriction and authorize its release.
              </label>
              <button
                className="button"
                disabled={busy || !confirmed || !note.trim()}
                onClick={() =>
                  void run(async () => {
                    await releaseModerationRestriction(block, note, confirmed);
                    setRows(null);
                    setSelected(null);
                    setConfirmed(false);
                    setNote("");
                    setNotice(
                      "Restriction released. Nothing was republished. Load current restrictions before another decision.",
                    );
                  })
                }
              >
                Confirm restriction release
              </button>
              <button
                className="button secondary"
                onClick={() => {
                  setSelected(null);
                  setConfirmed(false);
                  setNote("");
                }}
              >
                Cancel release
              </button>
            </fieldset>
          )}
        </article>
      ))}
      {rows && !rows.isDone && (
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => void run(() => load(rows.continueCursor))}
        >
          Load next restrictions
        </button>
      )}
      <LegacyModerationRepair disabled={busy} />
    </section>
  );
}
function LegacyModerationRepair({ disabled }: { disabled: boolean }) {
  const [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState<ModerationError | null>(null);
  const pending = useRef(false);
  return (
    <details>
      <summary>Repair a legacy moderation identity</summary>
      <p>
        Use the operator's bounded normalization report and retained moderation
        evidence. Supply the hash of the original canonical identity, never
        source text. This creates or preserves a restriction; it does not
        release it or restore private content. If the edition identity is
        missing, recover the original metadata first.
      </p>
      {error && (
        <div role="alert">
          <p>{error.message}</p>
          {["REAUTH_REQUIRED", "ACCESS_LOST"].includes(error.code) && (
            <Link
              href="/sign-in?reauth=true&returnTo=%2Fapp%2Fmoderation"
              prefetch={false}
            >
              Sign in again
            </Link>
          )}
        </div>
      )}
      {message && <output>{message}</output>}
      <form
        onChange={() => setConfirmed(false)}
        onSubmit={async (event) => {
          event.preventDefault();
          if (disabled || pending.current || !confirmed) return;
          const form = event.currentTarget,
            fields = new FormData(form);
          pending.current = true;
          setBusy(true);
          setError(null);
          setMessage("");
          try {
            await repairModerationIdentity(
              {
                editionId: String(fields.get("editionId") ?? ""),
                ...(fields.get("reportId")
                  ? { reportId: String(fields.get("reportId")) }
                  : {}),
                expectedEditionVersion: Number(fields.get("version")),
                canonicalHash: String(fields.get("canonicalHash") ?? ""),
                note: String(fields.get("note") ?? ""),
              },
              confirmed,
            );
            form.reset();
            setMessage(
              "Legacy identity restricted. Nothing was released or republished. Run the bounded normalization check again.",
            );
          } catch (caught) {
            setError(
              caught instanceof ModerationError
                ? caught
                : new ModerationError(
                    "UNAVAILABLE",
                    "Repair was not confirmed. Check current moderation state.",
                  ),
            );
          } finally {
            pending.current = false;
            setBusy(false);
            setConfirmed(false);
          }
        }}
      >
        <fieldset disabled={disabled || busy}>
          <legend>Recovered identity</legend>
          <label>
            Edition ID
            <input name="editionId" required maxLength={100} />
          </label>
          <label>
            Report ID, when retained
            <input name="reportId" maxLength={100} />
          </label>
          <label>
            Expected edition version
            <input name="version" type="number" required min={1} step={1} />
          </label>
          <label>
            Original canonical identity SHA-256
            <input
              name="canonicalHash"
              required
              pattern="[a-f0-9]{64}"
              minLength={64}
              maxLength={64}
            />
          </label>
          <label>
            Repair evidence, without source text or credentials
            <textarea name="note" required maxLength={500} />
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => {
                event.stopPropagation();
                setConfirmed(event.target.checked);
              }}
            />
            I verified the original identity and authorize this restriction
            repair.
          </label>
          <button className="button" disabled={!confirmed || busy || disabled}>
            Confirm identity repair
          </button>
        </fieldset>
      </form>
    </details>
  );
}

export function PublicModeration() {
  const [reports, setReports] = useState<ModerationReport[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [decision, setDecision] = useState<Decision>("dismiss");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ModerationError | null>(null);
  const [notice, setNotice] = useState("");
  const [inspection, setInspection] = useState<{
    id: string;
    edition: PublicEdition | null;
  } | null>(null);
  const pending = useRef(false);
  async function run(action: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    setNotice("");
    try {
      await action();
    } catch (caught) {
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
      setBusy(false);
    }
  }
  return (
    <section aria-labelledby="moderation-reports" aria-busy={busy}>
      <h2 id="moderation-reports">Open reports</h2>
      <p>Load up to 50 open reports. This page refreshes only when you ask.</p>
      <button
        className="button"
        disabled={busy}
        onClick={() =>
          void run(async () => {
            setReports(null);
            setSelected(null);
            setConfirmed(false);
            setInspection(null);
            setReports(await loadModerationReports());
          })
        }
      >
        {busy ? "Working…" : "Load reports"}
      </button>
      {error && (
        <div role="alert" className="notice" style={{ marginTop: 16 }}>
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
      {notice && <output style={{ display: "block" }}>{notice}</output>}
      {reports?.length === 0 && (
        <output style={{ display: "block" }}>
          No open reports were returned.
        </output>
      )}
      {reports?.map((report) => (
        <article
          className="card"
          key={report._id}
          style={{ marginTop: 16, overflowWrap: "anywhere" }}
        >
          <h3>Report {report._id}</h3>
          <p className="muted">Edition {report.editionId}</p>
          <p style={{ whiteSpace: "pre-wrap" }}>{report.reason}</p>
          <p className="muted">
            Reported {new Date(report.createdAt).toISOString()}. Updated{" "}
            {new Date(report.updatedAt).toISOString()}.
          </p>
          <button
            className="button secondary"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                setInspection(null);
                setSelected(null);
                setConfirmed(false);
                setInspection({
                  id: report._id,
                  edition: await inspectModerationReport(report._id),
                });
              })
            }
          >
            Inspect current public edition
          </button>
          {inspection?.id === report._id && (
            <div style={{ marginTop: 16 }}>
              {inspection.edition ? (
                <>
                  <h4>{inspection.edition.title}</h4>
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
          {selected !== report._id ? (
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => {
                setSelected(report._id);
                setDecision("dismiss");
                setConfirmed(false);
                setError(null);
                setNotice("");
              }}
            >
              Review decision
            </button>
          ) : (
            <fieldset disabled={busy}>
              <legend>Decision for report {report._id}</legend>
              <label htmlFor={`decision-${report._id}`}>Action</label>{" "}
              <select
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
                  ? "This removes public access and creates a durable publication restriction. Only an authorized moderator can release it."
                  : "This closes the report and leaves the edition's publication state unchanged."}
              </p>
              <label style={{ display: "block", padding: "12px 0" }}>
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />{" "}
                I reviewed this report and confirm this{" "}
                {decision === "remove" ? "removal" : "dismissal"}.
              </label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                <button
                  className="button"
                  disabled={!confirmed || busy}
                  onClick={() =>
                    void run(async () => {
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
                  Confirm {decision === "remove" ? "removal" : "dismissal"}
                </button>
                <button
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
        </article>
      ))}
      <ModerationRestrictions />
    </section>
  );
}
