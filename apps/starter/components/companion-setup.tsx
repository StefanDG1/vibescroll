"use client";
import { useId, useState } from "react";
import { Check, Circle, Laptop, ShieldCheck } from "lucide-react";
import {
  companionSetupSteps,
  type SetupAction,
  type SetupSnapshot,
} from "../../../packages/onboarding/companion-setup";
import type { CompanionReport } from "../../../packages/runner/companion-preflight.mjs";
import {
  type JourneyAction,
  type ProjectBuilderJourney,
  type SkillRecommendation,
} from "../../../packages/onboarding/project-builder-journey";
import { ProjectBuilderGuide } from "./project-builder-guide";
export { ProjectBuilderGuide } from "./project-builder-guide";

export type CompanionSetupProps = {
  snapshot: SetupSnapshot;
  diagnostics?: CompanionReport;
  onAction: (action: SetupAction) => Promise<void> | void;
  disabled?: boolean;
  journey?: ProjectBuilderJourney | null;
  onJourneyAction?: (action: JourneyAction) => Promise<void>;
  onJourneyNavigate?: (view: string) => void;
  onJourneySave?: () => void;
  skillRecommendations?: readonly SkillRecommendation[];
  skillRecommendationStatus?: "ready" | "unavailable" | "needs_context";
  skillRecommendationExplanation?: string;
  followingAvailable?: boolean;
};
export function CompanionSetup(props: CompanionSetupProps) {
  if (
    props.journey &&
    props.onJourneyAction &&
    props.onJourneyNavigate &&
    props.onJourneySave
  ) {
    return (
      <>
        <ProjectBuilderGuide
          journey={props.journey}
          onAction={props.onJourneyAction}
          onNavigate={props.onJourneyNavigate}
          onSave={props.onJourneySave}
          recommendations={props.skillRecommendations ?? []}
          recommendationStatus={
            props.skillRecommendationStatus ?? "unavailable"
          }
          recommendationExplanation={props.skillRecommendationExplanation}
          followingAvailable={props.followingAvailable ?? false}
          disabled={props.disabled}
          snapshot={props.snapshot}
        />
        <details>
          <summary>Computer readiness and first result</summary>
          <CompanionReadiness {...props} />
        </details>
      </>
    );
  }
  return <CompanionReadiness {...props} />;
}
// The parent supplies current saved progress and verified observations. This
// component never turns a locally selected step into a completed connection.
function CompanionReadiness({
  snapshot,
  diagnostics,
  onAction,
  disabled = false,
}: CompanionSetupProps) {
  const headingId = useId();
  const [guided, setGuided] = useState(false);
  const [busy, setBusy] = useState<SetupAction | null>(null);
  const [error, setError] = useState("");
  const [startupConsent, setStartupConsent] = useState(false);
  const steps = companionSetupSteps(snapshot, guided);
  const next = steps.find((step) => !step.complete || step.blocked);
  async function act(action: SetupAction) {
    setBusy(action);
    setError("");
    try {
      await onAction(action);
    } catch {
      setError(
        "That step could not be completed. Check your connection and try again.",
      );
    } finally {
      setBusy(null);
    }
  }
  return (
    <section
      className="panel form-grid"
      aria-labelledby={headingId}
      aria-busy={Boolean(busy)}
    >
      <h2 id={headingId}>
        <Laptop size={22} aria-hidden="true" /> Your first useful result
      </h2>
      <p>
        Pick up where you left off. GitHub, imports and assistant access are
        optional.
      </p>
      <label className="row wrap">
        <input
          type="checkbox"
          checked={guided}
          onChange={(event) => setGuided(event.target.checked)}
        />{" "}
        Show the full guided setup
      </label>
      {next ? (
        <div className="form-grid">
          <h3>{next.title}</h3>
          <p>{next.detail}</p>
          {next.blocked && (
            <output>
              This route is unavailable. Review your route or repair the
              connection before processing.
            </output>
          )}
          <div className="actions">
            <button
              type="button"
              className="primary"
              disabled={disabled || Boolean(busy)}
              onClick={() => void act(next.blocked ? "route" : next.action)}
            >
              {busy
                ? "Opening…"
                : next.blocked
                  ? "Review processing route"
                  : next.title}
            </button>
            <a href={next.help} target="_blank" rel="noopener noreferrer">
              Setup help
            </a>
          </div>
        </div>
      ) : (
        <output>
          <ShieldCheck size={20} aria-hidden="true" />{" "}
          {snapshot.route === "save_only"
            ? "Your library is ready for saved sources. Choose processing when you want to continue."
            : "Your first result is ready to review. Keep its evidence and coverage in view."}
        </output>
      )}
      <details>
        <summary>Setup progress</summary>
        <ol className="form-grid">
          {steps.map((step) => (
            <li key={step.action}>
              {step.complete && !step.blocked ? (
                <Check size={16} aria-hidden="true" />
              ) : (
                <Circle size={16} aria-hidden="true" />
              )}{" "}
              {step.title}:{" "}
              {step.blocked
                ? "needs attention"
                : step.complete
                  ? "complete"
                  : "to do"}
            </li>
          ))}
        </ol>
      </details>
      {snapshot.route === "local" && (
        <details>
          <summary>Computer controls and diagnostics</summary>
          <div className="form-grid">
            <p>
              Pairing: {snapshot.paired ? "paired" : "not paired"}. Account:{" "}
              {snapshot.accountConnected ? "connected" : "needs connection"}.
              Companion:{" "}
              {snapshot.paused
                ? "paused"
                : snapshot.workerAvailable
                  ? "available"
                  : "offline or not verified"}
              .
            </p>
            <p>
              Pause stops this companion through its normal cleanup. Unpairing
              and revoking assistant access are separate actions in Connections.
              Your computer cannot be woken remotely.
            </p>
            <div className="actions">
              <button
                type="button"
                className="secondary"
                disabled={disabled || Boolean(busy)}
                onClick={() => void act(snapshot.paused ? "resume" : "pause")}
              >
                {snapshot.paused ? "Resume companion" : "Pause companion"}
              </button>
              <button
                type="button"
                className="secondary"
                disabled={disabled || Boolean(busy)}
                onClick={() => void act("preflight")}
              >
                Check local prerequisites
              </button>
            </div>
            {snapshot.startupEnabled ? (
              <button
                type="button"
                className="secondary"
                disabled={disabled || Boolean(busy)}
                onClick={() => void act("startup_disable")}
              >
                Turn off startup at sign-in
              </button>
            ) : (
              <>
                <label className="row wrap">
                  <input
                    type="checkbox"
                    checked={startupConsent}
                    onChange={(event) =>
                      setStartupConsent(event.target.checked)
                    }
                  />{" "}
                  Start my companion at Windows sign-in for already approved
                  work.
                </label>
                <button
                  type="button"
                  className="secondary"
                  disabled={disabled || Boolean(busy) || !startupConsent}
                  onClick={() => void act("startup_enable")}
                >
                  Set up startup at sign-in
                </button>
              </>
            )}
            <p>
              These controls need the local companion on your computer. A phone
              can review setup and server permissions; it cannot silently launch
              or install software.
            </p>
            {diagnostics && (
              <>
                <h3>Local prerequisite report</h3>
                <p>
                  {diagnostics.readyForLocalStart
                    ? "Local prerequisites passed. Account access and a cited sample still need verification."
                    : "Some local prerequisites need attention."}
                </p>
                <ul>
                  {diagnostics.checks.map((check) => (
                    <li key={check.id}>
                      {check.id.replaceAll("_", " ")}: {check.status}
                      {check.repair ? `. ${check.repair}` : ""}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    const blob = new Blob(
                      [JSON.stringify(diagnostics, null, 2)],
                      { type: "application/json" },
                    );
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement("a");
                    link.href = url;
                    link.download = "vibescroll-local-prerequisites.json";
                    link.click();
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                  }}
                >
                  Download diagnostic summary
                </button>
              </>
            )}
          </div>
        </details>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
