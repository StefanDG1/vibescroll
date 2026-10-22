import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign, createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  mkdtemp,
  rm,
  readFile,
  writeFile,
  mkdir,
  symlink,
  readdir,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, relative, isAbsolute, sep, dirname } from "node:path";
import {
  createInstaller,
  downloadArtifact,
} from "../packages/companion/installer.mjs";
import {
  NODE_VERSION,
  sha256,
  verifyRelease,
  readZip,
  writeZip,
  releasePath,
} from "../packages/companion/release.mjs";
import { companionPrivatePath } from "../packages/companion/config-root.mjs";
import { buildCompanionPackage } from "../scripts/build-companion-package.mjs";
import {
  runtimeSourceInventory,
  materializeDependency,
  dependencyIntegrity,
  verifyDependencyTarball,
  moduleReferences,
} from "../packages/companion/runtime-package.mjs";

const keys = generateKeyPairSync("ed25519");
const execute = promisify(execFile);
const trust = {
  schemaVersion: 1,
  publicKeyPem: keys.publicKey
    .export({ format: "pem", type: "spki" })
    .toString(),
  packageUrlPrefix: "https://downloads.example.invalid/companion/",
  authenticodeSha256: "a".repeat(64),
  minimumSequence: 1,
};
const node = Buffer.from("synthetic non-executable fixture, not signed Node");
const runtimeArchive = writeZip([
  { path: `node-v${NODE_VERSION}-win-x64/node.exe`, content: node },
]);
const descriptor = (url, content) => ({
  url,
  bytes: content.length,
  sha256: sha256(content),
});
test("module graph parses side-effect, re-export and commented dynamic imports and refuses unknown or computed dependencies", async () => {
  const code = `import './side.mjs'; export * from './all.mjs'; export {x} from './named.mjs'; import /* comment */ ('./dynamic.mjs'); new URL('./asset.py', import.meta.url); const harmless="import 'ignored'";`;
  assert.deepEqual(moduleReferences(code, "scripts/test.mjs"), [
    "./side.mjs",
    "./all.mjs",
    "./named.mjs",
    "./dynamic.mjs",
    "./asset.py",
  ]);
  assert.throws(
    () => moduleReferences("import /*comment*/ (computed)", "scripts/test.mjs"),
    /COMPUTED_IMPORT_REFUSED/,
  );
  assert.throws(
    () => moduleReferences("require('./module.cjs')", "scripts/test.mjs"),
    /IMPORT_SYNTAX_UNSUPPORTED/,
  );
  await assert.rejects(
    runtimeSourceInventory(async (path) =>
      Buffer.from(
        path === "scripts/companion.mjs"
          ? "import 'unexpected-package';"
          : "// fixture",
      ),
    ),
    /EXTERNAL_MODULE_REFUSED/,
  );
  const graph = await runtimeSourceInventory(async (path) =>
    Buffer.from(
      path === "scripts/companion.mjs"
        ? "import /*comment*/ ('./side.mjs');"
        : "// fixture",
    ),
  );
  assert.ok(graph.files.has("scripts/side.mjs"));
});
function tarFixture(path, content, type = "0") {
  const header = Buffer.alloc(512);
  header.write(path, 0, 100);
  header.write("0000644\0", 100);
  header.write("0000000\0", 108);
  header.write("0000000\0", 116);
  header.write(content.length.toString(8).padStart(11, "0") + "\0", 124);
  header.write("00000000000\0", 136);
  header.fill(32, 148, 156);
  header.write(type, 156);
  header.write("ustar\0", 257);
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  header.write(checksum.toString(8).padStart(6, "0") + "\0 ", 148);
  const padding = Buffer.alloc((512 - (content.length % 512)) % 512);
  const archive = gzipSync(
    Buffer.concat([header, content, padding, Buffer.alloc(1024)]),
  );
  return {
    archive,
    integrity:
      "sha512-" + createHash("sha512").update(archive).digest("base64"),
  };
}
test("offline dependency tarballs bind lock integrity and refuse linked or traversing package entries", () => {
  const content = Buffer.from("synthetic dependency");
  const valid = tarFixture("package/index.js", content);
  assert.deepEqual(
    verifyDependencyTarball(valid.archive, valid.integrity).get("index.js"),
    content,
  );
  const traversal = tarFixture("package/../outside", content);
  assert.throws(
    () => verifyDependencyTarball(traversal.archive, traversal.integrity),
    /PATH_INVALID/,
  );
  const linked = tarFixture("package/index.js", content, "2");
  assert.throws(
    () => verifyDependencyTarball(linked.archive, linked.integrity),
    /TAR_INVALID/,
  );
});
function fixture(sequence = 1, distribution = "source") {
  const entries = [
    {
      path: "scripts/companion.mjs",
      content: Buffer.from(`// synthetic fixture release ${sequence}\n`),
    },
    {
      path: "pnpm-lock.yaml",
      content: Buffer.from("synthetic lock fixture\n"),
    },
    {
      path: "package.json",
      content: Buffer.from('{"version":"0.1.0-alpha.1","type":"module"}'),
    },
  ];
  const dependencies = [];
  if (distribution === "runtime")
    for (const [name, version] of [
      ["jose", "6.2.12"],
      ["zod", "4.6.1"],
    ]) {
      const files = [
        {
          path: `node_modules/${name}/package.json`,
          content: Buffer.from(
            JSON.stringify({ name, version, type: "module" }),
          ),
        },
        {
          path: `node_modules/${name}/LICENSE`,
          content: Buffer.from("MIT synthetic fixture"),
        },
        {
          path: `node_modules/${name}/index.js`,
          content: Buffer.from("export const synthetic=true;"),
        },
      ];
      entries.push(...files);
      dependencies.push({
        name,
        version,
        lockIntegrity: "sha512-" + "A".repeat(86) + "==",
        inventorySha256: sha256(
          Buffer.from(
            files
              .toSorted((a, b) => a.path.localeCompare(b.path))
              .map((entry) => `${entry.path}\0${sha256(entry.content)}\n`)
              .join(""),
          ),
        ),
      });
    }
  const packageArchive = writeZip(entries);
  const manifest = {
    schemaVersion: 1,
    sequence,
    version: "0.1.0-alpha.1",
    commit: "c".repeat(40),
    platform: "win32-x64",
    node: {
      version: NODE_VERSION,
      archive: descriptor(
        `https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-win-x64.zip`,
        runtimeArchive,
      ),
      executableSha256: sha256(node),
      executableBytes: node.length,
      authenticodeSha256: trust.authenticodeSha256,
    },
    package: {
      archive: descriptor(
        `${trust.packageUrlPrefix}fixture-${sequence}/companion.zip`,
        packageArchive,
      ),
      lockSha256: sha256(entries[1].content),
      entrypoint: "scripts/companion.mjs",
      files: entries.map((entry) => ({
        path: entry.path,
        bytes: entry.content.length,
        sha256: sha256(entry.content),
      })),
      distribution,
      dependencies,
    },
    downloadBytes: packageArchive.length + runtimeArchive.length,
    expandedBytes: entries.reduce(
      (sum, file) => sum + file.content.length,
      node.length,
    ),
    requiresRestart: true,
  };
  const raw = Buffer.from(JSON.stringify(manifest));
  return {
    raw,
    signature: sign(null, raw, keys.privateKey),
    trust,
    packageArchive,
    runtimeArchive,
    manifest,
    releaseId: verifyRelease(raw, sign(null, raw, keys.privateKey), trust)
      .releaseId,
  };
}
async function temporary(work) {
  const temporaryRoot = await mkdtemp(
    join(tmpdir(), "vibescroll-installer-fixture-"),
  );
  try {
    await work(temporaryRoot);
  } finally {
    const remainder = relative(resolve(tmpdir()), resolve(temporaryRoot));
    assert.ok(
      remainder &&
        !isAbsolute(remainder) &&
        !remainder.startsWith(`..${sep}`) &&
        remainder.startsWith("vibescroll-installer-fixture-"),
    );
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}
function installer(root, overrides = {}) {
  return createInstaller({
    localAppData: root,
    platform: "win32",
    architecture: "x64",
    freeBytes: async () => 1024 * 1024 * 1024,
    running: async () => false,
    verifyAuthenticode: async (path, signer) => {
      assert.deepEqual(await readFile(path), node);
      assert.equal(signer, trust.authenticodeSha256);
    },
    ...overrides,
  });
}
test("release trust rejects missing, altered, foreign-key and stale signed metadata before installation", () => {
  const release = fixture();
  assert.throws(
    () => verifyRelease(release.raw, Buffer.alloc(0), trust),
    /SIGNATURE_REQUIRED/,
  );
  assert.throws(
    () =>
      verifyRelease(
        Buffer.concat([release.raw, Buffer.from(" ")]),
        release.signature,
        trust,
      ),
    /SIGNATURE_INVALID/,
  );
  assert.throws(
    () =>
      verifyRelease(
        release.raw,
        sign(null, release.raw, generateKeyPairSync("ed25519").privateKey),
        trust,
      ),
    /SIGNATURE_INVALID/,
  );
  assert.throws(
    () =>
      verifyRelease(release.raw, release.signature, {
        ...trust,
        minimumSequence: 2,
      }),
    /MANIFEST_INVALID/,
  );
  assert.throws(
    () =>
      verifyRelease(release.raw, release.signature, {
        ...trust,
        packageUrlPrefix: "http://localhost/releases/",
      }),
    /URL_INVALID/,
  );
});
test("paths and ZIP extraction reject traversal, Windows devices, alternate streams, duplicate case and unexpected bytes", () => {
  for (const path of [
    "../outside",
    "/outside",
    "C:/outside",
    "a\\b",
    "a/../b",
    "a/NUL.txt",
    "a/foo.",
    "a//b",
    "a:stream",
  ])
    assert.throws(() => releasePath(path), /PATH_INVALID/);
  const content = Buffer.from("good");
  const expected = [
    { path: "safe.txt", bytes: content.length, sha256: sha256(content) },
  ];
  assert.deepEqual(
    readZip(writeZip([{ path: "safe.txt", content }]), expected).get(
      "safe.txt",
    ),
    content,
  );
  assert.throws(
    () =>
      readZip(
        writeZip([{ path: "safe.txt", content: Buffer.from("evil") }]),
        expected,
      ),
    /ARTIFACT_MISMATCH/,
  );
  assert.throws(
    () =>
      readZip(
        writeZip([
          { path: "safe.txt", content },
          { path: "SAFE.txt", content },
        ]),
        expected,
      ),
    /ZIP_DUPLICATE/,
  );
  assert.throws(
    () => readZip(writeZip([{ path: "other.txt", content }]), expected),
    /MISSING_FILE/,
  );
});
test("stage, update and rollback verify actual bytes and preserve credentials outside immutable releases", async () =>
  temporary(async (root) => {
    const api = installer(root);
    await mkdir(api.configRoot, { recursive: true });
    const credential = join(api.configRoot, "do-not-copy.json");
    await writeFile(credential, "synthetic credential sentinel");
    const first = fixture(1),
      second = fixture(2);
    const staged = await api.stage(first);
    assert.equal(staged.downloadBytes, first.manifest.downloadBytes);
    assert.equal(await api.current(), null);
    assert.equal(
      (await api.activate({ releaseId: first.releaseId, trust }))
        .processingAuthorized,
      false,
    );
    await assert.rejects(api.stage(second), /RESTART_APPROVAL_REQUIRED/);
    await api.stage({ ...second, restartApproved: true });
    await api.activate({
      releaseId: second.releaseId,
      trust,
      restartApproved: true,
    });
    assert.deepEqual(await api.current(), {
      releaseId: second.releaseId,
      previous: first.releaseId,
    });
    await api.rollback({ trust, restartApproved: true });
    assert.equal((await api.current()).releaseId, first.releaseId);
    assert.equal(
      await readFile(credential, "utf8"),
      "synthetic credential sentinel",
    );
    await assert.rejects(
      api.execution({ trust }),
      /RUNTIME_DISTRIBUTION_REQUIRED/,
    );
    const directories = await readdir(api.installRoot);
    assert.ok(
      directories.every(
        (name) => !name.startsWith("staging-") && name !== "installer.lock",
      ),
    );
  }));
test("wrong archive hash, executable signature and running worker never activate or retain a partial stage", async () =>
  temporary(async (root) => {
    const release = fixture();
    const api = installer(root);
    await assert.rejects(
      api.stage({
        ...release,
        packageArchive: Buffer.alloc(release.packageArchive.length),
      }),
      /ARTIFACT_MISMATCH/,
    );
    assert.equal(await api.current(), null);
    const badSigner = installer(root, {
      verifyAuthenticode: async () => {
        throw Error("INSTALL_AUTHENTICODE_MISMATCH");
      },
    });
    await assert.rejects(badSigner.stage(release), /AUTHENTICODE_MISMATCH/);
    assert.deepEqual(await readdir(join(api.installRoot, "releases")), []);
    assert.ok(
      !(await readdir(api.installRoot)).some((name) =>
        name.startsWith("staging-"),
      ),
    );
    await assert.rejects(
      installer(root, { running: async () => true }).stage(release),
      /STOP_COMPANION_FIRST/,
    );
    await assert.rejects(
      installer(root, { freeBytes: async () => 0 }).stage(release),
      /SPACE_INSUFFICIENT/,
    );
  }));
test("rollback and runtime execution refuse tampering without moving the current pointer", async () =>
  temporary(async (root) => {
    const api = installer(root),
      first = fixture(1, "runtime"),
      second = fixture(2, "runtime");
    await api.stage(first);
    await api.activate({ releaseId: first.releaseId, trust });
    const plan = await api.execution({ trust });
    assert.ok(plan.executable.startsWith(api.installRoot));
    assert.equal(plan.configRoot, api.configRoot);
    await api.stage({ ...second, restartApproved: true });
    await api.activate({
      releaseId: second.releaseId,
      trust,
      restartApproved: true,
    });
    await writeFile(
      join(
        api.installRoot,
        "releases",
        first.releaseId,
        "app",
        "scripts",
        "companion.mjs",
      ),
      "tampered",
    );
    await assert.rejects(
      api.rollback({ trust, restartApproved: true }),
      /ARTIFACT_MISMATCH/,
    );
    assert.equal((await api.current()).releaseId, second.releaseId);
    await writeFile(
      join(api.installRoot, "releases", second.releaseId, "app", "extra.js"),
      "unlisted",
    );
    await assert.rejects(api.execution({ trust }), /UNLISTED_FILE_REFUSED/);
  }));
test("installation root junctions and internal config overrides are refused", async () =>
  temporary(async (root) => {
    const outside = join(root, "outside");
    await mkdir(outside);
    await mkdir(join(root, "VibeScroll", "Companion"), { recursive: true });
    await symlink(
      outside,
      join(root, "VibeScroll", "Companion", "releases"),
      process.platform === "win32" ? "junction" : "dir",
    );
    await assert.rejects(
      installer(root).stage(fixture()),
      /REPARSE_PATH_REFUSED/,
    );
    const environment = {
      LOCALAPPDATA: root,
      VIBESCROLL_COMPANION_CONFIG_ROOT: join(
        root,
        "VibeScroll",
        "Companion",
        "secrets",
      ),
    };
    assert.throws(
      () =>
        companionPrivatePath("subscription-session.json", root, environment),
      /INSIDE_INSTALL_REFUSED/,
    );
    assert.throws(
      () =>
        companionPrivatePath(
          "subscription-session.json",
          join(root, "VibeScroll", "Companion", "releases", "fixture", "app"),
          { LOCALAPPDATA: root },
        ),
      /EXTERNAL_CONFIG_REQUIRED/,
    );
    environment.VIBESCROLL_COMPANION_CONFIG_ROOT = join(
      root,
      "VibeScroll",
      "CompanionConfig",
    );
    assert.equal(
      companionPrivatePath("subscription-session.json", root, environment),
      join(
        environment.VIBESCROLL_COMPANION_CONFIG_ROOT,
        "subscription-session.json",
      ),
    );
  }));
test("explicit downloads refuse redirects, wrong lengths and oversized streaming responses", async () => {
  const descriptor = fixture().manifest.package.archive;
  await assert.rejects(
    downloadArtifact(descriptor, async (_url, options) => {
      assert.equal(options.redirect, "error");
      return { ok: true, redirected: true };
    }),
    /DOWNLOAD_REFUSED/,
  );
  await assert.rejects(
    downloadArtifact(
      descriptor,
      async () => new Response(Buffer.alloc(descriptor.bytes + 1)),
    ),
    /DOWNLOAD_TOO_LARGE/,
  );
  await assert.rejects(
    downloadArtifact(
      descriptor,
      async () => new Response("wrong", { headers: { "content-length": "5" } }),
    ),
    /DOWNLOAD_REFUSED/,
  );
  const release = fixture();
  assert.deepEqual(
    await downloadArtifact(
      descriptor,
      async () => new Response(release.packageArchive),
    ),
    release.packageArchive,
  );
});
test("package builder binds commit, version, lock and runtime bytes and emits no signature", async () => {
  const release = fixture();
  const files = readZip(release.packageArchive, release.manifest.package.files);
  const spec = {
    files: [...files.keys()],
    distribution: "source",
    version: release.manifest.version,
    commit: release.manifest.commit,
    sequence: 1,
    node: release.manifest.node,
    packageUrl: release.manifest.package.archive.url,
  };
  const output = await buildCompanionPackage({
    spec,
    trust,
    source: async (path) => files.get(path),
    runtimeArchive,
    verifyAuthenticode: async (content) => assert.deepEqual(content, node),
  });
  const manifest = JSON.parse(output.raw);
  assert.equal(
    manifest.package.lockSha256,
    release.manifest.package.lockSha256,
  );
  assert.equal(manifest.commit, spec.commit);
  assert.equal(output.signature, undefined);
  await assert.rejects(
    buildCompanionPackage({
      spec: { ...spec, version: "9.9.9" },
      trust,
      source: async (path) => files.get(path),
      runtimeArchive,
      verifyAuthenticode: async () => {},
    }),
    /VERSION_MISMATCH/,
  );
});
test("runtime inventory follows the actual Node graph and materializes only pinned self-contained production dependencies", async () => {
  const repo = resolve(import.meta.dirname, "..");
  const graph = await runtimeSourceInventory((path) =>
    readFile(join(repo, path)),
  );
  assert.deepEqual(graph.external, ["zod"]);
  assert.ok(!graph.files.has("packages/runner/chatgpt-local.mjs"));
  for (const path of [
    "scripts/start-subscription-session.mjs",
    "packages/runner/assistant-runner.mjs",
    "packages/runner/vault.ps1",
    "packages/runner/chatgpt-storage.ps1",
    "packages/media/local_whisper.py",
  ])
    assert.ok(graph.files.has(path), path);
  const lock = await readFile(join(repo, "pnpm-lock.yaml"), "utf8");
  for (const name of graph.external) {
    const dependency = await materializeDependency(repo, name, lock);
    assert.ok(dependency.entries.length > 10);
    assert.ok(
      dependency.entries.every((entry) =>
        entry.path.startsWith(`node_modules/${name}/`),
      ),
    );
    assert.match(dependency.metadata.lockIntegrity, /^sha512-/);
  }
  assert.throws(
    () => dependencyIntegrity(lock, "jose", "0.0.0"),
    /LOCK_DEPENDENCY_MISMATCH/,
  );
});
test("native Node imports companion and assistant modules without starting a worker or acquiring provider authority", async () => {
  const assistant = await import("../packages/runner/assistant-local.mjs");
  const personal = await import("../packages/runner/personal-analysis.mjs");
  const companion = await import("../scripts/companion.mjs");
  assert.equal(typeof assistant.strictSchema, "function");
  assert.equal(typeof personal.OfficialPersonalClient, "function");
  assert.equal(typeof companion.inspectCompanion, "function");
});
test("runtime builder includes the complete real module graph and pinned dependency payload without a runtime package-manager install", async () => {
  const repo = resolve(import.meta.dirname, "..");
  const source = (path) => readFile(join(repo, path));
  const graph = await runtimeSourceInventory(source);
  const lock = (await source("pnpm-lock.yaml")).toString("utf8");
  const dependencies = await Promise.all(
    graph.external.map((name) => materializeDependency(repo, name, lock)),
  );
  const sample = fixture();
  const version = JSON.parse(
    (await source("package.json")).toString("utf8"),
  ).version;
  const spec = {
    files: [...graph.files.keys()],
    distribution: "runtime",
    version,
    commit: "c".repeat(40),
    sequence: 3,
    node: sample.manifest.node,
    packageUrl: `${trust.packageUrlPrefix}fixture-3/companion.zip`,
  };
  const output = await buildCompanionPackage({
    spec,
    trust,
    source,
    dependencies,
    runtimeArchive,
    verifyAuthenticode: async (content) => assert.deepEqual(content, node),
  });
  const release = verifyRelease(
    output.raw,
    sign(null, output.raw, keys.privateKey),
    trust,
  );
  const extracted = readZip(output.archive, release.manifest.package.files);
  assert.ok(!extracted.has("node_modules/jose/dist/webapi/index.js"));
  assert.ok(extracted.has("node_modules/zod/index.js"));
  assert.ok(extracted.has("packages/media/acquisition-runtime.ts"));
  assert.ok(extracted.has("packages/runner/personal-runner.mjs"));
  assert.ok(extracted.has("contracts/source-insight-v2.schema.json"));
  assert.ok(!extracted.has("packages/policy/index.ts"));
  assert.ok(![...extracted.keys()].some((path) => path.startsWith("private/")));
  await temporary(async (directory) => {
    for (const [path, content] of extracted) {
      const destination = join(directory, path);
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, content, { flag: "wx" });
    }
    // Import the actual extracted package outside the checkout, with global
    // module search disabled and the offline guard inherited. No runner starts.
    const { stdout } = await execute(
      process.execPath,
      [
        "--no-global-search-paths",
        "--no-addons",
        "--input-type=module",
        "--eval",
        'await import("./packages/runner/assistant-local.mjs"); await import("./packages/runner/personal-analysis.mjs"); await import("./scripts/companion.mjs"); console.log("isolated-package-import-passed");',
      ],
      {
        cwd: directory,
        env: { ...process.env, NODE_PATH: "" },
        windowsHide: true,
        shell: false,
        timeout: 15000,
      },
    );
    assert.match(stdout, /isolated-package-import-passed/);
  });
  assert.throws(
    () =>
      verifyDependencyTarball(
        Buffer.from("tampered"),
        dependencies[0].metadata.lockIntegrity,
      ),
    /ARCHIVE_INTEGRITY_MISMATCH/,
  );
});
test(
  "bootstrap metadata snapshots retain verified bytes after an external-file swap and reject oversize input before copying",
  { skip: process.platform !== "win32" },
  async () =>
    temporary(async (directory) => {
      const original = join(directory, "external-release.json"),
        snapshot = join(directory, "staged-release.json");
      const oversized = join(directory, "oversized.json"),
        rejected = join(directory, "rejected.json");
      const release = fixture();
      await writeFile(original, release.raw);
      await writeFile(oversized, Buffer.alloc(65));
      const script = `
$ErrorActionPreference='Stop'
$tokens=$null; $errors=$null
$ast=[Management.Automation.Language.Parser]::ParseFile($env:VIBE_BOOTSTRAP_SOURCE,[ref]$tokens,[ref]$errors)
if($errors.Count -ne 0){throw 'fixture parser error'}
foreach($name in @('Assert-PlainPath','Copy-Bounded')){
  $definition=$ast.Find({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name},$true)
  . ([ScriptBlock]::Create($definition.Extent.Text))
}
# Only extracted helper functions execute. No bootstrap body, signer or install.
Copy-Bounded $env:VIBE_ORIGINAL $env:VIBE_SNAPSHOT 2097152
[IO.File]::WriteAllText($env:VIBE_ORIGINAL,'{"unsigned":"replacement"}')
$blocked=$false
try { Copy-Bounded $env:VIBE_OVERSIZED $env:VIBE_REJECTED 64 } catch { if($_.Exception.Message -eq 'BOOTSTRAP_METADATA_SIZE_INVALID'){$blocked=$true}else{throw} }
if(-not $blocked -or (Test-Path -LiteralPath $env:VIBE_REJECTED)){throw 'fixture oversized input copied'}
Write-Output 'snapshot-preserved'
`;
      const { stdout } = await execute(
        join(
          process.env.SystemRoot ?? "C:\\Windows",
          "System32/WindowsPowerShell/v1.0/powershell.exe",
        ),
        [
          "-NoProfile",
          "-NonInteractive",
          "-EncodedCommand",
          Buffer.from(script, "utf16le").toString("base64"),
        ],
        {
          env: {
            ...process.env,
            VIBE_BOOTSTRAP_SOURCE: resolve(
              import.meta.dirname,
              "../scripts/bootstrap-companion.ps1",
            ),
            VIBE_ORIGINAL: original,
            VIBE_SNAPSHOT: snapshot,
            VIBE_OVERSIZED: oversized,
            VIBE_REJECTED: rejected,
          },
          windowsHide: true,
          shell: false,
          timeout: 15000,
        },
      );
      assert.match(stdout, /snapshot-preserved/);
      assert.equal(
        verifyRelease(await readFile(snapshot), release.signature, trust)
          .releaseId,
        release.releaseId,
      );
      assert.throws(
        () =>
          verifyRelease(
            Buffer.from('{"unsigned":"replacement"}'),
            release.signature,
            trust,
          ),
        /SIGNATURE_INVALID/,
      );
      const source = await readFile(
        resolve(import.meta.dirname, "../scripts/bootstrap-companion.ps1"),
        "utf8",
      );
      const verifiedPhase = source.slice(
        source.indexOf("& $nodePath $verifyPath"),
      );
      assert.doesNotMatch(verifiedPhase, /\$(?:Manifest|Signature)\b/);
    }),
);
