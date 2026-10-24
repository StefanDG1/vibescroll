// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Sandbox } from "@vercel/sandbox";
import { createJobSandbox } from "../packages/providers/sandbox";
import {
  preparationRuntime,
  creationProvenanceCurrent,
  type SnapshotAuthority,
} from "../packages/providers/preparation-runtime";
const NOW = Date.UTC(2026, 9, 23, 12);
const authority: SnapshotAuthority = {
  kind: "media",
  snapshotId: "snap_currentOwned123",
  expiresAt: NOW + 86400000,
  updatedAt: NOW - 1000,
  parentSnapshotId: "snap_parentOwned123",
  projectId: "prj_synthetic",
  teamId: "team_synthetic",
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubEnv("VERCEL_SANDBOX_TOKEN", "");
  vi.stubEnv("CLOUD_SANDBOX_PROVIDER", "vercel");
  vi.stubEnv("VERCEL_SANDBOX_TEAM_ID", authority.teamId);
  vi.stubEnv("VERCEL_SANDBOX_PROJECT_ID", authority.projectId);
  vi.stubEnv("APP_URL", "https://synthetic.invalid");
  vi.stubEnv(
    "SANDBOX_BRIDGE_URL",
    "https://synthetic.invalid/api/internal/sandbox-credentials",
  );
  vi.stubEnv("SANDBOX_BRIDGE_SECRET", "01".repeat(32));
  vi.stubEnv("VERCEL_MEDIA_SNAPSHOT", "snap_staleConfigured123");
  vi.spyOn(Sandbox.prototype, "runCommand").mockResolvedValue({
    exitCode: 0,
  } as Awaited<ReturnType<Sandbox["runCommand"]>>);
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
function transport(
  selected: SnapshotAuthority | null = authority,
  unknown = false,
) {
  const session = {
    id: "synthetic-session",
    memory: 4096,
    vcpus: 2,
    region: "fra1",
    timeout: 300000,
    status: "running",
    requestedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    cwd: "/home/user",
  };
  const sandbox = {
    name: "synthetic-owned",
    persistent: false,
    createdAt: NOW,
    updatedAt: NOW,
    currentSessionId: session.id,
    status: "running",
  };
  const calls: { url: URL; body: any }[] = [];
  let started!: () => void;
  const firstCreate = new Promise<void>((resolve) => {
    started = resolve;
  });
  const fake = vi.fn(
    async (url: string | URL | Request, init?: RequestInit) => {
      const u = new URL(String(url)),
        body = init?.body ? JSON.parse(String(init.body)) : null;
      calls.push({ url: u, body });
      if (u.hostname === "synthetic.invalid")
        return Response.json({
          token: "synthetic-machine-only",
          projectId: authority.projectId,
          teamId: authority.teamId,
          snapshots: {
            media: {
              snapshotId: authority.snapshotId,
              expiresAt: authority.expiresAt,
            },
          },
          ...(selected ? { snapshotAuthorities: { media: selected } } : {}),
        });
      if (u.pathname === "/api/v3/sandboxes") {
        started();
        if (unknown) throw Error("synthetic lost creation ACK");
        return Response.json({ session, sandbox, routes: [] });
      }
      if (u.pathname.endsWith("/stop"))
        return Response.json({ session: { ...session, status: "stopped" } });
      if (init?.method === "DELETE")
        return Response.json({ sandbox: { ...sandbox, status: "stopped" } });
      throw Error("unexpected synthetic endpoint");
    },
  );
  vi.stubGlobal("fetch", fake);
  return { calls, fake, firstCreate };
}
it("carries exact broker-selected provenance through the actual installed SDK create ACK without leaking metadata into its payload", async () => {
  const f = transport();
  const expected = preparationRuntime({
    version: "preparation-runtime-v1",
    route: "broker",
    authority,
  })!;
  const vm = await createJobSandbox("acquisition", 300, ["example.com"], {
    expectedRuntime: expected,
  });
  expect(vm.creationProvenance).toEqual({
    version: "sandbox-create-receipt-v1",
    selection: expected,
    sandboxId: "vercel:synthetic-owned",
  });
  expect(creationProvenanceCurrent(vm.creationProvenance, expected)).toBe(true);
  const request = f.calls.find((c) => c.url.pathname === "/api/v3/sandboxes")!;
  expect(request.body.source).toEqual({
    type: "snapshot",
    snapshotId: authority.snapshotId,
  });
  expect(request.body).not.toHaveProperty("snapshotAuthorities");
  expect(request.body).not.toHaveProperty("snapshots");
  expect(JSON.stringify(vm.creationProvenance)).not.toContain(
    "synthetic-machine-only",
  );
  expect(Object.isFrozen(vm.creationProvenance!.selection)).toBe(true);
  await vm.kill();
});
it("refuses a changed expected broker selection before creating any VM", async () => {
  const f = transport();
  const expected = preparationRuntime({
    version: "preparation-runtime-v1",
    route: "broker",
    authority: { ...authority, snapshotId: "snap_previousOwned123" },
  })!;
  await expect(
    createJobSandbox("media", 300, [], { expectedRuntime: expected }),
  ).rejects.toThrow("APPROVAL_STALE");
  expect(f.calls).toHaveLength(1);
});
it.each(["team", "project", "id", "expiry"])(
  "refuses inconsistent %s authority before VM creation",
  async (change) => {
    const selected = {
      ...authority,
      ...(change === "team"
        ? { teamId: "team_foreign" }
        : change === "project"
          ? { projectId: "prj_foreign" }
          : change === "id"
            ? { snapshotId: "snap_otherOwned123" }
            : { expiresAt: authority.expiresAt + 1 }),
    };
    const f = transport(selected);
    await expect(createJobSandbox("media", 300)).rejects.toThrow(
      "Sandbox source scope changed",
    );
    expect(f.calls).toHaveLength(1);
  },
);
it("preserves legacy broker execution without fabricating provenance when metadata is absent", async () => {
  transport(null);
  const vm = await createJobSandbox("media", 300);
  expect(vm.creationProvenance).toBeNull();
  await vm.kill();
});
it("returns no receipt and never duplicates creation when the installed SDK loses its acknowledgement", async () => {
  const f = transport(authority, true);
  const rejected = expect(createJobSandbox("media", 300)).rejects.toThrow(
    "SANDBOX_CREATE_UNCERTAIN",
  );
  await f.firstCreate;
  await vi.runAllTimersAsync();
  await rejected;
  expect(
    f.calls.filter((c) => c.url.pathname === "/api/v3/sandboxes"),
  ).toHaveLength(1);
});
it("fails closed for expired, future-version and forged creation provenance", () => {
  expect(
    preparationRuntime({
      version: "preparation-runtime-v1",
      route: "broker",
      authority: { ...authority, expiresAt: NOW + 30000 },
    }),
  ).toBeNull();
  expect(
    preparationRuntime({
      version: "preparation-runtime-v2",
      route: "broker",
      authority,
    }),
  ).toBeNull();
  const expected = preparationRuntime({
    version: "preparation-runtime-v1",
    route: "broker",
    authority,
  })!;
  expect(
    creationProvenanceCurrent(
      {
        version: "sandbox-create-receipt-v1",
        selection: expected,
        sandboxId: "foreign",
      },
      expected,
    ),
  ).toBe(false);
});
