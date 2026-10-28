"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChoiceSelect } from "./choice-select";
import { workCloudMonitorMessage } from "../../../packages/onboarding/work-cloud-monitor";
type Project = {
  repositoryId: string;
  name: string;
  baseSha: string;
  profileVersion: number;
  selectionVersion: number;
};
type Grant = {
  id: string;
  clientId: string;
  scopes: string[];
  repositories?: Omit<Project, "name">[];
  sources: { sourceId: string; generation: number; revision: number }[];
  libraryScope?: "all" | "personal" | "business";
  version: number;
  state: string;
  expiresAt: number | null;
  analysisDefaults?: {
    enabled: boolean;
    deviceId: string;
    profileBinding: string;
  };
  intakeSpace?: "personal" | "business";
  contextVersion?: number;
  cloudRequestPolicy?: "explicit_per_source_v1";
  cloudSaveDefaults?: {
    version: "app-save-cloud-v1" | "link-save-cloud-v2";
    model: string;
    effort: "low" | "medium" | "high" | "xhigh";
    retentionMs: number;
  };
};
type Setup = {
  devices?: {
    id: string;
    name: string;
    profileBinding?: string;
    online: boolean;
  }[];
  repositoryNextCursor: string | null;
  repositories: Project[];
  enabled: boolean;
  privateLibrary: boolean;
  eventsEnabled?: boolean;
  workCloudMediaEnabled?: boolean;
  workCloudSavedEnabled?: boolean;
  clients: { id: string; name: string; scopes: string[] }[];
  grants: Grant[];
  context: {
    version: number;
    goal: string;
    role: string;
    interests: string[];
  } | null;
};
const scopeNames: Record<string, string> = {
  "knowledge:read": "Read ideas in my chosen library scope",
  "context:read": "Read the confirmed context I select",
  "links:save": "Save links I explicitly request",
  "jobs:read": "Read status of work in my chosen scope",
  "analysis:request":
    "Use my saved local analysis preferences; use credits only when I choose them",
  "analysis:execute":
    "Read separately approved text or public video links and return private analysis through a reviewed Work Cloud connection",
  "feedback:write": "Record feedback I explicitly state",
  "suggestions:draft": "Prepare private project suggestions",
  "events:subscribe": "Notify me about completed work in my chosen scope",
};
type AssistantConnectionsProps = {
  organizationId: string;
  call: (op: string, args: unknown) => Promise<unknown>;
  readOnly: boolean;
  demo: boolean;
};
export function AssistantConnections(props: AssistantConnectionsProps) {
  return <AssistantAccessEditor key={props.organizationId} {...props} />;
}
function AssistantAccessEditor({
  organizationId,
  call,
  readOnly,
  demo,
}: AssistantConnectionsProps) {
  const [data, setData] = useState<Setup | null>(null);
  const [clientId, setClientId] = useState("");
  const [libraryScope, setLibraryScope] = useState("");
  const [selectedProjects, setSelectedProjects] = useState<Project[]>([]);
  const [repositoryCursor, setRepositoryCursor] = useState<string | null>(null);
  const [includeLibraryContext, setIncludeLibraryContext] = useState(false);
  const [scopes, setScopes] = useState<string[]>([]);
  const [intakeSpace, setIntakeSpace] = useState("");
  const [duration, setDuration] = useState("until_revoked");
  const [automatic, setAutomatic] = useState<boolean | null>(null);
  const [cloudRequests, setCloudRequests] = useState(false);
  const [cloudSaves, setCloudSaves] = useState(false);
  const [cloudModel, setCloudModel] = useState("gpt-6.1-sol");
  const [cloudEffort, setCloudEffort] = useState("high");
  const [cloudRetentionDays, setCloudRetentionDays] = useState("7");
  const [computerId, setComputerId] = useState("");
  const [ack, setAck] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const busy = pending !== null;
  const [pageLoading, setPageLoading] = useState(false);
  const [checkedAt, setCheckedAt] = useState(0);
  const [copiedSetup, setCopiedSetup] = useState("");
  const generation = useRef(0);
  const editor = useRef<HTMLDetailsElement>(null);
  const needsContext = scopes.includes("context:read");
  useEffect(() => {
    const epoch = generation;
    return () => {
      epoch.current++;
    };
  }, []);
  const load = useCallback(async () => {
    const current = ++generation.current;
    try {
      const read = async (operation: string, args: unknown) => {
        const response = await fetch("/api/product", {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ operation, args }),
        });
        if (
          !response.ok ||
          response.redirected ||
          !response.headers.get("content-type")?.includes("application/json")
        )
          throw Error(
            "Refresh Connections to check access. Sign in if your session has expired.",
          );
        return (await response.json()).result;
      };
      const [access, projects] = await Promise.all([
        read("assistantSetup", { organizationId }),
        needsContext
          ? read("assistantProjectChoices", {
              organizationId,
              cursor: repositoryCursor,
            })
          : Promise.resolve({ repositories: [], repositoryNextCursor: null }),
      ]);
      const next = { ...access, ...projects } as Setup;
      if (current === generation.current) {
        setData(next);
        if (!next.workCloudMediaEnabled) setCloudRequests(false);
        setCheckedAt(Date.now());
        setPageLoading(false);
        setError("");
      }
    } catch {
      if (current === generation.current) {
        setData(null);
        setLibraryScope("");
        setScopes([]);
        setSelectedProjects([]);
        setIncludeLibraryContext(false);
        setCloudRequests(false);
        setPageLoading(false);
        setAck("");
        setError(
          "Access could not be checked. Refresh access, or sign in if your session has expired.",
        );
      }
    }
  }, [organizationId, repositoryCursor, needsContext]);
  useEffect(() => {
    let active = true;
    if (!demo)
      queueMicrotask(() => {
        if (active) void load();
      });
    return () => {
      active = false;
    };
  }, [load, demo]);
  const activeClientId =
    clientId || (data?.clients.length === 1 ? data.clients[0].id : "");
  const client = data?.clients.find((c) => c.id === activeClientId);
  const existing = data?.grants.find((g) => g.clientId === activeClientId);
  const cloudAvailable = !!data?.workCloudMediaEnabled;
  const cloudEligible =
    cloudAvailable &&
    !!libraryScope &&
    scopes.includes("analysis:request") &&
    scopes.includes("analysis:execute") &&
    !!client?.scopes.includes("analysis:request") &&
    client.scopes.includes("analysis:execute");
  const cloudRequestPolicy =
    cloudEligible && cloudRequests ? "explicit_per_source_v1" : undefined;
  const cloudSaveEligible =
    !!cloudRequestPolicy &&
    !!data?.workCloudSavedEnabled &&
    libraryScope === "all" &&
    ["jobs:read", "events:subscribe", "links:save"].every(
      (scope) => scopes.includes(scope) && client?.scopes.includes(scope),
    );
  const cloudSaveDefaults =
    cloudSaveEligible && cloudSaves
      ? {
          version: "link-save-cloud-v2",
          model: cloudModel.trim(),
          effort: cloudEffort,
          retentionMs: Number(cloudRetentionDays) * 86400000,
        }
      : undefined;
  const automaticAnalysis =
    !cloudRequestPolicy &&
    (automatic ?? existing?.analysisDefaults?.enabled ?? true);
  const computers = data?.devices?.filter((d) => !!d.profileBinding) ?? [];
  const chosenComputerId =
    computerId ||
    existing?.analysisDefaults?.deviceId ||
    (computers.length === 1 ? computers[0].id : "");
  const computer = computers.find((d) => d.id === chosenComputerId);
  const intakeValid =
    !scopes.includes("links:save") ||
    !automaticAnalysis ||
    (scopes.includes("analysis:request") && !!computer && !!libraryScope);
  const projects = selectedProjects.map(
    (ref) =>
      data?.repositories?.find((r) => r.repositoryId === ref.repositoryId) ??
      ref,
  );
  const projectDraftValid =
    !scopes.includes("suggestions:draft") ||
    (scopes.includes("context:read") && projects.length > 0 && !!libraryScope);
  const contextValid =
    !scopes.includes("context:read") ||
    projects.length > 0 ||
    (includeLibraryContext && !!data?.context);
  const binding = JSON.stringify([
    organizationId,
    activeClientId,
    libraryScope,
    projects,
    includeLibraryContext,
    scopes,
    intakeSpace,
    duration,
    automaticAnalysis,
    cloudRequestPolicy,
    cloudSaveDefaults,
    cloudAvailable,
    computer,
    data?.context?.version,
    existing?.version,
  ]);
  const disabled = busy || pageLoading || readOnly || demo || !data?.enabled;
  function editPreferences(grant: Grant) {
    setClientId(grant.clientId);
    setLibraryScope(grant.libraryScope ?? "");
    setScopes(grant.scopes);
    setSelectedProjects(
      (grant.repositories ?? []).map((r) => ({
        ...r,
        name:
          data?.repositories.find((p) => p.repositoryId === r.repositoryId)
            ?.name ?? r.repositoryId,
      })),
    );
    setIncludeLibraryContext(grant.contextVersion !== undefined);
    setIntakeSpace(grant.intakeSpace ?? "");
    setAutomatic(grant.analysisDefaults?.enabled ?? true);
    setCloudRequests(grant.cloudRequestPolicy === "explicit_per_source_v1");
    setCloudSaves(!!grant.cloudSaveDefaults);
    setCloudModel(grant.cloudSaveDefaults?.model ?? "gpt-6.1-sol");
    setCloudEffort(grant.cloudSaveDefaults?.effort ?? "high");
    setCloudRetentionDays(
      String((grant.cloudSaveDefaults?.retentionMs ?? 7 * 86400000) / 86400000),
    );
    setComputerId(grant.analysisDefaults?.deviceId ?? "");
    setDuration(
      grant.expiresAt === null
        ? "until_revoked"
        : grant.expiresAt - checkedAt <= 7 * 86400000
          ? "7"
          : "30",
    );
    setAck("");
    if (editor.current) editor.current.open = true;
  }
  async function save(expiresAt: number | null) {
    if (
      disabled ||
      ack !== binding ||
      !scopes.length ||
      !projectDraftValid ||
      !contextValid ||
      !intakeValid ||
      !libraryScope
    )
      return;
    setPending("save");
    setError("");
    try {
      const result = await call("saveAssistantGrant", {
        organizationId,
        clientId: activeClientId,
        sources: [],
        libraryScope,
        scopes,
        repositories: scopes.includes("context:read")
          ? projects.map(({ name: _name, ...r }) => r)
          : [],
        ...(scopes.includes("context:read") && includeLibraryContext
          ? { contextVersion: data?.context?.version }
          : {}),
        ...(scopes.includes("links:save") && intakeSpace
          ? { intakeSpace }
          : {}),
        expectedVersion: existing?.version ?? 0,
        expiresAt,
        acknowledged: true,
        ...(cloudRequestPolicy ? { cloudRequestPolicy } : {}),
        ...(cloudSaveDefaults ? { cloudSaveDefaults } : {}),
        ...(scopes.includes("links:save")
          ? { intakePolicy: "explicit_links" }
          : {}),
        ...(scopes.includes("links:save") &&
        scopes.includes("analysis:request") &&
        computer
          ? {
              analysisDefaults: {
                enabled: automaticAnalysis,
                deviceId: computer.id,
                profileBinding: computer.profileBinding,
              },
            }
          : {}),
      });
      if (!result)
        throw Error(
          "Access was not saved. Refresh access and review the current settings again.",
        );
      setAck("");
      await load();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Access was not saved. Reload and review again.",
      );
    } finally {
      setPending(null);
    }
  }
  async function revoke(grant: Grant) {
    setPending(grant.id);
    setError("");
    try {
      if (
        !(await call("revokeAssistantGrant", {
          id: grant.id,
          expectedVersion: grant.version,
        }))
      )
        throw Error("Revocation was not confirmed. Reload to check access.");
      setAck("");
      await load();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Revocation was not confirmed.",
      );
    } finally {
      setPending(null);
    }
  }
  function exportGrants() {
    if (!data) return;
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            {
              schemaVersion: 1,
              organizationId,
              exportedAt: Date.now(),
              grants: data.grants,
            },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "vibescroll-assistant-grants.json";
    link.click();
    URL.revokeObjectURL(url);
  }
  return (
    <section
      className="panel assistant-connections"
      aria-labelledby="assistant-access-title"
    >
      <h2 id="assistant-access-title">Use saved ideas in your assistant</h2>
      <p>
        Choose a library scope once. Current and future eligible posts in that
        scope stay available until you turn access off, or until the expiry you
        choose.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {demo ? (
        <p className="notice">
          Assistant access needs your own signed-in account.
        </p>
      ) : !data ? (
        !error && <output>Checking current access...</output>
      ) : (
        <>
          {!data.enabled && (
            <p className="notice">
              Assistant connection is being prepared. New grants are unavailable
              until official OAuth is configured and verified.
            </p>
          )}
          <div className="assistant-grant-list">
            {data.grants.map((grant) => {
              const setupMessage =
                data.enabled &&
                data.eventsEnabled &&
                data.workCloudMediaEnabled &&
                data.workCloudSavedEnabled
                  ? workCloudMonitorMessage(
                      organizationId,
                      grant,
                      data.clients.find((c) => c.id === grant.clientId),
                      checkedAt,
                    )
                  : null;
              return (
                <div key={grant.id} className="assistant-grant-row">
                  <div>
                    <strong>
                      {data.clients.find((c) => c.id === grant.clientId)
                        ?.name ?? "Previously configured assistant"}
                    </strong>
                    <p className="fine">
                      {grant.state === "active" &&
                      (grant.expiresAt === null || grant.expiresAt > checkedAt)
                        ? grant.expiresAt === null
                          ? "Active until you turn access off"
                          : `Active until ${new Date(grant.expiresAt).toLocaleString()}`
                        : "Access ended"}
                      .{" "}
                      {grant.libraryScope
                        ? grant.libraryScope === "all"
                          ? "All current and future posts"
                          : `Current and future ${grant.libraryScope === "personal" ? "Personal" : "Business"} posts`
                        : `${grant.sources.length} previously selected posts`}
                      . {grant.repositories?.length ?? 0} selected projects.
                      {grant.cloudSaveDefaults
                        ? " Automatic Cloud defaults are saved."
                        : grant.analysisDefaults?.enabled
                          ? " Links automatically queue local extraction and organization."
                          : " Automatic analysis is off."}
                      {grant.cloudRequestPolicy === "explicit_per_source_v1"
                        ? " Exact private video requests are allowed in a supported Work Cloud chat."
                        : ""}
                    </p>
                  </div>
                  {setupMessage && (
                    <details className="assistant-cloud-monitor-setup">
                      <summary>Set up ChatGPT</summary>
                      <p className="fine">
                        Open a Work chat with Cloud and this VibeScroll plugin
                        selected. Paste this message once and let setup finish.
                        ChatGPT will check its runtime before creating the
                        monitor. Refresh access here after changing your
                        permissions.
                      </p>
                      <label htmlFor={`cloud-monitor-${grant.id}`}>
                        ChatGPT setup message
                      </label>
                      <textarea
                        id={`cloud-monitor-${grant.id}`}
                        readOnly
                        rows={8}
                        value={setupMessage}
                        onFocus={(event) => event.currentTarget.select()}
                      />
                      <button
                        type="button"
                        className="secondary"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(setupMessage);
                            setCopiedSetup(`${grant.id}:${grant.version}`);
                          } catch {
                            setCopiedSetup("");
                            setError(
                              "Select the setup message and copy it using your browser.",
                            );
                          }
                        }}
                      >
                        Copy setup message
                      </button>
                      <output className="fine">
                        {copiedSetup === `${grant.id}:${grant.version}`
                          ? "Copied. Paste it into your ChatGPT Work chat."
                          : "This message contains library identifiers, not your login credentials."}
                      </output>
                    </details>
                  )}
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy || readOnly}
                    onClick={() => editPreferences(grant)}
                  >
                    Edit preferences
                  </button>
                  {grant.state === "active" && (
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy || readOnly}
                      onClick={() => void revoke(grant)}
                    >
                      {pending === grant.id
                        ? "Turning access off..."
                        : "Turn off access"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <details ref={editor} className="assistant-grant-editor">
            <summary>Choose assistant access</summary>
            <p className="fine">
              Connect VibeScroll in{" "}
              <a
                href="https://chatgpt.com/plugins"
                target="_blank"
                rel="noreferrer"
              >
                ChatGPT plugins
              </a>
              , then save access here. Connecting alone does not share your
              library.
            </p>
            {data.clients.length > 1 ? (
              <label htmlFor="assistant-client-choice">
                Assistant
                <ChoiceSelect
                  id="assistant-client-choice"
                  value={activeClientId}
                  onValueChange={(value) => {
                    setClientId(value);
                    setScopes([]);
                    setLibraryScope("");
                    setSelectedProjects([]);
                    setIncludeLibraryContext(false);
                    setCloudRequests(false);
                    setAck("");
                  }}
                  disabled={disabled}
                  aria-label="Assistant client"
                >
                  <option value="">Choose an assistant</option>
                  {data.clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </ChoiceSelect>
              </label>
            ) : (
              <p className="fine">{client?.name}</p>
            )}
            {client && (
              <>
                <fieldset>
                  <legend>Library access</legend>
                  <ChoiceSelect
                    value={libraryScope}
                    onValueChange={(value) => {
                      setLibraryScope(value);
                      if (!value) setCloudRequests(false);
                      setAck("");
                    }}
                    disabled={disabled}
                    aria-label="Library access"
                  >
                    <option value="">Off</option>
                    {data.privateLibrary && (
                      <option value="personal">Personal</option>
                    )}
                    {data.privateLibrary && (
                      <option value="business">Business</option>
                    )}
                    <option value="all">
                      {data.privateLibrary
                        ? "Both (all posts)"
                        : "All posts in this workspace"}
                    </option>
                  </ChoiceSelect>
                  <p className="fine">
                    {libraryScope === "all"
                      ? "Includes all current and future eligible posts in this library, including unfiled posts."
                      : libraryScope
                        ? `Includes current and future posts filed in ${libraryScope === "personal" ? "Personal" : "Business"}. Moving a post out removes access.`
                        : "No library access will be saved. Use Turn off access above to end an existing grant."}{" "}
                    Deleted posts and posts without access rights are never
                    included.
                  </p>
                </fieldset>
                <fieldset>
                  <legend>Allowed actions</legend>
                  <button
                    type="button"
                    className="secondary"
                    disabled={disabled}
                    onClick={() => {
                      setScopes([...client.scopes]);
                      setAck("");
                    }}
                  >
                    Select all actions
                  </button>
                  <details className="assistant-selected-review">
                    <summary>
                      Customize actions ({scopes.length} selected)
                    </summary>
                    {client.scopes.map((scope) => (
                      <label key={scope} className="check">
                        <input
                          type="checkbox"
                          disabled={disabled}
                          checked={scopes.includes(scope)}
                          onChange={(e) => {
                            if (
                              !e.target.checked &&
                              ["analysis:request", "analysis:execute"].includes(
                                scope,
                              )
                            )
                              setCloudRequests(false);
                            setScopes((old) =>
                              e.target.checked
                                ? [...old, scope]
                                : old.filter((s) => s !== scope),
                            );
                            setAck("");
                          }}
                        />
                        {scopeNames[scope] ?? scope}
                      </label>
                    ))}
                  </details>
                  {client.scopes.includes("events:subscribe") &&
                    !data.eventsEnabled && (
                      <p className="fine">
                        Completion notifications are not available yet. Their
                        permission does not activate them.
                      </p>
                    )}
                </fieldset>
                {cloudAvailable && (
                  <fieldset>
                    <legend>Private Work Cloud requests</legend>
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={!!cloudRequestPolicy}
                        disabled={disabled || !cloudEligible}
                        onChange={(e) => {
                          if (disabled || !cloudEligible) return;
                          setCloudRequests(e.target.checked);
                          if (e.target.checked) setAutomatic(false);
                          setAck("");
                        }}
                      />
                      Allow exact video analysis requests in my Work Cloud chat
                    </label>
                    {!cloudEligible && (
                      <p className="fine">
                        Choose a library scope and both analysis actions above
                        before enabling Cloud requests.
                      </p>
                    )}
                    <p className="fine">
                      After this setup, you can request a specific saved public
                      video in a supported Work Cloud chat using your own
                      ChatGPT subscription. GitHub is not required.{" "}
                      {data?.workCloudSavedEnabled
                        ? "Automatic app and ChatGPT links use the defaults below and one native Cloud monitor."
                        : "VibeScroll does not launch the Cloud task or automatically process new links."}{" "}
                      The task must support the required tools and network
                      access. Results stay private, with no paid API fallback.
                    </p>
                    <p className="fine">
                      Up to 6 new requests per hour. Each request allows one
                      video up to 50 MiB and 10 minutes, up to 48 sampled
                      frames, a 3-minute renewable lease within a fixed
                      15-minute deadline, and result retention you choose within
                      30 days. Each request must specify its model, effort and
                      retention. Provider task history and cleanup remain
                      separate.
                    </p>
                    {data?.workCloudSavedEnabled && (
                      <div className="form-grid">
                        <label className="check">
                          <input
                            type="checkbox"
                            checked={cloudSaveEligible && cloudSaves}
                            disabled={disabled || !cloudSaveEligible}
                            onChange={(e) => {
                              setCloudSaves(e.target.checked);
                              setAck("");
                            }}
                          />
                          Automatically analyze video links I save in the app or
                          send to VibeScroll in ChatGPT
                        </label>
                        <p className="fine">
                          Choose all posts and the save, status, Events and
                          analysis actions above. Then finish the native
                          saved-link monitor in ChatGPT once. Saving without
                          analysis stays separate. Once configured, any chat
                          with VibeScroll available can queue your supported
                          links without per-post app review. Earlier saves and
                          existing results are not automatically reprocessed.
                        </p>
                        {cloudSaveDefaults && (
                          <details open>
                            <summary>
                              Cloud defaults for app and ChatGPT links
                            </summary>
                            <label>
                              Model selected in your ChatGPT task
                              <input
                                value={cloudModel}
                                maxLength={100}
                                onChange={(e) => {
                                  setCloudModel(e.target.value);
                                  setAck("");
                                }}
                                required
                                disabled={disabled}
                              />
                            </label>
                            <label
                              htmlFor={`cloud-save-effort-${organizationId}`}
                            >
                              Reasoning effort
                              <ChoiceSelect
                                id={`cloud-save-effort-${organizationId}`}
                                value={cloudEffort}
                                disabled={disabled}
                                onValueChange={(value) => {
                                  setCloudEffort(value);
                                  setAck("");
                                }}
                              >
                                <option value="low">Low</option>
                                <option value="medium">Medium</option>
                                <option value="high">High</option>
                                <option value="xhigh">Extra high</option>
                              </ChoiceSelect>
                            </label>
                            <label
                              htmlFor={`cloud-save-retention-${organizationId}`}
                            >
                              Keep results for
                              <ChoiceSelect
                                id={`cloud-save-retention-${organizationId}`}
                                value={cloudRetentionDays}
                                disabled={disabled}
                                onValueChange={(value) => {
                                  setCloudRetentionDays(value);
                                  setAck("");
                                }}
                              >
                                <option value="1">1 day</option>
                                <option value="7">7 days</option>
                                <option value="30">30 days</option>
                              </ChoiceSelect>
                            </label>
                            <p className="fine">
                              These are requested settings. Your ChatGPT task
                              must have its own supported tools and model
                              access. VibeScroll buys no API inference and does
                              not verify provider history deletion.
                            </p>
                          </details>
                        )}
                      </div>
                    )}
                  </fieldset>
                )}
                {scopes.includes("links:save") && (
                  <fieldset>
                    <legend>When I send a link</legend>
                    <p className="fine">
                      Links you send to VibeScroll are saved using this
                      connection permission. You will not be asked to confirm
                      each link again. Submit content you are permitted to
                      process.
                    </p>
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={automaticAnalysis}
                        disabled={disabled || !!cloudRequestPolicy}
                        onChange={(e) => {
                          if (cloudRequestPolicy) return;
                          setAutomatic(e.target.checked);
                          setAck("");
                        }}
                      />
                      Extract and organize automatically on my computer
                    </label>
                    {automaticAnalysis && (
                      <>
                        <label htmlFor="assistant-analysis-computer">
                          Computer
                          <ChoiceSelect
                            id="assistant-analysis-computer"
                            value={chosenComputerId}
                            disabled={disabled}
                            onValueChange={(value) => {
                              setComputerId(value);
                              setAck("");
                            }}
                          >
                            <option value="">
                              Choose your paired computer
                            </option>
                            {computers.map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.name}
                                {d.online
                                  ? " · connected"
                                  : " · will wait until connected"}
                              </option>
                            ))}
                          </ChoiceSelect>
                        </label>
                        {!computers.length && (
                          <p className="notice">
                            Start the local assistant runner on your paired
                            computer, then reload Connections. Your ChatGPT
                            login stays on that computer.
                          </p>
                        )}
                        <p className="fine">
                          Uses your own ChatGPT allowance with local media
                          preparation. Offline links wait. VibeScroll offers a
                          credit quote and balance if you want to run sooner; it
                          never switches to credits automatically. Add a project
                          name or ask for best project matches to evaluate a
                          source for projects. Coding and publication require
                          separate approval.
                        </p>
                        {!scopes.includes("analysis:request") && (
                          <p className="notice">
                            Select the analysis action above to enable automatic
                            extraction.
                          </p>
                        )}
                      </>
                    )}
                  </fieldset>
                )}
                {scopes.includes("context:read") && (
                  <fieldset>
                    <legend>Confirmed context</legend>
                    <details
                      className="assistant-selected-review"
                      open={!contextValid || !projectDraftValid}
                    >
                      <summary>Choose library and project context</summary>
                      {(data.context || data.repositories.length > 0) && (
                        <button
                          type="button"
                          className="secondary"
                          disabled={disabled}
                          onClick={() => {
                            setIncludeLibraryContext(!!data.context);
                            setSelectedProjects(data.repositories.slice(0, 5));
                            setAck("");
                          }}
                        >
                          Select confirmed context on this page
                        </button>
                      )}
                      <p className="fine">
                        Choose your confirmed library context, up to five
                        projects, or both. Project changes require a new review.
                        Repository code and chat history are not included.
                      </p>
                      {data.context && (
                        <div className="assistant-context">
                          <label className="check">
                            <input
                              type="checkbox"
                              checked={includeLibraryContext}
                              disabled={disabled}
                              onChange={(e) => {
                                setIncludeLibraryContext(e.target.checked);
                                setAck("");
                              }}
                            />
                            Include my confirmed library context
                          </label>
                          <p>{data.context.goal || "No stated goal"}</p>
                          <p className="fine">
                            {data.context.role}.{" "}
                            {data.context.interests.join(", ")}
                          </p>
                          <a href={`/app/${organizationId}/library`}>
                            Review my stated context
                          </a>
                        </div>
                      )}
                      <div className="assistant-source-choices">
                        {(data.repositories ?? []).map((project) => (
                          <label key={project.repositoryId} className="check">
                            <input
                              type="checkbox"
                              checked={selectedProjects.some(
                                (r) => r.repositoryId === project.repositoryId,
                              )}
                              disabled={
                                disabled ||
                                (!selectedProjects.some(
                                  (r) =>
                                    r.repositoryId === project.repositoryId,
                                ) &&
                                  selectedProjects.length >= 5)
                              }
                              onChange={(e) => {
                                setSelectedProjects((old) =>
                                  e.target.checked
                                    ? [...old, project]
                                    : old.filter(
                                        (r) =>
                                          r.repositoryId !==
                                          project.repositoryId,
                                      ),
                                );
                                setAck("");
                              }}
                            />
                            <span>
                              {project.name}
                              <small>
                                Context version {project.profileVersion}; commit{" "}
                                {project.baseSha.slice(0, 12)}
                              </small>
                              <a
                                href={`/app/${organizationId}/projects#repository-${project.repositoryId}`}
                              >
                                Review project context
                              </a>
                            </span>
                          </label>
                        ))}
                      </div>
                      <p className="fine">
                        {selectedProjects.length} of 5 projects selected. Only
                        confirmed current projects appear; other projects may be
                        on later pages.
                      </p>
                      <div className="row">
                        {repositoryCursor && (
                          <button
                            type="button"
                            className="secondary"
                            disabled={busy || pageLoading}
                            onClick={() => {
                              generation.current++;
                              setPageLoading(true);
                              setAck("");
                              setRepositoryCursor(null);
                            }}
                          >
                            First projects
                          </button>
                        )}
                        {data.repositoryNextCursor && (
                          <button
                            type="button"
                            className="secondary"
                            disabled={busy || pageLoading}
                            onClick={() => {
                              generation.current++;
                              setPageLoading(true);
                              setAck("");
                              setRepositoryCursor(data.repositoryNextCursor);
                            }}
                          >
                            More projects
                          </button>
                        )}
                        {!!selectedProjects.length && (
                          <button
                            type="button"
                            className="secondary"
                            disabled={disabled}
                            onClick={() => {
                              setSelectedProjects([]);
                              setAck("");
                            }}
                          >
                            Clear projects
                          </button>
                        )}
                      </div>
                      {!!projects.length && (
                        <details className="assistant-selected-review">
                          <summary>
                            Review {projects.length} selected projects
                          </summary>
                          <ul>
                            {projects.map((r) => (
                              <li key={r.repositoryId}>
                                <a
                                  href={`/app/${organizationId}/projects#repository-${r.repositoryId}`}
                                >
                                  {r.name}
                                </a>
                                <span className="fine">
                                  {" "}
                                  Context {r.profileVersion}, snapshot{" "}
                                  {r.selectionVersion}, commit{" "}
                                  {r.baseSha.slice(0, 12)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                      {!contextValid && (
                        <p className="fine">
                          Select confirmed context before saving this read
                          permission.
                        </p>
                      )}
                    </details>
                  </fieldset>
                )}
                {scopes.includes("links:save") && (
                  <label htmlFor="assistant-intake-choice">
                    File new links in
                    <ChoiceSelect
                      id="assistant-intake-choice"
                      value={intakeSpace}
                      onValueChange={(v) => {
                        setIntakeSpace(v);
                        setAck("");
                      }}
                      disabled={disabled}
                      aria-label="Assistant intake space"
                    >
                      <option value="">Use my selected library scope</option>
                      <option value="personal">Personal</option>
                      <option value="business">Business</option>
                    </ChoiceSelect>
                  </label>
                )}
                <label htmlFor="assistant-access-duration">
                  Access duration
                  <ChoiceSelect
                    id="assistant-access-duration"
                    value={duration}
                    onValueChange={(value) => {
                      setDuration(value);
                      setAck("");
                    }}
                    disabled={disabled}
                    aria-label="Assistant access duration"
                  >
                    <option value="until_revoked">
                      Until I turn access off
                    </option>
                    <option value="7">7 days</option>
                    <option value="30">30 days</option>
                  </ChoiceSelect>
                </label>
                <div className="assistant-access-summary" aria-live="polite">
                  <h3>
                    {duration === "until_revoked"
                      ? "Review access until you turn it off"
                      : `Review access for ${duration} days`}
                  </h3>
                  <p>
                    {libraryScope === "all"
                      ? "All current and future eligible posts"
                      : libraryScope
                        ? `${libraryScope === "personal" ? "Personal" : "Business"} current and future posts`
                        : "Library access off"}
                    . {scopes.length} actions and {projects.length} project
                    contexts selected.
                    {includeLibraryContext
                      ? " Includes your confirmed library context."
                      : ""}
                  </p>
                  <p className="fine">
                    {cloudRequestPolicy
                      ? "Exact private Work Cloud requests use your own subscription, with a paid API maximum of $0. Local automatic extraction is off. "
                      : ""}
                    {scopes.includes("links:save") && automaticAnalysis
                      ? "Automatic extraction and organization use your selected computer and ChatGPT allowance. "
                      : ""}
                    Credits require a separate explicit choice. Coding and
                    publication require separate approval. Chat history is not
                    included. Your assistant may retain content already shared
                    in a conversation.
                  </p>
                </div>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={ack === binding}
                    disabled={disabled}
                    onChange={(e) => setAck(e.target.checked ? binding : "")}
                  />
                  I approve this library scope, including future posts, and the
                  selected context and actions{" "}
                  {duration === "until_revoked"
                    ? "until I turn access off"
                    : `for ${duration} days`}
                  . This replaces previous access.
                </label>
                <p className="fine">
                  Your current signed-in session is enough to save these
                  preferences. You can change or turn off access here anytime.
                </p>
                {!projectDraftValid && (
                  <p className="fine">
                    Private project suggestions require library access, selected
                    project context and its read permission. An owner or admin
                    can prepare these drafts.
                  </p>
                )}
                <button
                  type="button"
                  className="primary"
                  disabled={
                    disabled ||
                    ack !== binding ||
                    !scopes.length ||
                    !projectDraftValid ||
                    !contextValid ||
                    !intakeValid ||
                    !libraryScope
                  }
                  onClick={() =>
                    void save(
                      duration === "until_revoked"
                        ? null
                        : Date.now() + Number(duration) * 86400000,
                    )
                  }
                >
                  {pending === "save"
                    ? "Saving access..."
                    : "Save reviewed access"}
                </button>
              </>
            )}
          </details>
          <button
            type="button"
            className="secondary"
            disabled={busy || pageLoading}
            onClick={exportGrants}
          >
            Export my access records
          </button>
        </>
      )}
      {!demo && (
        <button
          type="button"
          className="secondary"
          disabled={busy || pageLoading}
          onClick={() => void load()}
        >
          Refresh access
        </button>
      )}
    </section>
  );
}
