"use client";
import { useEffect, useState } from "react";
import { CompanionSetup } from "./companion-setup";
import type {
  SetupSnapshot,
  SetupAction,
} from "../../../packages/onboarding/companion-setup";
import type { pairingConfiguration } from "../../../packages/onboarding/pairing-configuration";
type Progress = {
  version: number;
  snapshot: SetupSnapshot;
  pairingConfiguration?: ReturnType<typeof pairingConfiguration>;
  localPreflight?: {
    readyToConnect?: boolean;
    passed: boolean;
    reportedAt: number;
    provenance: "user_provided";
    processingReady: "unverified";
  } | null;
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
  const [loaded, setLoaded] = useState<{
    organizationId: string;
    value: Progress | null;
  } | null>(null);
  const progress =
    loaded?.organizationId === organizationId ? loaded.value : null;
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
    setLoaded({ organizationId, value: result });
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
        if (active) setLoaded({ organizationId, value });
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
    if (action === "source") return onSave();
    if (action === "sample") return onNavigate("library");
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
      preflight: 'node scripts/companion.mjs preflight "ABSOLUTE_CONFIG_PATH"',
      account: 'node scripts/companion.mjs run "ABSOLUTE_CONFIG_PATH"',
      worker: 'node scripts/companion.mjs run "ABSOLUTE_CONFIG_PATH"',
      pause: 'node scripts/companion.mjs pause "ABSOLUTE_CONFIG_PATH"',
      resume:
        'node scripts/companion.mjs resume "ABSOLUTE_CONFIG_PATH" --allow-approved-work',
      startup_enable:
        'node scripts/companion.mjs startup-enable "ABSOLUTE_CONFIG_PATH" --start-at-sign-in',
      startup_disable:
        'node scripts/companion.mjs startup-disable "ABSOLUTE_CONFIG_PATH"',
    };
    setInstruction(
      commands[action] ?? "Review the companion setup guide on your computer.",
    );
  }
  return (
    <details className="panel" open={!progress?.snapshot.sampleCited}>
      <summary>Continue setup</summary>
      <p>
        Use the browser to save, review and approve work. The own-plan route
        needs your eligible account and an awake paired Windows computer with
        its supported isolated runtime. Your subscription allowance does not
        cover every preparation, storage or platform cost. Review each task's
        route and maximum before approval.
      </p>
      <a
        href="/help/connect-your-computer"
        target="_blank"
        rel="noopener noreferrer"
      >
        Set up your computer step by step
      </a>
      {progress && (
        <p>
          Saved route:{" "}
          {progress.snapshot.route === "local"
            ? "Your paired computer"
            : progress.snapshot.route === "cloud"
              ? "Managed cloud"
              : progress.snapshot.route === "save_only"
                ? "Save for later"
                : "Not selected"}
          . Own-plan account eligibility:{" "}
          {progress.snapshot.localEligible ? "available" : "unavailable"}.
          Managed processing:{" "}
          {progress.snapshot.cloudAvailable ? "available" : "unavailable"}.
          Availability still requires the task's current checks and approval.
        </p>
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
          <legend>Choose your processing route</legend>
          <p>
            Saving alone starts no inference. Every analysis still requires its
            own current approval and maximum. A saved preference cannot enable
            an unavailable route.
          </p>
          {(["save_only", "local", "cloud"] as const).map((route) => (
            <button
              type="button"
              className="secondary"
              key={route}
              aria-pressed={progress.snapshot.route === route}
              onClick={async () => {
                if (await save({ route })) setRouteReview(false);
              }}
            >
              {route === "save_only"
                ? "Save for later"
                : route === "local"
                  ? "Use my paired computer"
                  : "Review managed cloud"}
            </button>
          ))}
        </fieldset>
      )}
      {instruction && (
        <div>
          <output>
            Run this on your paired computer. This page has not started a worker
            or changed its local state. Run only one companion. The connection
            step offers official consent if needed; a saved login is not proof
            of a working model request.
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
            href="/help/connect-your-computer"
            target="_blank"
            rel="noopener noreferrer"
          >
            Computer setup and recovery
          </a>
        </div>
      )}
      {progress?.snapshot.route === "local" && (
        <section className="form-grid" aria-label="New computer configuration">
          <h3>Prepare a new computer</h3>
          <p>
            Download this workspace's unpaired configuration and keep it in a
            private local file. It contains setup metadata, no login token or
            device credential. Choose your own computer name and the required
            pinned media/transcription settings using the guide. Pairing creates
            the protected device credential separately.
          </p>
          <button
            type="button"
            className="secondary"
            disabled={disabled || saving || !progress.pairingConfiguration}
            onClick={() => {
              const configuration = progress.pairingConfiguration;
              if (!configuration || disabled || saving) return;
              const {
                server,
                workspaceId,
                protocolVersion,
                credentialVaultAdapter,
                deviceName,
              } = configuration;
              const blob = new Blob(
                [
                  JSON.stringify(
                    {
                      server,
                      workspaceId,
                      protocolVersion,
                      credentialVaultAdapter,
                      deviceName,
                    },
                    null,
                    2,
                  ) + "\n",
                ],
                { type: "application/json" },
              );
              const url = URL.createObjectURL(blob);
              const link = document.createElement("a");
              link.href = url;
              link.download = "vibescroll-unpaired-config.json";
              link.click();
              URL.revokeObjectURL(url);
            }}
          >
            Download new computer configuration
          </button>
          <p>
            Save with a new filename. Never overwrite an existing paired
            configuration or copy it to a different computer. This download
            installs nothing, pairs nothing and starts no work.
          </p>
          {!progress.pairingConfiguration && (
            <output>
              Configuration is unavailable because the deployment's matching
              setup origins could not be verified. Keep your source saved and
              follow the deployment-configuration repair in the guide. Do not
              guess the backend address.
            </output>
          )}
          <a
            href="/help/connect-your-computer"
            target="_blank"
            rel="noopener noreferrer"
          >
            Configuration and runtime instructions
          </a>
        </section>
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
          {progress.localPreflight && (
            <p>
              Recorded user-provided report:{" "}
              {progress.localPreflight.passed
                ? "full local prerequisite checks passed"
                : progress.localPreflight.readyToConnect
                  ? "local prerequisites permit official connection; full checks remain incomplete"
                  : "local prerequisites need attention"}
              . This acknowledgement expires after 24 hours. Processing and
              actual account/model access remain unverified by this report.
            </p>
          )}
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
