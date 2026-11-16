"use client";
import { useRef, useState } from "react";
import {
  ArrowUpRight,
  Check,
  GitPullRequest,
  Loader2,
  MessageSquare,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { usePolling } from "@/lib/use-polling";
import { ChoiceSelect } from "./choice-select";
import { ImprovementControls } from "./improvement-controls";
import { WorkEmpty, WorkFilters, WorkStatus } from "./work-screens";
import { LibrarySkeleton } from "./library-skeleton";
import { cloudExecutionEstimate } from "../../../packages/plans/execution-quote";
type Call = (operation: string, args: any) => Promise<any>;
type Filter = "all" | "active" | "results";
const stages: Record<string, string> = {
  unavailable: "Evidence unavailable",
  planning: "Preparing a plan",
  planned: "Ready to build",
  stale: "Needs a fresh review",
  queued: "Waiting to start",
  running: "AI is working",
  awaiting_review: "Ready for review",
  publishing: "Opening a pull request",
  pull_request: "Pull request open",
  awaiting_outcome: "Ready for your feedback",
  reviewed: "Outcome recorded",
  reverted: "Change reverted",
  closed_unmerged: "Closed without merging",
  access_lost: "Reconnect GitHub",
  failed: "Needs attention",
  canceled: "Stopped",
};
const activeStages = new Set([
  "planning",
  "planned",
  "queued",
  "running",
  "awaiting_review",
  "publishing",
  "pull_request",
]);
const resultStages = new Set([
  "awaiting_outcome",
  "reviewed",
  "reverted",
  "closed_unmerged",
]);
export function Improvements({
  organizationId,
  call,
  readOnly,
  demo,
  executionReady = false,
  availableCredits = 0,
  onOpenIssues,
  onOpenRuns,
  computeReservationCredits = 10000,
  creditsPerSecond = 1,
}: {
  organizationId: string;
  call: Call;
  readOnly: boolean;
  demo: boolean;
  executionReady?: boolean;
  availableCredits?: number;
  onOpenIssues: () => void;
  onOpenRuns: () => void;
  computeReservationCredits?: number;
  creditsPerSecond?: number;
}) {
  const [items, setItems] = useState<any[]>([]),
    [next, setNext] = useState<string | null>(null),
    [loading, setLoading] = useState(!demo),
    [refreshing, setRefreshing] = useState(false),
    [error, setError] = useState(""),
    [filter, setFilter] = useState<Filter>("all");
  const generation = useRef({ value: 0 }),
    browsing = useRef(false);
  async function refresh(cursor?: string, explicit = false) {
    if (demo) return;
    const g = ++generation.current.value;
    browsing.current = !!cursor;
    if (explicit) setRefreshing(true);
    try {
      const response = await fetch("/api/product", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation: "improvementList",
          args: { organizationId, cursor },
        }),
      });
      if (
        response.redirected ||
        response.status === 401 ||
        response.status === 403
      ) {
        if (g === generation.current.value) {
          setItems([]);
          setNext(null);
        }
        throw new Error(
          "Your access changed. Sign in again to view improvements.",
        );
      }
      if (!response.ok)
        throw new Error(
          "Improvements could not be refreshed. Try again in a moment.",
        );
      const data = await response.json();
      if (g !== generation.current.value) return;
      setItems((old) =>
        cursor ? [...old, ...data.result.items] : data.result.items,
      );
      setNext(data.result.next);
      setError("");
    } catch (e) {
      if (g === generation.current.value) {
        setError(
          e instanceof Error ? e.message : "Could not load improvements.",
        );
      }
      return false;
    } finally {
      if (g === generation.current.value) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }
  const processing = items.some((i) =>
    ["planning", "queued", "running", "publishing"].includes(i.stage),
  );
  usePolling(
    async () => {
      if (!browsing.current) return refresh();
    },
    processing ? 15000 : 60000,
    !demo,
    organizationId,
  );
  const active = items.filter((item) => activeStages.has(item.stage));
  const results = items.filter((item) => resultStages.has(item.stage));
  const visible =
    filter === "active" ? active : filter === "results" ? results : items;
  return (
    <section className="improvements" aria-label="Improvements">
      <div className="work-toolbar">
        {items.length > 0 ? (
          <WorkFilters
            label="Filter improvements"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All", count: items.length },
              { value: "active", label: "In progress", count: active.length },
              { value: "results", label: "Results", count: results.length },
            ]}
          />
        ) : (
          <p>Plans, pull requests, and measured outcomes</p>
        )}
        <button
          type="button"
          className="work-inline-action"
          disabled={loading || refreshing || demo}
          onClick={() => void refresh(undefined, true)}
          aria-busy={refreshing}
        >
          {refreshing ? (
            <Loader2 size={17} className="spinner" aria-hidden="true" />
          ) : (
            <RefreshCw size={17} aria-hidden="true" />
          )}
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      {error && (
        <div role="alert" className="work-feedback">
          <p>{error}</p>
          <button
            type="button"
            className="secondary"
            disabled={refreshing}
            onClick={() => void refresh(undefined, true)}
          >
            Try again
          </button>
        </div>
      )}
      {loading && <LibrarySkeleton kind="proposals" rows={4} />}
      {!loading && !error && !items.length && (
        <WorkEmpty
          icon="outcome"
          title="No improvements yet"
          description="Choose a project issue to prepare a plan and follow its progress."
          action={
            <button type="button" className="button" onClick={onOpenIssues}>
              Browse project issues
            </button>
          }
        />
      )}
      {items.length > 0 && !visible.length && (
        <WorkEmpty
          icon="outcome"
          title="No matching improvements"
          description="Choose All to see your current list."
          action={
            <button
              type="button"
              className="button"
              onClick={() => setFilter("all")}
            >
              Show all improvements
            </button>
          }
        />
      )}
      {visible.map((i) => (
        <Improvement
          key={`${i.id}:${i.version}`}
          item={i}
          call={call}
          readOnly={readOnly || demo}
          executionReady={executionReady}
          availableCredits={availableCredits}
          onOpenRuns={onOpenRuns}
          computeReservationCredits={computeReservationCredits}
          creditsPerSecond={creditsPerSecond}
          refresh={async () => {
            await refresh();
          }}
        />
      ))}
      {next && (
        <button
          type="button"
          className="secondary"
          disabled={refreshing}
          onClick={() => void refresh(next, true)}
        >
          More improvements
        </button>
      )}
      <ImprovementControls
        organizationId={organizationId}
        call={call}
        readOnly={readOnly}
        demo={demo}
      />
    </section>
  );
}
function Improvement({
  item: i,
  call,
  readOnly,
  executionReady,
  availableCredits,
  refresh,
  onOpenRuns,
  computeReservationCredits,
  creditsPerSecond,
}: {
  item: any;
  call: Call;
  readOnly: boolean;
  executionReady: boolean;
  availableCredits: number;
  onOpenRuns: () => void;
  computeReservationCredits: number;
  creditsPerSecond: number;
  refresh: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [credits, setCredits] = useState(20),
    [protectedApproval, setProtectedApproval] = useState(false);
  async function run(operation: string, args: any) {
    setBusy(true);
    try {
      const result = await call(operation, args);
      if (result !== undefined) await refresh();
    } finally {
      setBusy(false);
    }
  }
  const estimate = cloudExecutionEstimate(
    credits,
    computeReservationCredits,
    creditsPerSecond,
  );
  return (
    <article className="improvement-row">
      <div className="improvement-row-heading">
        <span className="improvement-project">{i.repository}</span>
        <WorkStatus
          value={i.stage}
          label={stages[i.stage] ?? "Needs attention"}
        />
      </div>
      <h2>{i.title}</h2>
      <p>{i.goal}</p>
      <div className="improvement-links">
        {i.issueUrl && (
          <a href={i.issueUrl} target="_blank" rel="noopener noreferrer">
            Issue
            <ArrowUpRight size={15} aria-hidden="true" />
          </a>
        )}
        {i.run?.prUrl && (
          <a href={i.run.prUrl} target="_blank" rel="noopener noreferrer">
            <GitPullRequest size={16} aria-hidden="true" />
            Pull request
            <ArrowUpRight size={15} aria-hidden="true" />
          </a>
        )}
      </div>
      {i.plan && (
        <details>
          <summary>Review the plan</summary>
          <p>{i.plan.scope}</p>
          <ol>
            {i.plan.steps.map((step: string, index: number) => (
              <li key={index}>{step}</li>
            ))}
          </ol>
          {i.plan.risks.map((risk: string, index: number) => (
            <p key={index}>{risk}</p>
          ))}
          {i.plan.unknowns.map((unknown: string, index: number) => (
            <p key={index}>{unknown}</p>
          ))}
          <p>{i.plan.rollout}</p>
          <p>{i.plan.rollback}</p>
        </details>
      )}
      {i.hasDraft && !i.run && i.current && (
        <form
          className="improvement-action"
          onSubmit={(e) => {
            e.preventDefault();
            void run("improvementExecute", {
              id: i.id,
              version: i.version,
              maxCredits: credits,
              approveProtected: protectedApproval,
            });
          }}
        >
          <label>
            Maximum spend <span>processing credits</span>
            <input
              type="number"
              min={2}
              max={10000}
              value={credits}
              onChange={(e) => setCredits(Number(e.target.value))}
              required
            />
          </label>
          {i.plan?.protected && (
            <details>
              <summary>Protected changes need your approval</summary>
              <label className="check">
                <input
                  type="checkbox"
                  checked={protectedApproval}
                  onChange={(e) => setProtectedApproval(e.target.checked)}
                />
                I approve this plan if it affects access, billing or other
                protected areas.
              </label>
            </details>
          )}
          <button
            className="primary"
            disabled={
              readOnly ||
              busy ||
              !executionReady ||
              credits > availableCredits ||
              !estimate ||
              !Number.isSafeInteger(credits) ||
              credits < 2
            }
          >
            <Sparkles size={17} aria-hidden="true" />
            Let AI build it
            {busy && (
              <Loader2 size={16} className="spinner" aria-hidden="true" />
            )}
          </button>
          {!estimate ? (
            <p>
              This maximum cannot cover the minimum coding session. Increase it
              or review Usage.
            </p>
          ) : !executionReady ? (
            <p>Cloud coding needs verified setup before it can start.</p>
          ) : credits > availableCredits ? (
            <p>
              Your available allowance cannot cover this maximum. Review Usage.
            </p>
          ) : (
            <p>
              AI writes and tests the change. Your maximum spend stays fixed.
            </p>
          )}
        </form>
      )}
      {i.plan?.routineCategory &&
        i.category === "unreviewed" &&
        i.current &&
        !i.run && (
          <button
            type="button"
            className="secondary"
            disabled={readOnly || busy}
            onClick={() =>
              void run("improvementCategorize", {
                id: i.id,
                version: i.version,
                category: i.plan.routineCategory,
              })
            }
          >
            Mark this reviewed plan as routine
          </button>
        )}
      {i.run?.state === "awaiting_review" && (
        <button type="button" className="secondary" onClick={onOpenRuns}>
          Review the change
        </button>
      )}
      {i.run?.prUrl && (
        <button
          type="button"
          className="secondary"
          disabled={readOnly || busy}
          onClick={() => void run("improvementRefresh", { id: i.run.id })}
        >
          Refresh progress
        </button>
      )}
      {i.run?.mergedAt && (
        <p>
          {i.run.deployment
            ? "Deployment confirmed by the provider."
            : "Merged. Production deployment has not been confirmed."}
        </p>
      )}
      {i.run?.mergedAt && (
        <Outcome item={i} call={call} readOnly={readOnly} refresh={refresh} />
      )}
      {i.outcome && (
        <div className="improvement-outcome">
          <Check size={16} aria-hidden="true" />
          <p>
            {
              (
                {
                  positive: "Helped",
                  negative: "Made things worse",
                  inconclusive: "No clear difference",
                  not_measured: "Not measured yet",
                } as Record<string, string>
              )[i.outcome.verdict]
            }{" "}
            ·{" "}
            {i.outcome.method === "judgment"
              ? "Your judgment"
              : i.outcome.method === "both"
                ? "Your judgment and reported data"
                : "Reported data"}
            <br />
            {i.outcome.note}
          </p>
        </div>
      )}
    </article>
  );
}
function Outcome({
  item: i,
  call,
  readOnly,
  refresh,
}: {
  item: any;
  call: Call;
  readOnly: boolean;
  refresh: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [method, setMethod] = useState("judgment");
  return (
    <div className="improvement-feedback">
      <button
        type="button"
        className="secondary"
        onClick={() => setOpen(!open)}
      >
        <MessageSquare size={17} aria-hidden="true" />
        {i.outcome ? "Update your feedback" : "Did this help?"}
      </button>
      {open && (
        <form
          className="form-grid"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            setBusy(true);
            try {
              const result = await call("improvementOutcome", {
                id: i.id,
                version: i.version,
                runId: i.run.id,
                verdict: String(f.get("verdict")),
                method,
                note: String(f.get("note")),
                ...(!i.run.deployment
                  ? {
                      deployedVersion: String(f.get("deployedVersion") ?? ""),
                      deployedUrl: String(f.get("deployedUrl") ?? ""),
                    }
                  : {}),
                ...(method !== "judgment"
                  ? {
                      measurement: {
                        label: String(f.get("metric")),
                        unit: String(f.get("unit")),
                        before: Number(f.get("before")),
                        after: Number(f.get("after")),
                        baselineStart: Date.parse(
                          String(f.get("baselineStart")),
                        ),
                        baselineEnd: Date.parse(String(f.get("baselineEnd"))),
                        observationStart: Date.parse(
                          String(f.get("observationStart")),
                        ),
                        observationEnd: Date.parse(
                          String(f.get("observationEnd")),
                        ),
                        baselineSamples: Number(f.get("baselineSamples")),
                        observationSamples: Number(f.get("observationSamples")),
                        limitations: String(f.get("limitations")),
                      },
                    }
                  : {}),
              });
              if (result !== undefined) await refresh();
            } finally {
              setBusy(false);
            }
          }}
        >
          <label htmlFor={`result-${i.id}`}>
            Your result
            <ChoiceSelect
              id={`result-${i.id}`}
              aria-label="Your result"
              name="verdict"
              defaultValue={i.outcome?.verdict ?? "not_measured"}
            >
              <option value="positive">Helped</option>
              <option value="negative">Made things worse</option>
              <option value="inconclusive">No clear difference</option>
              <option value="not_measured">Not enough evidence yet</option>
            </ChoiceSelect>
          </label>
          <label htmlFor={`result-method-${i.id}`}>
            Based on
            <ChoiceSelect
              id={`result-method-${i.id}`}
              aria-label="Based on"
              value={method}
              onValueChange={setMethod}
            >
              <option value="judgment">My judgment</option>
              <option value="reported_data">Reported data</option>
              <option value="both">Both</option>
            </ChoiceSelect>
          </label>
          <label>
            What did you notice?
            <textarea
              name="note"
              rows={3}
              maxLength={2000}
              required
              defaultValue={i.outcome?.note ?? ""}
            />
          </label>
          {!i.run.deployment && (
            <details>
              <summary>Confirm the release you used</summary>
              <label>
                Version or release name
                <input name="deployedVersion" maxLength={120} />
              </label>
              <label>
                Public page
                <input
                  name="deployedUrl"
                  type="url"
                  placeholder="https://example.com"
                  maxLength={500}
                />
              </label>
              <p>
                This is your reported release, separate from a provider-verified
                deployment.
              </p>
            </details>
          )}
          {method !== "judgment" && (
            <fieldset className="measurement-fields">
              <legend>Compare completed periods</legend>
              {[
                ["metric", "Measure", "text"],
                ["unit", "Unit", "text"],
                ["before", "Before", "number"],
                ["after", "After", "number"],
                ["baselineStart", "Baseline starts", "date"],
                ["baselineEnd", "Baseline ends", "date"],
                ["observationStart", "Observation starts", "date"],
                ["observationEnd", "Observation ends", "date"],
                ["baselineSamples", "Baseline sample count", "number"],
                ["observationSamples", "Observation sample count", "number"],
              ].map(([name, label, type]) => (
                <label key={name}>
                  {label}
                  <input
                    name={name}
                    type={type}
                    required
                    step={type === "number" ? "any" : undefined}
                    min={name.endsWith("Samples") ? 1 : undefined}
                    maxLength={type === "text" ? 120 : undefined}
                  />
                </label>
              ))}
              <label>
                Limitations
                <textarea
                  name="limitations"
                  rows={2}
                  maxLength={1000}
                  required
                />
              </label>
              <p>
                These numbers are reported evidence. A comparison alone does not
                prove what caused a change.
              </p>
            </fieldset>
          )}
          <button className="primary" disabled={readOnly || busy}>
            Save feedback
          </button>
        </form>
      )}
    </div>
  );
}
