import { Sandbox, APIError, type NetworkPolicy } from "@vercel/sandbox";
import { Writable } from "node:stream";
import { dirname } from "node:path";
import { randomBytes, createHash } from "node:crypto";
import { signSandboxRequest } from "../policy/sandbox-broker";
import { publicProxy, publicBridge } from "../media/public-proxy";
import { ensure } from "../policy";
import { toolSnapshot, type ToolSnapshot } from "../policy/tool-snapshots";
import { singleSandboxCreationFetch } from "./sandbox-creation";

type Options = {
  user?: "user" | "root";
  cwd?: string;
  timeoutMs?: number;
  requestTimeoutMs?: number;
};
type FileData = string | Uint8Array | ReadableStream<Uint8Array>;
const privateRanges = [
  "0.0.0.0/8",
  "10.0.0.0/8",
  "100.64.0.0/10",
  "127.0.0.0/8",
  "169.254.0.0/16",
  "172.16.0.0/12",
  "192.0.0.0/24",
  "192.168.0.0/16",
  "198.18.0.0/15",
  "224.0.0.0/4",
  "240.0.0.0/4",
];
export function sandboxPolicy(
  kind: "coding" | "media" | "acquisition",
  seconds: number,
  domains: string[] = [],
) {
  ensure(
    Number.isSafeInteger(seconds) &&
      seconds >= 30 &&
      seconds <= (kind === "coding" ? 1200 : 300),
    "QUOTE_CHANGED",
    "Review the bounded execution time.",
  );
  ensure(
    kind !== "acquisition" ||
      (domains.length > 0 &&
        domains.length <= 16 &&
        domains.every((d) => /^(?:\*\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(d))),
    "POLICY_BLOCKED",
    "Link retrieval requires its reviewed host policy.",
  );
  const networkPolicy: NetworkPolicy =
    kind === "acquisition"
      ? { allow: domains, subnets: { deny: privateRanges } }
      : "deny-all";
  return {
    persistent: false as const,
    networkPolicy,
    region: "fra1" as const,
    failoverRegions: [],
    resources: { vcpus: 2 },
    ports: [],
    timeout: seconds * 1000,
    tags: { product: "vibescroller", class: kind },
  };
}
function pathInJob(path: string) {
  ensure(
    path.startsWith("/home/user/") &&
      !path.includes("\\") &&
      path.split("/").every((p) => p !== "." && p !== "..") &&
      !/[\r\n\0]/.test(path),
    "POLICY_BLOCKED",
    "Artifact path is outside the isolated job.",
  );
  return path;
}
export async function sandboxCredentials(): Promise<{
  token?: string;
  teamId?: string;
  projectId?: string;
  snapshots?: Partial<Record<"media" | "coding", ToolSnapshot>>;
}> {
  const token = process.env.VERCEL_SANDBOX_TOKEN;
  if (!token) {
    const endpoint = process.env.SANDBOX_BRIDGE_URL;
    if (!endpoint) return {};
    const url = new URL(endpoint);
    ensure(
      url.protocol === "https:" &&
        url.origin ===
          new URL(process.env.APP_URL ?? "https://scroll.companynerve.com")
            .origin &&
        url.pathname === "/api/internal/sandbox-credentials" &&
        !url.search &&
        !url.hash &&
        !url.username &&
        !url.password,
      "SETUP_REQUIRED",
      "Use the configured production sandbox broker.",
    );
    const body = JSON.stringify({
      purpose: "vibescroller-sandbox-credentials",
      at: Date.now(),
      nonce: randomBytes(16).toString("hex"),
    });
    const signature = await signSandboxRequest(
      body,
      process.env.SANDBOX_BRIDGE_SECRET ?? "",
    );
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Vibe-Signature": signature,
      },
      body,
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    ensure(
      response.ok,
      "SETUP_REQUIRED",
      "Sandbox machine authorization is unavailable.",
    );
    const raw = await response.text();
    ensure(
      raw.length <= 32000,
      "POLICY_BLOCKED",
      "Sandbox authorization exceeded its limit.",
    );
    const credentials = JSON.parse(raw);
    ensure(
      typeof credentials.token === "string" &&
        credentials.token.length <= 16000 &&
        credentials.teamId === process.env.VERCEL_SANDBOX_TEAM_ID &&
        credentials.projectId === process.env.VERCEL_SANDBOX_PROJECT_ID,
      "POLICY_BLOCKED",
      "Sandbox project identity changed.",
    );
    return {
      token: credentials.token as string,
      teamId: credentials.teamId as string,
      projectId: credentials.projectId as string,
      ...(credentials.snapshots ? { snapshots: credentials.snapshots } : {}),
    };
  }
  ensure(
    process.env.VERCEL_SANDBOX_TEAM_ID && process.env.VERCEL_SANDBOX_PROJECT_ID,
    "SETUP_REQUIRED",
    "Configure the dedicated sandbox project identity.",
  );
  return {
    token,
    teamId: process.env.VERCEL_SANDBOX_TEAM_ID!,
    projectId: process.env.VERCEL_SANDBOX_PROJECT_ID!,
  };
}

