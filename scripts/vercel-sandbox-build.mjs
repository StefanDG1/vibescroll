import { Sandbox } from "@vercel/sandbox";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { reviewedDependencyPatches } from "./dependency-patches.mjs";
import { singleSandboxCreationFetch } from "../packages/providers/sandbox-creation.ts";
const token = process.env.VERCEL_OIDC_TOKEN ?? process.env.VERCEL_SANDBOX_TOKEN;
if (
  !token ||
  !process.env.VERCEL_SANDBOX_TEAM_ID ||
  !process.env.VERCEL_SANDBOX_PROJECT_ID
)
  throw Error("Dedicated project authorization missing");
const credentials = {
  token,
  projectId: process.env.VERCEL_SANDBOX_PROJECT_ID,
  teamId: process.env.VERCEL_SANDBOX_TEAM_ID,
};
if (!/^prj_[A-Za-z0-9]+$/.test(credentials.projectId))
  throw Error("Invalid dedicated project identifier");
const kind = process.argv[2];
if (!["media", "coding"].includes(kind)) throw Error("Use media or coding");
const withCache = process.argv.includes("--foundation-cache");
if (withCache && kind !== "coding")
  throw Error("Only coding uses the reviewed dependency cache");
const cacheProfile = withCache
  ? JSON.parse(readFileSync("infra/offline-dependency-cache.json", "utf8"))
  : undefined;
const cacheLock = withCache ? readFileSync("pnpm-lock.yaml") : undefined;
const cacheManifests = withCache
  ? [
      "package.json",
      "apps/starter/package.json",
      "apps/marketing/package.json",
    ].map((path) => ({ path, content: readFileSync(path) }))
  : [];
const cachePatches = withCache
  ? reviewedDependencyPatches(cacheProfile.patches, readFileSync)
  : [];
if (
  cacheLock &&
  createHash("sha256").update(cacheLock).digest("hex") !==
    cacheProfile.lockfileSha256
)
  throw Error("Review the public lockfile cache profile before rebuilding");
if (
  cacheManifests.some(
    (file) =>
      createHash("sha256").update(file.content).digest("hex") !==
      cacheProfile.manifests[file.path],
  )
)
  throw Error("Review public manifest hashes before rebuilding");
if (
  withCache &&
  (!Array.isArray(cacheProfile.metadataPackages) ||
    cacheProfile.metadataPackages.length === 0 ||
    cacheProfile.metadataPackages.length > 1000 ||
    !cacheProfile.metadataPackages.every((name) =>
      /^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/.test(name),
    ))
)
  throw Error("Review the bounded public registry metadata names");
const base =
  "vercel/sandbox/universal@sha256:c77f7436b9bc0a8b01ef7b09dbcea2de6a18a9fe2aafa89996d2da193da72cf0";
