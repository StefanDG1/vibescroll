import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID, createHash } from "node:crypto";
import { mkdir, readFile, writeFile, lstat, realpath } from "node:fs/promises";
import { resolve, join, sep, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { companionPreparationRoot } from "../companion/config-root.mjs";
import {
  acquisitionPolicy,
  acquisitionManifest,
} from "../media/acquisition-runtime.ts";
import { decoderManifest } from "../media/manifest.ts";
const execute = promisify(execFile);
export function localPreparationCleanupCommand(directory) {
  return {
    executable: process.execPath,
    args: [
      fileURLToPath(
        new URL("../../scripts/purge-subscription-media.mjs", import.meta.url),
      ),
      directory,
      "--wait",
    ],
  };
}
async function scheduleLocalCleanup(directory) {
  const command = localPreparationCleanupCommand(directory);
  await new Promise((done, reject) => {
    const cleanup = spawn(command.executable, command.args, {
      detached: true,
      windowsHide: true,
      stdio: "ignore",
    });
    cleanup.once("error", reject);
    cleanup.once("spawn", () => {
      cleanup.unref();
      done();
    });
  });
}
async function readPreparedJson(path, maximum) {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maximum)
    throw Error("LOCAL_PREPARATION_OUTPUT_INVALID");
  return JSON.parse(await readFile(path, "utf8"));
}
export async function docker(args, timeout = 20000) {
  const r = await execute("docker", args, {
    timeout,
    windowsHide: true,
    maxBuffer: 1000000,
    env: Object.fromEntries(
      ["PATH", "SystemRoot", "WINDIR", "USERPROFILE", "LOCALAPPDATA"].flatMap(
        (k) => (process.env[k] ? [[k, process.env[k]]] : []),
      ),
    ),
  });
  return r.stdout.trim();
}
export function workerFlags(image, name, volume, socket) {
  if (
    !/^sha256:[a-f0-9]{64}$/.test(image) ||
    ![name, volume, socket].every((v) =>
      /^vibe-trial-[a-f0-9-]+(?:-media|-socket|-worker|-proxy)?$/.test(v),
    )
  )
    throw Error("LOCAL_PREPARATION_CONFIG_INVALID");
  // The verified standalone downloader unpacks shared libraries into /tmp.
  // This bounded VM-local executable tmpfs is required for those libraries;
  // it grants no host access or direct network path.
  return [
    "create",
    "--name",
    name,
    "--network",
    "none",
    "--read-only",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    "--pids-limit",
    "64",
    "--memory",
    "1g",
    "--cpus",
    "2",
    "--user",
    "1001:1001",
    "--tmpfs",
    "/tmp:rw,exec,nosuid,nodev,size=192m",
    "--mount",
    `type=volume,source=${volume},target=/home/user/media`,
    "--mount",
    `type=volume,source=${socket},target=/run,readonly`,
    image,
    "python",
    "-c",
    "import time; time.sleep(900)",
  ];
}
export async function prepareLocalUrl({
  url,
  sourceId,
  image,
  privateRoot,
  run = docker,
  scheduleCleanup = scheduleLocalCleanup,
}) {
  const policy = acquisitionPolicy(url);
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(sourceId))
    throw Error("LOCAL_PREPARATION_SOURCE_INVALID");
  const root = resolve(privateRoot),
    dir = join(root, randomUUID());
  const expectedRoot = companionPreparationRoot();
  const base = dirname(expectedRoot);
  if (
    root !== expectedRoot ||
    !dir.startsWith(root + sep) ||
    (await realpath(base)) !== base ||
    (await lstat(base)).isSymbolicLink()
  )
    throw Error("LOCAL_PREPARATION_PATH_INVALID");
  await mkdir(root, { mode: 0o700 }).catch(async (error) => {
    if (error.code !== "EEXIST") throw error;
  });
  if ((await realpath(root)) !== root || (await lstat(root)).isSymbolicLink())
    throw Error("LOCAL_PREPARATION_PATH_INVALID");
  await mkdir(dir, { mode: 0o700 });
  const retentionUntil = Date.now() + 86400000;
  await writeFile(
    join(dir, "retention.json"),
    JSON.stringify({
      owner: "vibescroller-local-preparation",
      sourceId,
      image,
      expiresAt: retentionUntil,
    }),
    { flag: "wx", mode: 0o600 },
  );
  // Schedule cleanup before work, including acquisition failures and early returns.
  await scheduleCleanup(dir);
  const prefix = `vibe-trial-${randomUUID()}`,
    worker = `${prefix}-worker`,
    proxy = `${prefix}-proxy`,
    volume = `${prefix}-media`,
    socket = `${prefix}-socket`;
  // Docker Desktop supplies the local Linux VM boundary. No host bind mounts,
  // socket to the Docker daemon, repository, browser session or provider token.
  await run(["info", "--format", "{{.ServerVersion}}"]);
  const flags = workerFlags(image, worker, volume, socket);
  try {
    for (const [name, size] of [
      [volume, "450m"],
      [socket, "1m"],
    ])
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
        `o=size=${size},uid=${name === socket ? 0 : 1001},gid=1001,mode=0770`,
        name,
      ]);
    const policyPath = join(dir, "policy.json"),
      requestPath = join(dir, "request.json");
    await writeFile(policyPath, JSON.stringify({ domains: policy.domains }), {
      flag: "wx",
      mode: 0o600,
    });
    await writeFile(requestPath, JSON.stringify({ url: policy.url }), {
      flag: "wx",
      mode: 0o600,
    });
    await run([
      "create",
      "--name",
      proxy,
      "--read-only",
      "--cap-drop",
      "ALL",
      "--cap-add",
      "CHOWN",
      "--security-opt",
      "no-new-privileges",
      "--pids-limit",
      "32",
      "--memory",
      "128m",
      "--cpus",
      "0.5",
      "--user",
      "0:0",
      "--tmpfs",
      "/root:rw,noexec,nosuid,size=1m",
      "--mount",
      `type=volume,source=${socket},target=/run`,
      image,
      "python",
      "-c",
      "import pathlib,time,runpy;\nwhile not pathlib.Path('/root/policy-ready').exists(): time.sleep(.1)\nrunpy.run_path('/opt/vibe/public_proxy.py',run_name='__main__')",
    ]);
    await run(["start", proxy]);
    await run([
      "exec",
      proxy,
      "python",
      "-c",
      "import pathlib,sys;pathlib.Path('/root/vibe-public-policy.json').write_text(sys.argv[1])",
      JSON.stringify({ domains: policy.domains }),
    ]);
    await run(["exec", proxy, "touch", "/root/policy-ready"]);
    await run(flags);
    await run(["start", worker]);
    await run([
      "exec",
      worker,
      "python",
      "-c",
      "import os,socket,pathlib; assert os.getuid()==1001; assert pathlib.Path('/proc/self/status').read_text().split('NoNewPrivs:')[1].splitlines()[0].strip()=='1';\nfor host,port in [('169.254.169.254',80),('1.1.1.1',443),('host.docker.internal',443)]:\n try: socket.create_connection((host,port),timeout=1)\n except OSError: pass\n else: raise AssertionError('direct network access')",
    ]);
    await run([
      "exec",
      worker,
      "python",
      "-c",
      "import pathlib,sys;pathlib.Path('/home/user/media/request.json').write_text(sys.argv[1])",
      JSON.stringify({ url: policy.url }),
    ]);
    await run([
      "exec",
      "-d",
      worker,
      "socat",
      "TCP-LISTEN:47891,bind=127.0.0.1,reuseaddr,fork",
      "UNIX-CONNECT:/run/vibe-public.sock",
    ]);
    await run([
      "exec",
      worker,
      "python",
      "-c",
      "import socket,time;\nfor attempt in range(30):\n try:\n  s=socket.create_connection(('127.0.0.1',47891),timeout=1);s.sendall(b'CONNECT 169.254.169.254:443 HTTP/1.1\\r\\n\\r\\n'); assert b'403 Forbidden' in s.recv(1024);s.close();break\n except OSError: time.sleep(.1)\nelse: raise AssertionError('broker unavailable')",
    ]);
    await run(
      [
        "exec",
        "-e",
        "VIBE_DOWNLOAD_PROXY=http://127.0.0.1:47891",
        worker,
        "python",
        "/opt/vibe/acquire.py",
      ],
      140000,
    );
    await run([
      "cp",
      `${worker}:/home/user/media/acquisition.json`,
      join(dir, "acquisition.json"),
    ]);
    const acquisition = acquisitionManifest.parse(
      await readPreparedJson(join(dir, "acquisition.json"), 32768),
    );
    await run(["stop", "--time", "1", proxy]);
    if (!["acquired", "downloaded"].includes(acquisition.status))
      return {
        sourceId,
        status: acquisition.status,
        directory: dir,
        computeCredits: 0,
      };
    await run(
      ["exec", worker, "python", "/opt/vibe/decode-personal.py"],
      260000,
    );
    await run([
      "cp",
      `${worker}:/home/user/media/manifest.json`,
      join(dir, "manifest.json"),
    ]);
    const manifest = decoderManifest(
      await readPreparedJson(join(dir, "manifest.json"), 65536),
      true,
    );
    const assets = [];
    for (const name of [
      ...(manifest.audio ? [manifest.audio] : []),
      ...manifest.frames.map((f) => f.id),
    ]) {
      const path = join(dir, name);
      await run(["cp", `${worker}:/home/user/media/${name}`, path]);
      const stat = await lstat(path),
        max = name.endsWith(".wav") ? 19500000 : 2000000;
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > max)
        throw Error("LOCAL_PREPARATION_OUTPUT_INVALID");
      assets.push({
        name,
        bytes: stat.size,
        sha256: createHash("sha256")
          .update(await readFile(path))
          .digest("hex"),
      });
    }
    const receipt = {
      sourceId,
      url: policy.url,
      preparedAt: new Date().toISOString(),
      image,
      manifest,
      assets,
      computeCredits: 0,
      boundary: "local-docker-no-host-mounts",
      retentionUntil: new Date(retentionUntil).toISOString(),
    };
    await writeFile(
      join(dir, "receipt.json"),
      JSON.stringify(receipt, null, 2),
      { flag: "wx", mode: 0o600 },
    );
    return {
      sourceId,
      status: "prepared",
      directory: dir,
      frames: manifest.frames.length,
      audio: !!manifest.audio,
      computeCredits: 0,
    };
  } finally {
    // Only randomly named, task-owned Docker resources are removed.
    for (const name of [worker, proxy])
      await run(["rm", "--force", name]).catch(() => {});
    for (const name of [volume, socket])
      await run(["volume", "rm", name]).catch(() => {});
  }
}