// The SDK's privileged control process is never used to execute customer code.
// Each such command enters private PID/mount/IPC/UTS namespaces and drops every
// capability, supplementary group and inherited environment before execution.
export const namespaceCommand = (online: boolean) => [
  "--mount",
  "--pid",
  "--net",
  "--ipc",
  "--uts",
  "--fork",
  "--mount-proc",
  ...(online ? ["bash", "-c", 'ip link set lo up; exec "$@"', "bash"] : []),
  "setpriv",
  "--reuid=1001",
  "--regid=1001",
  "--clear-groups",
  "--no-new-privs",
  "--bounding-set=-all",
  "--inh-caps=-all",
  "--ambient-caps=-all",
  "env",
  "-i",
  "PATH=/usr/local/bin:/usr/bin:/bin",
  "HOME=/home/user",
  "LANG=C.UTF-8",
  // The pinned offline tool must not auto-install or rewrite the approved
  // lockfile when pnpm run/exec verifies dependencies or manages its version.
  ...(!online
    ? [
        "PNPM_CONFIG_PM_ON_FAIL=ignore",
        "PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false",
        "PNPM_CONFIG_IGNORE_PNPMFILE=true",
        "PNPM_CONFIG_ENABLE_PRE_POST_SCRIPTS=false",
        "PNPM_CONFIG_OFFLINE=true",
        "PNPM_CONFIG_FROZEN_LOCKFILE=true",
        "PNPM_CONFIG_IGNORE_SCRIPTS=true",
      ]
    : []),
  ...(online ? ["VIBE_DOWNLOAD_PROXY=http://127.0.0.1:47891"] : []),
];

const readArtifact = `import os,stat,base64,sys
parts=sys.argv[1].removeprefix('/home/user/').split('/')
fd=os.open('/home/user',os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
try:
 for part in parts[:-1]:
  nextfd=os.open(part,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=fd); os.close(fd); fd=nextfd
 file=os.open(parts[-1],os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK,dir_fd=fd)
 try:
  info=os.fstat(file); assert stat.S_ISREG(info.st_mode) and info.st_uid==1001 and info.st_nlink==1 and info.st_size<=int(sys.argv[2])
  with os.fdopen(file,'rb',closefd=False) as stream: data=stream.read(int(sys.argv[2])+1)
  assert len(data)<=int(sys.argv[2]); print(base64.b64encode(data).decode('ascii'))
 finally: os.close(file)
finally: os.close(fd)`;

const verifySnapshot = `import os,stat,hashlib,json,sys
for item in json.loads(sys.argv[1]):
 parts=item['path'].removeprefix('/home/user/').split('/')
 fd=os.open('/home/user',os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
 file=None
 try:
  try:
   for part in parts[:-1]:
    nextfd=os.open(part,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=fd); os.close(fd); fd=nextfd
   file=os.open(parts[-1],os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK,dir_fd=fd)
  except FileNotFoundError:
   assert item['hash'] is None; continue
  assert item['hash'] is not None
  info=os.fstat(file)
  assert stat.S_ISREG(info.st_mode) and info.st_uid==1001 and info.st_nlink==1 and info.st_size==item['size']
  assert bool(info.st_mode & 0o111)==item['executable']
  digest=hashlib.sha256()
  with os.fdopen(file,'rb',closefd=False) as stream:
   remaining=item['size']+1
   while remaining:
    data=stream.read(min(65536,remaining))
    if not data: break
    remaining-=len(data); digest.update(data)
  assert digest.hexdigest()==item['hash']
 finally:
  if file is not None: os.close(file)
  os.close(fd)
print('verified')`;

