import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { readFile, unlink } from "node:fs/promises";
import { AppServer } from "../packages/runner/app-server.mjs";
import { CodexConnectionStore } from "../packages/runner/codex-connection.mjs";
import {
  captureCodexCache,
  restoreCodexCache,
} from "../packages/runner/codex-cache-transfer.mjs";
import { subscriptionConfig } from "../packages/runner/subscription-trial.mjs";

const exec = promisify(execFile);
const docker = async (args) =>
  (
    await exec("docker", args, {
      windowsHide: true,
      timeout: 20000,
      maxBuffer: 100000,
    })
  ).stdout;

test(
  "encrypted own-client cache survives worker replacement and is denied to model children",
  {
    skip:
      process.env.RUN_LOCAL_CODEX_CONNECTION_TEST !== "1" ||
      process.platform !== "win32",
    timeout: 60000,
  },
  async () => {
    const image = JSON.parse(
      await readFile("private/subscription-images.json", "utf8"),
    ).codex;
    assert.match(image, /^sha256:[a-f0-9]{64}$/);
    const synthetic = JSON.stringify({
      OPENAI_API_KEY: null,
      tokens: {
        access_token: "synthetic-access",
        refresh_token: "synthetic-refresh",
        account_id: "synthetic-account",
      },
    });
    const store = new CodexConnectionStore();
    store.file = store.file.replace(
      "connection.dpapi",
      `probe-${randomUUID()}.dpapi`,
    );
    const names = [];
    let server;
    try {
      for (let i = 0; i < 2; i++) {
        const name = `vibe-trial-${randomUUID()}-codex`;
        names.push(name);
        await docker([
          "run",
          "-d",
          "--rm",
          "--name",
          name,
          "--init",
          "--network",
          "none",
          "--read-only",
          "--cap-drop",
          "ALL",
          "--security-opt",
          "no-new-privileges",
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
          "-e",
          "CODEX_HOME=/home/node/auth",
          image,
          "node",
          "-e",
          "setTimeout(()=>process.exit(0),50000)",
        ]);
        if (i === 0) {
          await restoreCodexCache(name, synthetic);
          await store.lock(async () =>
            store.write({
              version: 1,
              hostId: `urn:uuid:${randomUUID()}`,
              profiles: [],
              connection: { cache: await captureCodexCache(name) },
            }),
          );
          const encrypted = await readFile(store.file, "utf8");
          assert.ok(!encrypted.includes("synthetic-access"));
          assert.ok(!encrypted.includes("synthetic-refresh"));
          await docker(["rm", "-f", name]);
          continue;
        }
        await restoreCodexCache(name, (await store.read()).connection.cache);
        assert.equal(await captureCodexCache(name), synthetic);
        server = new AppServer("docker", [
          "exec",
          "-i",
          "-e",
          "TOKIO_WORKER_THREADS=2",
          name,
          "codex",
          "app-server",
          "--listen",
          "stdio://",
          ...subscriptionConfig.flatMap((c) => ["-c", c]),
        ]);
        await server.request("initialize", {
          clientInfo: {
            name: "vibe_connection_boundary_test",
            version: "0.1.0",
          },
          capabilities: { experimentalApi: true },
        });
        server.send({ method: "initialized", params: {} });
        const result = await server.request("command/exec", {
          cwd: "/home/node/evidence",
          permissionProfile: "trial",
          timeoutMs: 10000,
          command: [
            "node",
            "-e",
            "const fs=require('fs'),net=require('net');const r={};try{fs.readFileSync('/home/node/auth/auth.json');r.credentials=false}catch{r.credentials=true}try{fs.writeFileSync('/home/node/evidence/forbidden','x');r.write=false}catch{r.write=true}const s=net.connect({host:'1.1.1.1',port:443});s.on('connect',()=>{r.network=false;s.destroy()});s.on('error',e=>{r.network=['EPERM','EACCES','ENETUNREACH'].includes(e.code)});setTimeout(()=>{console.log(JSON.stringify(r));process.exit(0)},2000)",
          ],
        });
        assert.equal(result.exitCode, 0, result.stderr?.slice(0, 1000));
        assert.deepEqual(JSON.parse(result.stdout.trim()), {
          credentials: true,
          write: true,
          network: true,
        });
      }
    } finally {
      server?.close();
      for (const name of names)
        await docker(["rm", "-f", name]).catch(() => {});
      await unlink(store.file).catch(() => {});
    }
  },
);
