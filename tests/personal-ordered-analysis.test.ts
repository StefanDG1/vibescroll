import { afterEach, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import workflowTest from "@convex-dev/workflow/test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { wallet } from "../convex/product";
import { normalizeSubscriptionCapabilities } from "../packages/runner/subscription-capabilities.mjs";
import {
  OfficialPersonalClient,
  processPersonalJob,
} from "../packages/runner/personal-analysis.mjs";
import { checkOrderedAsr } from "../packages/runner/personal-ordered-preflight.mjs";
import { orderedRevisionHash } from "../packages/social/contracts";
const mocks = vi.hoisted(() => ({
  decode: vi.fn(),
  metadata: vi.fn(),
  google: vi.fn(),
}));
vi.mock("../packages/providers/ordered-media", async (original) => ({
  ...(await original<typeof import("../packages/providers/ordered-media")>()),
  prepareOrderedMedia: (...args: unknown[]) => mocks.decode(...args),
}));
vi.mock("../packages/providers/storage", () => ({
  signedObject: (key: string, method: string) =>
    `https://${"a".repeat(32)}.eu.r2.cloudflarestorage.com/bucket/${encodeURIComponent(key)}?method=${method}`,
  objectMetadata: (...args: unknown[]) => mocks.metadata(...args),
}));
vi.mock("../convex/lib/googleInference", () => ({ inferGoogle: mocks.google }));
const modules = import.meta.glob("../convex/**/*.ts");
const sha = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  mocks.decode.mockReset();
  mocks.metadata.mockReset();
  mocks.google.mockReset();
});
async function setup(kind: "image" | "video" = "image", count = 1) {
  vi.useFakeTimers();
  vi.stubEnv("PERSONAL_ALPHA_SUBJECTS_JSON", '["ordered-owner"]');
  vi.stubEnv("MEDIA_VERIFIED", "true");
  vi.stubEnv("ORDERED_MEDIA_VERIFIED", "true");
  vi.stubEnv("SANDBOX_CREDITS_PER_SECOND", "0.01");
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  workflowTest.register(t);
  await t.mutation(internal.accounts.syncUser, {
    subject: "ordered-owner",
    email: "ordered@example.test",
    name: "Synthetic ordered owner",
  });
  const owner = t.withIdentity({
      subject: "ordered-owner",
      auth_time: Math.floor(Date.now() / 1000),
    }),
    org = await owner.mutation(api.organizations.create, {
      name: "Private supplied media",
    });
  const raw = new Uint8Array([255, 216, 255, 1]),
    key = `${org}/synthetic-raw`;
  await t.run(async (ctx) => {
    const w = await wallet(ctx, org);
    await ctx.db.patch(w._id, { granted: 100 });
    for (let index = 0; index < count; index++)
      await ctx.db.insert("assets", {
        organizationId: org,
        key: index ? `${key}-${index}` : key,
        size: raw.length,
        type: kind === "video" ? "video/mp4" : "image/jpeg",
        state: "complete",
        etag: "synthetic-etag",
        expiresAt: Date.now() + 3600000,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
  });
  const id = await owner.mutation(api.product.captureOrdered, {
    organizationId: org,
    key: "ordered-synthetic",
    title: "Supplied original",
    assets: Array.from({ length: count }, (_, index) => ({
      key: index ? `${key}-${index}` : key,
      index,
      sha256: sha(raw),
    })),
    rightsAttested: true,
    caption: "Synthetic supplied caption",
  });
  const device = await owner.mutation(api.devices.start, {
      organizationId: org,
      name: "Synthetic paired computer",
      fingerprint: "a".repeat(64),
      codeHash: "b".repeat(64),
    }),
    credentialHash = "c".repeat(64);
  await owner.mutation(api.devices.approve, {
    id: device,
    fingerprint: "a".repeat(64),
    credentialHash,
  });
  const caps = normalizeSubscriptionCapabilities({
      data: [
        {
          model: "synthetic-image-model",
          supportedReasoningEfforts: [{ reasoningEffort: "high" }],
          inputModalities: ["text", "image"],
        },
      ],
    }),
    profileBinding = "d".repeat(64);
  const dispatch = (args: any) =>
    t.mutation(internal.personalAnalysis.dispatch, { credentialHash, ...args });
  const hello = () =>
    dispatch({
      operation: "hello",
      models: [{ slug: "synthetic-image-model", displayName: "Synthetic" }],
      profileBinding,
      capabilities: caps,
      sessionExpiresAt: Date.now() + 4 * 3600000,
      inputProtocols: ["ordered-personal-v1"],
    });
  await hello();
  const approve = () =>
    owner.mutation(api.personalAnalysis.approve, {
      id,
      generation: 0,
      deviceId: device,
      model: "synthetic-image-model",
      effort: "high",
      useOwnPlan: true,
      maxComputeCredits: 10,
    });
  const store = new Map<string, { bytes: Uint8Array; type: string }>();
  const fetchImpl = vi.fn(async (url: any, options: any = {}) => {
    const u = new URL(url),
      objectKey = decodeURIComponent(u.pathname.slice("/bucket/".length));
    if (options.method === "PUT") {
      store.set(objectKey, {
        bytes: new Uint8Array(options.body),
        type: options.headers["Content-Type"],
      });
      return new Response(null, { status: 200 });
    }
    const value = store.get(objectKey);
    return value
      ? new Response(Uint8Array.from(value.bytes).buffer, {
          headers: {
            "content-length": String(value.bytes.length),
            "content-type": value.type,
          },
        })
      : new Response(null, { status: 404 });
  });
  vi.stubGlobal("fetch", fetchImpl);
  mocks.metadata.mockImplementation(async (key: string) => ({
    size: store.get(key)!.bytes.length,
    type: store.get(key)!.type,
    etag: "synthetic-etag",
  }));
  const wav = new Uint8Array(3244),
    view = new DataView(wav.buffer);
  const tag = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) wav[offset + i] = text.charCodeAt(i);
  };
  tag(0, "RIFF");
  view.setUint32(4, 3236, true);
  tag(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true);
  view.setUint32(28, 32000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  tag(36, "data");
  view.setUint32(40, 3200, true);
  mocks.decode.mockImplementation(async (assets: any[], options: any) => {
    await options.authorize();
    const files = new Map<string, Uint8Array>();
    const decoded = assets.map((input) => {
      const prefix = `asset-${String(input.index).padStart(3, "0")}`,
        file =
          kind === "video" ? `${prefix}-frame-000.jpg` : `${prefix}-image.jpg`;
      files.set(file, raw);
      if (kind === "video") files.set(`${prefix}-audio.wav`, wav);
      return {
        id: input.id,
        index: input.index,
        kind,
        mime: kind === "video" ? "video/mp4" : "image/jpeg",
        bytes: raw.length,
        contentHash: sha(raw),
        width: 100,
        height: 60,
        ...(kind === "video" ? { durationMs: 100 } : {}),
        representations: [
          {
            kind: kind === "video" ? "video_frame" : "image",
            file,
            bytes: raw.length,
            sha256: sha(raw),
            width: 100,
            height: 60,
            ...(kind === "video" ? { timestampMs: 0 } : {}),
          },
        ],
        audio:
          kind === "video"
            ? {
                file: `${prefix}-audio.wav`,
                bytes: wav.length,
                sha256: sha(wav),
              }
            : null,
      };
    });
    return {
      computeSeconds: 2,
      files,
      manifest: {
        schemaVersion: "ordered-decoder-v1",
        assets: decoded,
        omitted: [],
        inputBytes: raw.length * count,
        videoDurationMs: kind === "video" ? 100 * count : 0,
        representationBytes: raw.length * count,
        audioBytes: kind === "video" ? wav.length * count : 0,
      },
    };
  });
  const official = {
    session: { profileBinding },
    check: vi.fn(async () => {}),
    capabilities: vi.fn(async () => caps),
    server: {
      request: vi.fn(async () => ({
        rateLimits: { primary: { usedPercent: 0 } },
      })),
    },
    structured: vi.fn(
      async (grammar: any, input: any, _frames: any[], _options: any) => {
        if (grammar.properties.observations)
          return {
            output: {
              observations: [
                {
                  text: "A visible synthetic label",
                  basis: "visible",
                  uncertainty: "",
                },
              ],
            },
          };
        const value = input.source,
          e = value.prepared.evidence[0];
        return {
          output: {
            schemaVersion: "3.0.0",
            sourceId: id,
            processingRunId: value.processingRunId,
            postRevisionHash: value.prepared.post.revisionHash,
            coverage: "ordered_media",
            summary: "Synthetic supplied media",
            warnings: [],
            insights: [
              {
                id: "idea_1",
                kind: "idea",
                title: "Check supplied evidence",
                claim: "A synthetic label is visible.",
                interpretation: "Review the source.",
                categories: ["general_advice"],
                evidence: [
                  {
                    kind: e.kind,
                    id: e.id,
                    startMs: e.kind === "image_observation" ? null : e.startMs,
                    endMs: e.kind === "image_observation" ? null : e.endMs,
                  },
                ],
                confidence: "supported",
                verificationNeeds: [],
              },
            ],
          },
        };
      },
    ),
  };
  const client = new OfficialPersonalClient(official);
  const request = async (operation: string, args: any = {}) =>
    dispatch({ operation, ...args });
  const poll = async () => {
    const result: any = await dispatch({ operation: "poll" });
    if (result.job?.media)
      result.job.media = await t.action(internal.personalOrderedMedia.lease, {
        credentialHash,
        id,
        generation: result.job.generation,
        claimToken: result.job.claimToken,
      });
    return result.job;
  };
  return {
    t,
    owner,
    org,
    id,
    device,
    credentialHash,
    caps,
    profileBinding,
    dispatch,
    hello,
    approve,
    client,
    official,
    request,
    poll,
    fetchImpl,
    raw,
    key,
  };
}
it("fresh official preflight hands off once before any paid preparation, then actual observations complete schema3 on the same existing personal job", async () => {
  const s = await setup();
  await s.approve();
  expect(mocks.decode).not.toHaveBeenCalled();
  expect(
    await s.t.run((ctx) => ctx.db.query("reservations").collect()),
  ).toMatchObject([{ max: 0 }]);
  const first = await s.poll();
  expect(first).toMatchObject({
    inputKind: "ordered-personal-v1",
    phase: "preflight",
    needsAudio: false,
  });
  expect(first).not.toHaveProperty("media");
  expect(JSON.stringify(first)).not.toContain("synthetic-raw");
  expect(
    await processPersonalJob(first, { client: s.client, request: s.request }),
  ).toEqual({ completed: false, deferred: true });
  expect(s.official.structured).not.toHaveBeenCalled();
  expect(s.official.server.request).toHaveBeenCalledWith(
    "account/rateLimits/read",
  );
  expect(mocks.decode).not.toHaveBeenCalled();
  const ack = {
    operation: "ordered_preflight",
    id: s.id,
    generation: 1,
    claimToken: first.claimToken,
    profileBinding: s.profileBinding,
    capabilities: s.caps,
    localAsrReady: true,
  };
  expect(await s.dispatch(ack)).toEqual({ accepted: true, deferred: true });
  expect(
    await s.t.run((ctx) => ctx.db.query("reservations").collect()),
  ).toHaveLength(2);
  await s.t.action(internal.personalOrderedMedia.prepare, {
    id: s.id,
    generation: 1,
  });
  const second = await s.poll();
  expect(second.phase).toBe("analysis");
  expect(second.claimToken).not.toBe(first.claimToken);
  await expect(
    s.dispatch({
      operation: "fail",
      id: s.id,
      generation: 1,
      claimToken: first.claimToken,
    }),
  ).rejects.toThrow("phase lease changed");
  expect(
    await processPersonalJob(second, {
      client: s.client,
      request: s.request,
      fetchImpl: s.fetchImpl,
    }),
  ).toEqual({ completed: true });
  const source = (await s.t.run((ctx) => ctx.db.get(s.id)))!;
  expect(source.state).toBe("ready");
  expect(source.analysis.schemaVersion).toBe("3.0.0");
  expect(source.orderedMedia.post.schemaVersion).toBe("provided-media-v1");
  expect(source.orderedMedia.post.provenance).toBe("user_supplied_unverified");
  expect(source.analysis.insights[0].evidence[0]).toMatchObject({
    kind: "image_observation",
    startMs: null,
    endMs: null,
  });
  expect(source.personalAnalysis?.state).toBe("completed");
  expect(source.managedAnalysisActor).toBeUndefined();
  expect(source.serviceIntent).toBeUndefined();
  expect(
    await s.t.run((ctx) => ctx.db.query("publicArtifacts").collect()),
  ).toHaveLength(0);
  expect(
    await s.t.run((ctx) => ctx.db.query("localLibraryRuns").collect()),
  ).toHaveLength(0);
  expect(mocks.google).not.toHaveBeenCalled();
  expect(
    await s.t.run((ctx) => ctx.db.query("reservations").collect()),
  ).toMatchObject([
    { state: "settled", settled: 0 },
    { state: "settled", settled: 1 },
  ]);
});
it("legacy runners and unavailable image efforts cannot approve an ordered job", async () => {
  const s = await setup();
  await s.dispatch({
    operation: "hello",
    models: [{ slug: "synthetic-image-model", displayName: "Synthetic" }],
    profileBinding: s.profileBinding,
  });
  await expect(s.approve()).rejects.toThrow("SETUP_REQUIRED");
  await s.hello();
  await expect(
    s.owner.mutation(api.personalAnalysis.approve, {
      id: s.id,
      generation: 0,
      deviceId: s.device,
      model: "synthetic-image-model",
      effort: "ultra",
      useOwnPlan: true,
      maxComputeCredits: 10,
    }),
  ).rejects.toThrow();
  expect(mocks.decode).not.toHaveBeenCalled();
});
it("actual allowance refusal fails before paid prep and does not switch providers", async () => {
  const s = await setup();
  await s.approve();
  const job = await s.poll();
  s.official.server.request.mockResolvedValueOnce({
    rateLimits: { primary: { usedPercent: 100 } },
  });
  await expect(
    processPersonalJob(job, { client: s.client, request: s.request }),
  ).rejects.toThrow("ALLOWANCE_UNAVAILABLE");
  expect(mocks.decode).not.toHaveBeenCalled();
  expect(
    await s.t.run((ctx) => ctx.db.query("reservations").collect()),
  ).toHaveLength(1);
});
it("missing local ASR fails its offline silent probe without installation, download or provider requests", async () => {
  await expect(
    checkOrderedAsr(undefined, new AbortController().signal),
  ).rejects.toThrow("ASR_SETUP_REQUIRED");
  const transcribe = vi.fn(async (bytes: Uint8Array) => ({
    durationMs: 100,
    segments: [],
    audioSha256: sha(bytes),
  }));
  expect(
    await checkOrderedAsr(
      { pythonPath: "fixture", modelDirectory: "fixture" },
      new AbortController().signal,
      transcribe,
    ),
  ).toBe(true);
  expect(transcribe.mock.calls[0][0].byteLength).toBe(3244);
});

async function prepared(s: Awaited<ReturnType<typeof setup>>) {
  await s.approve();
  const preflight = await s.poll();
  await processPersonalJob(preflight, { client: s.client, request: s.request });
  await s.t.action(internal.personalOrderedMedia.prepare, {
    id: s.id,
    generation: 1,
  });
  return { preflight, job: await s.poll() };
}
it("late preflight callbacks cannot clear a different active source claim", async () => {
  const s = await setup();
  await s.approve();
  const old = await s.poll();
  await processPersonalJob(old, { client: s.client, request: s.request });
  expect(
    (await s.t.run((ctx) => ctx.db.get(s.id)))?.personalAnalysis?.ordered
      ?.leaseToken,
  ).toBeUndefined();
  const other = await s.owner.mutation(api.product.capture, {
    organizationId: s.org,
    key: "other-text-source",
    kind: "text",
    title: "Other own source",
    text: "A synthetic supplied note",
    rightsAttested: true,
  });
  await s.owner.mutation(api.personalAnalysis.approve, {
    id: other,
    generation: 0,
    deviceId: s.device,
    model: "synthetic-image-model",
    effort: "high",
    useOwnPlan: true,
  });
  const current: any = await s.dispatch({ operation: "poll" });
  expect(current.job.id).toBe(other);
  await expect(
    s.dispatch({
      operation: "fail",
      id: s.id,
      generation: 1,
      claimToken: old.claimToken,
    }),
  ).rejects.toThrow("No matching active job");
  expect(
    (await s.t.run((ctx) => ctx.db.get(s.device)))?.activePersonalSource,
  ).toBe(other);
  expect(
    (await s.t.run((ctx) => ctx.db.get(other)))?.personalAnalysis?.state,
  ).toBe("running");
});
it("cancel fences the old token while permitting explicit fresh review of retained raw inputs", async () => {
  const s = await setup();
  await s.approve();
  const old = await s.poll();
  await s.owner.mutation(api.personalAnalysis.cancel, { id: s.id });
  await expect(
    s.dispatch({
      operation: "ordered_preflight",
      id: s.id,
      generation: 1,
      claimToken: old.claimToken,
      capabilities: s.caps,
      profileBinding: s.profileBinding,
      localAsrReady: true,
    }),
  ).rejects.toThrow();
  expect(
    (await s.t.run((ctx) => ctx.db.get(s.device)))?.activePersonalSource,
  ).toBeUndefined();
  const row = await s.t.run((ctx) =>
    ctx.db
      .query("assets")
      .withIndex("by_key", (q) => q.eq("key", s.key))
      .unique(),
  );
  expect(row?.sourceGeneration).toBe(2);
  await s.owner.mutation(api.personalAnalysis.approve, {
    id: s.id,
    generation: 2,
    deviceId: s.device,
    model: "synthetic-image-model",
    effort: "high",
    useOwnPlan: true,
    maxComputeCredits: 10,
  });
  expect((await s.t.run((ctx) => ctx.db.get(s.id)))?.generation).toBe(3);
  expect(mocks.decode).not.toHaveBeenCalled();
});
it("expired ordered claims reconcile only their exact token and do not dispatch new model work", async () => {
  const s = await setup();
  await s.approve();
  const old = await s.poll();
  await vi.advanceTimersByTimeAsync(41000);
  const response: any = await s.dispatch({ operation: "poll" });
  expect(response.reconcile).toMatchObject({
    id: s.id,
    inputKind: "ordered-personal-v1",
    claimToken: old.claimToken,
  });
  await expect(
    s.dispatch({
      operation: "fail",
      id: s.id,
      generation: 1,
      claimToken: "wrong",
    }),
  ).rejects.toThrow();
  expect(
    await s.dispatch({
      operation: "fail",
      id: s.id,
      generation: 1,
      claimToken: old.claimToken,
    }),
  ).toEqual({ stopped: true });
  expect(
    (await s.t.run((ctx) => ctx.db.get(s.device)))?.activePersonalSource,
  ).toBeUndefined();
  expect(s.official.structured).not.toHaveBeenCalled();
});
it("unknown preparation termination retains the full existing compute hold and refuses fresh dispatch", async () => {
  const s = await setup();
  await s.approve();
  const old = await s.poll();
  await processPersonalJob(old, { client: s.client, request: s.request });
  mocks.decode.mockRejectedValueOnce(Error("synthetic unknown creation"));
  await s.t.action(internal.personalOrderedMedia.prepare, {
    id: s.id,
    generation: 1,
  });
  expect(
    await s.t.run((ctx) => ctx.db.query("reservations").collect()),
  ).toMatchObject([
    { state: "settled", settled: 0 },
    { state: "active", max: 10 },
  ]);
  await expect(
    s.owner.mutation(api.personalAnalysis.approve, {
      id: s.id,
      generation: 1,
      deviceId: s.device,
      model: "synthetic-image-model",
      effort: "high",
      useOwnPlan: true,
      maxComputeCredits: 10,
    }),
  ).rejects.toThrow("COST_RECONCILIATION_REQUIRED");
  expect(mocks.decode).toHaveBeenCalledTimes(1);
  expect(s.official.structured).not.toHaveBeenCalled();
});
it.each(["device-revoked", "raw-expired"])(
  "releases only unstarted ordered compute when %s changes after preflight",
  async (change) => {
    const s = await setup();
    await s.approve();
    await processPersonalJob(await s.poll(), {
      client: s.client,
      request: s.request,
    });
    await s.t.run(async (ctx) => {
      if (change === "device-revoked")
        await ctx.db.patch(s.device, { state: "revoked" });
      else {
        const raw = (await ctx.db
          .query("assets")
          .withIndex("by_key", (q) => q.eq("key", s.key))
          .unique())!;
        await ctx.db.patch(raw._id, { expiresAt: Date.now() - 1 });
      }
    });
    await s.t.action(internal.personalOrderedMedia.prepare, {
      id: s.id,
      generation: 1,
    });
    const held = (
      await s.t.run((ctx) => ctx.db.query("reservations").collect())
    ).find((row) => row.key === `personal-media:${s.id}:1`)!;
    expect(held).toMatchObject({ state: "settled", settled: 0 });
    expect(held.dispatchedAt).toBeUndefined();
    expect(mocks.decode).not.toHaveBeenCalled();
  },
);
it.each([false, true])(
  "expiry releases ordered preparation only if it was never dispatched: dispatched=%s",
  async (dispatched) => {
    const s = await setup();
    await s.approve();
    await processPersonalJob(await s.poll(), {
      client: s.client,
      request: s.request,
    });
    if (dispatched)
      expect(
        await s.t.mutation(internal.personalOrderedMediaState.begin, {
          id: s.id,
          generation: 1,
        }),
      ).not.toBeNull();
    await s.t.run(async (ctx) => {
      const source = (await ctx.db.get(s.id))!;
      await ctx.db.patch(s.id, {
        personalAnalysis: {
          ...source.personalAnalysis!,
          expiresAt: Date.now() - 1,
        },
      });
    });
    await s.t.mutation(internal.personalMediaState.expire, {
      id: s.id,
      generation: 1,
    });
    const held = (
      await s.t.run((ctx) => ctx.db.query("reservations").collect())
    ).find((row) => row.key === `personal-media:${s.id}:1`)!;
    expect(held.state).toBe(dispatched ? "active" : "settled");
    expect(held.dispatchedAt === undefined).toBe(!dispatched);
    expect(mocks.decode).not.toHaveBeenCalled();
  },
);
it.each(["image-time", "actual-hash", "source-binding"])(
  "server completion rejects forged %s even when the client result is otherwise valid",
  async (kind) => {
    const s = await setup(),
      p = await prepared(s);
    let captured: any;
    await processPersonalJob(p.job, {
      client: s.client,
      request: async (op, args) => {
        if (op === "complete") {
          captured = structuredClone(args);
          return { accepted: true };
        }
        return s.request(op, args);
      },
      fetchImpl: s.fetchImpl,
    });
    if (kind === "image-time")
      captured.output.insights[0].evidence[0].startMs = 0;
    if (kind === "source-binding") captured.output.sourceId = "forged-source";
    if (kind === "actual-hash") {
      captured.orderedEvidence.post.assets[0].contentHash = "f".repeat(64);
      const revision = await orderedRevisionHash(captured.orderedEvidence.post);
      captured.orderedEvidence.post.revisionHash = revision;
      captured.orderedEvidence.evidence.forEach(
        (e: any) => (e.postRevisionHash = revision),
      );
      captured.output.postRevisionHash = revision;
    }
    await expect(
      s.dispatch({ operation: "complete", ...captured }),
    ).rejects.toThrow();
    expect((await s.t.run((ctx) => ctx.db.get(s.id)))?.state).toBe(
      "processing",
    );
    expect(
      (await s.t.run((ctx) => ctx.db.get(s.id)))?.orderedMedia,
    ).toBeUndefined();
    expect(mocks.google).not.toHaveBeenCalled();
  },
);
it("revoked retained evidence fails the next heartbeat before another local model turn", async () => {
  const s = await setup(),
    p = await prepared(s);
  await s.t.run((ctx) => ctx.db.patch(s.id, { rightsAttested: false }));
  await expect(
    s.dispatch({
      operation: "heartbeat",
      id: s.id,
      generation: 1,
      claimToken: p.job.claimToken,
    }),
  ).rejects.toThrow();
  expect(s.official.structured).not.toHaveBeenCalled();
});
it("a supplied carousel preserves both original untimed child positions through actual official structured observations", async () => {
  const s = await setup("image", 2),
    p = await prepared(s);
  await processPersonalJob(p.job, {
    client: s.client,
    request: s.request,
    fetchImpl: s.fetchImpl,
  });
  const source = (await s.t.run((ctx) => ctx.db.get(s.id)))!;
  expect(source.orderedMedia.post.assets.map((a: any) => a.index)).toEqual([
    0, 1,
  ]);
  expect(source.orderedMedia.evidence.map((e: any) => e.assetIndex)).toEqual([
    0, 1,
  ]);
  expect(
    source.orderedMedia.evidence.every((e: any) => !("startMs" in e)),
  ).toBe(true);
  expect(s.official.structured).toHaveBeenCalledTimes(3);
});
it("prepared video uses a checked local ASR callback with actual audio hash and retains speech uncertainty", async () => {
  const s = await setup("video"),
    probe = vi.fn(async (bytes: Uint8Array) => ({
      durationMs: 100,
      segments: [],
      audioSha256: sha(bytes),
    }));
  const client = {
    status: s.client.status.bind(s.client),
    capabilities: s.client.capabilities.bind(s.client),
    respond: s.client.respond.bind(s.client),
    preflight: async (options: any) => {
      await checkOrderedAsr(
        { pythonPath: "fixture", modelDirectory: "fixture" },
        options.signal,
        probe,
      );
      return s.client.preflight({ ...options, needsAudio: false });
    },
  };
  await s.approve();
  const first = await s.poll();
  expect(first.needsAudio).toBe(true);
  await processPersonalJob(first, { client, request: s.request });
  expect(probe).toHaveBeenCalledTimes(1);
  expect(mocks.decode).not.toHaveBeenCalled();
  await s.t.action(internal.personalOrderedMedia.prepare, {
    id: s.id,
    generation: 1,
  });
  const job = await s.poll(),
    asr = vi.fn(async (bytes: Uint8Array) => ({
      audioSha256: sha(bytes),
      durationMs: 100,
      segments: [{ text: "Synthetic spoken sentence", startMs: 10, endMs: 90 }],
      warnings: ["Automatic transcription can contain errors."],
    }));
  await processPersonalJob(job, {
    client,
    request: s.request,
    fetchImpl: s.fetchImpl,
    transcribe: asr,
  });
  const source = (await s.t.run((ctx) => ctx.db.get(s.id)))!;
  expect(source.state).toBe("ready");
  expect(source.orderedMedia.post.assets[0].audioInspected).toBe(true);
  expect(
    source.orderedMedia.evidence.find((e: any) => e.basis === "transcript"),
  ).toMatchObject({
    startMs: 10,
    endMs: 90,
    uncertainty: "Automatic transcription can contain errors.",
  });
  expect(asr).toHaveBeenCalledOnce();
  expect(mocks.google).not.toHaveBeenCalled();
});

it.each(["etag", "expiresAt"])(
  "a same-key same-size raw asset %s change invalidates preparation and prevents a subsequent model dispatch",
  async (field) => {
    const s = await setup(),
      p = await prepared(s);
    await s.t.run(async (ctx) => {
      const row = (await ctx.db
        .query("assets")
        .withIndex("by_key", (q) => q.eq("key", s.key))
        .unique())!;
      await ctx.db.patch(
        row._id,
        field === "etag"
          ? { etag: "synthetic-rewritten-etag" }
          : { expiresAt: Date.now() + 600000 },
      );
    });
    await expect(
      s.dispatch({
        operation: "heartbeat",
        id: s.id,
        generation: 1,
        claimToken: p.job.claimToken,
      }),
    ).rejects.toThrow("Ordered input or runner changed");
    await expect(
      s.t.action(internal.personalOrderedMedia.lease, {
        credentialHash: s.credentialHash,
        id: s.id,
        generation: 1,
        claimToken: p.job.claimToken,
      }),
    ).rejects.toThrow();
    expect(s.official.structured).not.toHaveBeenCalled();
  },
);
it("a raw asset rewrite after preflight approval cannot consume the paid preparation reservation", async () => {
  const s = await setup();
  await s.approve();
  const job = await s.poll();
  await s.t.run(async (ctx) => {
    const row = (await ctx.db
      .query("assets")
      .withIndex("by_key", (q) => q.eq("key", s.key))
      .unique())!;
    await ctx.db.patch(row._id, { etag: "synthetic-rewritten-etag" });
  });
  await expect(
    s.dispatch({
      operation: "ordered_preflight",
      id: s.id,
      generation: 1,
      claimToken: job.claimToken,
      profileBinding: s.profileBinding,
      capabilities: s.caps,
      localAsrReady: true,
    }),
  ).rejects.toThrow();
  expect(
    await s.t.run((ctx) => ctx.db.query("reservations").collect()),
  ).toHaveLength(1);
  expect(mocks.decode).not.toHaveBeenCalled();
});

it("revoking the ordered release gate after preparation denies lease, heartbeat and final commit", async () => {
  const s = await setup(),
    p = await prepared(s);
  let completion: any;
  await processPersonalJob(p.job, {
    client: s.client,
    request: async (op, args) => {
      if (op === "complete") {
        completion = args;
        return { accepted: true };
      }
      return s.request(op, args);
    },
    fetchImpl: s.fetchImpl,
  });
  vi.stubEnv("ORDERED_MEDIA_VERIFIED", "false");
  await expect(
    s.dispatch({
      operation: "heartbeat",
      id: s.id,
      generation: 1,
      claimToken: p.job.claimToken,
    }),
  ).rejects.toThrow();
  await expect(
    s.t.action(internal.personalOrderedMedia.lease, {
      credentialHash: s.credentialHash,
      id: s.id,
      generation: 1,
      claimToken: p.job.claimToken,
    }),
  ).rejects.toThrow();
  await expect(
    s.dispatch({ operation: "complete", ...completion }),
  ).rejects.toThrow();
  expect((await s.t.run((ctx) => ctx.db.get(s.id)))?.state).toBe("processing");
  expect(
    (await s.t.run((ctx) => ctx.db.get(s.id)))?.orderedMedia,
  ).toBeUndefined();
});

it("a refused heartbeat interrupts the active official observation and never submits a late final result", async () => {
  const s = await setup(),
    p = await prepared(s);
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  s.official.structured.mockImplementationOnce(
    async (_grammar: any, _input: any, _frames: any[], options: any) => {
      entered();
      return new Promise((_resolve, reject) => {
        options.signal.addEventListener(
          "abort",
          () => reject(Error("synthetic official observation interrupted")),
          { once: true },
        );
      });
    },
  );
  const request = vi.fn(s.request),
    result = processPersonalJob(p.job, {
      client: s.client,
      request,
      fetchImpl: s.fetchImpl,
    });
  const rejected = expect(result).rejects.toThrow("observation interrupted");
  await started;
  await s.t.run((ctx) => ctx.db.patch(s.id, { rightsAttested: false }));
  await vi.advanceTimersByTimeAsync(10000);
  await rejected;
  expect(s.official.structured).toHaveBeenCalledOnce();
  expect(request.mock.calls.map(([op]) => op)).not.toContain("complete");
  expect(
    (await s.t.run((ctx) => ctx.db.get(s.id)))?.orderedMedia,
  ).toBeUndefined();
});