export class JobSandbox {
  readonly sandboxId: string;
  private online: boolean;
  private deleted = false;
  constructor(
    private readonly sdk: Sandbox,
    acquisition: boolean,
    private readonly domains: string[] = [],
  ) {
    this.sandboxId = `vercel:${sdk.name}`;
    this.online = acquisition;
  }
  private async run(command: string, options: Options = {}) {
    const cwd = options.cwd ?? "/home/user";
    if (options.user !== "root") pathInJob(`${cwd}/`);
    const limit = Math.min(options.timeoutMs ?? 30000, 240000);
    const output = { stdout: "", stderr: "" };
    const sink = (key: "stdout" | "stderr") =>
      new Writable({
        write(chunk, _encoding, done) {
          const remaining = 1_000_000 - output[key].length;
          if (remaining > 0)
            output[key] += chunk.toString("utf8").slice(0, remaining);
          done();
        },
      });
    const result = await this.sdk.runCommand({
      sudo: true,
      cmd: options.user === "root" ? "bash" : "unshare",
      args:
        options.user === "root"
          ? ["-c", command]
          : this.online
            ? [
                ...namespaceCommand(true),
                "python3",
                "/usr/local/lib/vibe-public-bridge.py",
                cwd,
                command,
              ]
            : [
                ...namespaceCommand(false),
                "bash",
                "-c",
                'cd "$1" || exit 1; ulimit -f 1048576; exec bash -c "$2"',
                "bash",
                cwd,
                command,
              ],
      timeoutMs: limit,
      signal: AbortSignal.timeout(limit + 10000),
      stdout: sink("stdout"),
      stderr: sink("stderr"),
    });
    return { exitCode: result.exitCode ?? 1, ...output };
  }
  commands = {
    run: (command: string, options?: Options) => this.run(command, options),
  };
  async verifySnapshot(
    files: { path: string; content: string | null; executable: boolean }[],
  ) {
    ensure(
      files.length > 0 && files.length <= 2068,
      "POLICY_BLOCKED",
      "Snapshot verification exceeds its bound.",
    );
    for (let offset = 0; offset < files.length; offset += 100) {
      const expected = files.slice(offset, offset + 100).map((file) => {
        const content =
          file.content === null ? null : Buffer.from(file.content, "utf8");
        return {
          path: pathInJob(`/home/user/job/${file.path}`),
          hash:
            content === null
              ? null
              : createHash("sha256").update(content).digest("hex"),
          size: content?.length ?? 0,
          executable: file.executable,
        };
      });
      const result = await this.sdk.runCommand({
        sudo: true,
        cmd: "python3",
        args: ["-c", verifySnapshot, JSON.stringify(expected)],
        timeoutMs: 30000,
        signal: AbortSignal.timeout(40000),
      });
      ensure(
        result.exitCode === 0 && (await result.stdout()).trim() === "verified",
        "POLICY_BLOCKED",
        "Approved checks changed the exact tested source snapshot. Review a new generated patch.",
      );
    }
  }
  files = {
    write: async (
      pathOrFiles: string | { path: string; data: FileData }[],
      dataOrOptions?: FileData | Options,
      _options?: Options,
    ) => {
      const files =
        typeof pathOrFiles === "string"
          ? [{ path: pathOrFiles, data: dataOrOptions as FileData }]
          : pathOrFiles;
      const converted = [];
      let total = 0;
      for (const file of files) {
        pathInJob(file.path);
        let data: Buffer;
        if (file.data instanceof ReadableStream) {
          const parts: Uint8Array[] = [];
          const reader = file.data.getReader();
          let bytes = 0;
          try {
            while (true) {
              const next = await reader.read();
              if (next.done) break;
              bytes += next.value.byteLength;
              ensure(
                bytes <= 250000000,
                "SOURCE_UNAVAILABLE",
                "Source exceeds its byte limit.",
              );
              parts.push(next.value);
            }
          } finally {
            await reader.cancel();
            reader.releaseLock();
          }
          data = Buffer.concat(parts);
        } else data = Buffer.from(file.data);
        total += data.byteLength;
        ensure(
          total <= 250000000,
          "POLICY_BLOCKED",
          "Artifact transfer exceeds its limit.",
        );
        converted.push({ path: file.path, content: data });
      }
      // Only trusted setup writes occur before untrusted checks start.
      const parents = new Set<string>();
      for (const file of converted) {
        let parent = dirname(file.path);
        while (parent.startsWith("/home/user/")) {
          parents.add(parent);
          parent = dirname(parent);
        }
      }
      if (parents.size) {
        for (const cmd of ["mkdir", "chown", "chmod"] as const) {
          const args =
            cmd === "mkdir"
              ? ["-p", "--", ...parents]
              : cmd === "chown"
                ? ["1001:1000", "--", ...parents]
                : ["770", "--", ...parents];
          const result = await this.sdk.runCommand({
            sudo: true,
            cmd,
            args,
            timeoutMs: 15000,
          });
          ensure(
            result.exitCode === 0,
            "POLICY_BLOCKED",
            "Artifact directories could not be prepared.",
          );
        }
      }
      await this.sdk.writeFiles(converted, {
        signal: AbortSignal.timeout(60000),
      });
      const result = await this.sdk.runCommand({
        sudo: true,
        cmd: "chown",
        args: ["1001:1001", "--", ...converted.map((f) => f.path)],
        timeoutMs: 15000,
      });
      ensure(
        result.exitCode === 0,
        "POLICY_BLOCKED",
        "Artifact ownership could not be established.",
      );
    },
    read: async (
      path: string,
      options?: { format?: "bytes"; maxBytes?: number },
    ): Promise<any> => {
      pathInJob(path);
      const limit =
        options?.maxBytes ?? (options?.format === "bytes" ? 19500000 : 20000);
      ensure(
        Number.isSafeInteger(limit) &&
          limit > 0 &&
          limit <= (options?.format === "bytes" ? 19500000 : 100000),
        "INVALID_MEDIA_MANIFEST",
        "Artifact read exceeded the bounded format allowance.",
      );
      // Descriptor-relative O_NOFOLLOW reads reject raced symlinks, hardlinks,
      // nonregular files and anything owned by a privileged broker.
      const result = await this.sdk.runCommand({
        sudo: true,
        cmd: "python3",
        args: ["-c", readArtifact, path, String(limit)],
        timeoutMs: 30000,
      });
      ensure(
        result.exitCode === 0,
        "INVALID_MEDIA_MANIFEST",
        "Artifact read failed its safety checks.",
      );
      const data = Buffer.from((await result.stdout()).trim(), "base64");
      ensure(
        data.length <= limit,
        "INVALID_MEDIA_MANIFEST",
        "Artifact exceeded its limit.",
      );
      return options?.format === "bytes" ? data : data.toString("utf8");
    },
    remove: async (path: string, _options?: Options) => {
      pathInJob(path);
      const result = await this.sdk.runCommand({
        sudo: true,
        cmd: "rm",
        args: ["-f", "--", path],
        timeoutMs: 10000,
      });
      ensure(
        result.exitCode === 0,
        "POLICY_BLOCKED",
        "Artifact deletion failed.",
      );
    },
  };
  async lockdown() {
    await this.sdk.update({ networkPolicy: "deny-all" });
    this.online = false;
  }
  async configurePublicDownload() {
    ensure(
      this.online && this.domains.length > 0,
      "POLICY_BLOCKED",
      "Public retrieval policy is unavailable.",
    );
    await this.sdk.writeFiles([
      {
        path: "/vercel/sandbox/vibe-public-proxy.py",
        content: Buffer.from(publicProxy),
      },
      {
        path: "/vercel/sandbox/vibe-public-bridge.py",
        content: Buffer.from(publicBridge),
      },
      {
        path: "/vercel/sandbox/vibe-public-policy.json",
        content: Buffer.from(JSON.stringify({ domains: this.domains })),
      },
    ]);
    const setup = await this.run(
      `set -eu
command -v ip >/dev/null
install -m 600 /vercel/sandbox/vibe-public-proxy.py /root/vibe-public-proxy.py
install -m 755 /vercel/sandbox/vibe-public-bridge.py /usr/local/lib/vibe-public-bridge.py
install -m 600 /vercel/sandbox/vibe-public-policy.json /root/vibe-public-policy.json
rm -f /vercel/sandbox/vibe-public-proxy.py /vercel/sandbox/vibe-public-bridge.py /vercel/sandbox/vibe-public-policy.json
nohup python3 /root/vibe-public-proxy.py >/root/vibe-public-proxy.log 2>&1 < /dev/null &
python3 - <<'PY'
import pathlib,time,stat
for _ in range(100):
 p=pathlib.Path('/run/vibe-public.sock')
 if p.exists():
  s=p.stat(); assert stat.S_ISSOCK(s.st_mode) and s.st_uid==0 and s.st_gid==1001 and stat.S_IMODE(s.st_mode)==0o660; break
 time.sleep(.02)
else: raise RuntimeError('broker unavailable')
PY`,
      { user: "root", timeoutMs: 10000 },
    );
    ensure(
      setup.exitCode === 0,
      "POLICY_BLOCKED",
      "The restricted public-download broker did not start.",
    );
  }
  async kill() {
    if (this.deleted) return;
    try {
      await this.sdk.stop({ signal: AbortSignal.timeout(30000) });
      await this.sdk.delete({ signal: AbortSignal.timeout(30000) });
      this.deleted = true;
    } catch (error) {
      if (error instanceof APIError && error.response.status === 404) {
        this.deleted = true;
        return;
      }
      throw error;
    }
  }
}

