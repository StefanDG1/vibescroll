import { posix, join, resolve } from "node:path";
import { readFile, readdir, realpath, lstat } from "node:fs/promises";
import { releasePath, sha256 } from "./release.mjs";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { stripTypeScriptTypes } from "node:module";
import { parseAst } from "vite";

export const runtimeDependencies = Object.freeze({
  jose: "6.2.12",
  zod: "4.6.6",
});
export const runtimeEntrypoints = Object.freeze([
  "scripts/companion.mjs",
  "scripts/install-companion.mjs",
  "scripts/start-subscription-session.mjs",
  "packages/runner/assistant-runner.mjs",
  "packages/runner/personal-runner.mjs",
  "packages/runner/pair.mjs",
]);
export function moduleReferences(code, filename) {
  let ast;
  try {
    const javascript = filename.endsWith(".ts")
      ? stripTypeScriptTypes(code, { mode: "strip", sourceUrl: filename })
      : code;
    ast = parseAst(javascript, undefined, filename);
  } catch {
    throw Error("PACKAGE_MODULE_SYNTAX_UNSUPPORTED");
  }
  const references = [];
  const literal = (node) =>
    node?.type === "Literal" && typeof node.value === "string"
      ? node.value
      : null;
  function visit(node) {
    if (!node || typeof node !== "object") return;
    if (
      [
        "ImportDeclaration",
        "ExportNamedDeclaration",
        "ExportAllDeclaration",
      ].includes(node.type) &&
      node.source
    ) {
      const value = literal(node.source);
      if (value === null) throw Error("PACKAGE_IMPORT_SYNTAX_UNSUPPORTED");
      references.push(value);
    }
    if (node.type === "ImportExpression") {
      const value = literal(node.source);
      if (value === null) throw Error("PACKAGE_COMPUTED_IMPORT_REFUSED");
      references.push(value);
    }
    if (
      node.type === "CallExpression" &&
      (node.callee?.name === "require" ||
        node.callee?.property?.name === "require" ||
        (node.callee?.object?.type === "MetaProperty" &&
          node.callee?.property?.name === "resolve"))
    )
      throw Error("PACKAGE_IMPORT_SYNTAX_UNSUPPORTED");
    if (node.type === "NewExpression" && node.callee?.name === "URL") {
      const value = literal(node.arguments[0]),
        base = node.arguments[1];
      if (
        value?.startsWith(".") &&
        base?.type === "MemberExpression" &&
        base.property?.name === "url" &&
        base.object?.type === "MetaProperty" &&
        base.object.meta?.name === "import" &&
        base.object.property?.name === "meta"
      )
        references.push(value);
    }
    for (const child of Object.values(node)) {
      if (Array.isArray(child)) for (const value of child) visit(value);
      else if (child && typeof child === "object") visit(child);
    }
  }
  visit(ast);
  return references;
}
export async function runtimeSourceInventory(source) {
  const queue = [
    ...runtimeEntrypoints,
    "package.json",
    "pnpm-lock.yaml",
    "LICENSE",
    "packages/media/asr-model.lock.json",
    "packages/media/asr_verification.py",
  ];
  const files = new Map(),
    external = new Set();
  while (queue.length) {
    const path = releasePath(queue.shift());
    if (files.has(path)) continue;
    if (
      path === "packages/runner/chatgpt-local.mjs" ||
      path === "packages/runner/chatgpt-cli.mjs"
    )
      throw Error("PACKAGE_UNSUPPORTED_AUTH_ADAPTER");
    if (
      !/^(?:scripts\/|packages\/(?:runner|companion|contracts|knowledge|media)\/|packages\/plans\/contract\.mjs$|packages\/social\/identity\.mjs$|packages\/social\/(?:analysis|contracts|preparation|diagnostics|ordered-intake)\.ts$|packages\/insights\/presentation\.ts$|packages\/policy\/secrets\.mjs$|infra\/downloader\.json$|contracts\/|package\.json$|pnpm-lock\.yaml$|LICENSE$)/.test(
        path,
      )
    )
      throw Error("PACKAGE_MODULE_PATH_REFUSED");
    const content = Buffer.from(await source(path));
    files.set(path, content);
    if (!/\.(?:mjs|js|ts)$/.test(path)) continue;
    const code = content.toString("utf8");
    // Parse all ECMAScript import/export forms with the existing build tool.
    // Native type stripping matches the installed Node runtime's TS boundary.
    const references = moduleReferences(code, path);
    for (const reference of references) {
      if (reference.startsWith("node:")) continue;
      if (reference.startsWith("."))
        queue.push(posix.normalize(posix.join(posix.dirname(path), reference)));
      else if (runtimeDependencies[reference]) external.add(reference);
      else throw Error("PACKAGE_EXTERNAL_MODULE_REFUSED");
    }
  }
  if ([...external].some((name) => !runtimeDependencies[name]))
    throw Error("PACKAGE_DEPENDENCY_UNSUPPORTED");
  return { files, external: [...external].sort() };
}
export function dependencyIntegrity(lock, name, version) {
  const key = `  ${name}@${version}:\n`;
  const section = lock.replaceAll("\r\n", "\n").split(key)[1]?.split("\n\n")[0];
  const integrity = section?.match(
    /resolution: \{integrity: (sha512-[A-Za-z0-9+/]+={0,2})\}/,
  )?.[1];
  if (
    !integrity ||
    !lock.includes(`      ${name}:`) ||
    !lock.includes(`specifier: ${version}`)
  )
    throw Error("PACKAGE_LOCK_DEPENDENCY_MISMATCH");
  return integrity;
}
export function verifyDependencyTarball(archive, integrity) {
  if (
    !Buffer.isBuffer(archive) ||
    archive.length > 32 * 1024 * 1024 ||
    `sha512-${createHash("sha512").update(archive).digest("base64")}` !==
      integrity
  )
    throw Error("PACKAGE_DEPENDENCY_ARCHIVE_INTEGRITY_MISMATCH");
  const tar = gunzipSync(archive, { maxOutputLength: 64 * 1024 * 1024 });
  const files = new Map();
  let offset = 0;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) {
      if (!tar.subarray(offset).every((byte) => byte === 0))
        throw Error("PACKAGE_DEPENDENCY_TAR_INVALID");
      return files;
    }
    const text = (start, end) =>
      header.subarray(start, end).toString("utf8").split("\0")[0];
    const octal = (start, end) => {
      const value = text(start, end).trim();
      if (!/^[0-7]+$/.test(value))
        throw Error("PACKAGE_DEPENDENCY_TAR_INVALID");
      return Number.parseInt(value, 8);
    };
    const checksum = octal(148, 156);
    if (
      header.reduce(
        (sum, byte, index) => sum + (index >= 148 && index < 156 ? 32 : byte),
        0,
      ) !== checksum
    )
      throw Error("PACKAGE_DEPENDENCY_TAR_INVALID");
    const prefix = text(345, 500),
      name = (prefix ? prefix + "/" : "") + text(0, 100);
    const size = octal(124, 136),
      type = text(156, 157);
    if (
      !name.startsWith("package/") ||
      !["", "0", "5"].includes(type) ||
      size > 8 * 1024 * 1024 ||
      offset + 512 + size > tar.length
    )
      throw Error("PACKAGE_DEPENDENCY_TAR_INVALID");
    const path = name.slice(8).replace(/\/$/, "");
    if (path) releasePath(path);
    if (type !== "5") {
      if (!path || files.has(path))
        throw Error("PACKAGE_DEPENDENCY_TAR_INVALID");
      files.set(
        path,
        Buffer.from(tar.subarray(offset + 512, offset + 512 + size)),
      );
    }
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  throw Error("PACKAGE_DEPENDENCY_TAR_INVALID");
}
export async function materializeDependency(repoRoot, name, lock, archive) {
  const version = runtimeDependencies[name];
  if (!version) throw Error("PACKAGE_DEPENDENCY_UNSUPPORTED");
  const integrity = dependencyIntegrity(lock, name, version);
  // Resolve only the known pnpm package directory. Symlinks inside its payload
  // are forbidden; no parent/sibling dependency fallback enters the archive.
  const directory = await realpath(
    join(
      repoRoot,
      "node_modules",
      ".pnpm",
      `${name}@${version}`,
      "node_modules",
      name,
    ),
  );
  const expected = resolve(
    repoRoot,
    "node_modules",
    ".pnpm",
    `${name}@${version}`,
    "node_modules",
    name,
  );
  if (directory.toLowerCase() !== expected.toLowerCase())
    throw Error("PACKAGE_DEPENDENCY_ROOT_MISMATCH");
  const metadata = JSON.parse(
    await readFile(join(directory, "package.json"), "utf8"),
  );
  if (
    metadata.name !== name ||
    metadata.version !== version ||
    metadata.license !== "MIT" ||
    Object.keys(metadata.dependencies ?? {}).length ||
    Object.keys(metadata.optionalDependencies ?? {}).length
  )
    throw Error("PACKAGE_DEPENDENCY_METADATA_MISMATCH");
  const entries = [];
  async function walk(path, prefix = "") {
    for (const entry of (await readdir(path, { withFileTypes: true })).sort(
      (a, b) => a.name.localeCompare(b.name),
    )) {
      if (entry.isSymbolicLink())
        throw Error("PACKAGE_DEPENDENCY_LINK_REFUSED");
      const relative = releasePath(prefix + entry.name);
      if (entry.isDirectory())
        await walk(join(path, entry.name), relative + "/");
      else {
        if (
          !entry.isFile() ||
          (await lstat(join(path, entry.name))).size > 8 * 1024 * 1024
        )
          throw Error("PACKAGE_DEPENDENCY_FILE_REFUSED");
        entries.push({
          path: `node_modules/${name}/${relative}`,
          content: await readFile(join(path, entry.name)),
        });
      }
    }
  }
  await walk(directory);
  if (
    !entries.some((entry) =>
      /^node_modules\/[^/]+\/LICENSE(?:\.md)?$/i.test(entry.path),
    )
  )
    throw Error("PACKAGE_DEPENDENCY_LICENSE_REQUIRED");
  if (archive) {
    const published = verifyDependencyTarball(archive, integrity);
    if (
      published.size !== entries.length ||
      entries.some(
        (entry) =>
          !published
            .get(entry.path.slice(`node_modules/${name}/`.length))
            ?.equals(entry.content),
      )
    )
      throw Error("PACKAGE_DEPENDENCY_INSTALLED_BYTES_MISMATCH");
  }
  const inventorySha256 = sha256(
    Buffer.from(
      entries
        .toSorted((a, b) => a.path.localeCompare(b.path))
        .map((entry) => `${entry.path}\0${sha256(entry.content)}\n`)
        .join(""),
    ),
  );
  return {
    entries,
    metadata: { name, version, lockIntegrity: integrity, inventorySha256 },
  };
}
