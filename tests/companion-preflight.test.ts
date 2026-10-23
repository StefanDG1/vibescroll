// @vitest-environment node
import { expect, it, afterEach, vi } from "vitest";
import {
  mkdtemp,
  readFile,
  writeFile,
  mkdir,
  rm,
  lstat,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  companionPreflight,
  startupLauncher,
} from "../packages/runner/companion-preflight.mjs";
import { companionCommand } from "../scripts/companion.mjs";
const observed = {
  platform: "win32",
  nodeVersion: "24.12.0",
  dockerLinux: true,
  dockerEndpointLocal: true,
  config: {
    server: "https://synthetic.convex.site",
    workspaceId: "synthetic-workspace",
    credentialVaultAdapter: "windows-credential-manager",
    credentialTarget: "VibeScroller/device-synthetic",
    mediaImage: `sha256:${"a".repeat(64)}`,
  },
  mediaImagePresent: true,
  codexImagePinned: true,
  codexImagePresent: true,
  pythonPresent: true,
  asrModelPresent: true,
  asrRuntimeVerified: true,
  asrModelVerified: true,
  savedConnectionPresent: true,
  freeBytes: 4 * 1024 ** 3,
};
const temporary: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  for (const path of temporary.splice(0)) {
    const target = resolve(path);
    if (
      dirname(target) !== resolve(tmpdir()) ||
      !target.startsWith(join(resolve(tmpdir()), "vibe-companion-test-"))
    )
      throw Error("Unexpected test cleanup target");
    await rm(target, { recursive: true, force: true });
  }
});
it("produces a redacted prerequisite report without claiming account, model or live sample verification", () => {
  const report = companionPreflight({
    ...observed,
    config: {
      ...observed.config,
      unexpectedToken: "SYNTHETIC_SECRET_MUST_NOT_LEAK",
    },
  });
  expect(report).toMatchObject({
    readyForLocalStart: true,
    processingReady: "unverified",
  });
  const serialized = JSON.stringify(report);
  for (const value of [
    "SYNTHETIC_SECRET_MUST_NOT_LEAK",
    "synthetic-workspace",
    "device-synthetic",
    "synthetic.convex.site",
  ])
    expect(serialized).not.toContain(value);
});
it("blocks missing isolation, wrong runtime, unsafe server, absent account and low or unknown disk space", () => {
  for (const change of [
    { platform: "linux" },
    { nodeVersion: "25.0.0" },
    { dockerLinux: false },
    { dockerEndpointLocal: false },
    { mediaImagePresent: false },
    { codexImagePinned: false },
    { pythonPresent: false },
    { asrModelPresent: false },
    { asrRuntimeVerified: false },
    { asrModelVerified: false },
    { asrRuntimeVerified: undefined },
    { savedConnectionPresent: false },
    { freeBytes: 0 },
    { freeBytes: undefined },
    {
      config: {
        ...observed.config,
        server: "https://synthetic.convex.site.evil.invalid",
      },
    },
  ]) {
    expect(
      companionPreflight({ ...observed, ...change }).readyForLocalStart,
    ).toBe(false);
  }
});
it("quotes a hidden per-user startup without a shell and rejects expansion or line injection", () => {
  const paths = {
    executable: "C:\\Program Files\\node.exe",
    script: "C:\\Vibe Scroll\\companion.mjs",
    config: "C:\\Private\\paired.json",
    root: "C:\\Vibe Scroll",
  };
  const text = startupLauncher(paths);
  expect(text).toContain("shell.CurrentDirectory");
  expect(text).toContain(", 0, False");
  expect(text).toContain('""C:\\Program Files\\node.exe""');
  expect(text).not.toMatch(/cmd\.exe|powershell|ExecutionPolicy/);
  for (const config of ["x\r\nmalicious", "%TEMP%\\evil.json", 'x" & evil'])
    expect(() => startupLauncher({ ...paths, config })).toThrow(
      "COMPANION_STARTUP_PATH_INVALID",
    );
});
it("closes its managed IPC channel after invalid-config shutdown without starting any worker", async () => {
  // Missing configuration fails before credential, Docker or provider access.
  // Only this newly spawned invalid-config child is subject to test cleanup.
  const child = spawn(
    process.execPath,
    [
      fileURLToPath(
        new URL("../packages/runner/assistant-runner.mjs", import.meta.url),
      ),
    ],
    {
      windowsHide: true,
      shell: false,
      stdio: ["ignore", "ignore", "ignore", "ipc"],
    },
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const code = await new Promise((resolve, reject) => {
      timer = setTimeout(
        () => reject(Error("Managed IPC channel kept the stopped child alive")),
        2000,
      );
      child.once("error", reject);
      child.once("exit", resolve);
    });
    expect(code).toBe(1);
  } finally {
    clearTimeout(timer);
    if (child.exitCode === null) child.kill();
  }
});
it.skipIf(process.platform !== "win32")(
  "keeps startup opt-in, requests only a managed pause and preserves unknown startup files",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "vibe-companion-test-"));
    temporary.push(directory);
    vi.stubEnv("LOCALAPPDATA", join(directory, "local"));
    vi.stubEnv("APPDATA", join(directory, "roaming"));
    const config = join(directory, "paired.json");
    await expect(companionCommand(["startup-enable", config])).rejects.toThrow(
      "COMPANION_USAGE",
    );
    expect(await companionCommand(["status", config])).toMatchObject({
      startupEnabled: false,
      managedWorker: "not_managed",
    });
    await companionCommand(["pause", config]);
    expect(await companionCommand(["status", config])).toMatchObject({
      paused: true,
    });
    await expect(companionCommand(["resume", config])).rejects.toThrow(
      "COMPANION_USAGE",
    );
    await companionCommand(["resume", config, "--allow-approved-work"]);
    expect(await companionCommand(["status", config])).toMatchObject({
      paused: false,
    });
    const startupDir = join(
      directory,
      "roaming",
      "Microsoft/Windows/Start Menu/Programs/Startup",
    );
    await mkdir(startupDir, { recursive: true });
    const key = createHash("sha256")
      .update(config.toLowerCase())
      .digest("hex")
      .slice(0, 24);
    const startup = join(startupDir, `VibeScroll-${key}.vbs`);
    await writeFile(startup, "Unrelated user-owned file");
    await expect(companionCommand(["startup-disable", config])).rejects.toThrow(
      "COMPANION_STARTUP_NOT_OWNED",
    );
    expect(await readFile(startup, "utf8")).toBe("Unrelated user-owned file");
    expect(await lstat(config).catch(() => null)).toBeNull();
  },
);