export async function createJobSandbox(
  kind: "coding" | "media" | "acquisition",
  seconds: number,
  domains: string[] = [],
) {
  ensure(
    (process.env.CLOUD_SANDBOX_PROVIDER ?? "vercel") === "vercel",
    "SETUP_REQUIRED",
    "The selected sandbox provider is not supported. No fallback was used.",
  );
  const image =
    process.env[
      kind === "coding" ? "VERCEL_CODING_IMAGE" : "VERCEL_MEDIA_IMAGE"
    ];
  const { snapshots, ...credentials } = await sandboxCredentials();
  const kindSnapshot = snapshots?.[kind === "coding" ? "coding" : "media"];
  const snapshotId = kindSnapshot
    ? toolSnapshot(kindSnapshot).snapshotId
    : process.env[
        kind === "coding" ? "VERCEL_CODING_SNAPSHOT" : "VERCEL_MEDIA_SNAPSHOT"
      ];
  ensure(
    snapshotId
      ? /^snap_[A-Za-z0-9_-]{8,128}$/.test(snapshotId)
      : image && /^[A-Za-z0-9/_.-]+@sha256:[a-f0-9]{64}$/.test(image),
    "SETUP_REQUIRED",
    "Configure the pinned and tested isolated tool image.",
  );
  const sdk = await Sandbox.create({
    ...credentials,
    ...sandboxPolicy(kind, seconds, domains),
    fetch: singleSandboxCreationFetch(),
    signal: AbortSignal.timeout(30000),
    ...(snapshotId
      ? { source: { type: "snapshot" as const, snapshotId } }
      : { image }),
  });
  const sandbox = new JobSandbox(sdk, kind === "acquisition", domains);
  try {
    const setup = await sandbox.commands.run(
      'set -eu; if ! id user >/dev/null 2>&1; then useradd -m -u 1001 user; fi; test "$(id -u user)" = 1001; chmod 700 /home/ubuntu /root; chown user:ubuntu /home/user; chmod 770 /home/user; command -v unshare; command -v setpriv',
      { user: "root", timeoutMs: 15000 },
    );
    ensure(
      setup.exitCode === 0,
      "POLICY_BLOCKED",
      "Isolated user setup failed.",
    );
    return sandbox;
  } catch (error) {
    await sandbox.kill();
    throw error;
  }
}

export async function stopJobSandbox(id: string) {
  ensure(
    /^vercel:[A-Za-z0-9_-]{1,128}$/.test(id),
    "POLICY_BLOCKED",
    "Unrecognized sandbox identity.",
  );
  try {
    // resume:false is essential: cancellation must never restart a stopped VM.
    const sdk = await Sandbox.get({
      ...(await sandboxCredentials()),
      name: id.slice(7),
      resume: false,
    });
    await sdk.stop({ signal: AbortSignal.timeout(30000) });
    await sdk.delete({ signal: AbortSignal.timeout(30000) });
  } catch (error) {
    if (!(error instanceof APIError && error.response.status === 404))
      throw error;
  }
}
