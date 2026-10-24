import { readFile, access } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { companionPrivatePath } from "../companion/config-root.mjs";
import { setTimeout as delay } from "node:timers/promises";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { vault } from "./vault.mjs";
import { loadAssistantRuntime } from "./assistant-runtime.mjs";
import {
  OfficialPersonalClient,
  processPersonalJob,
} from "./personal-analysis.mjs";
import {
  createSubscriptionCoordinator,
  createRunnerRequest,
  controllerAnnouncement,
  assertLocalDockerEndpoint,
} from "./subscription-coordinator.mjs";
const { OfficialAssistantClient, processAssistantJob, localWhisperPath } =
  await loadAssistantRuntime();

if (process.argv[2] === "--check") {
  await access(localWhisperPath);
  console.log(
    "VibeScroll assistant runtime ready. No account or processing request was made.",
  );
  process.exit(0);
}

// Device credentials are sent only to the paired Convex origin. Provider
// credentials remain in the existing isolated official-client controller.
let client, controller;
const stop = new AbortController();
for (const name of ["SIGINT", "SIGTERM"])
  process.once(name, () => stop.abort());
// The opt-in companion only controls the child it starts. Preserve the normal
// graceful checkpoint and controller teardown when the user pauses it.
const parentStop = (message) => {
  if (message === "stop") stop.abort();
};
process.on("message", parentStop);
try {
  const path = process.argv[2];
  if (process.platform !== "win32" || !isAbsolute(path ?? ""))
    throw Error("ASSISTANT_CONFIG_INVALID");
  const raw = await readFile(path, "utf8");
  if (Buffer.byteLength(raw) > 10000) throw Error("ASSISTANT_CONFIG_INVALID");
  const config = JSON.parse(raw),
    url = new URL(config.server);
  if (
    url.protocol !== "https:" ||
    !/^[a-z0-9-]+\.convex\.site$/.test(url.hostname) ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    config.protocolVersion !== "1.0.0" ||
    config.credentialVaultAdapter !== "windows-credential-manager" ||
    !config.credentialTarget ||
    !config.workspaceId ||
    !/^sha256:[a-f0-9]{64}$/.test(config.mediaImage ?? "")
  )
    throw Error("ASSISTANT_CONFIG_INVALID");
  const secret = JSON.parse(
    (await vault("read", config.credentialTarget)).secret ?? "{}",
  );
  if (!/^[A-Za-z0-9_-]{43}$/.test(secret.credential ?? ""))
    throw Error("ASSISTANT_CONFIG_INVALID");
  const localDocker = await promisify(execFile)(
    "docker",
    ["context", "inspect", "--format", "{{.Endpoints.docker.Host}}"],
    { windowsHide: true, timeout: 8000, maxBuffer: 2000 },
  );
  assertLocalDockerEndpoint(localDocker.stdout, process.env.DOCKER_HOST);
  // Each worker retains the existing four-hour absolute deadline. A later
  // worker restores the same saved login; no task approval is prolonged.
  while (!stop.signal.aborted) {
    const before = Date.now();
    const sessionStop = new AbortController(),
      announcement = controllerAnnouncement();
    controller = spawn(
      process.execPath,
      [
        resolve(
          import.meta.dirname,
          "../../scripts/start-subscription-session.mjs",
        ),
        "--personal-library",
      ],
      { windowsHide: true, stdio: ["ignore", "pipe", "inherit", "ipc"] },
    );
    // Only this trusted controller's stdout can bind its session file. Tee the
    // original consent output to the terminal; never persist it as diagnostics.
    controller.stdout.on("data", (chunk) => {
      process.stdout.write(chunk);
      try {
        announcement.push(chunk);
      } catch {
        sessionStop.abort();
      }
    });
    let controllerEnded = false;
    controller.once("exit", () => {
      controllerEnded = true;
      sessionStop.abort();
    });
    controller.once("error", () => {
      controllerEnded = true;
      sessionStop.abort();
    });
    let session;
    for (
      let attempt = 0;
      attempt < 900 &&
      !stop.signal.aborted &&
      !sessionStop.signal.aborted &&
      !controllerEnded;
      attempt++
    ) {
      const candidate = await readFile(
        companionPrivatePath("subscription-session.json"),
        "utf8",
      )
        .then(JSON.parse)
        .catch(() => null);
      if (announcement.accepts(candidate, before)) {
        session = candidate;
        break;
      }
      await delay(1000, undefined, {
        signal: AbortSignal.any([stop.signal, sessionStop.signal]),
      }).catch(() => {});
    }
    if (!session || stop.signal.aborted || sessionStop.signal.aborted)
      throw Error("ASSISTANT_CONNECTION_REQUIRED");
    client = await OfficialAssistantClient.connect(session);
    const signal = AbortSignal.any([
      stop.signal,
      sessionStop.signal,
      AbortSignal.timeout(Math.max(1, session.expiresAt - Date.now())),
    ]);
    const requests = {
      server: url.href,
      credential: secret.credential,
      signal,
    };
    const coordinator = createSubscriptionCoordinator({
      official: client,
      personal: new OfficialPersonalClient(client),
      requestPersonal: createRunnerRequest({ ...requests, route: "personal" }),
      requestAssistant: createRunnerRequest({
        ...requests,
        route: "assistant",
      }),
      processPersonal: processPersonalJob,
      processAssistant: processAssistantJob,
      config,
      signal,
      onStatus({ route, state, mediaStatus }) {
        console.log(
          state === "completed"
            ? `VibeScroll ${route === "personal" ? "personal source" : "assistant intake"} completed. Review the cited result in your library.`
            : state === "unavailable"
              ? `VibeScroll ${route} processing is unavailable for this account or workspace. No alternate funding route was used.`
              : `VibeScroll ${route} work stopped${mediaStatus ? ` (${mediaStatus})` : ""}. Review its state before retrying. No alternate provider was used.`,
        );
      },
    });
    while (
      !stop.signal.aborted &&
      !controllerEnded &&
      Date.now() < session.expiresAt - 60000
    ) {
      const result = await coordinator.step();
      if (result.rotate) break;
      await delay(result.delayMs, undefined, { signal }).catch(() => {});
    }
    client.close();
    client = undefined;
    if (controller.connected) controller.send("stop");
    // Let the existing controller checkpoint refreshed credentials and remove
    // its own worker. Do not kill the controller or leave expired workers live.
    const cleanupDeadline = Date.now() + 20000;
    while (!controllerEnded && Date.now() < cleanupDeadline) await delay(1000);
    if (!controllerEnded) throw Error("ASSISTANT_CONTROLLER_CLEANUP_PENDING");
    controller = undefined;
  }
} catch {
  if (!stop.signal.aborted) {
    console.error(
      "VibeScroll assistant runner stopped. Check pairing, saved ChatGPT login, Docker and Connections. No paid fallback ran.",
    );
    process.exitCode = 1;
  }
} finally {
  client?.close();
  // Its independent expiry still removes task resources if interrupted.
  if (controller?.connected) {
    controller.send("stop");
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 20000);
      controller.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
    if (controller.connected) controller.disconnect();
  }
  process.removeListener("message", parentStop);
  if (process.connected) process.disconnect();
}
