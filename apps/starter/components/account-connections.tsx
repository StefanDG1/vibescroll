import Link from "next/link";
import { GitBranch } from "lucide-react";
import { Button } from "@companynerve/ui";
import { AssistantConnections } from "./assistant-connections";
import { AccountSection, AccountStatus } from "./account-layout";

export function AccountConnections({
  organizationId,
  githubConnected,
  providerStatus,
  reviewedModels,
  canLoad,
  readOnly,
  role,
  canViewLaunchChecks,
  demo,
  busy,
  call,
  openProjects,
}: {
  organizationId: string;
  githubConnected: boolean;
  providerStatus?: string;
  reviewedModels: number;
  canLoad: boolean;
  readOnly: boolean;
  role?: string;
  canViewLaunchChecks: boolean;
  demo: boolean;
  busy: boolean;
  call: (operation: string, args: unknown) => Promise<unknown>;
  openProjects: () => void;
}) {
  const writable = canLoad && !readOnly && !demo;
  const canManageCredential = writable && role === "owner";
  const canLinkGithub = writable && (role === "owner" || role === "admin");
  const hasCredential = Boolean(
    providerStatus && providerStatus !== "disconnected",
  );
  return (
    <div className="account-content">
      <div className="account-grid account-grid-start account-connection-top">
        <AssistantConnections
          organizationId={organizationId}
          call={call}
          readOnly={readOnly}
          demo={demo}
          canLoad={canLoad}
        />
        <div className="account-content">
          <AccountSection
            title="GitHub"
            icon={GitBranch}
            description="Choose the repositories VibeScroll can use for project context."
            trailing={
              githubConnected && (
                <AccountStatus tone="positive">Connected</AccountStatus>
              )
            }
          >
            <div className="account-actions">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={openProjects}
              >
                Manage repositories
              </Button>
              {githubConnected
                ? canManageCredential && (
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={busy}
                      onClick={() =>
                        void call("revoke", {
                          organizationId,
                          provider: "github",
                        })
                      }
                    >
                      Disconnect GitHub
                    </Button>
                  )
                : canLinkGithub && (
                    <a
                      className="secondary"
                      href={`/api/github/connect?organizationId=${organizationId}`}
                    >
                      Link GitHub
                    </a>
                  )}
            </div>
          </AccountSection>
          <details className="account-disclosure">
            <summary>OpenAI API credential</summary>
            {!canLoad ? (
              <p>Provider credential details are unavailable.</p>
            ) : !canManageCredential ? (
              <p>Ask a workspace owner to manage the OpenAI API credential.</p>
            ) : (
              <form
                className="form-grid"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (busy) return;
                  const form = event.currentTarget;
                  const secret = new FormData(form).get("secret");
                  form.reset();
                  void call("saveKey", { organizationId, secret });
                }}
              >
                <p>
                  Provider charges are separate. VibeScroll encrypts this
                  credential on the server. Saving a changed key requires a
                  recent sign-in.
                </p>
                <p>
                  {providerStatus?.replaceAll("_", " ") ?? "Disconnected"} ·{" "}
                  {reviewedModels} reviewed{" "}
                  {reviewedModels === 1 ? "model" : "models"}
                </p>
                <label>
                  API key
                  <input
                    name="secret"
                    type="password"
                    autoComplete="off"
                    pattern="sk-.+"
                    maxLength={499}
                    title="Enter an OpenAI API credential that starts with sk-."
                    disabled={busy}
                    required
                  />
                </label>
                <div className="account-actions">
                  <Button type="submit" disabled={busy}>
                    Encrypt and save credential
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy || !hasCredential}
                    onClick={() => void call("testKey", { organizationId })}
                  >
                    Verify credential
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={busy || !hasCredential}
                    onClick={() =>
                      void call("revoke", {
                        organizationId,
                        provider: "openai",
                      })
                    }
                  >
                    Revoke credential
                  </Button>
                </div>
                <p className="fine">
                  Verification only requests the model list. Coding requires a
                  reviewed model, a separate provider ceiling, and platform
                  compute allowance.
                </p>
              </form>
            )}
          </details>
          <details className="account-disclosure">
            <summary>Telegram</summary>
            <p>
              Telegram capture is unavailable. Save links through VibeScroll.
            </p>
          </details>
          {canViewLaunchChecks && (
            <Link
              className="account-footer-link"
              href={`/app/${organizationId}/launch-checks`}
              prefetch={false}
            >
              Configure LaunchProof
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
