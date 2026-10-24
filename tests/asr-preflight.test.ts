// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  inspectLocalAsr,
  asrSetupPath,
} from "../packages/runner/asr-preflight.mjs";
const temporary: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  for (const root of temporary.splice(0)) {
    if (
      dirname(resolve(root)) !== resolve(tmpdir()) ||
      !root.includes("vibe-asr-metadata-")
    )
      throw Error("Unsafe cleanup target");
    await rm(root, { recursive: true, force: true });
  }
});
async function setup() {
  const root = await mkdtemp(join(tmpdir(), "vibe-asr-metadata-"));
  temporary.push(root);
  const modelDirectory = join(root, "model");
  await mkdir(modelDirectory);
  return { root, config: { pythonPath: process.execPath, modelDirectory } };
}
const valid = {
  kind: "local_asr_metadata",
  version: 1,
  modelVerified: true,
  runtimeVerified: true,
  modelRevision: "d1d751a5f8271d482d14ca55d9e2deeebbae577f",
  runtimeVersion: "1.2.1",
  pythonVersion: "3.13.1",
};
it("uses a bounded isolated metadata command without forwarding provider secrets or paths into its result", async () => {
  const { config } = await setup();
  vi.stubEnv("HF_TOKEN", "SYNTHETIC_SECRET");
  vi.stubEnv("OPENAI_API_KEY", "SYNTHETIC_SECRET");
  const run = vi.fn(async () => ({ stdout: JSON.stringify(valid) }));
  expect(await inspectLocalAsr(config, run)).toEqual({
    asrRuntimeVerified: true,
    asrModelVerified: true,
  });
  const [command, args, options] = run.mock.calls[0] as unknown as [
    string,
    string[],
    any,
  ];
  expect(command).toBe(process.execPath);
  expect(args).toEqual([
    "-I",
    asrSetupPath,
    "--inspect",
    config.modelDirectory,
  ]);
  expect(options).toMatchObject({
    shell: false,
    windowsHide: true,
    timeout: 60000,
    maxBuffer: 4096,
  });
  expect(JSON.stringify(options.env)).not.toContain("SYNTHETIC_SECRET");
  expect(options.env.HF_HUB_OFFLINE).toBe("1");
});
it("does not trust existing paths alone or malformed, stale and failed inspection", async () => {
  const { config } = await setup();
  for (const result of [
    {},
    { ...valid, runtimeVerified: false },
    { ...valid, modelVerified: false },
    { ...valid, modelRevision: "a".repeat(40) },
    { ...valid, pythonVersion: "3.14.0" },
  ]) {
    const observed = await inspectLocalAsr(config, async () => ({
      stdout: JSON.stringify(result),
    }));
    expect(observed.asrRuntimeVerified && observed.asrModelVerified).toBe(
      false,
    );
  }
  expect(
    await inspectLocalAsr(config, async () => {
      throw Error("PRIVATE_PATH_AND_TOKEN");
    }),
  ).toEqual({ asrRuntimeVerified: false, asrModelVerified: false });
  const run = vi.fn();
  expect(
    await inspectLocalAsr({ ...config, pythonPath: "relative/python" }, run),
  ).toEqual({ asrRuntimeVerified: false, asrModelVerified: false });
  expect(run).not.toHaveBeenCalled();
});
it("rejects a junction/symlink in the model ancestor path before spawning inspection", async () => {
  const { root, config } = await setup();
  const alias = join(root, "alias");
  await symlink(
    config.modelDirectory,
    alias,
    process.platform === "win32" ? "junction" : "dir",
  );
  const run = vi.fn();
  expect(
    await inspectLocalAsr({ ...config, modelDirectory: alias }, run),
  ).toEqual({ asrRuntimeVerified: false, asrModelVerified: false });
  expect(run).not.toHaveBeenCalled();
});
it("executes the actual Python setup boundaries with synthetic bytes and no downloads or model inference", async () => {
  const result = await promisify(execFile)(
    "python",
    ["-I", "tests/asr_setup_test.py"],
    {
      cwd: resolve(import.meta.dirname, ".."),
      timeout: 15000,
      maxBuffer: 8000,
      windowsHide: true,
    },
  );
  expect(result.stderr).toContain("Ran 12 tests");
  expect(result.stderr).toContain("OK");
});