const release = JSON.parse(readFileSync("infra/downloader.json", "utf8"));
let sandbox;
try {
  sandbox = await Sandbox.create({
    ...credentials,
    fetch: singleSandboxCreationFetch(undefined, { allowSnapshot: true }),
    signal: AbortSignal.timeout(30000),
    image: base,
    persistent: false,
    networkPolicy: {
      allow:
        kind === "media"
          ? ["archive.ubuntu.com", "security.ubuntu.com"]
          : ["registry.npmjs.org"],
      subnets: {
        deny: [
          "10.0.0.0/8",
          "127.0.0.0/8",
          "169.254.0.0/16",
          "172.16.0.0/12",
          "192.168.0.0/16",
        ],
      },
    },
    ports: [],
    resources: { vcpus: 2 },
    timeout: 300000,
    region: "fra1",
    failoverRegions: [],
    tags: { product: "vibescroller", class: "clean-tool-image" },
  });
  const install = await sandbox.runCommand({
    sudo: true,
    cmd: "bash",
    args: [
      "-c",
      kind === "coding"
        ? 'set -eu; npm install -g pnpm@12.3.4 --ignore-scripts --registry=https://registry.npmjs.org >/dev/null; test "$(pnpm --version)" = 12.3.4; node --version; pnpm --version; git --version'
        : "set -eu; sed -i 's#http://#https://#g' /etc/apt/sources.list.d/ubuntu.sources; apt-get update -qq; DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends ffmpeg python3-pil iproute2 >/dev/null; rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*",
    ],
    timeoutMs: 200000,
  });
  if (install.exitCode !== 0) {
    console.log(
      JSON.stringify({
        installExit: install.exitCode,
        diagnostic: (await install.stderr()).slice(-1800),
      }),
    );
    throw Error("Clean image installation failed");
  }
  let versions = (await install.stdout()).trim();
  let cacheBytes;
  if (cacheLock) {
    await sandbox.writeFiles([
      { path: "/opt/vibe/cache-build/pnpm-lock.yaml", content: cacheLock },
      {
        path: "/opt/vibe/cache-build/pnpm-workspace.yaml",
        content: Buffer.from(
          'packages: ["apps/*"]\nsupportedArchitectures:\n  os: [linux]\n  cpu: [x64]\n  libc: [glibc]\n' +
            (cachePatches.length
              ? "patchedDependencies:\n" +
                cachePatches
                  .map(
                    (patch) =>
                      `  ${JSON.stringify(patch.package)}: ${JSON.stringify(patch.path)}\n`,
                  )
                  .join("")
              : ""),
        ),
      },
      ...cacheManifests.map((file) => ({
        path: "/opt/vibe/cache-build/" + file.path,
        content: file.content,
      })),
      ...cachePatches.map((file) => ({
        path: "/opt/vibe/cache-build/" + file.path,
        content: file.content,
      })),
    ]);
    const fetched = await sandbox.runCommand({
      sudo: true,
      cmd: "bash",
      args: [
        "-c",
        "set -eu; cd /opt/vibe/cache-build; pnpm install --frozen-lockfile --ignore-scripts --ignore-pnpmfile --no-runtime --store-dir /opt/vibe/pnpm-store --config.cache-dir=/opt/vibe/pnpm-metadata --registry=https://registry.npmjs.org --pm-on-fail=ignore --config.fetch-retries=0 --reporter=append-only >/opt/vibe/cache-build/fetch.log 2>&1",
      ],
      timeoutMs: 200000,
    });
    if (fetched.exitCode !== 0) throw Error("Reviewed dependency fetch failed");
    await sandbox.writeFiles([
      {
        path: "/opt/vibe/cache-build/metadata.mjs",
        content: readFileSync("scripts/mirror-registry-metadata.mjs"),
      },
      {
        path: "/opt/vibe/cache-build/names.json",
        content: Buffer.from(JSON.stringify(cacheProfile.metadataPackages)),
      },
    ]);
    const metadata = await sandbox.runCommand({
      sudo: true,
      cmd: "node",
      args: [
        "/opt/vibe/cache-build/metadata.mjs",
        "/opt/vibe/cache-build/names.json",
      ],
      timeoutMs: 180000,
    });
    if (metadata.exitCode !== 0)
      throw Error("Reviewed public metadata caching failed");
    const sealed = await sandbox.runCommand({
      sudo: true,
      cmd: "bash",
      args: [
        "-c",
        `set -eu; bytes=$(du -sb /opt/vibe/pnpm-store /opt/vibe/pnpm-metadata | awk '{n+=$1} END {print n}'); test "$bytes" -le 2147483648; printf '%s\\n' "$bytes"; printf '%s\\n' '${cacheProfile.lockfileSha256}' > /opt/vibe/foundation-cache.sha256; chmod -R a+rX,a-w /opt/vibe/pnpm-store /opt/vibe/pnpm-metadata; rm -rf /opt/vibe/cache-build`,
      ],
      timeoutMs: 20000,
    });
    if (sealed.exitCode !== 0) throw Error("Dependency cache sealing failed");
    cacheBytes = Number((await sealed.stdout()).trim());
  }
  if (kind === "media") {
    const res = await fetch(release.url, {
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) throw Error("Downloader artifact unavailable");
    const bytes = Buffer.from(await res.arrayBuffer());
    if (
      bytes.length > 50_000_000 ||
      createHash("sha256").update(bytes).digest("hex") !== release.sha256
    )
      throw Error("Downloader artifact failed size or hash verification");
    await sandbox.writeFiles([
      { path: "/vercel/sandbox/yt-dlp", content: bytes },
    ]);
    const finish = await sandbox.runCommand({
      sudo: true,
      cmd: "bash",
      args: [
        "-c",
        `set -eu; install -m 755 /vercel/sandbox/yt-dlp /usr/local/bin/yt-dlp; rm -f /vercel/sandbox/yt-dlp; test "$(/usr/local/bin/yt-dlp --version)" = '${release.version}'; python3 -c 'from PIL import Image'; ffmpeg -version | head -1; node --version; pnpm --version`,
      ],
      timeoutMs: 20000,
    });
    if (finish.exitCode !== 0) throw Error("Tool image verification failed");
    versions = (await finish.stdout()).trim();
  }
  await sandbox.update({ networkPolicy: "deny-all" });
  const snapshot = await sandbox.snapshot({
    expiration: 7 * 24 * 60 * 60 * 1000,
  });
  const proof = {
    createdAt: snapshot.createdAt.toISOString(),
    expiresAt: snapshot.expiresAt?.toISOString(),
    snapshotId: snapshot.snapshotId,
    projectId: credentials.projectId,
    teamId: credentials.teamId,
    baseImage: base,
    region: "fra1",
    customerDataPresent: false,
    credentialsInVm: false,
    kind,
    dependencyCache: withCache
      ? {
          lockfileSha256: cacheProfile.lockfileSha256,
          bytes: cacheBytes,
          scriptsExecuted: false,
        }
      : undefined,
    downloadRelease: kind === "media" ? release : undefined,
    toolVersions: versions,
    expiresAfterDays: 7,
    verified: false,
  };
  writeFileSync(
    "private/vercel-" + kind + "-" + credentials.projectId + "-build.json",
    JSON.stringify(proof, null, 2),
  );
  console.log(JSON.stringify(proof));
} catch {
  console.error("Sandbox image build failed. Verification remains disabled.");
  process.exitCode = 1;
} finally {
  if (sandbox) {
    await sandbox.stop();
    await sandbox.delete();
    console.log(JSON.stringify({ stopped: true, deleted: true }));
  }
}
