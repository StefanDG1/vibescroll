import assert from "node:assert/strict";
import childProcess from "node:child_process";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { syncBuiltinESMExports } from "node:module";
import { fileURLToPath } from "node:url";

const attempts = [];
const refuse = (kind) => () => {
  attempts.push(kind);
  throw Error("LOCAL_PREPARATION_UNEXPECTED_SIDE_EFFECT");
};
for (const name of [
  "exec",
  "execFile",
  "spawn",
  "fork",
  "execSync",
  "execFileSync",
  "spawnSync",
])
  childProcess[name] = refuse(name);
globalThis.fetch = refuse("fetch");
for (const transport of [http, https]) {
  transport.request = refuse("http");
  transport.get = refuse("http");
}
net.Socket.prototype.connect = refuse("socket");
syncBuiltinESMExports();

const { localPreparationCleanupCommand } =
  await import("../../packages/runner/local-preparation.mjs");
const command = localPreparationCleanupCommand(
  "synthetic-preparation-directory",
);
assert.deepEqual(command, {
  executable: process.execPath,
  args: [
    fileURLToPath(
      new URL("../../scripts/purge-subscription-media.mjs", import.meta.url),
    ),
    "synthetic-preparation-directory",
    "--wait",
  ],
});
await import("../../scripts/prepare-local-media.mjs");
console.log(JSON.stringify({ cleanup: command.args[0], attempts }));
