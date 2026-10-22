import { Sandbox, Snapshot } from "@vercel/sandbox";
import { randomBytes } from "node:crypto";
import { sandboxCredentials, sandboxPolicy, namespaceCommand } from "./sandbox";
import { toolSnapshot } from "../policy/tool-snapshots";
import { ensure } from "../policy";
import downloader from "../../infra/downloader.json";
import { singleSandboxCreationFetch } from "./sandbox-creation";

// This process receives only a previously verified clean tools snapshot. No
// customer job, source, repository, transcript or credential enters the VM.
export async function renewCleanTools(item: {
  kind: "media" | "coding";
  snapshotId: string;
  expiresAt: number;
  projectId: string;
  teamId: string;
}) {
  toolSnapshot(item);
  const { snapshots: _snapshots, ...credentials } = await sandboxCredentials();
  ensure(
    credentials.projectId === item.projectId &&
      credentials.teamId === item.teamId,
    "POLICY_BLOCKED",
    "Maintenance project changed.",
  );
  const started = Date.now();
  let vm: Sandbox | undefined, candidate: Snapshot | undefined;
  let deleted = false;
  let stage = "create";
  try {
    vm = await Sandbox.create({
      ...credentials,
      ...sandboxPolicy(item.kind, 120),
      fetch: singleSandboxCreationFetch(undefined, { allowSnapshot: true }),
      signal: AbortSignal.timeout(30000),
      source: { type: "snapshot", snapshotId: item.snapshotId },
      tags: {
        product: "vibescroller",
        class: "clean-tool-renewal",
        kind: item.kind,
      },
    });
    stage = "setup";
    const setup = await vm.runCommand({
      sudo: true,
      cmd: "bash",
      args: [
        "-c",
        'set -eu; if test -d /home/user; then test -z "$(find /home/user -mindepth 1 ! -name .bashrc ! -name .profile ! -name .bash_logout -print -quit)"; fi; if ! id user >/dev/null 2>&1; then useradd -m -u 1001 user; fi; test "$(id -u user)" = 1001; chmod 700 /root /home/ubuntu; chown user:ubuntu /home/user; chmod 770 /home/user',
      ],
      timeoutMs: 15000,
    });
    ensure(
      setup.exitCode === 0,
      "POLICY_BLOCKED",
      "Clean image contents or user setup failed.",
    );
    const toolCheck =
      item.kind === "coding"
        ? 'test "$(pnpm --version)" = 12.3.4; node --version; git --version'
        : `test "$(yt-dlp --version)" = '${downloader.version}'; python3 -c 'from PIL import Image'; ffmpeg -nostdin -threads 1 -v error -f lavfi -i color=c=black:s=16x16:d=0.04 -f null -`;
    stage = "probe";
    const check = await vm.runCommand({
      sudo: true,
      cmd: "unshare",
      args: [
        ...namespaceCommand(false),
        "bash",
        "-c",
        `set -eu; test "$(id -u)" = 1001; test "$(awk '/^CapBnd:/ {print $2}' /proc/self/status)" = 0000000000000000; test "$(awk '/^NoNewPrivs:/ {print $2}' /proc/self/status)" = 1; test ! -r /root; test ! -r /home/ubuntu; awk 'NF && $1 != "Iface" {exit 1}' /proc/net/route; ${toolCheck}`,
      ],
      timeoutMs: 30000,
    });
    ensure(
      check.exitCode === 0,
      "POLICY_BLOCKED",
      "Clean tool isolation or version verification failed.",
    );
    stage = "snapshot";
    candidate = await vm.snapshot({ expiration: 7 * 86400000 });
    const next = toolSnapshot({
      snapshotId: candidate.snapshotId,
      expiresAt: candidate.expiresAt?.getTime(),
    });
    stage = "teardown";
    await vm.stop({ signal: AbortSignal.timeout(30000) });
    await vm.delete({ signal: AbortSignal.timeout(30000) });
    deleted = true;
    const computeSeconds = Math.ceil((Date.now() - started) / 1000);
    ensure(
      computeSeconds <= 120,
      "BUDGET_EXCEEDED",
      "Maintenance exceeded its bounded wall-clock quote.",
    );
    return { ...next, computeSeconds, teardownConfirmed: true as const };
  } catch {
    if (candidate)
      await candidate
        .delete({ signal: AbortSignal.timeout(30000) })
        .catch(() => {});
    // Fixed stages are safe operational diagnostics; provider output may
    // contain capabilities and is never forwarded to logs or customer errors.
    throw Error(`CLEAN_TOOL_RENEWAL_FAILED:${stage}`);
  } finally {
    if (vm && !deleted) {
      // Attempt deletion even when the separate stop receipt is unavailable.
      await vm.stop({ signal: AbortSignal.timeout(30000) }).catch(() => {});
      await vm.delete({ signal: AbortSignal.timeout(30000) }).catch(() => {});
    }
  }
}
export const maintenanceLease = () => randomBytes(16).toString("hex");
