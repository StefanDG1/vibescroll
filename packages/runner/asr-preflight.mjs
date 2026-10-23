import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { lstat } from "node:fs/promises";
import { isAbsolute, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const execute = promisify(execFile);
export const asrSetupPath = fileURLToPath(
  new URL("../../scripts/setup-local-asr.py", import.meta.url),
);
async function plain(path, directory = false) {
  if (!isAbsolute(path ?? "")) return false;
  let current = resolve(path);
  const entry = await lstat(current);
  if (directory ? !entry.isDirectory() : !entry.isFile()) return false;
  for (;;) {
    if ((await lstat(current)).isSymbolicLink()) return false;
    const parent = dirname(current);
    if (parent === current) return true;
    current = parent;
  }
}
// Metadata/hash inspection only. No credentials, controller, model construction,
// network client or download is involved. Paths never leave this local process.
export async function inspectLocalAsr(config, run = execute) {
  try {
    if (
      !(await plain(config?.pythonPath)) ||
      !(await plain(config?.modelDirectory, true))
    )
      return { asrRuntimeVerified: false, asrModelVerified: false };
    const env = Object.fromEntries(
      [
        "SystemRoot",
        "SYSTEMROOT",
        "WINDIR",
        "TEMP",
        "TMP",
        "LOCALAPPDATA",
      ].flatMap((key) => (process.env[key] ? [[key, process.env[key]]] : [])),
    );
    Object.assign(env, {
      HF_HUB_OFFLINE: "1",
      HF_HUB_DISABLE_TELEMETRY: "1",
      PYTHONNOUSERSITE: "1",
    });
    const { stdout } = await run(
      config.pythonPath,
      ["-I", asrSetupPath, "--inspect", config.modelDirectory],
      {
        env,
        cwd: dirname(asrSetupPath),
        shell: false,
        windowsHide: true,
        timeout: 60000,
        maxBuffer: 4096,
      },
    );
    const result = JSON.parse(stdout);
    const valid =
      result.kind === "local_asr_metadata" &&
      result.version === 1 &&
      result.modelRevision === "d1d751a5f8271d482d14ca55d9e2deeebbae577f" &&
      result.runtimeVersion === "1.2.1" &&
      /^3\.13\.\d+$/.test(result.pythonVersion);
    return {
      asrRuntimeVerified: valid && result.runtimeVerified === true,
      asrModelVerified: valid && result.modelVerified === true,
    };
  } catch {
    return { asrRuntimeVerified: false, asrModelVerified: false };
  }
}
