import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { writeFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { subscriptionConfig } from "../packages/runner/subscription-trial.mjs";
import { AppServer } from "../packages/runner/app-server.mjs";
import {
  CodexConnectionStore,
  SavedCodexConnection,
} from "../packages/runner/codex-connection.mjs";
import {
  captureCodexCache,
  restoreCodexCache,
} from "../packages/runner/codex-cache-transfer.mjs";
import {
  sessionDeadline,
  waitForSessionExpiry,
  workerExpiryScript,
} from "../packages/runner/session-lifetime.mjs";
const options = process.argv.slice(2).join(" ");
if (!["", "--personal-library", "--disconnect"].includes(options))
  throw Error("SUBSCRIPTION_SESSION_OPTIONS_INVALID");
const store = new CodexConnectionStore();
if (options === "--disconnect") {
  await store.disconnect();
  console.log(
    JSON.stringify({
      status: "local_connection_removed",
      remoteRevoked: false,
    }),
  );
  process.exit(0);
}
const exec = promisify(execFile),
  image = JSON.parse(
    await readFile(resolve("private/subscription-images.json"), "utf8"),
  ).codex,
  prefix = "vibe-trial-" + randomUUID(),
  worker = prefix + "-codex",
  proxy = prefix + "-proxy",
  socket = prefix + "-socket";
const library = options === "--personal-library";
const sessionMs = library ? 4 * 3600000 : 1800000;
const expiresAt = sessionDeadline(sessionMs);
const startedAt = Date.now();
const run = async (args) =>
  (
    await exec("docker", args, {
      windowsHide: true,
      timeout: 20000,
      maxBuffer: 200000,
    })
  ).stdout.trim();
if (!/^sha256:[a-f0-9]{64}$/.test(image))
  throw Error("SUBSCRIPTION_IMAGE_INVALID");
let server;
let connection;
let checkpointTimer;
let checkpointTail = Promise.resolve();
let checkpointFailure;
let stopResolve;
const stopped = new Promise((r) => (stopResolve = r));
const stop = () => {
  stopResolve(false);
  server?.close();
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
const parentStop = (message) => {
  if (message === "stop") stop();
};
process.on("message", parentStop);
try {
  await store.lock(async () => {
    try {
      await run([
        "volume",
        "create",
        "--driver",
        "local",
        "--opt",
        "type=tmpfs",
        "--opt",
        "device=tmpfs",
        "--opt",
        "o=size=1m,uid=0,gid=1001,mode=0770",
        socket,
      ]);
      await run([
        "run",
        "-d",
        "--rm",
        "--name",
        proxy,
        "--read-only",
        "--cap-drop",
        "ALL",
        "--cap-add",
        "CHOWN",
        "--security-opt",
        "no-new-privileges",
        "--user",
        "0:0",
        "--memory",
        "128m",
        "--cpus",
        "0.5",
        "--pids-limit",
        "32",
        "--tmpfs",
        "/root:rw,noexec,nosuid,size=1m",
        "--mount",
        `type=volume,source=${socket},target=/run`,
        image,
        "python3",
        "-c",
        `import pathlib,time,runpy,threading,os,sys;threading.Timer(max(0,${expiresAt}/1000-time.time()),lambda:os._exit(0)).start();\nwhile not pathlib.Path('/root/ready').exists(): time.sleep(.1)\nsys.argv=['public_proxy.py','${library ? "--subscription-library" : "--subscription"}'];runpy.run_path('/opt/vibe/public_proxy.py',run_name='__main__')`,
      ]);
      await run([
        "exec",
        proxy,
        "python3",
        "-c",
        "import pathlib,sys;pathlib.Path('/root/vibe-public-policy.json').write_text(sys.argv[1]);pathlib.Path('/root/ready').touch()",
        JSON.stringify({
          domains: ["auth.openai.com", "chatgpt.com", "api.openai.com"],
        }),
      ]);
      await run([
        "run",
        "-d",
        "--rm",
        "--name",
        worker,
        "--init",
        "--network",
        "none",
        "--read-only",
        "--cap-drop",
        "ALL",
        "--security-opt",
        "no-new-privileges",
        "--group-add",
        "1001",
        "--memory",
        "1g",
        "--cpus",
        "2",
        "--pids-limit",
        "96",
        "--tmpfs",
        "/tmp:rw,exec,nosuid,nodev,size=64m",
        "--tmpfs",
        "/home/node/auth:rw,exec,nosuid,nodev,size=32m,uid=1000,gid=1000",
        "--tmpfs",
        "/home/node/evidence:rw,noexec,nosuid,size=1m,uid=1000,gid=1000",
        "--mount",
        `type=volume,source=${socket},target=/run,readonly`,
        "-e",
        "CODEX_HOME=/home/node/auth",
        "-e",
        "HTTPS_PROXY=http://127.0.0.1:47891",
        "-e",
        "HTTP_PROXY=http://127.0.0.1:47891",
        image,
        "node",
        "-e",
        workerExpiryScript(expiresAt),
      ]);
      connection = new SavedCodexConnection({
        store,
        restore: (cache) => restoreCodexCache(worker, cache),
        capture: () => captureCodexCache(worker),
      });
      await connection.restoreSaved();
      await run([
        "exec",
        "-d",
        worker,
        "socat",
        "TCP-LISTEN:47891,bind=127.0.0.1,reuseaddr,fork",
        "UNIX-CONNECT:/run/vibe-public.sock",
      ]);
      const configs = subscriptionConfig;
      server = new AppServer("docker", [
        "exec",
        "-i",
        "-e",
        "TOKIO_WORKER_THREADS=2",
        worker,
        "codex",
        "app-server",
        "--listen",
        "stdio://",
        ...configs.flatMap((c) => ["-c", c]),
      ]);
      let loginResolve;
      const loggedIn = new Promise((r) => (loginResolve = r));
      server.onEvent((m) => {
        if (m.id !== undefined) server.deny(m);
        if (m.method === "account/login/completed") {
          console.log(
            JSON.stringify({ loginCompleted: m.params.success === true }),
          );
          loginResolve(m.params.success === true);
        }
      });
      await server.request("initialize", {
        clientInfo: { name: "vibescroller_trial", version: "0.1.0" },
        capabilities: { experimentalApi: true },
      });
      server.send({ method: "initialized", params: {} });
      await writeFile(
        resolve("private/subscription-session.json"),
        JSON.stringify({
          worker,
          proxy,
          socket,
          image,
          expiresAt,
          startedAt,
          purpose: library ? "personal_library" : "comparison",
        }),
        { mode: 0o600 },
      );
      const { profileBinding, reused } = await connection.connect(
        server,
        async () => {
          const login = await server.request("account/login/start", {
            type: "chatgptDeviceCode",
          });
          console.log(
            JSON.stringify({
              verificationUrl: login.verificationUrl,
              userCode: login.userCode,
            }),
          );
          const success = await waitForSessionExpiry(
            Math.min(expiresAt, Date.now() + 900000),
            Promise.race([loggedIn, stopped]),
            false,
          );
          if (!success) throw Error("LOGIN_NOT_COMPLETED");
          if (Date.now() >= expiresAt) throw Error("LOGIN_SESSION_EXPIRED");
        },
      );
      await writeFile(
        resolve("private/subscription-session.json"),
        JSON.stringify({
          worker,
          proxy,
          socket,
          image,
          profileBinding,
          connectionSaved: true,
          expiresAt,
          startedAt,
          purpose: library ? "personal_library" : "comparison",
        }),
        { mode: 0o600 },
      );
      console.log(
        JSON.stringify({
          status: "own_account_connected",
          worker,
          reused,
          connectionSaved: true,
        }),
      );
      // Login is complete; release this client's threads before analysis starts.
      server.close();
      server = undefined;
      // Official Codex rotates tokens during use. Retain updated credentials in
      // encrypted host storage without retaining any task container or evidence.
      const checkpoint = () => {
        checkpointTail = checkpointTail
          .then(() => connection.checkpoint())
          .catch(() => {
            checkpointFailure = true;
            stop();
          });
      };
      checkpointTimer = setInterval(checkpoint, 15000);
      // Save before the worker's absolute deadline, then tear it down. This does
      // not extend the application's approval or the isolated worker's lifetime.
      await waitForSessionExpiry(expiresAt - 5000, stopped);
      clearInterval(checkpointTimer);
      await checkpointTail;
      if (checkpointFailure) throw Error("CHATGPT_CONNECTION_SAVE_FAILED");
    } catch (e) {
      console.log(
        JSON.stringify({
          status: "blocked",
          code: /^(LOGIN|CHATGPT)_[A-Z_]+$/.test(e.message)
            ? e.message
            : "SUBSCRIPTION_SESSION_SETUP_FAILED",
        }),
      );
      process.exitCode = 1;
    } finally {
      clearInterval(checkpointTimer);
      await checkpointTail;
      if (connection?.profileBinding && !checkpointFailure) {
        await connection.checkpoint().catch(() => {
          console.log(
            JSON.stringify({
              status: "blocked",
              code: "CHATGPT_CONNECTION_SAVE_FAILED",
            }),
          );
          process.exitCode = 1;
        });
      }
      server?.close();
      for (const name of [worker, proxy])
        await run(["rm", "-f", name]).catch(() => {});
      await run(["volume", "rm", socket]).catch(() => {});
      process.removeListener("SIGINT", stop);
      process.removeListener("SIGTERM", stop);
      process.removeListener("message", parentStop);
      if (process.connected) process.disconnect();
    }
  });
} catch {
  console.log(
    JSON.stringify({
      status: "blocked",
      code: "CHATGPT_CONNECTION_BUSY_OR_UNAVAILABLE",
    }),
  );
  process.exitCode = 1;
} finally {
  process.removeListener("message", parentStop);
  if (process.connected) process.disconnect();
}
