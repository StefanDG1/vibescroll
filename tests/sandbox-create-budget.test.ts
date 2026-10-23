// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Sandbox } from "@vercel/sandbox";
import { convexTest } from "convex-test";
import { execFileSync } from "node:child_process";
import { createJobSandbox } from "../packages/providers/sandbox";
import { singleSandboxCreationFetch } from "../packages/providers/sandbox-creation";
import { renewCleanTools } from "../packages/providers/tool-renewal";
import schema from "../convex/schema";
import { internal } from "../convex/_generated/api";

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("CLOUD_SANDBOX_PROVIDER", "vercel");
  vi.stubEnv("VERCEL_SANDBOX_TOKEN", "synthetic-machine-token");
  vi.stubEnv("VERCEL_SANDBOX_TEAM_ID", "team_synthetic");
  vi.stubEnv("VERCEL_SANDBOX_PROJECT_ID", "prj_synthetic");
  vi.stubEnv("VERCEL_MEDIA_SNAPSHOT", "snap_synthetic_media");
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it.each(["lost_response", "503", "429"])(
  "dispatches only one creation request through the installed SDK after %s",
  async (failure) => {
    let started!: () => void;
    const firstDispatch = new Promise<void>((resolve) => {
      started = resolve;
    });
    const transport = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        started();
        expect(new URL(String(input)).pathname).toBe("/api/v3/sandboxes");
        expect(init?.method).toBe("POST");
        if (failure === "lost_response")
          throw new TypeError(
            "Synthetic response lost after creation dispatch",
          );
        return new Response(
          JSON.stringify({
            error: { message: "Synthetic creation unavailable" },
          }),
          { status: Number(failure), headers: { "Retry-After": "0" } },
        );
      },
    );
    vi.stubGlobal("fetch", transport);
    const rejected = expect(createJobSandbox("media", 300)).rejects.toThrow(
      "SANDBOX_CREATE_UNCERTAIN",
    );
    await firstDispatch;
    await vi.runAllTimersAsync();
    await rejected;
    expect(transport).toHaveBeenCalledTimes(1);
  },
);

it("fails renewal without claiming snapshot cleanup when a snapshot response is lost", async () => {
  const receipt = sdkReceipt();
  vi.spyOn(Sandbox.prototype, "runCommand").mockResolvedValue({
    exitCode: 0,
  } as Awaited<ReturnType<Sandbox["runCommand"]>>);
  let started!: () => void;
  const firstSnapshot = new Promise<void>((resolve) => {
    started = resolve;
  });
  const operations: string[] = [];
  const transport = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname;
      operations.push(`${init?.method}:${path}`);
      if (path === "/api/v3/sandboxes") return Response.json(receipt);
      if (path.endsWith("/snapshot")) {
        expect(JSON.parse(String(init?.body))).toEqual({
          expiration: 7 * 86400000,
        });
        started();
        throw new TypeError(
          "Synthetic snapshot response lost after allocation",
        );
      }
      if (path.endsWith("/stop"))
        return Response.json({
          session: { ...receipt.session, status: "stopped" },
        });
      expect(init?.method).toBe("DELETE");
      expect(path).toBe("/api/v2/sandboxes/synthetic-owned");
      return Response.json({
        sandbox: { ...receipt.sandbox, status: "stopped" },
      });
    },
  );
  vi.stubGlobal("fetch", transport);
  const rejected = expect(
    renewCleanTools({
      kind: "media",
      snapshotId: "snap_synthetic_media",
      expiresAt: Date.now() + 86400000,
      projectId: "prj_synthetic",
      teamId: "team_synthetic",
    }),
  ).rejects.toThrow("CLEAN_TOOL_RENEWAL_FAILED:snapshot");
  await firstSnapshot;
  await vi.runAllTimersAsync();
  await rejected;
  expect(operations).toEqual([
    "POST:/api/v3/sandboxes",
    "POST:/api/v2/sandboxes/sessions/synthetic-session/snapshot",
    "POST:/api/v2/sandboxes/sessions/synthetic-session/stop",
    "DELETE:/api/v2/sandboxes/synthetic-owned",
  ]);
});

