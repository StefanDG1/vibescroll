import {
  readFile,
  writeFile,
  mkdir,
  unlink,
  lstat,
  statfs,
  rmdir,
} from "node:fs/promises";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { isAbsolute, resolve, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { companionPrivatePath } from "../packages/companion/config-root.mjs";
import {
  companionPreflight,
  startupLauncher,
} from "../packages/runner/companion-preflight.mjs";

const root = resolve(import.meta.dirname, "..");
const execute = promisify(execFile);
const pauseMarker = "VibeScroll companion paused v1\n";
async function present(path, directory = false) {
  if (!isAbsolute(path ?? "")) return false;
  return lstat(path)
    .then(
      (s) => !s.isSymbolicLink() && (directory ? s.isDirectory() : s.isFile()),
    )
    .catch(() => false);
}
async function jsonFile(path, maxBytes = 10000) {
  if (!(await present(path)) || (await lstat(path)).size > maxBytes)
    throw Error("COMPANION_CONFIG_UNAVAILABLE");
  return JSON.parse(await readFile(path, "utf8"));
}
async function localCommand(command, args) {
  return (
    await execute(command, args, {
      cwd: root,
      timeout: 8000,
      maxBuffer: 10000,
      windowsHide: true,
      shell: false,
    })
  ).stdout.trim();
}
export async function inspectCompanion(configPath) {
  const config = await jsonFile(configPath);
  const images = await jsonFile(
    companionPrivatePath("subscription-images.json", root),
  ).catch(() => ({}));
  const pinned = /^sha256:[a-f0-9]{64}$/;
  const imagePresent = async (digest) =>
    pinned.test(digest ?? "") &&
    (await localCommand("docker", [
      "image",
      "inspect",
      "--format",
      "{{.Id}}",
      digest,
    ])
      .then((id) => id === digest)
      .catch(() => false));
  // Inspect context configuration before contacting an engine. Protected own-
  // account workers belong on this computer, never a remote Docker daemon.
  const localPipes = [
    "npipe:////./pipe/dockerdesktoplinuxengine",
    "npipe:////./pipe/docker_engine",
  ];
  const contextEndpoint = await localCommand("docker", [
    "context",
    "inspect",
    "--format",
    "{{.Endpoints.docker.Host}}",
  ]).catch(() => "");
  const dockerEndpointLocal =
    localPipes.includes(contextEndpoint.toLowerCase()) &&
    (!process.env.DOCKER_HOST ||
      localPipes.includes(process.env.DOCKER_HOST.toLowerCase()));
  const dockerLinux =
    dockerEndpointLocal &&
    (await localCommand("docker", ["info", "--format", "{{.OSType}}"])
      .then((value) => value === "linux")
      .catch(() => false));
  const [mediaImagePresent, codexImagePresent] = dockerLinux
    ? await Promise.all([
        imagePresent(config.mediaImage),
        imagePresent(images.codex),
      ])
    : [false, false];
  const disk = await statfs(root).catch(() => null);
  const saved = process.env.LOCALAPPDATA
    ? join(
        process.env.LOCALAPPDATA,
        "VibeScroller/ChatGPT/OfficialCodex/connection.dpapi",
      )
    : "";
  return companionPreflight({
    config,
    platform: process.platform,
    nodeVersion: process.versions.node,
    dockerLinux,
    dockerEndpointLocal,
    mediaImagePresent,
    codexImagePresent,
    codexImagePinned: pinned.test(images.codex ?? ""),
    pythonPresent: await present(config.localAsr?.pythonPath),
    asrModelPresent: await present(config.localAsr?.modelDirectory, true),
    savedConnectionPresent: await present(saved),
    freeBytes: disk ? Number(disk.bavail) * Number(disk.bsize) : undefined,
  });
}
function paths(configPath) {
  if (
    process.platform !== "win32" ||
    !isAbsolute(configPath ?? "") ||
    !process.env.LOCALAPPDATA ||
    !process.env.APPDATA
  )
    throw Error("COMPANION_WINDOWS_CONFIG_REQUIRED");
  const config = resolve(configPath);
  const key = createHash("sha256")
    .update(config.toLowerCase())
    .digest("hex")
    .slice(0, 24);
  const directory = join(process.env.LOCALAPPDATA, "VibeScroller", "Companion");
  const startup = join(
    process.env.APPDATA,
    "Microsoft/Windows/Start Menu/Programs/Startup",
    `VibeScroll-${key}.vbs`,
  );
  return {
    config,
    directory,
    startup,
    pause: join(directory, `${key}.paused`),
    lock: join(directory, `${key}.lock`),
  };
}
async function runCompanion(p) {
  if (await present(p.pause)) throw Error("COMPANION_PAUSED");
  const report = await inspectCompanion(p.config);
  if (!report.readyForLocalStart) {
    console.log(JSON.stringify(report, null, 2));
    throw Error("COMPANION_PREREQUISITES_BLOCKED");
  }
  await mkdir(p.directory, { recursive: true, mode: 0o700 });
  await mkdir(p.lock); // Never erase an uncertain lock or start a second managed worker.
  let child, timer;
  const stop = () => {
    if (child?.connected) child.send("stop", () => {});
  };
  try {
    child = spawn(
      process.execPath,
      [join(root, "packages/runner/assistant-runner.mjs"), p.config],
      {
        cwd: root,
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "ignore", "ignore", "ipc"],
      },
    );
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    let checking = false;
    timer = setInterval(async () => {
      if (checking) return;
      checking = true;
      try {
        if (await present(p.pause)) stop();
      } finally {
        checking = false;
      }
    }, 1000);
    // Close the startup/pause race after the child has its IPC listener.
    if (await present(p.pause)) stop();
    await new Promise((done, reject) => {
      child.once("error", () => reject(Error("COMPANION_START_FAILED")));
      child.once("exit", (code) =>
        code === 0
          ? done()
          : reject(Error("COMPANION_STOPPED_REVIEW_CONNECTION")),
      );
    });
  } finally {
    clearInterval(timer);
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
    await rmdir(p.lock);
  }
}
export async function companionCommand(args) {
  const [operation, configPath, consent] = args;
  if (!isAbsolute(configPath ?? "") || args.length > 3)
    throw Error("COMPANION_USAGE");
  if (operation === "preflight" && !consent)
    return inspectCompanion(configPath);
  const p = paths(configPath);
  if (operation === "run" && !consent) return runCompanion(p);
  if (operation === "status" && !consent)
    return {
      paused: await present(p.pause),
      managedWorker: (await present(p.lock, true))
        ? "active_or_needs_reconciliation"
        : "not_managed",
      startupEnabled: await present(p.startup),
      accountAndServer: "unverified",
    };
  if (operation === "pause" && !consent) {
    await mkdir(p.directory, { recursive: true, mode: 0o700 });
    await writeFile(p.pause, pauseMarker, { flag: "wx", mode: 0o600 }).catch(
      async (error) => {
        if (
          error.code !== "EEXIST" ||
          (await readFile(p.pause, "utf8")) !== pauseMarker
        )
          throw error;
      },
    );
    return {
      status: "pause_requested",
      note: "Only this managed companion observes the pause. Active work stops through its normal checkpoint and lease handling. Other runners are unchanged.",
    };
  }
  if (operation === "resume" && consent === "--allow-approved-work") {
    if (await present(p.pause)) {
      if ((await readFile(p.pause, "utf8")) !== pauseMarker)
        throw Error("COMPANION_PAUSE_NOT_OWNED");
      await unlink(p.pause);
    }
    return {
      status: "pause_removed",
      note: "Run the companion explicitly, or wait for an enabled sign-in startup. Existing server approvals still apply.",
    };
  }
  const launcher = startupLauncher({
    executable: process.execPath,
    script: fileURLToPath(import.meta.url),
    config: p.config,
    root,
  });
  if (operation === "startup-enable" && consent === "--start-at-sign-in") {
    const report = await inspectCompanion(p.config);
    if (!report.readyForLocalStart) return { status: "blocked", report };
    await writeFile(p.startup, launcher, { flag: "wx", mode: 0o600 }).catch(
      async (error) => {
        if (
          error.code !== "EEXIST" ||
          (await readFile(p.startup, "utf8")) !== launcher
        )
          throw error;
      },
    );
    return {
      status: "startup_enabled",
      note: "Starts hidden at your next Windows sign-in while unpaused. Does not wake the computer or bypass account, model, grant or budget checks.",
    };
  }
  if (operation === "startup-disable" && !consent) {
    if (await present(p.startup)) {
      if ((await readFile(p.startup, "utf8")) !== launcher)
        throw Error("COMPANION_STARTUP_NOT_OWNED");
      await unlink(p.startup);
    }
    return {
      status: "startup_disabled",
      note: "A running companion is unchanged. Use pause to request its graceful stop.",
    };
  }
  throw Error("COMPANION_USAGE");
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const result = await companionCommand(process.argv.slice(2));
    if (result) console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(
      /^COMPANION_[A-Z_]+$/.test(error.message ?? "")
        ? error.message
        : "COMPANION_ACTION_FAILED",
    );
    console.error(
      "Use: node scripts/companion.mjs preflight|status|run|pause|startup-disable ABSOLUTE_CONFIG; resume ABSOLUTE_CONFIG --allow-approved-work; startup-enable ABSOLUTE_CONFIG --start-at-sign-in. No diagnostic includes credentials.",
    );
    process.exitCode = 1;
  }
}
