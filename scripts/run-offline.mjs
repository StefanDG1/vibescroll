import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, delimiter } from "node:path";

const [command, ...args] = process.argv.slice(2);
if (
  !["pnpm", "node", "python"].includes(command) ||
  args.some((arg) => !/^[A-Za-z0-9_@./:=,+-]+$/.test(arg))
)
  throw Error("Use pnpm, node or python with plain command arguments.");
for (const path of [
  ".env",
  ".env.local",
  "apps/starter/.env",
  "apps/starter/.env.local",
  "apps/marketing/.env.local",
])
  if (existsSync(path))
    throw Error("Use a clean test checkout without local credentials.");
const safe =
  /^(PATH|PATHEXT|SystemRoot|SYSTEMDRIVE|WINDIR|COMSPEC|TEMP|TMP|TMPDIR|APPDATA|LOCALAPPDATA|USERPROFILE|HOME|LANG|LC_ALL|NUMBER_OF_PROCESSORS|PROCESSOR_ARCHITECTURE|PNPM_HOME|CI|TERM)$/i;
const env = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => safe.test(key)),
);
const pathKey =
  Object.keys(env).find((key) => key.toLowerCase() === "path") ?? "PATH";
env[pathKey] = `${dirname(process.execPath)}${delimiter}${env[pathKey] ?? ""}`;
Object.assign(env, {
  VIBESCROLL_OFFLINE: "1",
  VIBE_STAGING_TEST: "",
  NEXT_TELEMETRY_DISABLED: "1",
  DO_NOT_TRACK: "1",
  APP_URL: "http://127.0.0.1:3001",
  SEO_PUBLIC_INDEXING: "false",
  NODE_OPTIONS: `--import=${new URL("./offline-network.mjs", import.meta.url).href}`,
});
const windowsPnpm = process.platform === "win32" && command === "pnpm";
const child = spawn(
  windowsPnpm
    ? env.COMSPEC || process.env.ComSpec || "cmd.exe"
    : command === "node"
      ? process.execPath
      : command,
  windowsPnpm ? ["/d", "/s", "/c", `pnpm ${args.join(" ")}`] : args,
  { env, stdio: "inherit", windowsHide: true },
);
child.once("error", () => {
  process.exitCode = 1;
});
child.once("exit", (code) => {
  process.exitCode = code ?? 1;
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => child.kill(signal));
