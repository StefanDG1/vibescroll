"use client";
import { useEffect, useRef, useState } from "react";
import type { SubscriptionCapabilities } from "../../../packages/runner/subscription-capabilities.mjs";

type Device = {
  id: string;
  name: string;
  catalogue: SubscriptionCapabilities | null;
  expiresAt: number;
};
type TaskStatus = {
  id: string;
  state: string;
  workload: string;
  model: string;
  effort: string;
  deadline: number;
  proposalIds: string[];
  evaluationIds: string[];
};
type Selection = {
  organizationId: string;
  workload: "project_evaluation" | "plan_draft";
  deviceId: string;
  model: string;
  effort: string;
  key: string;
  sourceId?: string;
  repositoryIds?: string[];
  proposalId?: string;
  proposalVersion?: number;
};
type Quote = {
  hash: string;
  expiresAt: number;
  payload: {
    sourceBindings: { sourceId: string; generation: number }[];
    repositoryBindings: { repositoryId: string; baseSha: string }[];
  };
  maxInferenceCredits: number;
};
export type OwnPlanTaskProps = {
  organizationId: string;
  call: (operation: string, args: Record<string, unknown>) => Promise<any>;
  source?: { id: string; title: string };
  proposal?: { id: string; title: string; version: number; review: string };
  repositories: { id: string; name: string }[];
  disabled?: boolean;
  onComplete?: () => unknown | Promise<unknown>;
};

