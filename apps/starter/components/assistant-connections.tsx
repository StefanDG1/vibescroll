"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ChoiceSelect } from "./choice-select";
import { TaskRuntimePicker, type TaskRuntime } from "./task-runtime-picker";
import { workCloudMonitorMessage } from "../../../packages/onboarding/work-cloud-monitor";
const AssistantAccessAdvanced = dynamic(() =>
  import("./assistant-access-advanced").then((m) => m.AssistantAccessAdvanced),
);
type Grant = Parameters<typeof workCloudMonitorMessage>[1] & {
  id: string;
  state: string;
  expiresAt: number | null;
  analysisDefaults?: { enabled: boolean; deviceId: string };
  cloudSaveDefaults?: { version: string; model: string };
};
type Setup = {
  checkedAt: number;
  processingRoute?: TaskRuntime;
  enabled: boolean;
  workCloudMediaEnabled: boolean;
  workCloudSavedEnabled: boolean;
  eventsEnabled: boolean;
  clients: { id: string; name: string; scopes: string[] }[];
  grants: Grant[];
  devices: {
    id: string;
    name: string;
    profileBinding?: string;
    online: boolean;
  }[];
  modelChoices?: { id: string; name: string }[];
};
type Props = {
  organizationId: string;
  call: (op: string, args: unknown) => Promise<unknown>;
  readOnly: boolean;
  demo: boolean;
};
export function AssistantConnections(props: Props) {
  return <ConnectionSetup key={props.organizationId} {...props} />;
}
function ConnectionSetup({ organizationId, call, readOnly, demo }: Props) {
  const [setup, setSetup] = useState<Setup | null>(null);
  const [clientId, setClientId] = useState("");
  const [route, setRoute] = useState<TaskRuntime>("work_cloud");
  const [model, setModel] = useState("");
  const [effort, setEffort] = useState("high");
  const [deviceId, setDeviceId] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [setupMessage, setSetupMessage] = useState("");
  const routeEdited = useRef(false);
  const load = useCallback(
    async (signal?: AbortSignal) => {
      const response = await fetch("/api/product", {
        method: "POST",
        cache: "no-store",
        signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation: "assistantSetup",
          args: { organizationId },
        }),
      });
      if (
        !response.ok ||
        response.redirected ||
        !response.headers.get("content-type")?.includes("application/json")
      )
        throw Error("Could not load setup. Refresh or sign in again.");
      const data = (await response.json()).result as Setup;
      if (!signal?.aborted) {
        setSetup(data);
        if (!routeEdited.current && data.processingRoute)
          setRoute(data.processingRoute);
      }
      return data;
    },
    [organizationId],
  );
  useEffect(() => {
    if (demo) return;
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted)
        void load(controller.signal).catch((e) => {
          if (!controller.signal.aborted) setError(e.message);
        });
    });
    return () => controller.abort();
  }, [demo, load]);
  const client =
    setup?.clients.find((c) => c.id === clientId) ??
    setup?.clients.find((c) =>
      setup.grants.some(
        (g) =>
          g.clientId === c.id && g.state === "active" && g.cloudSaveDefaults,
      ),
    ) ??
    setup?.clients[0];
  const grant = setup?.grants.find((g) => g.clientId === client?.id);
  const active =
    grant?.state === "active" &&
    (grant.expiresAt === null || grant.expiresAt > (setup?.checkedAt ?? 0));
  const devices = setup?.devices.filter((d) => d.profileBinding) ?? [];
  const chosenDevice =
    deviceId || grant?.analysisDefaults?.deviceId || devices[0]?.id || "";
  const chosenModel = model || grant?.cloudSaveDefaults?.model || "gpt-6.1-sol";
  const models = [
    ...(setup?.modelChoices ?? [{ id: "gpt-6.1-sol", name: "GPT-6.1 Sol" }]),
  ];
  if (!models.some((m) => m.id === chosenModel))
    models.push({ id: chosenModel, name: `${chosenModel} (saved setting)` });
  const disabled = pending || readOnly || demo || !setup?.enabled;
  async function continueSetup() {
    if (!client || disabled || route === "cloud") return;
    setPending(true);
    setError("");
    setMessage("");
    try {
      const result = await call("continueAssistantSetup", {
        organizationId,
        clientId: client.id,
        expectedVersion: grant?.version ?? 0,
        route,
        model: chosenModel,
        effort,
        ...(route === "local" ? { deviceId: chosenDevice } : {}),
      });
      if (!result) throw Error("Setup was not saved. Refresh and try again.");
      const data = await load();
      const saved = data.grants.find((g) => g.clientId === client.id);
      setSetupMessage(
        route === "work_cloud" && saved && data.eventsEnabled
          ? (workCloudMonitorMessage(
              organizationId,
              saved,
              client,
              data.checkedAt,
            ) ?? "")
          : "",
      );
      setMessage(
        route === "work_cloud"
          ? "Preferences saved. Finish or resume the ChatGPT task below once."
          : "Preferences saved. Your paired computer will process new links when online.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Setup was not saved.");
    } finally {
      setPending(false);
    }
  }
  const monitorMessage =
    setupMessage ||
    (grant && client && setup?.eventsEnabled
      ? (workCloudMonitorMessage(
          organizationId,
          grant,
          client,
          setup.checkedAt,
        ) ?? "")
      : "");
  return (
    <section
      className="panel assistant-connections"
      aria-labelledby="connections-title"
    >
      <h2 id="connections-title">Where tasks run</h2>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {!setup && !demo && !error && <output>Loading your setup…</output>}
      <TaskRuntimePicker
        organizationId={organizationId}
        value={route}
        onChange={(value) => {
          routeEdited.current = true;
          setRoute(value);
          setSetupMessage("");
          setMessage("");
        }}
        workCloudAvailable={!!setup?.workCloudMediaEnabled}
        workCloudConfigured={!!grant?.cloudSaveDefaults}
        localAvailable={devices.length > 0}
        localConfigured={devices.length > 0}
        localStatus={
          devices.some((d) => d.online) ? "check_before_running" : "offline"
        }
        disabled={pending || readOnly || demo}
        setupMode
      />
      {setup && route === "work_cloud" && (
        <div className="form-grid">
          <p>
            {active
              ? "VibeScroll access is enabled."
              : "Connect VibeScroll in ChatGPT, then continue here."}{" "}
            Saving a supported video link uses this route automatically.
          </p>
          {setup.clients.length > 1 && (
            <label>
              ChatGPT connection
              <ChoiceSelect
                value={client?.id ?? ""}
                onValueChange={setClientId}
              >
                {setup.clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </ChoiceSelect>
            </label>
          )}
          <label>
            Model
            <ChoiceSelect
              value={chosenModel}
              disabled={disabled}
              onValueChange={setModel}
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </ChoiceSelect>
          </label>
          <p className="fine">
            ChatGPT checks which models your plan can use during setup.
          </p>
          <button
            type="button"
            className="primary"
            disabled={disabled || !setup.workCloudSavedEnabled}
            onClick={() => void continueSetup()}
          >
            {pending ? "Saving…" : "Continue"}
          </button>
          {monitorMessage && (
            <details open={!!setupMessage}>
              <summary>Finish or resume ChatGPT setup</summary>
              <p>
                Open a ChatGPT Work chat with Cloud and VibeScroll selected.
                Send this message once and let the task finish setup. Keep its
                saved-link task enabled. A normal chat alone does not enable
                background processing.
              </p>
              <textarea
                aria-label="ChatGPT setup message"
                readOnly
                value={monitorMessage}
                rows={5}
                onFocus={(e) => e.currentTarget.select()}
              />
              <button
                type="button"
                className="secondary"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(monitorMessage);
                    setMessage("Copied. Paste into your ChatGPT Work chat.");
                  } catch {
                    setError(
                      "Select and copy the setup message in your browser.",
                    );
                  }
                }}
              >
                Copy setup message
              </button>
              <a href="https://chatgpt.com/" target="_blank" rel="noreferrer">
                Open ChatGPT
              </a>
            </details>
          )}
          <Link href="/help/processing-and-recovery" prefetch={false}>
            Setup guide
          </Link>
        </div>
      )}
      {route === "local" && (
        <div className="form-grid">
          <p>
            Keep your paired computer and VibeScroll runner on. Your ChatGPT
            login stays on that computer.
          </p>
          {!!devices.length && (
            <label>
              Computer
              <ChoiceSelect value={chosenDevice} onValueChange={setDeviceId}>
                {devices.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                    {d.online ? " · online" : " · offline"}
                  </option>
                ))}
              </ChoiceSelect>
            </label>
          )}
          <Link href={`/app/${organizationId}/runners`} prefetch={false}>
            Connect your computer
          </Link>
          <button
            type="button"
            className="primary"
            disabled={disabled || !chosenDevice}
            onClick={() => void continueSetup()}
          >
            {pending ? "Saving…" : "Continue"}
          </button>
        </div>
      )}
      {route === "cloud" && (
        <p>
          VibeScroll server processing is not available yet. Credits will be
          bought separately when this route is ready.
        </p>
      )}
      <output aria-live="polite">{message}</output>
      <details onToggle={(e) => setAdvanced(e.currentTarget.open)}>
        <summary>Advanced settings</summary>
        <p>
          Library access and supported actions are included by default. Saved
          results stay until deleted. Optional restrictions apply only when you
          save them below.
        </p>
        {route === "work_cloud" && (
          <label htmlFor={`connection-effort-${organizationId}`}>
            Reasoning effort
            <ChoiceSelect
              id={`connection-effort-${organizationId}`}
              value={effort}
              onValueChange={setEffort}
              disabled={disabled}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="xhigh">Extra high</option>
            </ChoiceSelect>
          </label>
        )}
        {advanced && (
          <AssistantAccessAdvanced
            organizationId={organizationId}
            call={call}
            readOnly={readOnly}
            demo={demo}
            route={route}
          />
        )}
      </details>
      {active && grant && (
        <button
          type="button"
          className="secondary"
          disabled={disabled}
          onClick={async () => {
            setPending(true);
            try {
              const result = await call("revokeAssistantGrant", {
                id: grant.id,
                expectedVersion: grant.version,
              });
              if (!result) throw Error("Disconnect was not confirmed.");
              await load();
              setMessage("Disconnected.");
            } catch (e) {
              setError(e instanceof Error ? e.message : "Disconnect failed.");
            } finally {
              setPending(false);
            }
          }}
        >
          Disconnect ChatGPT access
        </button>
      )}
    </section>
  );
}
