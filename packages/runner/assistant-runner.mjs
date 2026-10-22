import { readFile, access } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { spawn } from "node:child_process";
import { vault } from "./vault.mjs";
import { loadAssistantRuntime } from "./assistant-runtime.mjs";
const {
  OfficialAssistantClient,
  processAssistantJob,
  idleDelay,
  localWhisperPath,
} = await loadAssistantRuntime();

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
  const endpoint = new URL("/runner/assistant/v1", url);
  const request = async (operation, args = {}) => {
    const body = JSON.stringify({ protocolVersion: "1.0.0", operation, args });
    if (Buffer.byteLength(body) > 1000000)
      throw Error("ASSISTANT_REQUEST_LIMIT");
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret.credential}`,
      },
      redirect: "error",
      cache: "no-store",
      body,
      signal: AbortSignal.any([
        stop.signal,
        AbortSignal.timeout(operation === "evaluation" ? 90000 : 30000),
      ]),
    });
    const bytes = await response.text();
    if (
      !response.ok ||
      Buffer.byteLength(bytes) > 1000000 ||
      !response.headers.get("content-type")?.includes("application/json")
    )
      throw Error("ASSISTANT_REQUEST_REFUSED");
    return JSON.parse(bytes);
  };
  // Each worker retains the existing four-hour absolute deadline. A later
  // worker restores the same saved login; no task approval is prolonged.
  while (!stop.signal.aborted) {
    const before = Date.now();
    controller = spawn(
      process.execPath,
      [resolve("scripts/start-subscription-session.mjs"), "--personal-library"],
      { windowsHide: true, stdio: ["ignore", "inherit", "inherit", "ipc"] },
    );
    let controllerEnded = false;
    controller.once("exit", () => {
      controllerEnded = true;
    });
    controller.once("error", () => {
      controllerEnded = true;
    });
    let session;
    for (
      let attempt = 0;
      attempt < 900 && !stop.signal.aborted && !controllerEnded;
      attempt++
    ) {
      const candidate = await readFile(
        resolve("private/subscription-session.json"),
        "utf8",
      )
        .then(JSON.parse)
        .catch(() => null);
      if (
        candidate?.connectionSaved &&
        candidate.startedAt >= before &&
        candidate.expiresAt > before &&
        candidate.expiresAt <= before + 4 * 3600000 + 30000 &&
        candidate.profileBinding
      ) {
        session = candidate;
        break;
      }
      await delay(1000, undefined, { signal: stop.signal }).catch(() => {});
    }
    if (!session || stop.signal.aborted)
      throw Error("ASSISTANT_CONNECTION_REQUIRED");
    client = await OfficialAssistantClient.connect(session);
    let empty = 0,
      announcedAt = 0;
    while (
      !stop.signal.aborted &&
      !controllerEnded &&
      Date.now() < session.expiresAt - 60000
    ) {
      if (Date.now() - announcedAt > 240000) {
        await client.check();
        const hello = await request("hello", {
          profileBinding: session.profileBinding,
          model: "gpt-6.1-sol",
          expiresAt: session.expiresAt,
        });
        if (hello.workspaceId !== config.workspaceId)
          throw Error("ASSISTANT_WORKSPACE_CHANGED");
        announcedAt = Date.now();
      }
      const { job, rotate } = await request("claim");
      if (rotate) break;
      if (job) {
        empty = 0;
        try {
          await processAssistantJob(job, { client, request, config });
          console.log(
            "VibeScroll source completed. Review the cited results in your library.",
          );
        } catch (error) {
          const code =
            /^(?:ASSISTANT|LOCAL_ASR|LOCAL_PREPARATION)_[A-Z_]+$/.test(
              error?.message,
            )
              ? error.message
              : "ASSISTANT_LOCAL_WORK_FAILED";
          const mediaStatus = [
            "needs_auth",
            "rate_limited",
            "unavailable",
            "unsupported",
            "over_limit",
            "failed",
          ].includes(error?.mediaStatus)
            ? error.mediaStatus
            : undefined;
          await request("fail", {
            runId: job.runId,
            ...(mediaStatus ? { mediaStatus } : {}),
          }).catch(() => {});
          console.error(
            mediaStatus
              ? `VibeScroll media preparation stopped (${mediaStatus}). No AI analysis or paid fallback started. Review the source for next steps.`
              : `VibeScroll local work stopped (${code}). No alternate provider was used; review the source before retrying.`,
          );
        }
      } else empty++;
      await delay(job ? 1000 : idleDelay(empty - 1), undefined, {
        signal: stop.signal,
      }).catch(() => {});
    }
    client.close();
    client = undefined;
    if (controller.connected) controller.send("stop");
    // Let the existing controller checkpoint refreshed credentials and remove
    // its own worker. Do not kill the controller or leave expired workers live.
    while (!controllerEnded && !stop.signal.aborted)
      await delay(1000, undefined, { signal: stop.signal }).catch(() => {});
    controller = undefined;
  }
} catch {
  console.error(
    "VibeScroll assistant runner stopped. Check pairing, saved ChatGPT login, Docker and Connections. No paid fallback ran.",
  );
  process.exitCode = 1;
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
}
