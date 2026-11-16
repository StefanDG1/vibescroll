"use client";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Pause, Settings2 } from "lucide-react";
import { ChoiceSelect } from "./choice-select";
type Call = (operation: string, args: any) => Promise<any>;
export function ImprovementControls({
  organizationId,
  call,
  readOnly,
  demo,
}: {
  organizationId: string;
  call: Call;
  readOnly: boolean;
  demo: boolean;
}) {
  const [data, setData] = useState<any>(),
    [preferences, setPreferences] = useState<any>(),
    [open, setOpen] = useState(false),
    [error, setError] = useState("");
  const generation = useRef({ value: 0 });
  const invalidate = useEffectEvent(() => {
    generation.current.value++;
  });
  async function load() {
    if (demo) return;
    const g = ++generation.current.value;
    try {
      const results = await Promise.all(
        ["improvementPolicies", "improvementPreferences"].map(
          async (operation) => {
            const r = await fetch("/api/product", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ operation, args: { organizationId } }),
            });
            if (
              !r.ok ||
              r.redirected ||
              !r.headers.get("content-type")?.includes("application/json")
            )
              throw Error(
                "Settings are unavailable. Check your connection or sign in again.",
              );
            return (await r.json()).result;
          },
        ),
      );
      if (g !== generation.current.value) return;
      setData(results[0]);
      setPreferences(results[1]);
      setError("");
    } catch (e) {
      if (g !== generation.current.value) return;
      setData(undefined);
      setPreferences(undefined);
      setError(e instanceof Error ? e.message : "Settings are unavailable.");
    }
  }
  const loadFromEffect = useEffectEvent(() => load());
  useEffect(() => {
    if (!open || demo) return;
    let active = true;
    const timer = setTimeout(() => {
      if (active) void loadFromEffect();
    }, 0);
    return () => {
      active = false;
      invalidate();
      clearTimeout(timer);
    };
  }, [organizationId, demo, open]);
  return (
    <details
      className="improvement-settings"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        <Settings2 size={17} aria-hidden="true" />
        Preferences and continuous operation
      </summary>
      {error && <p role="alert">{error}</p>}
      {open && !demo && !preferences && !error && (
        <output>Loading settings…</output>
      )}
      {preferences && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const result = await call("improvementPreferencesSave", {
              organizationId,
              version: preferences.version,
              note: String(new FormData(e.currentTarget).get("preferences")),
            });
            if (result !== undefined) await load();
          }}
        >
          <label>
            What should future ideas focus on?
            <textarea
              name="preferences"
              rows={3}
              maxLength={3000}
              defaultValue={preferences.note}
              placeholder="For example: make the parent journey clearer; avoid features that add setup."
            />
          </label>
          <p>
            Private to this workspace. Updated preferences require ideas to be
            reviewed again.
          </p>
          <button
            className="secondary"
            disabled={readOnly || !data?.canConfigure}
          >
            Save preferences
          </button>
        </form>
      )}
      {data?.items.map((item: any) => (
        <Policy
          key={`${item.repositoryId}:${item.policy?.version ?? 0}`}
          item={item}
          call={call}
          readOnly={readOnly || !data.canConfigure}
          verified={data.verified}
          reload={load}
        />
      ))}
      {demo && (
        <p>
          Continuous operation is configured separately for each real project.
        </p>
      )}
    </details>
  );
}
function Policy({
  item,
  call,
  readOnly,
  verified,
  reload,
}: {
  item: any;
  call: Call;
  readOnly: boolean;
  verified: boolean;
  reload: () => Promise<void>;
}) {
  const p = item.policy,
    [mode, setMode] = useState(p?.mode ?? "review"),
    [busy, setBusy] = useState(false);
  return (
    <details className="improvement-policy">
      <summary>
        {item.repository}
        <span>
          {p?.paused !== false ? "Review each change" : "Continuous operation"}
        </span>
      </summary>
      <form
        className="form-grid"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setBusy(true);
          try {
            const result = await call("improvementPolicySave", {
              repositoryId: item.repositoryId,
              version: p?.version ?? 0,
              mode,
              monthlyCredits: Number(f.get("monthly")),
              perRunCredits: Number(f.get("maximum")),
              categories: f.getAll("categories"),
              requiredChecks: String(f.get("checks"))
                .split("\n")
                .map((s) => s.trim())
                .filter(Boolean),
              merge: f.get("merge") === "on",
            });
            if (result !== undefined) await reload();
          } finally {
            setBusy(false);
          }
        }}
      >
        <label htmlFor={`policy-mode-${item.repositoryId}`}>
          How should AI work?
          <ChoiceSelect
            id={`policy-mode-${item.repositoryId}`}
            aria-label="How should AI work?"
            value={mode}
            onValueChange={setMode}
          >
            <option value="review">Review each change</option>
            <option value="routine" disabled={!verified}>
              Continuous routine changes
            </option>
          </ChoiceSelect>
        </label>
        {!verified && (
          <p>
            Continuous activation is waiting for a verified real cycle. You can
            prepare your limits now.
          </p>
        )}
        <div className="improvement-limits">
          <label>
            Monthly ceiling
            <input
              name="monthly"
              type="number"
              min={1}
              max={10000}
              defaultValue={p?.monthlyCredits ?? 100}
              required
            />
          </label>
          <label>
            Maximum per coding run
            <input
              name="maximum"
              type="number"
              min={2}
              max={10000}
              defaultValue={p?.perRunCredits ?? 40}
              required
            />
          </label>
        </div>
        <p>
          Processing credits. Each independent review reserves up to 10 more.
          Your current allowance and provider caps still apply.
        </p>
        <fieldset>
          <legend>Permitted routine changes</legend>
          {[
            ["interface", "Interface"],
            ["documentation", "Documentation"],
          ].map(([value, label]) => (
            <label className="check" key={value}>
              <input
                type="checkbox"
                name="categories"
                value={value}
                defaultChecked={(p?.categories ?? ["interface"]).includes(
                  value,
                )}
              />
              {label}
            </label>
          ))}
        </fieldset>
        <label>
          Required GitHub checks
          <textarea
            name="checks"
            rows={2}
            maxLength={1500}
            defaultValue={p?.requiredChecks.join("\n") ?? "verify"}
            required
          />
        </label>
        <label className="check">
          <input
            name="merge"
            type="checkbox"
            defaultChecked={p?.merge ?? false}
          />
          Allow merging after independent review, all checks and protected
          branch rules pass
        </label>
        <p>
          Only reviewed issues and plans you mark as routine enter this queue.
          Protected work stops for individual approval. The grant expires after
          30 days and needs renewal at a new month.
        </p>
        {p && (
          <p>
            {p.used} credits committed from {p.monthlyCredits}.{" "}
            {p.status === "active"
              ? "Ready for the next approved change."
              : p.status === "waiting_for_checks"
                ? "Waiting for GitHub checks or reviews."
                : p.status === "paused"
                  ? "Paused."
                  : "Review this project's latest run before continuing."}
          </p>
        )}
        <div className="actions">
          <button
            className="secondary"
            disabled={readOnly || busy || !item.confirmed}
          >
            Save limits
          </button>
          {p && !p.paused && (
            <button
              type="button"
              className="secondary"
              disabled={readOnly || busy}
              onClick={async () => {
                await call("improvementPolicyPause", {
                  repositoryId: item.repositoryId,
                });
                await reload();
              }}
            >
              <Pause size={16} aria-hidden="true" />
              Pause
            </button>
          )}
        </div>
      </form>
    </details>
  );
}
