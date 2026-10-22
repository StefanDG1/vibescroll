import {
  mkdir,
  lstat,
  readFile,
  writeFile,
  rename,
  rm,
  statfs,
  open,
  readdir,
} from "node:fs/promises";
import { resolve, join, dirname, relative, isAbsolute, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  NODE_VERSION,
  verifyArtifact,
  verifyRelease,
  readZip,
  releasePath,
} from "./release.mjs";

const execute = promisify(execFile);
function within(root, path) {
  const remainder = relative(root, path);
  return (
    !isAbsolute(remainder) &&
    remainder !== "" &&
    remainder !== ".." &&
    !remainder.startsWith(`..${sep}`)
  );
}
async function exists(path) {
  return lstat(path).then(
    () => true,
    (error) => {
      if (error.code === "ENOENT") return false;
      throw error;
    },
  );
}
// Check every existing ancestor, including the per-user installation parent.
export async function plainPath(path) {
  let cursor = resolve(path);
  while (true) {
    const stat = await lstat(cursor).catch((error) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (stat?.isSymbolicLink()) throw Error("INSTALL_REPARSE_PATH_REFUSED");
    const parent = dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
}
async function boundedRead(path, max = 2 * 1024 * 1024) {
  await plainPath(path);
  const stat = await lstat(path);
  if (!stat.isFile() || stat.size > max) throw Error("INSTALL_FILE_INVALID");
  return readFile(path);
}
// PowerShell receives paths as arguments, never interpolated executable text.
// Only the Windows trust provider decides signature validity; no bypass flag.
export async function windowsAuthenticode(path, expectedSha256) {
  if (process.platform !== "win32") throw Error("INSTALL_WINDOWS_REQUIRED");
  const script =
    "$ErrorActionPreference='Stop'; $s=Get-AuthenticodeSignature -LiteralPath $env:VIBESCROLL_INSTALL_CHECK_PATH; if($s.Status -ne 'Valid' -or $null -eq $s.SignerCertificate){exit 9}; $s.SignerCertificate.GetCertHashString([System.Security.Cryptography.HashAlgorithmName]::SHA256).ToLowerInvariant()";
  const { stdout } = await execute(
    join(
      process.env.SystemRoot ?? "C:\\Windows",
      "System32",
      "WindowsPowerShell",
      "v1.0",
      "powershell.exe",
    ),
    [
      "-NoProfile",
      "-NonInteractive",
      "-EncodedCommand",
      Buffer.from(script, "utf16le").toString("base64"),
    ],
    {
      env: { ...process.env, VIBESCROLL_INSTALL_CHECK_PATH: path },
      windowsHide: true,
      shell: false,
      timeout: 30000,
      maxBuffer: 1024,
    },
  );
  if (stdout.trim() !== expectedSha256)
    throw Error("INSTALL_AUTHENTICODE_MISMATCH");
}
export async function windowsRunning(installRoot) {
  if (process.platform !== "win32") throw Error("INSTALL_WINDOWS_REQUIRED");
  // Output a count only. Do not export process arguments or credentials.
  const script =
    "$ErrorActionPreference='Stop'; $r=[IO.Path]::GetFullPath($env:VIBESCROLL_INSTALL_CHECK_PATH).TrimEnd('\\')+'\\'; @((Get-CimInstance Win32_Process -Filter \"Name='node.exe'\") | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($r,[StringComparison]::OrdinalIgnoreCase) }).Count";
  const { stdout } = await execute(
    join(
      process.env.SystemRoot ?? "C:\\Windows",
      "System32",
      "WindowsPowerShell",
      "v1.0",
      "powershell.exe",
    ),
    [
      "-NoProfile",
      "-NonInteractive",
      "-EncodedCommand",
      Buffer.from(script, "utf16le").toString("base64"),
    ],
    {
      env: { ...process.env, VIBESCROLL_INSTALL_CHECK_PATH: installRoot },
      windowsHide: true,
      shell: false,
      timeout: 15000,
      maxBuffer: 1024,
    },
  );
  if (!/^\d+$/.test(stdout.trim()))
    throw Error("INSTALL_PROCESS_CHECK_UNAVAILABLE");
  return Number(stdout.trim()) > 0;
}
export async function downloadArtifact(descriptor, request = fetch) {
  // URL authorization comes from verifyRelease, before this function is called.
  const response = await request(descriptor.url, {
    redirect: "error",
    signal: AbortSignal.timeout(120000),
    headers: { "Accept-Encoding": "identity" },
  });
  if (
    !response.ok ||
    response.redirected ||
    (response.url && response.url !== descriptor.url) ||
    (response.headers.get("content-length") &&
      Number(response.headers.get("content-length")) !== descriptor.bytes) ||
    !response.body
  )
    throw Error("INSTALL_DOWNLOAD_REFUSED");
  const chunks = [];
  let length = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > descriptor.bytes) throw Error("INSTALL_DOWNLOAD_TOO_LARGE");
      chunks.push(Buffer.from(value));
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return verifyArtifact(Buffer.concat(chunks), descriptor);
}
/** Dependencies are injectable for offline fixture tests, never CLI options. */
export function createInstaller({
  localAppData = process.env.LOCALAPPDATA,
  platform = process.platform,
  architecture = process.arch,
  verifyAuthenticode = windowsAuthenticode,
  running = windowsRunning,
  freeBytes = async (path) => {
    const value = await statfs(path);
    return Number(value.bavail) * Number(value.bsize);
  },
} = {}) {
  if (
    platform !== "win32" ||
    architecture !== "x64" ||
    !localAppData ||
    !isAbsolute(localAppData)
  )
    throw Error("INSTALL_WINDOWS_X64_CURRENT_USER_REQUIRED");
  const installRoot = join(resolve(localAppData), "VibeScroll", "Companion");
  const configRoot = join(
    resolve(localAppData),
    "VibeScroll",
    "CompanionConfig",
  );
  const releases = join(installRoot, "releases");
  const pointer = join(installRoot, "current.json");
  async function root() {
    await plainPath(installRoot);
    await plainPath(configRoot);
    await mkdir(releases, { recursive: true });
    await plainPath(releases);
    // Config/credentials are a sibling and are never copied or removed here.
  }
  async function current() {
    if (!(await exists(pointer))) return null;
    const value = JSON.parse(
      (await boundedRead(pointer, 1024)).toString("utf8"),
    );
    if (
      !/^[0-9]+-[a-f0-9]{24}$/.test(value.releaseId ?? "") ||
      (value.previous !== null &&
        !/^[0-9]+-[a-f0-9]{24}$/.test(value.previous ?? ""))
    )
      throw Error("INSTALL_POINTER_INVALID");
    return { releaseId: value.releaseId, previous: value.previous };
  }
  async function exclusive(work) {
    await root();
    const lockPath = join(installRoot, "installer.lock");
    let lock;
    try {
      lock = await open(lockPath, "wx");
    } catch {
      throw Error("INSTALL_BUSY_OR_RECOVERY_REQUIRED");
    }
    try {
      return await work();
    } finally {
      await lock.close();
      await rm(lockPath);
    }
  }
  async function preflight(
    release,
    { restartApproved = false, previewOnly = false } = {},
  ) {
    await root();
    const requiredBytes =
      release.manifest.downloadBytes +
      release.manifest.expandedBytes +
      64 * 1024 * 1024;
    const availableBytes = await freeBytes(installRoot);
    const spaceReady =
      Number.isSafeInteger(availableBytes) && availableBytes >= requiredBytes;
    if (!spaceReady && !previewOnly) throw Error("INSTALL_SPACE_INSUFFICIENT");
    const previous = await current();
    if (previous && !restartApproved && !previewOnly)
      throw Error("INSTALL_RESTART_APPROVAL_REQUIRED");
    const companionRunning = await running(installRoot);
    if (companionRunning && !previewOnly)
      throw Error("INSTALL_STOP_COMPANION_FIRST");
    return {
      installRoot,
      configRoot,
      downloadBytes: release.manifest.downloadBytes,
      expandedBytes: release.manifest.expandedBytes,
      requiredBytes,
      availableBytes,
      spaceReady,
      companionRunning,
      restartRequired: Boolean(previous),
      restartApproved,
      previousRelease: previous?.releaseId ?? null,
    };
  }
  async function auditVersion(id, trust) {
    if (!/^[0-9]+-[a-f0-9]{24}$/.test(id))
      throw Error("INSTALL_RELEASE_ID_INVALID");
    const directory = join(releases, id);
    await plainPath(directory);
    const release = verifyRelease(
      await boundedRead(join(directory, "release.json")),
      await boundedRead(join(directory, "release.sig"), 64),
      trust,
    );
    if (release.releaseId !== id) throw Error("INSTALL_RELEASE_ID_MISMATCH");
    const allowed = new Set([
      "release.json",
      "release.sig",
      "runtime/node.exe",
      ...release.manifest.package.files.map((file) => `app/${file.path}`),
    ]);
    async function auditTree(path, prefix = "") {
      for (const entry of await readdir(path, { withFileTypes: true })) {
        const name = prefix + entry.name;
        if (entry.isSymbolicLink()) throw Error("INSTALL_REPARSE_PATH_REFUSED");
        if (entry.isDirectory())
          await auditTree(join(path, entry.name), `${name}/`);
        else if (!entry.isFile() || !allowed.has(name))
          throw Error("INSTALL_UNLISTED_FILE_REFUSED");
      }
    }
    await auditTree(directory);
    for (const file of release.manifest.package.files)
      verifyArtifact(
        await boundedRead(join(directory, "app", file.path), file.bytes),
        file,
      );
    const nodePath = join(directory, "runtime", "node.exe");
    verifyArtifact(
      await boundedRead(nodePath, release.manifest.node.executableBytes),
      {
        sha256: release.manifest.node.executableSha256,
        bytes: release.manifest.node.executableBytes,
      },
    );
    await verifyAuthenticode(nodePath, trust.authenticodeSha256);
    return release;
  }
  async function activatePointer(releaseId, previous) {
    const temporary = join(installRoot, `pointer-${randomUUID()}.json`);
    const file = await open(temporary, "wx");
    try {
      await file.writeFile(JSON.stringify({ releaseId, previous }));
      await file.sync();
    } finally {
      await file.close();
    }
    // Same-directory rename atomically replaces the pointer. Version directories
    // are immutable and the previous pointer is never removed beforehand.
    try {
      await rename(temporary, pointer);
    } finally {
      await rm(temporary, { force: true });
    }
  }
  return {
    installRoot,
    configRoot,
    current,
    preflight,
    async stage({
      raw,
      signature,
      trust,
      packageArchive,
      runtimeArchive,
      restartApproved = false,
    }) {
      const release = verifyRelease(raw, signature, trust);
      return exclusive(async () => {
        const check = await preflight(release, { restartApproved });
        verifyArtifact(packageArchive, release.manifest.package.archive);
        verifyArtifact(runtimeArchive, release.manifest.node.archive);
        const files = readZip(packageArchive, release.manifest.package.files);
        const runtimePath = `node-v${NODE_VERSION}-win-x64/node.exe`;
        const runtime = readZip(runtimeArchive, [
          {
            path: runtimePath,
            sha256: release.manifest.node.executableSha256,
            bytes: release.manifest.node.executableBytes,
          },
        ]);
        const destination = join(releases, release.releaseId);
        if (await exists(destination)) {
          await auditVersion(release.releaseId, trust);
          return {
            ...check,
            releaseId: release.releaseId,
            alreadyStaged: true,
          };
        }
        const staging = join(installRoot, `staging-${randomUUID()}`);
        if (!within(installRoot, staging)) throw Error("INSTALL_PATH_INVALID");
        try {
          await mkdir(join(staging, "runtime"), { recursive: true });
          for (const [path, content] of files) {
            const target = join(staging, "app", releasePath(path));
            if (!within(staging, target)) throw Error("INSTALL_PATH_INVALID");
            await mkdir(dirname(target), { recursive: true });
            await writeFile(target, content, { flag: "wx" });
          }
          const executable = join(staging, "runtime", "node.exe");
          await writeFile(executable, runtime.get(runtimePath), { flag: "wx" });
          await verifyAuthenticode(executable, trust.authenticodeSha256);
          await writeFile(join(staging, "release.json"), raw, { flag: "wx" });
          await writeFile(join(staging, "release.sig"), signature, {
            flag: "wx",
          });
          await rename(staging, destination);
        } finally {
          // Only the freshly generated staging child can be removed recursively.
          await plainPath(staging);
          await rm(staging, { recursive: true, force: true });
        }
        return { ...check, releaseId: release.releaseId, alreadyStaged: false };
      });
    },
    async activate({ releaseId, trust, restartApproved = false }) {
      return exclusive(async () => {
        const release = await auditVersion(releaseId, trust);
        await preflight(release, { restartApproved });
        const previous = await current();
        if (
          previous &&
          release.manifest.sequence <=
            Number(previous.releaseId.split("-")[0]) &&
          releaseId !== previous.releaseId
        )
          throw Error("INSTALL_DOWNGRADE_REQUIRES_ROLLBACK");
        if (previous?.releaseId !== releaseId)
          await activatePointer(releaseId, previous?.releaseId ?? null);
        return {
          releaseId,
          activated: true,
          processingAuthorized: false,
          startupEnabled: false,
        };
      });
    },
    async rollback({ trust, restartApproved = false }) {
      return exclusive(async () => {
        const previous = await current();
        if (!previous?.previous) throw Error("INSTALL_ROLLBACK_UNAVAILABLE");
        const release = await auditVersion(previous.previous, trust);
        await preflight(release, { restartApproved });
        await activatePointer(previous.previous, previous.releaseId);
        return {
          releaseId: previous.previous,
          rolledBack: true,
          processingAuthorized: false,
          startupEnabled: false,
        };
      });
    },
    async execution({ trust }) {
      const active = await current();
      if (!active) throw Error("INSTALL_ACTIVE_RELEASE_REQUIRED");
      const release = await auditVersion(active.releaseId, trust);
      if (release.manifest.package.distribution !== "runtime")
        throw Error("INSTALL_RUNTIME_DISTRIBUTION_REQUIRED");
      return {
        executable: join(releases, active.releaseId, "runtime", "node.exe"),
        entrypoint: join(
          releases,
          active.releaseId,
          "app",
          release.manifest.package.entrypoint,
        ),
        cwd: join(releases, active.releaseId, "app"),
        configRoot,
      };
    },
  };
}
