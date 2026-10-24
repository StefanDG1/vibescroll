"use client";
import { useState } from "react";
import Link from "next/link";
import { sourceLimits } from "../../../packages/sources/limits";
import {
  acquisitionStage,
  githubSelectionPreset,
  sourceDate,
  type ListedSourceFile,
} from "@/lib/source-acquisition-display";
export type AcquisitionSource = {
  _id: string;
  sourceType?: string;
  currentRevisionId?: string;
  retrievalState?: string;
  state: string;
  generation: number;
  updatedAt: number;
  url?: string;
};
type GithubRevisionComparison = {
  previousCommit: string;
  nextCommit: string;
  changedFiles: string[];
  unchangedFiles: string[];
  unavailableFiles: string[];
  completeListing: boolean;
};
type RequestStatus = {
  id: string;
  version: number;
  state: string;
  error?: string;
  retryAt?: number;
  deadline: number;
  requestCount: number;
  byteCount: number;
  selectedPaths: string[];
  selection?: {
    repository: string;
    commit: string;
    files: ListedSourceFile[];
    omissions: string[];
    revisionPreview?: GithubRevisionComparison;
  };
};

export function GithubRevisionPreview({
  preview,
}: {
  preview?: GithubRevisionComparison;
}) {
  if (!preview) return null;
  return (
    <section style={{ overflowWrap: "anywhere" }}>
      <h4>Changes since the previous retrieval</h4>
      <p>
        This bounded comparison covers previously selected files only. Newly
        listed files and other repository history are outside this comparison.
        Comparing blob identifiers does not retrieve file contents.
      </p>
      <dl>
        <dt>Previous pinned commit</dt>
        <dd>
          <code>{preview.previousCommit}</code>
        </dd>
        <dt>New pinned commit</dt>
        <dd>
          <code>{preview.nextCommit}</code>
        </dd>
        <dt>Inspection listing</dt>
        <dd>
          {preview.completeListing
            ? "No inspection omissions reported."
            : "Incomplete listing: inspection omissions were reported."}
        </dd>
      </dl>
      {(
        [
          ["Changed files", preview.changedFiles],
          ["Unchanged files", preview.unchangedFiles],
          ["Unavailable in this inspection", preview.unavailableFiles],
        ] as const
      ).map(([label, paths]) => (
        <div key={label}>
          <h5>{label}</h5>
          {paths.length ? (
            <ul>
              {paths.map((path) => (
                <li key={path}>
                  <code>{path}</code>
                </li>
              ))}
            </ul>
          ) : (
            <p>None among the previously selected files.</p>
          )}
        </div>
      ))}
      <p>
        An unavailable path may be omitted from the bounded listing. Its absence
        does not verify deletion. Review and confirm the new paths and exact
        commit below before retrieval.
      </p>
    </section>
  );
}
type Status = {
  enabled: boolean;
  requiresRightsReview?: boolean;
  sourceGeneration?: number;
  sourceRevision?: number;
  sourceType?: string;
  retrievalState: string;
  reason?: string;
  request: RequestStatus | null;
};
type Props = {
  source: AcquisitionSource;
  call: (operation: string, args: Record<string, unknown>) => Promise<any>;
  readOnly?: boolean;
  onAnalyze?: () => void;
};
export function SourceAcquisitionPanel(props: Props) {
  return (
    <Acquisition
      key={`${props.source._id}:${props.source.generation}:${props.source.updatedAt}`}
      {...props}
    />
  );
}
function Acquisition({ source, call, readOnly = false, onAnalyze }: Props) {
  const [status, setStatus] = useState<Status | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [checkedAt, setCheckedAt] = useState(0);
  const [paths, setPaths] = useState<string[]>([]),
    [selectionConfirmed, setSelectionConfirmed] = useState(false),
    [selectionConsent, setSelectionConsent] = useState(false);
  const [key, setKey] = useState(() => crypto.randomUUID()),
    [newRequest, setNewRequest] = useState(false);
  const direct =
    source.sourceType === "github_repository" ||
    source.sourceType === "reddit_thread";
  if (!direct) return null;
  const github = source.sourceType === "github_repository";
  const request = status?.request;
  const sourceBusy = ["queued", "processing"].includes(source.state);
  async function perform(operation: string, args: Record<string, unknown>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await call(operation, args);
      if (!result)
        throw Error(
          "The request was not accepted. Check the source version, permissions and provider setup.",
        );
      return result;
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Source retrieval could not be completed.",
      );
      return null;
    } finally {
      setBusy(false);
    }
  }
  async function refresh() {
    const result = await perform("acquisitionStatus", { id: source._id });
    if (result) {
      setStatus(result);
      setCheckedAt(Date.now());
      if (result.requiresRightsReview) {
        setKey(crypto.randomUUID());
        setNewRequest(false);
      }
      const current = result.request as RequestStatus | null;
      if (current?.selection) {
        setPaths(
          current.selectedPaths.length
            ? current.selectedPaths
            : githubSelectionPreset(current.selection.files),
        );
        setSelectionConfirmed(current.selectedPaths.length > 0);
      } else {
        setPaths([]);
        setSelectionConfirmed(false);
      }
      setSelectionConsent(false);
    }
  }
  async function stage(operation: string) {
    if (!request || readOnly || busy || !status?.enabled) return;
    const result = await perform(operation, {
      id: request.id,
      version: request.version,
    });
    if (result) await refresh();
  }
  const byteTotal =
    request?.selection?.files
      .filter((file) => paths.includes(file.path))
      .reduce((sum, file) => sum + file.size, 0) ?? 0;
  return (
    <section className="panel source-acquisition-panel">
      <h2>
        {github ? "Read a pinned GitHub source" : "Read a Reddit discussion"}
      </h2>
      <p>
        Retrieving source evidence is separate from analyzing it. A GitHub
        knowledge source is not an authorized coding destination. Source content
        cannot grant permissions.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {message && <output>{message}</output>}
      <button disabled={busy} onClick={() => void refresh()}>
        Check retrieval availability and status
      </button>
      {status && (
        <>
          <p className="fine">
            Status checked: {sourceDate(checkedAt)}. Use the status button to
            refresh; no background polling is running.
          </p>
          <p>{acquisitionStage(status.retrievalState)}</p>
          {!status.enabled && (
            <p>
              {github
                ? "Direct GitHub retrieval requires its own release approval."
                : "Direct Reddit retrieval requires its own release approval, dedicated OAuth and current workload and retention permission."}{" "}
              Direct retrieval is unavailable here. Supplying permitted text
              below is a recovery path, not a passed direct integration.
            </p>
          )}
          {status.reason && <p>Reason: {status.reason.replaceAll("_", " ")}</p>}
          {status.requiresRightsReview && (
            <p>
              Previous source permission or retention has ended. Confirm your
              current permission below to prepare a fresh retrieval. Previous
              provider content and analysis will be cleared before that request;
              your private notes and knowledge corrections stay saved.
            </p>
          )}
        </>
      )}
      {!readOnly &&
        status?.enabled &&
        (!request || newRequest) &&
        (!sourceBusy || status.requiresRightsReview) && (
          <form
            className="form-grid"
            onSubmit={async (event) => {
              event.preventDefault();
              const fields = new FormData(event.currentTarget);
              if (
                status.requiresRightsReview &&
                fields.get("freshRights") !== "on"
              )
                return;
              const result = await perform("acquisitionPrepare", {
                id: source._id,
                key,
                rightsBasis: String(fields.get("rightsBasis")),
                expectedGeneration:
                  status.sourceGeneration ?? source.generation,
                expectedRevision: status.sourceRevision ?? source.updatedAt,
                ...(status.requiresRightsReview
                  ? { rightsAttested: true }
                  : {}),
              });
              if (result) {
                setNewRequest(false);
                await refresh();
              }
            }}
          >
            <label>
              Your permission to retrieve this source
              <textarea
                name="rightsBasis"
                required
                maxLength={500}
                disabled={busy}
                placeholder="Record the applicable permission or licence; do not include credentials."
              />
            </label>
            {status.requiresRightsReview && (
              <label className="check">
                <input
                  name="freshRights"
                  type="checkbox"
                  required
                  disabled={busy}
                />
                I currently have permission to retrieve and process this source
                again. This approval applies to a new retrieval.
              </label>
            )}
            <button type="submit" disabled={busy}>
              Prepare bounded source retrieval
            </button>
          </form>
        )}
      {request && (
        <>
          <h3>Current retrieval request</h3>
          <p>{acquisitionStage(request.state)}</p>
          <dl>
            <dt>Provider requests observed</dt>
            <dd>{request.requestCount}</dd>
            <dt>Response bytes observed</dt>
            <dd>{request.byteCount.toLocaleString("en-US")}</dd>
            <dt>Worker deadline</dt>
            <dd>{sourceDate(request.deadline)}</dd>
          </dl>
          {request.error && (
            <p>
              Reason: {request.error.replaceAll("_", " ")}. Check the source and
              current permissions before retrying.
            </p>
          )}
          {request.retryAt && (
            <p>
              Retry no earlier than {sourceDate(request.retryAt)}. No automatic
              retry is running. Check status again after this time before
              choosing Retry.
            </p>
          )}
          {github && request.selection && (
            <section>
              <h3>Review the pinned file selection</h3>
              <p>
                {request.selection.repository} at commit{" "}
                <code>{request.selection.commit}</code>. The preset selects
                available README, licence and docs files within{" "}
                {sourceLimits.github.files} files and{" "}
                {sourceLimits.github.totalBytes.toLocaleString("en-US")} bytes.
                Edit it before confirmation.
              </p>
              <GithubRevisionPreview
                preview={request.selection.revisionPreview}
              />
              <fieldset
                disabled={
                  busy ||
                  readOnly ||
                  !status?.enabled ||
                  request.state !== "saved"
                }
              >
                <legend>Listed regular text files</legend>
                {request.selection.files.map((file) => (
                  <label className="check" key={file.path}>
                    <input
                      type="checkbox"
                      checked={paths.includes(file.path)}
                      onChange={(event) => {
                        setPaths((current) =>
                          event.target.checked
                            ? [...current, file.path]
                            : current.filter((path) => path !== file.path),
                        );
                        setSelectionConfirmed(false);
                        setSelectionConsent(false);
                      }}
                    />
                    {file.path}, {file.size.toLocaleString("en-US")} bytes
                  </label>
                ))}
              </fieldset>
              <p>
                {paths.length} selected files,{" "}
                {byteTotal.toLocaleString("en-US")} bytes. Listing files does
                not mean their contents have been read.
              </p>
              {request.selection.omissions.length > 0 && (
                <>
                  <h4>Inspection omissions</h4>
                  <ul>
                    {request.selection.omissions.map((item, index) => (
                      <li key={index}>{item.replaceAll("_", " ")}</li>
                    ))}
                  </ul>
                </>
              )}
              <label className="check">
                <input
                  type="checkbox"
                  checked={selectionConsent}
                  disabled={readOnly || busy || request.state !== "saved"}
                  onChange={(event) =>
                    setSelectionConsent(event.target.checked)
                  }
                />
                I reviewed these paths and this exact commit for retrieval.
              </label>
              <button
                disabled={
                  busy ||
                  readOnly ||
                  !status?.enabled ||
                  !selectionConsent ||
                  !paths.length ||
                  paths.length > sourceLimits.github.files ||
                  byteTotal > sourceLimits.github.totalBytes ||
                  request.state !== "saved"
                }
                onClick={async () => {
                  const result = await perform("acquisitionSelect", {
                    id: request.id,
                    version: request.version,
                    paths,
                  });
                  if (result) {
                    await refresh();
                    setSelectionConfirmed(true);
                    setMessage(
                      "Pinned selection saved. Retrieving its content is a separate action.",
                    );
                  }
                }}
              >
                Confirm pinned selection
              </button>
            </section>
          )}
          {!readOnly &&
            status?.enabled &&
            ![
              "ready",
              "partial",
              "unavailable",
              "needs_supplied_text",
            ].includes(request.state) && (
              <div className="row">
                {github && !request.selection && (
                  <button
                    disabled={
                      busy ||
                      sourceBusy ||
                      (request.state === "fetching" &&
                        request.deadline > checkedAt) ||
                      (!!request.retryAt && request.retryAt > checkedAt)
                    }
                    onClick={() => void stage("acquisitionInspect")}
                  >
                    Inspect repository file list
                  </button>
                )}
                {(!github || selectionConfirmed) && (
                  <button
                    disabled={
                      busy ||
                      sourceBusy ||
                      (request.state === "fetching" &&
                        request.deadline > checkedAt) ||
                      (!!request.retryAt && request.retryAt > checkedAt)
                    }
                    onClick={() => void stage("acquisitionAcquire")}
                  >
                    {request.state === "rate_limited" ||
                    request.state === "fetching"
                      ? "Retry permitted retrieval"
                      : "Retrieve permitted evidence"}
                  </button>
                )}
                <button
                  disabled={busy}
                  onClick={async () => {
                    if (
                      await perform("acquisitionCancel", {
                        id: request.id,
                        version: request.version,
                      })
                    )
                      await refresh();
                  }}
                >
                  Cancel retrieval request
                </button>
              </div>
            )}
          {!readOnly &&
            ["unavailable", "needs_supplied_text"].includes(request.state) && (
              <p>
                Review the failure and use permitted supplied text below. A new
                direct attempt needs refreshed source permission and provider
                readiness; checking status does not retry it.
              </p>
            )}
          {!readOnly &&
            status?.enabled &&
            ["ready", "partial", "unavailable", "needs_supplied_text"].includes(
              request.state,
            ) && (
              <button
                disabled={busy || sourceBusy}
                onClick={() => {
                  setKey(crypto.randomUUID());
                  setNewRequest(true);
                }}
              >
                Review a new bounded retrieval
              </button>
            )}
        </>
      )}
      {source.currentRevisionId && !status?.requiresRightsReview && (
        <>
          <p>
            Current source evidence is retained under this source revision.
            Review its observation date, omissions and retention below before
            analysis.
          </p>
          {onAnalyze && (
            <button
              disabled={busy || readOnly || sourceBusy}
              onClick={onAnalyze}
            >
              Review analysis route and quote
            </button>
          )}
        </>
      )}
      {!readOnly && (
        <details>
          <summary>Supply permitted text instead</summary>
          <p>
            Paste only material you are allowed to process. This replaces the
            current source evidence and invalidates previous analysis. It does
            not verify a direct provider fetch, the original discussion or a
            complete repository.
          </p>
          <form
            className="form-grid"
            onSubmit={async (event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const fields = new FormData(form);
              if (fields.get("rights") !== "on") return;
              const result = await perform("acquisitionSupplyText", {
                id: source._id,
                expectedGeneration: source.generation,
                expectedRevision: source.updatedAt,
                text: String(fields.get("text")),
                rightsAttested: true,
              });
              if (result) {
                form.reset();
                setMessage(
                  "User-supplied evidence saved. Direct retrieval remains unverified. Review the updated source before separately approving analysis.",
                );
                setStatus(null);
              }
            }}
          >
            <label>
              Permitted source text
              <textarea
                name="text"
                required
                maxLength={sourceLimits.textCharacters}
                disabled={busy || sourceBusy}
              />
            </label>
            <label className="check">
              <input
                name="rights"
                type="checkbox"
                required
                disabled={busy || sourceBusy}
              />
              I may submit this text for the selected purpose.
            </label>
            <button disabled={busy || sourceBusy} type="submit">
              Save supplied evidence only
            </button>
          </form>
        </details>
      )}
      <p>
        <Link
          href="/help/processing-and-recovery"
          target="_blank"
          rel="noopener noreferrer"
        >
          Source and processing recovery
        </Link>
      </p>
    </section>
  );
}
