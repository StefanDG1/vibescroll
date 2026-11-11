"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePolling } from "@/lib/use-polling";
import { EvidenceViewer } from "./evidence-viewer";

type Version = {
  origin?: "private" | "service";
  id: string;
  number: number;
  state: string;
  summary: string;
  insightCount: number;
  requestedModel: string | null;
  requestedEffort: string | null;
  reportedModel: string | null;
};
type History = {
  page: Version[];
  continueCursor: string;
  isDone: boolean;
  selectedVersionId: string | null;
  selectionRevision: number;
  baselineAvailable: boolean;
  pending: { id: string; number: number; state: string } | null;
};
async function read(operation: string, args: unknown) {
  const response = await fetch("/api/product", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operation, args }),
    cache: "no-store",
  });
  if (
    !response.ok ||
    !response.headers.get("content-type")?.includes("application/json")
  )
    throw Error(
      "History is unavailable. Refresh to check your current access.",
    );
  return (await response.json()).result;
}
export function AnalysisHistory({
  sourceId,
  revision,
  disabled,
  reanalysisDisabled = disabled,
  recommendationMode,
  call,
  onChange,
}: {
  sourceId: string;
  revision: string;
  disabled: boolean;
  reanalysisDisabled?: boolean;
  recommendationMode?: "recommended" | "pinned";
  call: (operation: string, args: unknown) => Promise<unknown>;
  onChange: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<History>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<{
    version: Version;
    output: {
      summary: string;
      insights: {
        id: string;
        title: string;
        claim: string;
        evidence: {
          id: string;
          startMs: number | null;
          endMs: number | null;
        }[];
      }[];
    };
    evidence: {
      id: string;
      text: string;
      basis: string;
      uncertainty: string;
    }[];
    frames: {
      id: string;
      assetId?: string;
      reference?: string;
      timestampMs: number;
    }[];
  }>();
  const [frame, setFrame] = useState<string>();
  const [comparison, setComparison] = useState<{
    beforeId: string;
    afterId: string;
    revision: number;
    summaryChanged: boolean;
    added: string[];
    removed: string[];
    changed: string[];
  }>();
  const [model, setModel] = useState("gpt-6.1-sol");
  const [effort, setEffort] = useState("high");
  const [cursor, setCursor] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ attemptId: string }>();
  const operation = useRef<{
    key: string;
    model: string;
    effort: string;
    revision: number;
  } | null>(null);
  const epoch = useRef(0);
  const clearAccess = () => {
    epoch.current++;
    setView(undefined);
    setComparison(undefined);
    setFrame(undefined);
  };
  const load = async () => {
    try {
      const next: History = await read("analysisHistory", {
        sourceId,
        paginationOpts: { numItems: 20, cursor },
      });
      setHistory(next);
      setError("");
    } catch (e) {
      setHistory(undefined);
      clearAccess();
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    if (!open) return;
    let active = true;
    read("analysisHistory", {
      sourceId,
      paginationOpts: { numItems: 20, cursor },
    })
      .then((next) => {
        if (active) {
          setHistory(next);
          setError("");
        }
      })
      .catch((e) => {
        if (active) {
          setHistory(undefined);
          clearAccess();
          setError(e.message);
        }
      });
    return () => {
      active = false;
    };
  }, [open, sourceId, revision, cursor]);
  usePolling(
    load,
    10000,
    open &&
      !!history?.pending &&
      ["queued", "running"].includes(history.pending.state),
    `analysis-history:${sourceId}:${cursor}`,
    false,
  );
  const act = async (operation: string, args: unknown) => {
    setBusy(true);
    setError("");
    try {
      const result = await call(operation, args);
      await load();
      onChange();
      return result;
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "The change was not confirmed. Refresh history before trying again.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <details
      className="panel"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>Analysis versions</summary>
      <p>
        Keep the current result while another analysis runs. Review a candidate
        before selecting it. You can return to any version while its evidence is
        retained.
      </p>
      {error && (
        <p role="alert">
          {error}{" "}
          <Link href="/help/work-cloud-text-review">Check Cloud setup</Link>.
        </p>
      )}
      {open && !history && !error && (
        <output>Loading version history...</output>
      )}
      {history && (
        <>
          <p>
            Selected{" "}
            {history.selectedVersionId
              ? `version ${history.page.find((v) => v.id === history.selectedVersionId)?.number ?? "in history"}`
              : "original analysis"}
            .
          </p>
          {recommendationMode === "pinned" && (
            <button
              className="secondary"
              disabled={disabled || busy}
              onClick={() =>
                act("analysisFollowRecommended", {
                  sourceId,
                  expectedSelectionRevision: history.selectionRevision,
                })
              }
            >
              Follow recommended analysis
            </button>
          )}
          {history.pending && (
            <output>
              Version {history.pending.number}: {history.pending.state}. Your
              selected result is preserved.
            </output>
          )}
          {history.pending?.state === "queued" && (
            <button
              className="secondary"
              disabled={busy || disabled}
              onClick={() =>
                act("analysisCancelWaiting", {
                  sourceId,
                  attemptId: history.pending!.id,
                })
              }
            >
              Cancel waiting request
            </button>
          )}
          {history.page.map((version) => (
            <article key={version.id}>
              <h3>
                Version {version.number}
                {version.origin === "service" ? " · Shared" : " · Personal"}
                {version.id === history.selectedVersionId ? " · Selected" : ""}
              </h3>
              <p>
                {version.state === "ready"
                  ? version.summary
                  : "Evidence no longer available."}
              </p>
              <p className="fine">
                Requested {version.requestedModel ?? "model not recorded"} ·{" "}
                {version.requestedEffort ?? "effort not recorded"}. Model
                reports are not provider verification.
              </p>
              <button
                className="secondary"
                disabled={busy || version.state !== "ready"}
                onClick={async () => {
                  setBusy(true);
                  setComparison(undefined);
                  const started = epoch.current;
                  try {
                    const result = await read("analysisVersion", {
                      sourceId,
                      versionId: version.id,
                    });
                    if (started === epoch.current) setView(result);
                  } catch {
                    clearAccess();
                    setError(
                      "This version is unavailable with your current access or retention.",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Review version {version.number}
              </button>
              <button
                className="secondary"
                disabled={
                  disabled ||
                  busy ||
                  version.state !== "ready" ||
                  version.id === history.selectedVersionId
                }
                onClick={() =>
                  act("analysisSelect", {
                    sourceId,
                    versionId: version.id,
                    expectedSelectionRevision: history.selectionRevision,
                  })
                }
              >
                Use version {version.number}
              </button>
            </article>
          ))}
          {view && (
            <section aria-label={`Review version ${view.version.number}`}>
              <h3>Review version {view.version.number}</h3>
              <p>{view.output.summary}</p>
              {view.output.insights.map((insight) => (
                <article key={insight.id}>
                  <h4>{insight.title}</h4>
                  <p>{insight.claim}</p>
                  <details>
                    <summary>Cited evidence</summary>
                    {insight.evidence.map((ref) => {
                      const observation = view.evidence.find(
                        (entry) => entry.id === ref.id,
                      );
                      return (
                        <blockquote key={ref.id}>
                          <p>
                            {observation?.text ?? "Observation unavailable."}
                          </p>
                          <footer>
                            {observation?.basis ?? "Recorded observation"}
                            {ref.startMs !== null
                              ? ` at ${(ref.startMs / 1000).toFixed(1)}s`
                              : ""}
                            {observation?.uncertainty
                              ? `. ${observation.uncertainty}`
                              : ""}
                          </footer>
                        </blockquote>
                      );
                    })}
                  </details>
                </article>
              ))}
              <details>
                <summary>Retained screenshots for this version</summary>
                {view.frames.map(
                  (image, index) =>
                    (image.reference || image.assetId) && (
                      <button
                        className="secondary"
                        key={image.id}
                        onClick={() =>
                          setFrame(image.reference ?? image.assetId)
                        }
                      >
                        Image {index + 1} at{" "}
                        {(image.timestampMs / 1000).toFixed(1)}s
                      </button>
                    ),
                )}
              </details>
              {history.selectedVersionId &&
                history.selectedVersionId !== view.version.id && (
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      const started = epoch.current;
                      try {
                        const result = await read("analysisCompare", {
                          sourceId,
                          beforeId: history.selectedVersionId,
                          afterId: view.version.id,
                        });
                        if (started === epoch.current)
                          setComparison({
                            ...result,
                            beforeId: history.selectedVersionId!,
                            afterId: view.version.id,
                            revision: history.selectionRevision,
                          });
                      } catch {
                        clearAccess();
                        setError("These retained versions cannot be compared.");
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Compare with selected version
                  </button>
                )}
              {comparison &&
                comparison.beforeId === history.selectedVersionId &&
                comparison.afterId === view.version.id &&
                comparison.revision === history.selectionRevision && (
                  <p>
                    Summary{" "}
                    {comparison.summaryChanged ? "changed" : "unchanged"}.{" "}
                    {comparison.added.length} added, {comparison.removed.length}{" "}
                    removed and {comparison.changed.length} changed insight
                    identifiers. These differences do not establish which
                    analysis is better.
                  </p>
                )}
              {frame && (
                <EvidenceViewer
                  key={frame}
                  frames={view.frames.flatMap((image) =>
                    image.reference || image.assetId
                      ? [
                          {
                            id: (image.reference ?? image.assetId)!,
                            startMs: image.timestampMs,
                          },
                        ]
                      : [],
                  )}
                  initialId={frame}
                  onClose={() => setFrame(undefined)}
                />
              )}
            </section>
          )}
          {!history.isDone && (
            <button
              className="secondary"
              disabled={busy}
              onClick={() => setCursor(history.continueCursor)}
            >
              Older versions
            </button>
          )}
          {cursor && (
            <button className="secondary" onClick={() => setCursor(null)}>
              Newest versions
            </button>
          )}
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              operation.current ??= {
                key: crypto.randomUUID(),
                model,
                effort,
                revision: history.selectionRevision,
              };
              const pending = operation.current;
              const result = await act("analysisReanalyze", {
                sourceId,
                expectedSelectionRevision: pending.revision,
                key: pending.key,
                configuration: {
                  model: pending.model,
                  effort: pending.effort,
                  useOwnPlan: true,
                  maxApiUsd: 0,
                },
              });
              if (result) {
                setReceipt(result as { attemptId: string });
                operation.current = null;
              }
            }}
          >
            <h3>Analyze again using your Cloud Work</h3>
            <p>
              Reuse the saved transcript and screenshots. This uses your own
              ChatGPT subscription and 0 app credits. It does not download or
              transcribe the source again.
            </p>
            <label>
              Model in your Cloud task
              <input
                value={model}
                maxLength={100}
                pattern="[A-Za-z0-9_.:-]+"
                required
                onChange={(event) => setModel(event.target.value)}
              />
            </label>
            <label>
              Reasoning effort
              <select
                value={effort}
                onChange={(event) => setEffort(event.target.value)}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="xhigh">Extra high</option>
              </select>
            </label>
            <p className="fine">
              Choose settings supported by your Cloud task. A stronger model can
              still produce a worse result. The current selection stays in place
              until you choose another version.
            </p>
            <button
              className="primary"
              disabled={
                reanalysisDisabled || disabled || busy || !!history.pending
              }
            >
              Analyze again
            </button>
          </form>
          {receipt && (
            <output>
              Request saved. Your Cloud monitor needs the current setup
              instructions to pick up reanalysis requests.{" "}
              <Link href="/help/work-cloud-text-review">Check Cloud setup</Link>
              . You can also ask your connected Cloud chat to process retained
              attempt {receipt.attemptId} for this post.
            </output>
          )}
          <button className="secondary" disabled={busy} onClick={load}>
            Refresh history
          </button>
        </>
      )}
    </details>
  );
}
