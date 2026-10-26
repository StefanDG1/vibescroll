"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { CompanionSetup } from "./companion-setup";
import { TaskRuntimePicker } from "./task-runtime-picker";
import type {
  SetupSnapshot,
  SetupAction,
} from "../../../packages/onboarding/companion-setup";
type Progress = {
  version: number;
  snapshot: SetupSnapshot;
  workCloud?: { available: boolean; configured: boolean } | null;
};
export function SetupJourney({
  organizationId,
  call,
  onNavigate,
  onSave,
  disabled = false,
}: {
  organizationId: string;
  call: (operation: string, args: any) => Promise<any>;
  onNavigate: (view: string) => void;
  onSave: () => void;
  disabled?: boolean;
}) {
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState("");
  const [routeReview, setRouteReview] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [report, setReport] = useState("");
  const [saving, setSaving] = useState(false);
  async function reload() {
    const result = await call("setupJourney", { organizationId });
    if (!result)
      throw Error(
        "Setup progress is unavailable. Check your current workspace access.",
      );
    setProgress(result);
  }
  async function save(changes: Record<string, unknown>) {
    if (!progress || disabled || saving) return false;
    setSaving(true);
    setError("");
    try {
      const result = await call("saveSetupJourney", {
        organizationId,
        expectedVersion: progress.version,
        ...changes,
      });
      if (!result)
        throw Error(
          "The setup change was not confirmed. Reload current progress before retrying.",
        );
      await reload();
      return true;
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Setup could not be saved. Review current progress.",
      );
      return false;
    } finally {
      setSaving(false);
    }
  }
  useEffect(() => {
    let active = true;
    call("setupJourney", { organizationId })
      .then((value) => {
        if (active) setProgress(value);
      })
      .catch(() => {
        if (active) setError("Setup progress could not be loaded. Try again.");
      });
    return () => {
      active = false;
    };
    // Re-entering Home remounts this view. No background setup polling.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);
  async function act(action: SetupAction) {
    setInstruction("");
    if (action === "purpose") {
      document
        .getElementById("library-purpose")
        ?.scrollIntoView({ block: "start" });
      return;
    }
    if (action === "source" || action === "sample") return onSave();
    if (action === "route") return setRouteReview(true);
    if (action === "assistant") return onNavigate("connections");
    if (action === "project") return onNavigate("projects");
    if (action === "pair") return onNavigate("runners");
    if (action === "import" || action === "preferences") {
      if (action === "import") onSave();
      else onNavigate("menu");
      return;
    }
    const commands: Partial<Record<SetupAction, string>> = {
      preflight: "node scripts/companion.mjs preflight ABSOLUTE_CONFIG_PATH",
      account:
        "Complete the documented official account connection on your paired computer, then start the companion.",
      worker: "node scripts/companion.mjs run ABSOLUTE_CONFIG_PATH",
      pause: "node scripts/companion.mjs pause ABSOLUTE_CONFIG_PATH",
      resume:
        "node scripts/companion.mjs resume ABSOLUTE_CONFIG_PATH --allow-approved-work",
      startup_enable:
        "node scripts/companion.mjs startup-enable ABSOLUTE_CONFIG_PATH --start-at-sign-in",
      startup_disable:
        "node scripts/companion.mjs startup-disable ABSOLUTE_CONFIG_PATH",
    };
    setInstruction(
      commands[action] ?? "Review the companion setup guide on your computer.",
    );
  }
  return (
    <details className="panel" open={!progress?.snapshot.sampleCited}>
      <summary>Continue setup</summary>
      <p>
        Save and review posts in your browser. Choose where analysis runs below.
        Each option shows its setup and costs. Saving a preference starts no
        work.
      </p>
      <Link href="/help/processing-and-recovery" prefetch={false}>
        Help choosing where tasks run
      </Link>
      {progress && (
        <>
          <p>
            Saved route:{" "}
            {progress.snapshot.route === "local"
              ? "Local machine"
              : progress.snapshot.route === "cloud"
                ? "VibeScroll's servers"
                : progress.snapshot.route === "work_cloud"
                  ? "My own Cloud Work"
                  : progress.snapshot.route === "save_only"
                    ? "Save for later"
                    : "Not selected"}
            . Review task limits before starting analysis.
          </p>
          <TaskRuntimePicker
            organizationId={organizationId}
            value={
              progress.snapshot.route === "save_only"
                ? undefined
                : progress.snapshot.route
            }
            onChange={(route) => {
              void save({ route });
            }}
            serverAvailable={progress.snapshot.cloudAvailable}
            workCloudAvailable={progress.workCloud?.available}
            workCloudConfigured={progress.workCloud?.configured}
            localAvailable={progress.snapshot.localEligible}
            localConfigured={progress.snapshot.paired}
            localStatus={
              !progress.snapshot.paired
                ? "setup_required"
                : !progress.snapshot.workerAvailable
                  ? "offline"
                  : !progress.snapshot.accountConnected ||
                      !progress.snapshot.prerequisitesChecked
                    ? "setup_required"
                    : "check_before_running"
            }
            disabled={disabled || saving}
          />
        </>
      )}
      {progress && (
        <CompanionSetup
          snapshot={progress.snapshot}
          onAction={act}
          disabled={disabled || saving}
        />
      )}
      {routeReview && progress && (
        <fieldset disabled={disabled || saving} className="form-grid">
          <legend>Save without analysis</legend>
          <p>Choose a task location above, or keep links saved for later.</p>
          <button
            type="button"
            className="secondary"
            aria-pressed={progress.snapshot.route === "save_only"}
            onClick={async () => {
              if (await save({ route: "save_only" })) setRouteReview(false);
            }}
          >
            Save for later
          </button>
        </fieldset>
      )}
      {instruction && (
        <div>
          <output>
            Run this on your paired computer. This page has not changed its
            local state.
          </output>
          <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
            {instruction}
          </pre>
          <p>
            Replace ABSOLUTE_CONFIG_PATH with the protected configuration file
            on that computer. Keep the real path and credentials out of this
            page.
          </p>
          <a
            href="/help/processing-and-recovery"
            target="_blank"
            rel="noopener noreferrer"
          >
            Companion and recovery help
          </a>
        </div>
      )}
      {progress?.snapshot.route === "local" && (
        <form
          className="form-grid"
          onSubmit={async (event) => {
            event.preventDefault();
            setError("");
            try {
              if (
                !report.trim() ||
                new TextEncoder().encode(report).length > 16384
              )
                throw Error(
                  "Paste the metadata-only prerequisite report within 16 KiB.",
                );
              const parsed: unknown = JSON.parse(report);
              if (await save({ preflightReport: parsed })) setReport("");
            } catch {
              setError(
                "The local report is invalid. Paste only the companion's metadata-only prerequisite JSON, without configuration, credentials or paths.",
              );
            }
          }}
        >
          <label>
            User-provided local prerequisite report (JSON)
            <textarea
              value={report}
              onChange={(event) => setReport(event.target.value)}
              maxLength={16384}
              disabled={disabled || saving}
            />
          </label>
          <p>
            This records your local report, not independent installation
            verification. Model access and a cited sample remain unverified; it
            grants no startup, processing or account permission. Do not paste
            the private configuration or raw command logs.
          </p>
          <button type="submit" disabled={disabled || saving || !report.trim()}>
            Save local prerequisite report
          </button>
        </form>
      )}
      {progress && (
        <details>
          <summary>Optional review acknowledgements</summary>
          <p>
            After reviewing an import preview or your Account preferences,
            record that review. This grants no processing or startup permission.
          </p>
          {(["importReviewed", "preferencesReviewed"] as const).map((field) => (
            <button
              type="button"
              className="secondary"
              key={field}
              disabled={disabled || saving || progress.snapshot[field]}
              onClick={async () => {
                await save({ [field]: true });
              }}
            >
              {field === "importReviewed"
                ? "I reviewed saved-link import"
                : "I reviewed my preferences"}
            </button>
          ))}
        </details>
      )}
      {error && <p role="alert">{error}</p>}
      <button
        type="button"
        className="secondary"
        onClick={() =>
          void reload()
            .then(() => setError(""))
            .catch(() => setError("Setup progress is unavailable."))
        }
      >
        Check current setup
      </button>
    </details>
  );
}