export function OwnPlanTaskControls(props: OwnPlanTaskProps) {
  return (
    <OwnPlanTaskPanel
      key={`${props.organizationId}:${props.source?.id ?? ""}:${props.proposal?.id ?? ""}:${props.proposal?.version ?? ""}`}
      {...props}
    />
  );
}
export function OwnPlanTaskPanel({
  organizationId,
  call,
  source,
  proposal,
  repositories,
  disabled = false,
  onComplete,
}: OwnPlanTaskProps) {
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const [devices, setDevices] = useState<Device[] | null>(null),
    [observedAt, setObservedAt] = useState(Date.now),
    [deviceId, setDeviceId] = useState(""),
    [model, setModel] = useState(""),
    [effort, setEffort] = useState(""),
    [selected, setSelected] = useState<string[]>([]),
    [quote, setQuote] = useState<{ selection: Selection; value: Quote } | null>(
      null,
    ),
    [consent, setConsent] = useState(false),
    [runId, setRunId] = useState(""),
    [status, setStatus] = useState<TaskStatus | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [unknownReviewed, setUnknownReviewed] = useState(false);
  const [history, setHistory] = useState<TaskStatus[] | null>(null);
  const [historyNext, setHistoryNext] = useState<string | null>(null);
  const device = devices?.find((item) => item.id === deviceId),
    models = device?.catalogue?.models ?? [],
    chosen = models.find((item) => item.slug === model),
    accepted = !proposal || proposal.review === "accepted",
    currentCatalogue = !!device?.catalogue && device.expiresAt > observedAt,
    pending =
      !!runId && (!status || ["queued", "active"].includes(status.state)),
    locked = disabled || busy || pending;
  function invalidate() {
    setQuote(null);
    setConsent(false);
    setError("");
  }
  async function action(work: () => Promise<void>) {
    if (disabled || busy) return;
    setBusy(true);
    setObservedAt(Date.now());
    setError("");
    try {
      await work();
    } catch (failure) {
      if (alive.current)
        setError(
          `${failure instanceof Error ? failure.message : "Request failed."} Refresh account choices and review the current quote. If sign-in expired, sign in again.`,
        );
    } finally {
      if (alive.current) {
        setBusy(false);
        setObservedAt(Date.now());
      }
    }
  }
  async function refresh(id = runId) {
    const next: TaskStatus = await call("localTaskStatus", { runId: id });
    if (!alive.current) return;
    setStatus(next);
    if (next.state === "completed") await onComplete?.();
  }
  async function loadHistory(cursor: string | null = null) {
    const page: { items: TaskStatus[]; next: string | null } = await call(
      "localTaskResume",
      {
        organizationId,
        ...(proposal ? { proposalId: proposal.id } : { sourceId: source?.id }),
        cursor,
      },
    );
    if (!alive.current) return;
    setHistory((old) =>
      cursor
        ? [
            ...(old ?? []),
            ...page.items.filter(
              (item) => !old?.some((known) => known.id === item.id),
            ),
          ]
        : page.items,
    );
    setHistoryNext(page.next);
  }

  return (
    <section
      className="evidence-card"
      style={{ overflowWrap: "anywhere" }}
      aria-label="Use your own subscription"
    >
      <h3>
        {proposal
          ? "Draft a plan with your subscription"
          : "Evaluate this source for your projects"}
      </h3>
      <p>
        {proposal ? proposal.title : source?.title}. Your awake paired computer
        uses your own eligible account. These steps do not run code or publish
        anything.
      </p>
      <p>
        Model choices are advertised by your connected account. A completed
        request verifies access. Inference uses 0 app credits; media preparation
        needs its separate approval. No paid API fallback is authorized.
      </p>
      {!accepted && (
        <output>
          Accept the current proposal before requesting a plan draft.
        </output>
      )}
      <button
        className="secondary"
        type="button"
        disabled={disabled || busy}
        onClick={() => void action(() => loadHistory())}
      >
        Find existing tasks
      </button>
      {history && (
        <section aria-label="Existing own-subscription tasks">
          {!history.length && <p>No matching tasks on this page.</p>}
          <ul>
            {history.map((task) => (
              <li key={task.id}>
                <span>
                  {task.state}: {task.model}, {task.effort}.{" "}
                </span>
                <button
                  className="secondary"
                  type="button"
                  disabled={disabled || busy}
                  onClick={() =>
                    void action(async () => {
                      setRunId(task.id);
                      setStatus(null);
                      setQuote(null);
                      setConsent(false);
                      setUnknownReviewed(false);
                      await refresh(task.id);
                    })
                  }
                >
                  Open task status
                </button>
              </li>
            ))}
          </ul>
          {historyNext && (
            <button
              className="secondary"
              type="button"
              disabled={disabled || busy}
              onClick={() => void action(() => loadHistory(historyNext))}
            >
              Find more tasks
            </button>
          )}
        </section>
      )}
      <button
        className="secondary"
        type="button"
        disabled={locked}
        onClick={() =>
          void action(async () => {
            invalidate();
            const result: Device[] = await call("localTaskCapabilities", {
              organizationId,
            });
            if (!alive.current) return;
            setDevices(result);
            setDeviceId("");
            setModel("");
            setEffort("");
          })
        }
      >
        Load account choices
      </button>
      {devices &&
        !devices.some(
          (item) => item.catalogue && item.expiresAt > observedAt,
        ) && (
          <output>
            Start your paired companion and connect your eligible account, then
            load choices again.
          </output>
        )}
      {!!devices?.length && (
        <fieldset disabled={locked} style={{ display: "grid", gap: 12 }}>
          <legend>Account and task choices</legend>
          <label>
            Paired computer{" "}
            <select
              style={{ minHeight: 44, maxWidth: "100%" }}
              value={deviceId}
              onChange={(event) => {
                invalidate();
                setDeviceId(event.target.value);
                setModel("");
                setEffort("");
              }}
            >
              <option value="">Choose your computer</option>
              {devices.map((item) => (
                <option
                  key={item.id}
                  value={item.id}
                  disabled={!item.catalogue || item.expiresAt <= observedAt}
                >
                  {item.name}
                  {!item.catalogue || item.expiresAt <= observedAt
                    ? " (reconnect required)"
                    : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            Model{" "}
            <select
              style={{ minHeight: 44, maxWidth: "100%" }}
              value={model}
              disabled={!currentCatalogue}
              onChange={(event) => {
                invalidate();
                setModel(event.target.value);
                setEffort("");
              }}
            >
              <option value="">Choose an advertised model</option>
              {models.map((item) => (
                <option key={item.slug} value={item.slug}>
                  {item.displayName}
                </option>
              ))}
            </select>
          </label>
          <label>
            Reasoning effort{" "}
            <select
              style={{ minHeight: 44, maxWidth: "100%" }}
              value={effort}
              disabled={!chosen}
              onChange={(event) => {
                invalidate();
                setEffort(event.target.value);
              }}
            >
              <option value="">Choose an advertised effort</option>
              {chosen?.reasoningEfforts.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          {!proposal && (
            <fieldset>
              <legend>Selected repositories, up to five</legend>
              {repositories.length ? (
                repositories.map((repo) => (
                  <label
                    key={repo.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      minHeight: 44,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(repo.id)}
                      disabled={
                        !selected.includes(repo.id) && selected.length >= 5
                      }
                      onChange={(event) => {
                        invalidate();
                        setSelected((old) =>
                          event.target.checked
                            ? [...old, repo.id]
                            : old.filter((id) => id !== repo.id),
                        );
                      }}
                    />
                    {repo.name}
                  </label>
                ))
              ) : (
                <p>Connect and confirm a repository context first.</p>
              )}
            </fieldset>
          )}
        </fieldset>
      )}
      <button
        className="secondary"
        type="button"
        disabled={
          locked ||
          !currentCatalogue ||
          !chosen?.reasoningEfforts.includes(effort) ||
          !accepted ||
          (!proposal && (!source || !selected.length))
        }
        onClick={() =>
          void action(async () => {
            if (device && device.expiresAt <= Date.now())
              throw Error(
                "Account choices expired. Load current account choices before reviewing a quote.",
              );
            if (
              !currentCatalogue ||
              !chosen?.reasoningEfforts.includes(effort) ||
              !accepted ||
              (!proposal &&
                (!source || selected.length < 1 || selected.length > 5))
            )
              return;
            invalidate();
            const selection: Selection = {
              organizationId,
              workload: proposal ? "plan_draft" : "project_evaluation",
              deviceId,
              model,
              effort,
              key: `own-${crypto.randomUUID()}`,
              ...(proposal
                ? { proposalId: proposal.id, proposalVersion: proposal.version }
                : { sourceId: source!.id, repositoryIds: [...selected] }),
            };
            const value: Quote = await call("localTaskQuote", selection);
            if (
              value.maxInferenceCredits !== 0 ||
              value.expiresAt <= Date.now()
            )
              throw Error(
                "The own-subscription quote is unavailable or expired.",
              );
            if (alive.current) setQuote({ selection, value });
          })
        }
      >
        Review own-subscription quote
      </button>
      {quote && (
        <section aria-label="Task approval quote">
          <h4>Review this exact request</h4>
          <p>
            {quote.selection.model}, {quote.selection.effort}. Maximum app
            inference credits: 0. Approval expires{" "}
            {new Date(quote.value.expiresAt).toLocaleTimeString()}.
          </p>
          <ul>
            {quote.value.payload.repositoryBindings.map((binding) => (
              <li key={binding.repositoryId}>
                {repositories.find((repo) => repo.id === binding.repositoryId)
                  ?.name ?? "Proposal repository"}
                : <code>{binding.baseSha}</code>
              </li>
            ))}
          </ul>
          <p>
            {quote.value.payload.sourceBindings.length} current source
            {quote.value.payload.sourceBindings.length === 1 ? "" : "s"} bound
            to this quote. Evaluation saves every disposition for review. Plan
            drafting saves an editable draft.
          </p>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              minHeight: 44,
            }}
          >
            <input
              type="checkbox"
              checked={consent}
              disabled={locked}
              onChange={(event) => setConsent(event.target.checked)}
            />
            Use my own account for this request. I understand its subscription
            limits and separate preparation costs.
          </label>
          <button
            className="primary"
            type="button"
            disabled={locked || !consent || quote.value.expiresAt <= observedAt}
            onClick={() =>
              void action(async () => {
                const now = Date.now();
                if (
                  !device?.catalogue ||
                  device.expiresAt <= now ||
                  quote.value.expiresAt <= now
                ) {
                  setQuote(null);
                  setConsent(false);
                  throw Error(
                    "The account catalogue or quote expired. Load current account choices and review a new quote.",
                  );
                }
                const result = await call("localTaskApprove", {
                  ...quote.selection,
                  quoteHash: quote.value.hash,
                  quoteExpiresAt: quote.value.expiresAt,
                  useOwnPlan: true,
                  maxInferenceCredits: 0,
                });
                if (!alive.current) return;
                setRunId(result.runId);
                setStatus(null);
                setQuote(null);
                setConsent(false);
                await refresh(result.runId);
              })
            }
          >
            Approve on my paired computer
          </button>
        </section>
      )}
      {!!runId && (
        <section aria-label="Own-subscription task status">
          <output>
            {status
              ? `Task ${status.state}. ${status.model}, ${status.effort}.`
              : "Approval recorded. Refresh to see the task status."}
          </output>
          <button
            className="secondary"
            type="button"
            disabled={disabled || busy}
            onClick={() => void action(() => refresh())}
          >
            Refresh task status
          </button>
          {pending && (
            <button
              className="secondary"
              type="button"
              disabled={disabled || busy}
              onClick={() =>
                void action(async () => {
                  await call("localTaskCancel", { runId });
                  await refresh();
                })
              }
            >
              Cancel this task
            </button>
          )}
          {status?.state === "completed" && (
            <p>
              {proposal
                ? "Your editable plan draft is ready for review. Coding needs a separate approval."
                : "Project evaluation is complete. Review its proposals, including no-fit and already-built decisions."}
            </p>
          )}
          {status &&
            ["unknown", "expired", "canceled"].includes(status.state) && (
              <>
                <p>
                  Stopped work may have used subscription allowance. Check your
                  local controller and account usage. New work cannot resolve an
                  uncertain earlier request.
                </p>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    minHeight: 44,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={unknownReviewed}
                    disabled={disabled || busy}
                    onChange={(event) =>
                      setUnknownReviewed(event.target.checked)
                    }
                  />
                  I reviewed the stopped request. Its usage remains unknown.
                </label>
                <button
                  className="secondary"
                  type="button"
                  disabled={
                    disabled ||
                    busy ||
                    !unknownReviewed ||
                    status.deadline > observedAt
                  }
                  onClick={() =>
                    void action(async () => {
                      await call("localTaskReconcile", {
                        runId,
                        acknowledgeUnknownUsage: true,
                      });
                      setUnknownReviewed(false);
                      await refresh();
                    })
                  }
                >
                  Record usage review after the deadline
                </button>
              </>
            )}
        </section>
      )}
      {busy && <output>Checking this request…</output>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
