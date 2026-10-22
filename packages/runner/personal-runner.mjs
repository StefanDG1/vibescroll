import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import { OfficialAssistantClient } from "./assistant-local.mjs";
import { companionPrivatePath } from "../companion/config-root.mjs";
import { vault } from "./vault.mjs";
import {
  processPersonalJob,
  OfficialPersonalClient,
} from "./personal-analysis.mjs";

let official, controller;
const shutdown = new AbortController();
const parentStop = (message) => {
  if (message === "stop") shutdown.abort();
};
process.on("message", parentStop);
for (const name of ["SIGINT", "SIGTERM"])
  process.once(name, () => shutdown.abort());

// Outbound HTTPS only. This process runs no repository scripts or decoder.
try {
  const path = process.argv[2];
  if (process.platform !== "win32" || !isAbsolute(path ?? ""))
    throw new Error("PERSONAL_CONFIG_INVALID");
  const bytes = await readFile(path);
  if (bytes.length > 10000) throw new Error("PERSONAL_CONFIG_INVALID");
  const config = JSON.parse(bytes.toString("utf8"));
  const url = new URL(config.server);
  if (
    url.protocol !== "https:" ||
    !/^[a-z0-9-]+\.convex\.site$/.test(url.hostname) ||
    url.port ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    url.username ||
    url.password ||
    config.protocolVersion !== "1.0.0" ||
    config.credentialVaultAdapter !== "windows-credential-manager" ||
    !config.credentialTarget ||
    !config.workspaceId
  )
    throw new Error("PERSONAL_CONFIG_INVALID");
  const stored = await vault("read", config.credentialTarget);
  if (!stored.secret) throw new Error("PERSONAL_CONFIG_INVALID");
  const secret = JSON.parse(stored.secret);
  if (!/^[A-Za-z0-9_-]{43}$/.test(secret.credential ?? ""))
    throw new Error("PERSONAL_CONFIG_INVALID");
  const endpoint = new URL("/runner/personal/v1", url);
  const request = async (operation, args = {}) => {
    const body = JSON.stringify({ protocolVersion: "1.0.0", operation, args });
    if (Buffer.byteLength(body) > 150000)
      throw new Error("PERSONAL_OUTPUT_LIMIT");
    const response = await fetch(endpoint, {
      method: "POST",
      redirect: "error",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret.credential}`,
      },
      body,
      signal: AbortSignal.timeout(20000),
    });
    if (
      !response.ok ||
      !response.headers.get("content-type")?.includes("application/json")
    )
      throw new Error("PERSONAL_DEVICE_UNAVAILABLE");
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    try {
      for (;;) {
        const item = await reader.read();
        if (item.done) break;
        size += item.value.byteLength;
        if (size > 1000000) throw new Error("PERSONAL_OUTPUT_LIMIT");
        chunks.push(Buffer.from(item.value));
      }
    } finally {
      await reader.cancel();
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  };
  const execute = promisify(execFile);
  const dockerEndpoint = (
    await execute(
      "docker",
      ["context", "inspect", "--format", "{{.Endpoints.docker.Host}}"],
      { windowsHide: true, timeout: 8000, maxBuffer: 2000 },
    )
  ).stdout
    .trim()
    .toLowerCase();
  const localPipes = [
    "npipe:////./pipe/dockerdesktoplinuxengine",
    "npipe:////./pipe/docker_engine",
  ];
  if (
    !localPipes.includes(dockerEndpoint) ||
    (process.env.DOCKER_HOST &&
      !localPipes.includes(process.env.DOCKER_HOST.toLowerCase()))
  )
    throw Error("PERSONAL_LOCAL_DOCKER_REQUIRED");
  while (!shutdown.signal.aborted) {
    const before = Date.now();
    controller = spawn(
      process.execPath,
      [
        resolve(
          import.meta.dirname,
          "../../scripts/start-subscription-session.mjs",
        ),
        "--personal-library",
      ],
      { windowsHide: true, stdio: ["ignore", "inherit", "inherit", "ipc"] },
    );
    let ended = false;
    controller.once("exit", () => {
      ended = true;
    });
    controller.once("error", () => {
      ended = true;
    });
    let session;
    for (
      let attempt = 0;
      attempt < 900 && !ended && !shutdown.signal.aborted;
      attempt++
    ) {
      const value = await readFile(
        companionPrivatePath("subscription-session.json"),
        "utf8",
      )
        .then(JSON.parse)
        .catch(() => null);
      if (
        value?.connectionSaved &&
        value.startedAt >= before &&
        value.expiresAt > before &&
        value.expiresAt <= before + 4 * 3600000 + 30000 &&
        value.profileBinding
      ) {
        session = value;
        break;
      }
      await delay(1000, undefined, { signal: shutdown.signal }).catch(() => {});
    }
    if (!session || shutdown.signal.aborted)
      throw Error("PERSONAL_CONNECTION_REQUIRED");
    official = await OfficialAssistantClient.connect(session);
    const client = new OfficialPersonalClient(official);
    let announcedAt = 0;
    while (
      !shutdown.signal.aborted &&
      !ended &&
      Date.now() < session.expiresAt - 60000
    ) {
      if (Date.now() - announcedAt > 5 * 60000) {
        const profile = await client.status();
        if (!profile.profileBinding)
          throw new Error("PERSONAL_PROFILE_UNAVAILABLE");
        const status = await request("hello", {
          models: await client.models(),
          profileBinding: profile.profileBinding,
        });
        if (status.workspaceId !== config.workspaceId)
          throw new Error("PERSONAL_WORKSPACE_MISMATCH");
        announcedAt = Date.now();
      }
      const response = await request("poll");
      if (response.reconcile) {
        await request("fail", {
          id: response.reconcile.id,
          ...(response.reconcile.generation === null
            ? {}
            : { generation: response.reconcile.generation }),
        });
      } else if (response.job) {
        try {
          await processPersonalJob(response.job, {
            client,
            request,
            signal: AbortSignal.any([
              shutdown.signal,
              AbortSignal.timeout(Math.max(1, session.expiresAt - Date.now())),
            ]),
            asr: config.localAsr,
          });
          console.log(
            "Personal source analysis completed. Review it in the browser.",
          );
        } catch (error) {
          if (
            error instanceof Error &&
            /^Personal analysis failed at (lease|profile|media|inference|output_validation|completion): ((PERSONAL|CHATGPT)_[A-Z_]+|VALIDATION_OR_TRANSPORT)$/.test(
              error.message,
            )
          )
            console.error(error.message);
          try {
            await request("fail", {
              id: response.job.id,
              generation: response.job.generation,
            });
          } catch {
            /* Revoked credentials cannot acknowledge. The result remains fenced. */
          }
          console.error(
            "Personal analysis stopped. No alternate provider was used; review its state and plan usage.",
          );
        }
      }
      await delay(
        response.job || response.reconcile ? 1000 : 30000,
        undefined,
        {
          signal: shutdown.signal,
        },
      ).catch(() => {});
    }
    official.close();
    official = undefined;
    if (controller.connected) controller.send("stop");
    while (!ended && !shutdown.signal.aborted)
      await delay(1000, undefined, { signal: shutdown.signal }).catch(() => {});
    controller = undefined;
  }
} catch {
  console.error(
    "Personal runner stopped. Check pairing, account permission and backend setup. No credentials or source content were logged.",
  );
  process.exitCode = 1;
} finally {
  official?.close();
  if (controller?.connected) {
    controller.send("stop");
    await new Promise((done) => {
      const timer = setTimeout(done, 20000);
      controller.once("exit", () => {
        clearTimeout(timer);
        done();
      });
    });
    if (controller.connected) controller.disconnect();
  }
  process.removeListener("message", parentStop);
  if (process.connected) process.disconnect();
}
