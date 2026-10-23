import { createHash, createPublicKey, verify } from "node:crypto";
import { inflateRawSync } from "node:zlib";

export const NODE_VERSION = "24.22.1";
const MAX_ARCHIVE = 256 * 1024 * 1024;
const MAX_EXPANDED = 768 * 1024 * 1024;
export const sha256 = (value) =>
  createHash("sha256").update(value).digest("hex");
const fail = (reason) => {
  throw Error(reason);
};
const hash = (value) => /^[a-f0-9]{64}$/.test(value ?? "");
const bytes = (value, maximum = MAX_ARCHIVE) =>
  Number.isSafeInteger(value) && value > 0 && value <= maximum;
function keys(value, expected) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !expected.includes(key))
  )
    fail("RELEASE_FIELDS_INVALID");
}
export function releasePath(value) {
  if (
    typeof value !== "string" ||
    value.length > 240 ||
    !/^[a-zA-Z0-9._/-]+$/.test(value) ||
    value.includes("\\") ||
    value.startsWith("/") ||
    value.endsWith("/") ||
    value
      .split("/")
      .some(
        (part) =>
          !part ||
          part === "." ||
          part === ".." ||
          part.endsWith(".") ||
          /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part),
      )
  )
    fail("RELEASE_PATH_INVALID");
  return value;
}
function safeUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    fail("RELEASE_URL_INVALID");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    url.search ||
    url.hash ||
    url.href !== value
  )
    fail("RELEASE_URL_INVALID");
  return url;
}
export function validateTrust(trust) {
  keys(trust, [
    "schemaVersion",
    "publicKeyPem",
    "packageUrlPrefix",
    "authenticodeSha256",
    "minimumSequence",
  ]);
  if (
    trust.schemaVersion !== 1 ||
    !hash(trust.authenticodeSha256) ||
    !Number.isSafeInteger(trust.minimumSequence) ||
    trust.minimumSequence < 1
  )
    fail("RELEASE_TRUST_REQUIRED");
  const prefix = safeUrl(trust.packageUrlPrefix);
  // A local, separately reviewed trust file grants one static download path.
  // GitHub redirecting release URLs are deliberately unsuitable here.
  if (
    !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(prefix.hostname) ||
    !/^\/(?:[A-Za-z0-9_.-]+\/)+$/.test(prefix.pathname)
  )
    fail("RELEASE_TRUST_URL_INVALID");
  let publicKey;
  try {
    publicKey = createPublicKey(trust.publicKeyPem);
  } catch {
    fail("RELEASE_TRUST_REQUIRED");
  }
  if (publicKey.asymmetricKeyType !== "ed25519") fail("RELEASE_TRUST_REQUIRED");
  return publicKey;
}
function artifact(value) {
  keys(value, ["url", "sha256", "bytes"]);
  if (!hash(value.sha256) || !bytes(value.bytes))
    fail("RELEASE_ARTIFACT_INVALID");
  safeUrl(value.url);
}
export function validateManifest(manifest, trust) {
  validateTrust(trust);
  keys(manifest, [
    "schemaVersion",
    "sequence",
    "version",
    "commit",
    "platform",
    "node",
    "package",
    "downloadBytes",
    "expandedBytes",
    "requiresRestart",
  ]);
  if (
    manifest.schemaVersion !== 1 ||
    manifest.platform !== "win32-x64" ||
    !Number.isSafeInteger(manifest.sequence) ||
    manifest.sequence < trust.minimumSequence ||
    !/^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-zA-Z0-9.-]+)?$/.test(
      manifest.version ?? "",
    ) ||
    !/^[a-f0-9]{40}$/.test(manifest.commit ?? "") ||
    manifest.requiresRestart !== true
  )
    fail("RELEASE_MANIFEST_INVALID");
  keys(manifest.node, [
    "version",
    "archive",
    "executableSha256",
    "executableBytes",
    "authenticodeSha256",
  ]);
  artifact(manifest.node.archive);
  if (
    manifest.node.version !== NODE_VERSION ||
    manifest.node.archive.url !==
      `https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-win-x64.zip` ||
    !hash(manifest.node.executableSha256) ||
    !bytes(manifest.node.executableBytes) ||
    manifest.node.authenticodeSha256 !== trust.authenticodeSha256
  )
    fail("RELEASE_RUNTIME_INVALID");
  keys(manifest.package, [
    "archive",
    "lockSha256",
    "entrypoint",
    "files",
    "distribution",
    "dependencies",
  ]);
  artifact(manifest.package.archive);
  if (
    !manifest.package.archive.url.startsWith(trust.packageUrlPrefix) ||
    !/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+\.zip$/.test(
      manifest.package.archive.url.slice(trust.packageUrlPrefix.length),
    ) ||
    !hash(manifest.package.lockSha256) ||
    manifest.package.entrypoint !== "scripts/companion.mjs" ||
    !Array.isArray(manifest.package.files) ||
    !manifest.package.files.length ||
    manifest.package.files.length > 12000
  )
    fail("RELEASE_PACKAGE_INVALID");
  const names = new Set();
  let expanded = 0;
  for (const file of manifest.package.files) {
    keys(file, ["path", "sha256", "bytes"]);
    releasePath(file.path);
    const key = file.path.toLowerCase();
    if (
      names.has(key) ||
      !hash(file.sha256) ||
      !bytes(file.bytes, MAX_EXPANDED)
    )
      fail("RELEASE_FILE_INVALID");
    names.add(key);
    expanded += file.bytes;
  }
  if (
    !["source", "runtime"].includes(manifest.package.distribution) ||
    !Array.isArray(manifest.package.dependencies)
  )
    fail("RELEASE_DISTRIBUTION_INVALID");
  const dependencies = manifest.package.dependencies;
  if (manifest.package.distribution === "source" && dependencies.length)
    fail("RELEASE_DEPENDENCY_INVALID");
  if (manifest.package.distribution === "runtime") {
    if (
      dependencies.length < 1 ||
      dependencies.length > 2 ||
      !dependencies.some((item) => item.name === "zod") ||
      new Set(dependencies.map((item) => item.name)).size !==
        dependencies.length
    )
      fail("RELEASE_DEPENDENCY_INVALID");
    for (const dependency of dependencies) {
      keys(dependency, ["name", "version", "lockIntegrity", "inventorySha256"]);
      const { name } = dependency;
      const version = { jose: "6.2.12", zod: "4.6.6" }[name];
      const inventory = manifest.package.files
        .filter((file) => file.path.startsWith(`node_modules/${name}/`))
        .sort((a, b) => a.path.localeCompare(b.path));
      if (
        !version ||
        dependency.version !== version ||
        !/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(dependency.lockIntegrity) ||
        !inventory.some(
          (file) => file.path === `node_modules/${name}/package.json`,
        ) ||
        !inventory.some((file) =>
          /^node_modules\/[^/]+\/LICENSE(?:\.md)?$/i.test(file.path),
        ) ||
        sha256(
          Buffer.from(
            inventory.map((file) => `${file.path}\0${file.sha256}\n`).join(""),
          ),
        ) !== dependency.inventorySha256
      )
        fail("RELEASE_DEPENDENCY_INVALID");
    }
  }
  if (
    manifest.package.files.some(
      (file) =>
        file.path.startsWith("node_modules/") &&
        (manifest.package.distribution !== "runtime" ||
          !dependencies.some((dependency) =>
            file.path.startsWith(`node_modules/${dependency.name}/`),
          )),
    )
  )
    fail("RELEASE_DEPENDENCY_INVALID");
  if (
    !names.has("pnpm-lock.yaml") ||
    !names.has(manifest.package.entrypoint) ||
    manifest.package.files.find((file) => file.path === "pnpm-lock.yaml")
      ?.sha256 !== manifest.package.lockSha256 ||
    manifest.downloadBytes !==
      manifest.node.archive.bytes + manifest.package.archive.bytes ||
    !bytes(manifest.expandedBytes, MAX_EXPANDED) ||
    manifest.expandedBytes !== expanded + manifest.node.executableBytes
  )
    fail("RELEASE_SIZE_OR_LOCK_INVALID");
  return manifest;
}
export function verifyRelease(raw, detachedSignature, trust) {
  if (
    !Buffer.isBuffer(raw) ||
    raw.length > 2 * 1024 * 1024 ||
    !Buffer.isBuffer(detachedSignature) ||
    detachedSignature.length !== 64
  )
    fail("RELEASE_SIGNATURE_REQUIRED");
  const publicKey = validateTrust(trust);
  if (!verify(null, raw, publicKey, detachedSignature))
    fail("RELEASE_SIGNATURE_INVALID");
  let manifest;
  try {
    manifest = JSON.parse(raw.toString("utf8"));
  } catch {
    fail("RELEASE_JSON_INVALID");
  }
  validateManifest(manifest, trust);
  return {
    manifest,
    releaseId: `${manifest.sequence}-${sha256(raw).slice(0, 24)}`,
    manifestSha256: sha256(raw),
  };
}
export function verifyArtifact(data, descriptor) {
  if (
    !Buffer.isBuffer(data) ||
    data.length !== descriptor.bytes ||
    sha256(data) !== descriptor.sha256
  )
    fail("RELEASE_ARTIFACT_MISMATCH");
  return data;
}
// ZIP reader deliberately rejects ZIP64, encryption, symlinks and extra records.
// The signed inventory determines every extracted path and uncompressed bound.
export function readZip(data, inventory) {
  if (!Buffer.isBuffer(data) || data.length > MAX_ARCHIVE || data.length < 22)
    fail("RELEASE_ZIP_INVALID");
  const end = data.length - 22;
  if (
    data.readUInt32LE(end) !== 0x06054b50 ||
    data.readUInt16LE(end + 4) !== 0 ||
    data.readUInt16LE(end + 6) !== 0 ||
    data.readUInt16LE(end + 20) !== 0
  )
    fail("RELEASE_ZIP_INVALID");
  const count = data.readUInt16LE(end + 10);
  const start = data.readUInt32LE(end + 16);
  if (
    count !== data.readUInt16LE(end + 8) ||
    count > 12000 ||
    start + data.readUInt32LE(end + 12) !== end
  )
    fail("RELEASE_ZIP_INVALID");
  const expected = new Map(
    inventory.map((file) => [releasePath(file.path), file]),
  );
  const results = new Map();
  const names = new Set();
  let cursor = start;
  for (let index = 0; index < count; index++) {
    if (cursor + 46 > end || data.readUInt32LE(cursor) !== 0x02014b50)
      fail("RELEASE_ZIP_INVALID");
    const flags = data.readUInt16LE(cursor + 8),
      method = data.readUInt16LE(cursor + 10);
    const compressed = data.readUInt32LE(cursor + 20),
      size = data.readUInt32LE(cursor + 24);
    const nameLength = data.readUInt16LE(cursor + 28),
      extraLength = data.readUInt16LE(cursor + 30),
      commentLength = data.readUInt16LE(cursor + 32);
    const local = data.readUInt32LE(cursor + 42),
      mode = data.readUInt32LE(cursor + 38) >>> 16;
    if (
      cursor + 46 + nameLength + extraLength + commentLength > end ||
      flags & ~0x808 ||
      ![0, 8].includes(method) ||
      data.readUInt16LE(cursor + 34) !== 0 ||
      (mode & 0xf000) === 0xa000
    )
      fail("RELEASE_ZIP_UNSUPPORTED");
    const name = data
      .subarray(cursor + 46, cursor + 46 + nameLength)
      .toString("utf8");
    const directory = name.endsWith("/");
    releasePath(directory ? name.slice(0, -1) : name);
    const folded = name.toLowerCase();
    if (names.has(folded)) fail("RELEASE_ZIP_DUPLICATE");
    names.add(folded);
    if (
      local + 30 > start ||
      data.readUInt32LE(local) !== 0x04034b50 ||
      data.readUInt16LE(local + 6) !== flags ||
      data.readUInt16LE(local + 8) !== method
    )
      fail("RELEASE_ZIP_INVALID");
    const localNameLength = data.readUInt16LE(local + 26),
      localExtraLength = data.readUInt16LE(local + 28);
    const body = local + 30 + localNameLength + localExtraLength;
    if (
      body + compressed > start ||
      data
        .subarray(local + 30, local + 30 + localNameLength)
        .toString("utf8") !== name
    )
      fail("RELEASE_ZIP_INVALID");
    const descriptor = expected.get(name);
    // Runtime archives contain unused npm/docs files. Validate their paths but
    // extract only signed requested entries. Never invoke an archive tool.
    if (descriptor) {
      if (size !== descriptor.bytes || !bytes(size, MAX_EXPANDED))
        fail("RELEASE_ZIP_SIZE_INVALID");
      const encoded = data.subarray(body, body + compressed);
      const content =
        method === 0
          ? Buffer.from(encoded)
          : inflateRawSync(encoded, { maxOutputLength: size });
      verifyArtifact(content, descriptor);
      results.set(name, content);
    }
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  if (cursor !== end || results.size !== expected.size)
    fail("RELEASE_ZIP_MISSING_FILE");
  return results;
}
// Deterministic stored ZIP output. Package builder supplies an explicit inventory.
export function writeZip(entries) {
  if (!entries.length || entries.length > 12000) fail("RELEASE_ZIP_INVALID");
  const locals = [],
    central = [];
  let offset = 0;
  const crcTable = Array.from({ length: 256 }, (_, index) => {
    let value = index;
    for (let bit = 0; bit < 8; bit++)
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    return value >>> 0;
  });
  for (const entry of entries) {
    const name = Buffer.from(releasePath(entry.path));
    const content = Buffer.from(entry.content);
    let crc = 0xffffffff;
    for (const byte of content)
      crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
    crc = (crc ^ 0xffffffff) >>> 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(content.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, content);
    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50);
    record.writeUInt16LE(20, 4);
    record.writeUInt16LE(20, 6);
    record.writeUInt32LE(crc, 16);
    record.writeUInt32LE(content.length, 20);
    record.writeUInt32LE(content.length, 24);
    record.writeUInt16LE(name.length, 28);
    record.writeUInt32LE(offset, 42);
    central.push(record, name);
    offset += local.length + name.length + content.length;
  }
  const directory = Buffer.concat(central),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  const result = Buffer.concat([...locals, directory, end]);
  if (result.length > MAX_ARCHIVE) fail("RELEASE_PACKAGE_TOO_LARGE");
  return result;
}
