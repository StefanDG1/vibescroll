"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { SubscriptionCapabilities } from "../../../packages/runner/subscription-capabilities.mjs";
import type { PrivateEvaluationOrigin } from "../../../packages/contracts/private-evaluation-context";
import type { LocalTaskRuntimeSnapshot } from "../../../packages/contracts/private-source-analysis";
import type { PrivateVariantSelection } from "../../../packages/contracts/private-project-variant";
function variantIdentity(value?: PrivateVariantSelection) {
  return JSON.stringify(
    value
      ? [
          value.schemaVersion,
          value.runId,
          value.version,
          value.outputHash,
          value.insightIds,
        ]
      : null,
  );
}

type Device = {
  id: string;
  name: string;
  catalogue: SubscriptionCapabilities | null;
  expiresAt: number;
  admittedRuntime?: LocalTaskRuntimeSnapshot | null;
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
  privateEvaluationOrigin?: PrivateEvaluationOrigin;
  privateVersion?: number | null;
  resultAvailable?: boolean;
};
type Selection = {
  includeSourceContent?: boolean;
  organizationId: string;
  workload: "project_evaluation" | "plan_draft" | "source_reanalysis_text";
  deviceId: string;
  model: string;
  effort: string;
  key: string;
  sourceId?: string;
  repositoryIds?: string[];
  proposalId?: string;
  proposalVersion?: number;
  privateEvaluationBrief?: string;
  expectedPrivateVersion?: number;
  privateSourceBrief?: string;
  privateVariantSelection?: PrivateVariantSelection;
};
type Quote = {
  hash: string;
  expiresAt: number;
  payload: {
    includeSourceContent?: boolean;
    sourceBindings?: { sourceId: string; generation: number }[];
    repositoryBindings?: { repositoryId: string; baseSha: string }[];
    privateEvaluationBrief?: string;
    privateEvaluationOrigin?: PrivateEvaluationOrigin;
    privateSourceBrief?: string;
    sourceId?: string;
    expectedPrivateVersion?: number;
    privateVariantSelection?: PrivateVariantSelection;
  };
  maxInferenceCredits: number;
};
export type OwnPlanTaskProps = {
  sourceContentChoice?: {
    include: boolean;
    onChange: (include: boolean) => void;
  };
  organizationId: string;
  call: (operation: string, args: Record<string, unknown>) => Promise<any>;
  source?: { id: string; title: string };
  proposal?: {
    id: string;
    title: string;
    version: number;
    review: string;
    privateEvaluationOrigin?: PrivateEvaluationOrigin;
  };
  privateLibrary?: boolean;
  sourceReanalysis?: {
    available: boolean;
    expectedPrivateVersion: number;
    pendingRunId?: string | null;
  };
  onViewPrivateResult?: (runId: string) => void;
  privateVariantSelection?: PrivateVariantSelection;
  privateVariantReadUntil?: number | null;
  repositories: { id: string; name: string }[];
  disabled?: boolean;
  onComplete?: () => unknown | Promise<unknown>;
};