it("refuses an unreviewed initial creation endpoint before any transport dispatch", async () => {
  for (const [path, method] of [
    ["/api/v4/sandboxes", "POST"],
    ["/api/v3/sandboxes/", "POST"],
    ["/api/v3/sandboxes", "GET"],
  ]) {
    const transport = vi.fn(async () => Response.json({}));
    await expect(
      singleSandboxCreationFetch(transport)(
        `https://synthetic.invalid${path}`,
        { method },
      ),
    ).rejects.toThrow("POLICY_BLOCKED");
    expect(transport).not.toHaveBeenCalled();
  }
});

it("does not duplicate a renewal VM when creation loses its response", async () => {
  let started!: () => void;
  const firstDispatch = new Promise<void>((resolve) => {
    started = resolve;
  });
  const transport = vi.fn(async () => {
    started();
    throw new TypeError("Synthetic lost renewal creation response");
  });
  vi.stubGlobal("fetch", transport);
  const rejected = expect(
    renewCleanTools({
      kind: "media",
      snapshotId: "snap_synthetic_media",
      expiresAt: Date.now() + 86400000,
      projectId: "prj_synthetic",
      teamId: "team_synthetic",
    }),
  ).rejects.toThrow("CLEAN_TOOL_RENEWAL_FAILED:create");
  await firstDispatch;
  await vi.runAllTimersAsync();
  await rejected;
  expect(transport).toHaveBeenCalledTimes(1);
});

it("keeps supported legacy creation single-dispatch without blocking control requests", async () => {
  const transport = vi.fn(async () => new Response("{}"));
  const guarded = singleSandboxCreationFetch(transport);
  await guarded(
    new Request("https://synthetic.invalid/api/v2/sandboxes", {
      method: "POST",
    }),
  );
  await expect(
    guarded("https://synthetic.invalid/api/v2/sandboxes", { method: "POST" }),
  ).rejects.toThrow("SANDBOX_CREATE_UNCERTAIN");
  await guarded(
    "https://synthetic.invalid/api/v2/sandboxes/owned?resume=false",
    { method: "GET" },
  );
  await guarded(
    "https://synthetic.invalid/api/v2/sandboxes/sessions/owned/stop",
    { method: "POST" },
  );
  await guarded("https://synthetic.invalid/api/v2/sandboxes/owned", {
    method: "DELETE",
  });
  expect(transport).toHaveBeenCalledTimes(4);
});

it.each(["lost_response", "503", "429"])(
  "keeps one seven-day snapshot dispatch through the installed SDK after %s",
  async (failure) => {
    let started!: () => void;
    const firstSnapshot = new Promise<void>((resolve) => {
      started = resolve;
    });
    const transport = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        if (new URL(String(input)).pathname === "/api/v3/sandboxes")
          return Response.json(sdkReceipt());
        expect(new URL(String(input)).pathname).toBe(
          "/api/v2/sandboxes/sessions/synthetic-session/snapshot",
        );
        expect(JSON.parse(String(init?.body))).toEqual({
          expiration: 7 * 86400000,
        });
        started();
        if (failure === "lost_response")
          throw new TypeError(
            "Synthetic snapshot response lost after dispatch",
          );
        return new Response("{}", {
          status: Number(failure),
          headers: { "Retry-After": "0" },
        });
      },
    );
    const sdk = await Sandbox.create({
      token: "synthetic",
      projectId: "prj_synthetic",
      teamId: "team_synthetic",
      fetch: singleSandboxCreationFetch(transport, { allowSnapshot: true }),
    });
    const rejected = expect(
      sdk.snapshot({ expiration: 7 * 86400000 }),
    ).rejects.toThrow("SANDBOX_SNAPSHOT_UNCERTAIN");
    await firstSnapshot;
    await vi.runAllTimersAsync();
    await rejected;
    expect(transport).toHaveBeenCalledTimes(2);
  },
);

