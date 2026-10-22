import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, join, isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";
import {
  NODE_VERSION,
  releasePath,
  sha256,
  writeZip,
  readZip,
  verifyArtifact,
  validateManifest,
} from "../packages/companion/release.mjs";
import {
  plainPath,
  windowsAuthenticode,
} from "../packages/companion/installer.mjs";
import {
  runtimeSourceInventory,
  materializeDependency,
} from "../packages/companion/runtime-package.mjs";
const execute = promisify(execFile);
const root = resolve(import.meta.dirname, "..");
export async function buildCompanionPackage({
  spec,
  trust,
  source,
  runtimeArchive,
  verifyAuthenticode,
  dependencies = [],
}) {
  if (!Array.isArray(spec.files) || spec.files.length > 12000)
    throw Error("PACKAGE_FILE_LIST_REQUIRED");
  const entries = [];
  const names = new Set();
  for (const path of [...spec.files].sort()) {
    releasePath(path);
    if (
      /(?:^|\/)(?:private|outputs|\.git|node_modules)(?:\/|$)/i.test(path) ||
      /(?:^|\/)(?:\.env(?:\..*)?|.*\.(?:pem|pfx|p12|key)|credentials[^/]*|config\.json)$/i.test(
        path,
      ) ||
      names.has(path.toLowerCase())
    )
      throw Error("PACKAGE_PRIVATE_OR_DUPLICATE_PATH");
    names.add(path.toLowerCase());
    const content = Buffer.from(await source(path));
    if (!content.length) throw Error("PACKAGE_EMPTY_FILE_REFUSED");
    entries.push({ path, content });
  }
  const packageJson = entries.find((entry) => entry.path === "package.json");
  if (
    !packageJson ||
    JSON.parse(packageJson.content.toString("utf8")).version !== spec.version
  )
    throw Error("PACKAGE_VERSION_MISMATCH");
  verifyArtifact(runtimeArchive, spec.node.archive);
  const runtimePath = `node-v${NODE_VERSION}-win-x64/node.exe`;
  const runtime = readZip(runtimeArchive, [
    {
      path: runtimePath,
      sha256: spec.node.executableSha256,
      bytes: spec.node.executableBytes,
    },
  ]);
  // The caller checks the extracted executable with the Windows trust provider.
  await verifyAuthenticode(
    runtime.get(runtimePath),
    spec.node.authenticodeSha256,
  );
  if (spec.distribution === "runtime") {
    for (const dependency of dependencies) entries.push(...dependency.entries);
  } else if (spec.distribution !== "source" || dependencies.length)
    throw Error("PACKAGE_DISTRIBUTION_INVALID");
  const archive = writeZip(entries);
  const files = entries.map(({ path, content }) => ({
    path,
    bytes: content.length,
    sha256: sha256(content),
  }));
  const manifest = {
    schemaVersion: 1,
    sequence: spec.sequence,
    version: spec.version,
    commit: spec.commit,
    platform: "win32-x64",
    node: spec.node,
    package: {
      archive: {
        url: spec.packageUrl,
        bytes: archive.length,
        sha256: sha256(archive),
      },
      lockSha256: files.find((file) => file.path === "pnpm-lock.yaml")?.sha256,
      entrypoint: "scripts/companion.mjs",
      files,
      distribution: spec.distribution,
      dependencies: dependencies.map((dependency) => dependency.metadata),
    },
    downloadBytes: archive.length + runtimeArchive.length,
    expandedBytes:
      files.reduce((sum, file) => sum + file.bytes, 0) +
      spec.node.executableBytes,
    requiresRestart: true,
  };
  validateManifest(manifest, trust);
  return {
    archive,
    raw: Buffer.from(JSON.stringify(manifest, null, 2) + "\n"),
  };
}
async function main(args) {
  if (args.length !== 4 || args.some((path) => !isAbsolute(path)))
    throw Error("PACKAGE_USAGE");
  const [specPath, trustPath, runtimePath, output] = args;
  await Promise.all(args.map(plainPath));
  const spec = JSON.parse(await readFile(specPath, "utf8"));
  const trust = JSON.parse(await readFile(trustPath, "utf8"));
  if (process.platform !== "win32")
    throw Error("PACKAGE_WINDOWS_SIGNATURE_VERIFICATION_REQUIRED");
  const { stdout } = await execute("git", ["rev-parse", "--verify", "HEAD"], {
    cwd: root,
    windowsHide: true,
    shell: false,
  });
  if (stdout.trim() !== spec.commit) throw Error("PACKAGE_COMMIT_MISMATCH");
  // Read committed objects. Working-tree edits/untracked credentials cannot enter
  // the archive, and the claimed commit binds every source byte.
  const source = async (path) =>
    (
      await execute("git", ["show", `${spec.commit}:${path}`], {
        cwd: root,
        windowsHide: true,
        shell: false,
        encoding: "buffer",
        maxBuffer: 32 * 1024 * 1024,
      })
    ).stdout;
  let dependencies = [];
  if (spec.distribution === "runtime") {
    const graph = await runtimeSourceInventory(source);
    spec.files = [...graph.files.keys()];
    const lock = (await source("pnpm-lock.yaml")).toString("utf8");
    dependencies = await Promise.all(
      graph.external.map(async (name) => {
        const archive = spec.dependencyArchives?.[name];
        if (!isAbsolute(archive ?? ""))
          throw Error("PACKAGE_DEPENDENCY_ARCHIVE_REQUIRED");
        await plainPath(archive);
        return materializeDependency(root, name, lock, await readFile(archive));
      }),
    );
  }
  const result = await buildCompanionPackage({
    spec,
    trust,
    source,
    dependencies,
    runtimeArchive: await readFile(runtimePath),
    verifyAuthenticode: async (content, signer) => {
      await mkdir(output, { recursive: true });
      const executable = join(output, `node-verification-${randomUUID()}.exe`);
      const { unlink } = await import("node:fs/promises");
      let created = false;
      try {
        await writeFile(executable, content, { flag: "wx" });
        created = true;
        await windowsAuthenticode(executable, signer);
      } finally {
        if (created) await unlink(executable);
      }
    },
  });
  await mkdir(output, { recursive: true });
  await writeFile(
    join(output, `companion-${spec.distribution}.zip`),
    result.archive,
    { flag: "wx" },
  );
  await writeFile(join(output, "release.unsigned.json"), result.raw, {
    flag: "wx",
  });
  console.log(
    "Unsigned package built. External release signing and dependency inventory review are still required. No install, execution or upload occurred.",
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main(process.argv.slice(2)).catch((error) => {
    console.error(
      /^(PACKAGE|RELEASE|INSTALL)_[A-Z_]+$/.test(error.message ?? "")
        ? error.message
        : "PACKAGE_BUILD_FAILED",
    );
    process.exitCode = 1;
  });