export function OwnPlanTaskControls(props: OwnPlanTaskProps) {
  return (
    <OwnPlanTaskPanel
      key={`${props.organizationId}:${props.source?.id ?? ""}:${props.proposal?.id ?? ""}:${props.proposal?.version ?? ""}${props.privateLibrary === true ? ":private" : ""}${props.sourceReanalysis ? `:source-text-v2:${props.sourceReanalysis.expectedPrivateVersion}` : ""}${props.privateVariantSelection ? `:private-variant:${JSON.stringify(props.privateVariantSelection)}:${props.privateVariantReadUntil ?? ""}` : ""}`}
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
  privateLibrary,
  sourceReanalysis,
  onViewPrivateResult,
  privateVariantSelection,
  privateVariantReadUntil,
  sourceContentChoice,
  disabled = false,
  onComplete,
}: OwnPlanTaskProps) {
  const alive = useRef(true);
  const requestRevision = useRef(0);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      requestRevision.current += 1;
    };
  }, []);
  const [devices, setDevices] = useState<Device[] | null>(null),
    [observedAt, setObservedAt] = useState(Date.now),
    [deviceId, setDeviceId] = useState(""),
    [model, setModel] = useState(""),
    [effort, setEffort] = useState(""),
    [selected, setSelected] = useState<string[]>([]),
    [quote, setQuote] = useState<{
      selection: Selection;
      value: Quote;
      revision: number;
    } | null>(null),
    [consent, setConsent] = useState(false),
    [runId, setRunId] = useState(""),
    [status, setStatus] = useState<TaskStatus | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [unknownReviewed, setUnknownReviewed] = useState(false);
  const [history, setHistory] = useState<TaskStatus[] | null>(null);
  const [historyNext, setHistoryNext] = useState<string | null>(null);
  const [privateBrief, setPrivateBrief] = useState("");
  const [localSourceContent, setLocalSourceContent] = useState(true);
  const includeSourceContent =
    sourceContentChoice?.include ?? localSourceContent;
  const sourceContentCurrent = useRef(includeSourceContent);
  const [seenSourceContent, setSeenSourceContent] =
    useState(includeSourceContent);
  if (seenSourceContent !== includeSourceContent) {
    setSeenSourceContent(includeSourceContent);
    setQuote(null);
    setConsent(false);
  }
  const setIncludeSourceContent = (include: boolean) =>
    sourceContentChoice
      ? sourceContentChoice.onChange(include)
      : setLocalSourceContent(include);
  useLayoutEffect(() => {
    sourceContentCurrent.current = includeSourceContent;
    requestRevision.current += 1;
  }, [includeSourceContent]);
  const sourceMode = !!sourceReanalysis && !proposal;
  const applicationMode = !!source && !sourceMode && !proposal;
  const variantMode = !!privateVariantSelection && !sourceMode && !proposal;
  const requiresVariantRuntime =
    variantMode ||
    proposal?.privateEvaluationOrigin?.kind === "private_source_variant";
  const variantCurrent = (now = observedAt) =>
    !variantMode ||
    (privateLibrary === true &&
      !!source &&
      privateVariantSelection!.schemaVersion === "private-source-variant-v1" &&
      privateVariantSelection!.insightIds.length >= 1 &&
      privateVariantSelection!.insightIds.length <= 12 &&
      new Set(privateVariantSelection!.insightIds).size ===
        privateVariantSelection!.insightIds.length &&
      (privateVariantReadUntil == null || privateVariantReadUntil > now));
  const privateBriefAllowed =
    privateLibrary === true && !!source && !proposal && !variantMode;
  const privateBriefBytes = new TextEncoder().encode(privateBrief).length;
  const briefOverLimit = privateBriefAllowed && privateBriefBytes > 4000;
  const device = devices?.find((item) => item.id === deviceId),
    models = device?.catalogue?.models ?? [],
    chosen = models.find((item) => item.slug === model),
    accepted = !proposal || proposal.review === "accepted",
    currentCatalogue = !!device?.catalogue && device.expiresAt > observedAt,
    runtimeCurrent = (item: Device | undefined, now = observedAt) =>
      (!sourceMode && !requiresVariantRuntime && !applicationMode) ||
      (!!item?.admittedRuntime &&
        item.admittedRuntime.value.schemaVersion === "local-task-runtime-v1" &&
        item.admittedRuntime.value.features.includes(
          applicationMode
            ? "project_apply_source_v1"
            : requiresVariantRuntime
              ? "project_private_variant_v1"
              : "source_reanalysis_text_v1",
        ) &&
        item.admittedRuntime.expiresAt > now &&
        item.admittedRuntime.sessionExpiresAt > now),
    pending =
      !!runId && (!status || ["queued", "active"].includes(status.state)),
    locked = disabled || busy || pending;
  function invalidate() {
    requestRevision.current += 1;
    setQuote(null);
    setConsent(false);
    setError("");
  }
  async function action(work: () => Promise<void>) {
    if (!alive.current || disabled || busy) return;
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
        ...(sourceMode ? { workload: "source_reanalysis_text" } : {}),
        ...(variantMode ? { privateVariantSelection } : {}),
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
        {sourceMode
          ? "Reanalyze this text privately"
          : proposal
            ? "Draft a plan with your subscription"
            : "Evaluate this source for your projects"}
      </h3>
      <p>
        {proposal ? proposal.title : source?.title}. Your awake paired computer
        uses your own eligible account. These steps do not run code or publish
        anything.
      </p>
      {proposal?.privateEvaluationOrigin?.kind ===
        "private_evaluation_brief" && (
        <p>
          Private evaluation context. This plan inherits the proposal's approved
          private focus.
        </p>
      )}
      {proposal?.privateEvaluationOrigin?.kind === "private_source_variant" && (
        <p>
          Private source result version{" "}
          {proposal.privateEvaluationOrigin.version}. This plan inherits the
          accepted proposal's selected private ideas.
        </p>
      )}
      <p>
        Model choices are advertised by your connected account. A completed
        request verifies access. Inference uses 0 app credits; media preparation
        needs its separate approval. No paid API fallback is authorized.
      </p>
      {sourceMode && (
        <p>
          Text evidence only. Your private result does not replace the source
          analysis or shared catalog. Update the local runtime if text
          reanalysis is unavailable; signing in again is not required just to
          update it.
        </p>
      )}
      {variantMode && (
        <p>
          Evaluate {privateVariantSelection!.insightIds.length} selected ideas
          from private result version {privateVariantSelection!.version}. The
          source analysis and shared catalog stay unchanged.
        </p>
      )}
      {!accepted && (
        <output>
          Accept the current proposal before requesting a plan draft.
        </output>
      )}
      {applicationMode && (
        <label className="check-label">
          <input
            type="checkbox"
            checked={includeSourceContent}
            disabled={locked}
            onChange={(event) => {
              invalidate();
              setIncludeSourceContent(event.target.checked);
            }}
          />{" "}
          <span>
            Include full transcript and images
            <span className="fine" style={{ display: "block" }}>
              Uses only retained source text and sampled images that are
              available. Missing media is not fetched again. Up to five distinct
              proposals per project.
            </span>
          </span>
        </label>
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
                  {task.privateEvaluationOrigin?.kind ===
                    "private_evaluation_brief" &&
                    "Private evaluation context. "}
                  {task.privateEvaluationOrigin?.kind ===
                    "private_source_variant" &&
                    `Private source result version ${task.privateEvaluationOrigin.version}. `}
                </span>
                {sourceMode && task.resultAvailable && onViewPrivateResult && (
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy}
                    onClick={() => onViewPrivateResult(task.id)}
                  >
                    View private result version {task.privateVersion}
                  </button>
                )}
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
      {privateBriefAllowed && (
        <details>
          <summary>
            {sourceMode
              ? "Optional private text focus"
              : "Advanced: private evaluation focus"}
          </summary>
          <p>
            {sourceMode ? (
              "Optionally describe your private focus for this text review. Your approved brief joins the text sent to your connected account. It does not change the source analysis or shared catalog. Do not include credentials."
            ) : (
              <>
                Optionally explain what to focus on for your selected projects.
                This private focus does not change the generic source analysis
                or shared catalog. Your approved text is included in the context
                sent to your connected account. Do not include credentials.
              </>
            )}
          </p>
          <label>
            {sourceMode
              ? "Private text brief, optional"
              : "Private evaluation brief, optional"}
            <textarea
              value={privateBrief}
              disabled={locked}
              rows={5}
              style={{ width: "100%", boxSizing: "border-box" }}
              aria-invalid={briefOverLimit}
              onChange={(event) => {
                invalidate();
                setPrivateBrief(event.target.value);
              }}
            />
          </label>
          <p role={briefOverLimit ? "alert" : undefined}>
            {privateBriefBytes} / 4000 UTF-8 bytes.{" "}
            {briefOverLimit && "Shorten the brief before reviewing a quote."}
          </p>
        </details>
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
                  disabled={
                    !item.catalogue ||
                    item.expiresAt <= observedAt ||
                    !runtimeCurrent(item)
                  }
                >
                  {item.name}
                  {!runtimeCurrent(item)
                    ? requiresVariantRuntime
                      ? " (private project runtime update required)"
                      : " (text runtime update required)"
                    : ""}
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
          {!proposal && !sourceMode && (
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
          !variantCurrent() ||
          ((requiresVariantRuntime || applicationMode) &&
            !runtimeCurrent(device)) ||
          (sourceMode &&
            (privateLibrary !== true ||
              !sourceReanalysis?.available ||
              !!sourceReanalysis.pendingRunId ||
              !runtimeCurrent(device))) ||
          briefOverLimit ||
          !currentCatalogue ||
          !chosen?.reasoningEfforts.includes(effort) ||
          !accepted ||
          (!proposal && (!source || (!sourceMode && !selected.length)))
        }
        onClick={() =>
          void action(async () => {
            if (device && device.expiresAt <= Date.now())
              throw Error(
                "Account choices expired. Load current account choices before reviewing a quote.",
              );
            if (
              !currentCatalogue ||
              !variantCurrent(Date.now()) ||
              ((requiresVariantRuntime || applicationMode) &&
                !runtimeCurrent(device, Date.now())) ||
              (sourceMode &&
                (privateLibrary !== true ||
                  !sourceReanalysis?.available ||
                  !!sourceReanalysis.pendingRunId ||
                  !runtimeCurrent(device, Date.now()))) ||
              briefOverLimit ||
              !chosen?.reasoningEfforts.includes(effort) ||
              !accepted ||
              (!proposal &&
                !sourceMode &&
                (!source || selected.length < 1 || selected.length > 5))
            )
              return;
            invalidate();
            const revision = requestRevision.current;
            const selection: Selection = {
              organizationId,
              workload: sourceMode
                ? "source_reanalysis_text"
                : proposal
                  ? "plan_draft"
                  : "project_evaluation",
              deviceId,
              model,
              effort,
              key: `own-${crypto.randomUUID()}`,
              ...(sourceMode
                ? {
                    sourceId: source!.id,
                    expectedPrivateVersion:
                      sourceReanalysis!.expectedPrivateVersion,
                    ...(privateBriefAllowed && privateBrief.trim().length > 0
                      ? { privateSourceBrief: privateBrief }
                      : {}),
                  }
                : proposal
                  ? {
                      proposalId: proposal.id,
                      proposalVersion: proposal.version,
                    }
                  : {
                      sourceId: source!.id,
                      repositoryIds: [...selected],
                      includeSourceContent,
                      ...(variantMode ? { privateVariantSelection } : {}),
                      ...(privateBriefAllowed && privateBrief.trim().length > 0
                        ? { privateEvaluationBrief: privateBrief }
                        : {}),
                    }),
            };
            const value: Quote = await call("localTaskQuote", selection);
            if (
              !alive.current ||
              requestRevision.current !== revision ||
              (applicationMode &&
                sourceContentCurrent.current !== selection.includeSourceContent)
            )
              return;
            if (
              value.maxInferenceCredits !== 0 ||
              value.expiresAt <= Date.now() ||
              value.payload.privateEvaluationBrief !==
                selection.privateEvaluationBrief ||
              (applicationMode &&
                value.payload.includeSourceContent !==
                  selection.includeSourceContent) ||
              (variantMode &&
                variantIdentity(value.payload.privateVariantSelection) !==
                  variantIdentity(selection.privateVariantSelection)) ||
              (sourceMode &&
                (value.payload.privateSourceBrief !==
                  selection.privateSourceBrief ||
                  value.payload.sourceId !== source?.id ||
                  value.payload.expectedPrivateVersion !==
                    sourceReanalysis?.expectedPrivateVersion))
            )
              throw Error(
                "The own-subscription quote is unavailable or expired.",
              );
            if (alive.current) setQuote({ selection, value, revision });
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
          {variantMode && (
            <p>
              Private result version {privateVariantSelection!.version}.
              Selected insight IDs:{" "}
              {privateVariantSelection!.insightIds.join(", ")}. Review the
              selected claims in the private result above.
            </p>
          )}
          {(quote.selection.privateEvaluationBrief !== undefined ||
            quote.selection.privateSourceBrief !== undefined) && (
            <section
              aria-label={
                sourceMode
                  ? "Private text brief in this quote"
                  : "Private evaluation brief in this quote"
              }
            >
              <h4>
                {sourceMode ? "Private text brief" : "Private evaluation brief"}
              </h4>
              <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                {quote.selection.privateSourceBrief ??
                  quote.selection.privateEvaluationBrief}
              </p>
            </section>
          )}
          {proposal &&
            quote.value.payload.privateEvaluationOrigin?.kind ===
              "private_evaluation_brief" && (
              <p>
                Private evaluation context inherited from the approved proposal.
              </p>
            )}
          {proposal &&
            quote.value.payload.privateEvaluationOrigin?.kind ===
              "private_source_variant" && (
              <p>
                Private source result version{" "}
                {quote.value.payload.privateEvaluationOrigin.version}, inherited
                from the accepted proposal.
              </p>
            )}
          <ul>
            {(quote.value.payload.repositoryBindings ?? []).map((binding) => (
              <li key={binding.repositoryId}>
                {repositories.find((repo) => repo.id === binding.repositoryId)
                  ?.name ?? "Proposal repository"}
                : <code>{binding.baseSha}</code>
              </li>
            ))}
          </ul>
          <p>
            {sourceMode ? (
              "This quote binds the current text evidence and private result version. It creates no project proposal or plan."
            ) : (
              <>
                {quote.value.payload.sourceBindings?.length ?? 0} current source
                {quote.value.payload.sourceBindings?.length === 1
                  ? ""
                  : "s"}{" "}
                bound to this quote. Evaluation saves every disposition for
                review. Plan drafting saves an editable draft.
              </>
            )}
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
                  (requiresVariantRuntime || applicationMode) &&
                  !runtimeCurrent(device, now)
                ) {
                  invalidate();
                  throw Error(
                    "Private project runtime changed. Review current account choices and a new quote.",
                  );
                }
                if (requestRevision.current !== quote.revision) {
                  invalidate();
                  throw Error("Task choices changed. Review a new quote.");
                }
                if (
                  applicationMode &&
                  quote.selection.includeSourceContent !==
                    sourceContentCurrent.current
                ) {
                  invalidate();
                  throw Error(
                    "Source content choice changed. Review a new quote.",
                  );
                }
                if (
                  variantMode &&
                  (!variantCurrent(now) ||
                    !runtimeCurrent(device, now) ||
                    variantIdentity(quote.selection.privateVariantSelection) !==
                      variantIdentity(privateVariantSelection))
                ) {
                  invalidate();
                  throw Error(
                    "Private result selection, rights or runtime changed. Review a new quote.",
                  );
                }
                if (
                  sourceMode &&
                  (!runtimeCurrent(device, now) ||
                    quote.selection.expectedPrivateVersion !==
                      sourceReanalysis?.expectedPrivateVersion ||
                    quote.selection.privateSourceBrief !==
                      (privateBrief.trim() ? privateBrief : undefined))
                ) {
                  invalidate();
                  throw Error(
                    "Text runtime or private context changed. Review a new quote.",
                  );
                }
                if (
                  quote.selection.privateEvaluationBrief !== undefined &&
                  (!privateBriefAllowed ||
                    quote.selection.privateEvaluationBrief !== privateBrief ||
                    briefOverLimit)
                ) {
                  invalidate();
                  throw Error("The private focus changed. Review a new quote.");
                }
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
          {sourceMode && status?.resultAvailable && onViewPrivateResult && (
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => onViewPrivateResult(status.id)}
            >
              View private result version {status.privateVersion}
            </button>
          )}
          {status?.privateEvaluationOrigin?.kind ===
            "private_evaluation_brief" && (
            <p>
              Private evaluation context. The private brief is retained with its
              approved task.
            </p>
          )}
          {status?.privateEvaluationOrigin?.kind ===
            "private_source_variant" && (
            <p>
              Private source result version{" "}
              {status.privateEvaluationOrigin.version}. Selected private ideas
              remain separate from the source analysis.
            </p>
          )}
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
              {sourceMode
                ? "Task completed. Load its private result to check current availability. The generic source analysis is unchanged."
                : proposal
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