it("blocks unapproved snapshots, changed resource endpoints, lifetime extensions and automatic VM resume before dispatch", async () => {
  for (const [path, method, body] of [
    ["/api/v3/sandboxes/new-resource", "POST", "{}"],
    ["/api/v2/sandboxes/owned/fork", "POST", "{}"],
    ["/api/v2/sandboxes/owned?resume=true", "GET", undefined],
    ["/api/v2/sandboxes/owned", "GET", undefined],
    ["/api/v2/sandboxes/sessions/owned/extend-timeout", "POST", "{}"],
    ["/api/v2/sandboxes/owned", "PATCH", '{"timeout":600000}'],
    [
      "/api/v2/sandboxes/sessions/owned/snapshot",
      "POST",
      '{"expiration":604800000}',
    ],
  ]) {
    const transport = vi.fn(async () => Response.json({}));
    const guarded = singleSandboxCreationFetch(transport);
    await guarded("https://synthetic.invalid/api/v3/sandboxes", {
      method: "POST",
    });
    await expect(
      guarded(`https://synthetic.invalid${path}`, { method, body }),
    ).rejects.toThrow("POLICY_BLOCKED");
    expect(transport).toHaveBeenCalledTimes(1);
  }
  const transport = vi.fn(async () => Response.json({}));
  const guarded = singleSandboxCreationFetch(transport, {
    allowSnapshot: true,
  });
  await guarded("https://synthetic.invalid/api/v3/sandboxes", {
    method: "POST",
  });
  for (const expiration of [0, 7 * 86400000 + 1])
    await expect(
      guarded(
        "https://synthetic.invalid/api/v2/sandboxes/sessions/owned/snapshot",
        { method: "POST", body: JSON.stringify({ expiration }) },
      ),
    ).rejects.toThrow("POLICY_BLOCKED");
  expect(transport).toHaveBeenCalledTimes(1);
});

it("loads the native image-builder guard and makes one synthetic creation attempt", () => {
  const script = `
    let calls=0;
    globalThis.fetch=async()=>{calls++;throw new TypeError('Synthetic creation response lost');};
    process.env.VERCEL_SANDBOX_TOKEN='synthetic-machine-token';
    process.env.VERCEL_SANDBOX_PROJECT_ID='prj_synthetic';
    process.env.VERCEL_SANDBOX_TEAM_ID='team_synthetic';
    process.argv=['node','scripts/vercel-sandbox-build.mjs','media'];
    process.on('exit',()=>console.log('syntheticCreateDispatches='+calls));
    await import('./scripts/vercel-sandbox-build.mjs');
  `;
  let stdout = "";
  try {
    execFileSync(process.execPath, ["--input-type=module", "-e", script], {
      encoding: "utf8",
      stdio: "pipe",
      windowsHide: true,
      timeout: 4000,
    });
    throw new Error("Synthetic failed creation must not report image success");
  } catch (error) {
    const result = error as {
      status?: number;
      stdout?: string;
      stderr?: string;
    };
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Verification remains disabled");
    stdout = String(result.stdout);
  }
  expect(stdout).toContain("syntheticCreateDispatches=1");
  expect(stdout).not.toContain('"verified":true');
});

function sdkReceipt() {
  const now = Date.now();
  const session = {
    id: "synthetic-session",
    memory: 4096,
    vcpus: 2,
    region: "fra1",
    timeout: 300000,
    status: "running",
    requestedAt: now,
    createdAt: now,
    updatedAt: now,
    cwd: "/home/user",
  };
  const sandbox = {
    name: "synthetic-owned",
    persistent: false,
    createdAt: now,
    updatedAt: now,
    currentSessionId: session.id,
    status: "running",
  };
  return { session, sandbox, routes: [] };
}

it("preserves one bounded isolated creation and the SDK's stop/delete retry path", async () => {
  const receipt = sdkReceipt();
  const creationDeadline = new AbortController();
  vi.spyOn(AbortSignal, "timeout").mockImplementationOnce((milliseconds) => {
    expect(milliseconds).toBe(30000);
    setTimeout(() => creationDeadline.abort(), milliseconds);
    return creationDeadline.signal;
  });
  const create = vi.spyOn(Sandbox, "create");
  const command = vi
    .spyOn(Sandbox.prototype, "runCommand")
    .mockResolvedValue({ exitCode: 0 } as Awaited<
      ReturnType<Sandbox["runCommand"]>
    >);
  let stops = 0;
  const transport = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname;
      if (path === "/api/v3/sandboxes") {
        expect(JSON.parse(String(init?.body))).toMatchObject({
          persistent: false,
          region: "fra1",
          failoverRegions: [],
          resources: { vcpus: 2 },
          timeout: 300000,
          ports: [],
          networkPolicy: { mode: "deny-all" },
          source: { type: "snapshot", snapshotId: "snap_synthetic_media" },
        });
        expect(init?.signal).toBeInstanceOf(AbortSignal);
        return Response.json(receipt);
      }
      if (path.endsWith("/stop")) {
        expect(init?.signal).not.toBe(creationDeadline.signal);
        expect(init?.signal?.aborted).toBe(false);
        stops++;
        if (stops === 1) return new Response("{}", { status: 503 });
        return Response.json({
          session: { ...receipt.session, status: "stopped" },
        });
      }
      expect(init?.method).toBe("DELETE");
      expect(init?.signal).not.toBe(creationDeadline.signal);
      expect(init?.signal?.aborted).toBe(false);
      return Response.json({
        sandbox: { ...receipt.sandbox, status: "stopped" },
      });
    },
  );
  vi.stubGlobal("fetch", transport);
  const vm = await createJobSandbox("media", 300);
  expect(vm.sandboxId).toBe("vercel:synthetic-owned");
  expect(command).toHaveBeenCalledTimes(1);
  expect(create.mock.calls[0][0]).toHaveProperty("signal");
  await vi.advanceTimersByTimeAsync(31000);
  expect(creationDeadline.signal.aborted).toBe(true);
  const killed = expect(vm.kill()).resolves.toBeUndefined();
  await vi.waitUntil(() => stops === 1);
  await vi.runAllTimersAsync();
  await killed;
  expect(stops).toBe(2);
  expect(transport).toHaveBeenCalledTimes(4);
});

it("keeps ambiguous creation compute held and never records a known zero-cost success", async () => {
  vi.stubEnv("PERSONAL_ALPHA_SUBJECTS_JSON", '["synthetic-owner"]');
  vi.stubEnv("MEDIA_VERIFIED", "true");
  vi.stubEnv("SANDBOX_CREDITS_PER_SECOND", "0.02");
  vi.spyOn(console, "error").mockImplementation(() => {});
  const t = convexTest(schema, import.meta.glob("../convex/**/*.ts"));
  const ids = await t.run(async (ctx) => {
    const now = Date.now();
    const actor = await ctx.db.insert("users", {
      subject: "synthetic-owner",
      email: "owned@example.test",
      name: "Owned",
      status: "active",
      createdAt: now,
    });
    const organizationId = await ctx.db.insert("organizations", {
      name: "Synthetic",
      status: "active",
      createdBy: actor,
      createdAt: now,
    });
    await ctx.db.insert("memberships", {
      organizationId,
      userId: actor,
      role: "owner",
    });
    const wallet = await ctx.db.insert("wallets", {
      organizationId,
      granted: 10,
      purchased: 0,
      spent: 0,
      reserved: 10,
      tier: "trial",
      interval: "trial",
      periodEnd: now + 86400000,
      createdAt: now,
      updatedAt: now,
    });
    const pool = await ctx.db.insert("creditPools", {
      organizationId,
      key: "synthetic",
      kind: "included",
      granted: 10,
      spent: 0,
      reserved: 10,
      createdAt: now,
      updatedAt: now,
    });
    const deviceId = await ctx.db.insert("devices", {
      organizationId,
      owner: actor,
      name: "Synthetic",
      fingerprint: "a".repeat(64),
      codeHash: "b".repeat(64),
      credentialHash: "c".repeat(64),
      state: "paired",
      expiresAt: now + 900000,
      lastSeenAt: now,
      capabilities: [],
      personalProfileBinding: "synthetic-profile",
      createdAt: now,
      updatedAt: now,
    });
    const source = await ctx.db.insert("sources", {
      organizationId,
      key: "synthetic",
      canonical: "synthetic",
      kind: "upload",
      objectKey: `${organizationId}/synthetic-owned`,
      title: "Owned synthetic audio",
      state: "processing",
      coverage: "metadata_only",
      tags: [],
      rightsAttested: true,
      generation: 1,
      createdAt: now,
      updatedAt: now,
      personalAnalysis: {
        deviceId,
        actor,
        generation: 1,
        model: "synthetic-model",
        profileBinding: "synthetic-profile",
        effort: "medium",
        state: "preparing",
        approvedAt: now,
        expiresAt: now + 900000,
        leaseUntil: 0,
        deadline: 0,
      },
    });
    await ctx.db.insert("assets", {
      organizationId,
      sourceId: source,
      sourceGeneration: 0,
      key: `${organizationId}/synthetic-owned`,
      type: "video/mp4",
      size: 100,
      state: "complete",
      kind: "original",
      etag: "synthetic-original-etag",
      expiresAt: now + 3600000,
      createdAt: now,
      updatedAt: now,
    });
    const reservation = await ctx.db.insert("reservations", {
      organizationId,
      key: `personal-media:${source}:1`,
      max: 10,
      settled: 0,
      state: "active",
      expiresAt: now + 900000,
      allocations: [{ poolId: pool, credits: 10 }],
      operatorKeys: [],
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("reservations", {
      organizationId,
      key: `source:${source}:1`,
      max: 0,
      settled: 0,
      state: "active",
      expiresAt: now + 900000,
      createdAt: now,
      updatedAt: now,
    });
    return { source, reservation, wallet, pool };
  });
  let started!: () => void;
  const firstDispatch = new Promise<void>((resolve) => {
    started = resolve;
  });
  const transport = vi.fn(async () => {
    started();
    throw new TypeError("Synthetic response lost after dispatch");
  });
  vi.stubGlobal("fetch", transport);
  const prepared = t.action(internal.personalMedia.prepare, {
    id: ids.source,
    generation: 1,
  });
  await firstDispatch;
  await vi.runAllTimersAsync();
  await prepared;
  const result = await t.run(async (ctx) => ({
    source: await ctx.db.get(ids.source),
    reservation: await ctx.db.get(ids.reservation),
    wallet: await ctx.db.get(ids.wallet),
    pool: await ctx.db.get(ids.pool),
  }));
  expect(transport).toHaveBeenCalledTimes(1);
  expect(result.source).toMatchObject({
    state: "failed",
    personalAnalysis: { state: "failed" },
  });
  expect(result.source?.error).toContain("Compute usage needs reconciliation");
  expect(result.source?.analysis).toBeUndefined();
  expect(result.reservation).toMatchObject({
    state: "active",
    settled: 0,
    max: 10,
    dispatchedAt: expect.any(Number),
  });
  expect(result.wallet).toMatchObject({ spent: 0, reserved: 10 });
  expect(result.pool).toMatchObject({ spent: 0, reserved: 10 });
});
