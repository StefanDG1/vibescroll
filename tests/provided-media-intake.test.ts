import { afterEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import {
  providedMediaMetadata,
  providedMediaSchema,
  orderedRevisionHash,
  socialHash,
  validateOrderedEvidence,
  validateSocialEvidence,
} from "../packages/social/contracts";
import {
  validateOrderedAnalysis,
  validateSocialAnalysis,
} from "../packages/social/analysis";
import { currentOrderedSource } from "../convex/lib/orderedSource";
import { exportRecord } from "../packages/privacy/export";
import type { Doc } from "../convex/_generated/dataModel";

const modules = import.meta.glob("../convex/**/*.ts");
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
async function setup(count = 1) {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  await t.mutation(internal.accounts.syncUser, {
    subject: "provided",
    email: "provided@example.test",
    name: "Provided",
  });
  const a = t.withIdentity({ subject: "provided" });
  const org = await a.mutation(api.organizations.create, { name: "Provided" });
  const assets = await t.run(async (ctx) => {
    const result = [];
    for (let index = 0; index < count; index++) {
      const key = `${org}/${crypto.randomUUID()}`;
      await ctx.db.insert("assets", {
        organizationId: org,
        key,
        size: 4,
        type: "image/png",
        state: "complete",
        etag: "synthetic-storage-etag",
        expiresAt: Date.now() + 3600000,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      result.push({ key, index, sha256: "a".repeat(64) });
    }
    return result;
  });
  return {
    t,
    a,
    org,
    input: {
      organizationId: org,
      key: crypto.randomUUID(),
      title: "Supplied files",
      assets,
      rightsAttested: true,
    },
  };
}
it.each([1, 35])(
  "captures %i ordered private files atomically without inference or invented social identity",
  async (count) => {
    const f = await setup(count);
    const args = {
      ...f.input,
      originalUrl: "https://www.instagram.com/p/Original/",
      caption: "A supplied caption",
    };
    const id = await f.a.mutation(api.product.captureOrdered, args);
    const source = await f.t.run((ctx) => ctx.db.get(id));
    expect(source).toMatchObject({
      state: "saved",
      generation: 0,
      kind: "upload",
      coverage: "metadata_only",
    });
    expect(source!.personalOrderedInput).toMatchObject({
      schemaVersion: "ordered-personal-input-v1",
      metadata: {
        schemaVersion: "provided-media-v1",
        originalUrl: args.originalUrl,
        publishedAt: null,
        dateReliability: "unknown",
        provenance: "user_supplied_unverified",
        expectedAssetCount: count,
      },
    });
    expect(source!.canonical).toBe(
      `provided:${source!.personalOrderedInput.metadata.submissionId}`,
    );
    expect(source).not.toHaveProperty("socialIdentity");
    expect(source).not.toHaveProperty("personalAnalysis");
    expect(source).not.toHaveProperty("orderedMedia");
    expect(await f.a.mutation(api.product.captureOrdered, args)).toBe(id);
    await expect(
      f.a.mutation(api.product.captureOrdered, { ...args, caption: "Changed" }),
    ).rejects.toThrow("INPUT_CHANGED");
    await f.t.run(async (ctx) => {
      expect(await ctx.db.query("reservations").collect()).toEqual([]);
      for (const [index, input] of args.assets.entries()) {
        const asset = await ctx.db
          .query("assets")
          .withIndex("by_key", (q) => q.eq("key", input.key))
          .unique();
        expect(asset).toMatchObject({ sourceId: id, sourceGeneration: 0 });
        expect(source!.personalOrderedInput.assets[index]).toMatchObject({
          id: `child_${index}`,
          index,
          key: input.key,
        });
      }
    });
    // Neither a supplied URL nor upload acknowledgement authorizes legacy paid processing.
    await expect(
      f.a.mutation(api.product.processSource, { id, maxCredits: 10 }),
    ).rejects.toThrow("Ordered posts require");
    await expect(
      f.a.mutation(api.product.capture, {
        organizationId: f.org,
        key: crypto.randomUUID(),
        kind: "upload",
        objectKey: args.assets[count - 1].key,
        title: "Legacy rebind attempt",
        rightsAttested: true,
      }),
    ).rejects.toThrow("already belongs to a source");
    expect(
      (
        await f.t.run((ctx) =>
          ctx.db
            .query("assets")
            .withIndex("by_key", (q) => q.eq("key", args.assets[count - 1].key))
            .unique(),
        )
      )?.sourceId,
    ).toBe(id);
  },
);
it("rejects missing/36 files, repeated keys, changed order and unauthenticated scope before capture", async () => {
  const f = await setup(36);
  for (const assets of [
    [],
    f.input.assets,
    [{ ...f.input.assets[0], index: 1 }],
    [f.input.assets[0], { ...f.input.assets[0], index: 1 }],
    [{ ...f.input.assets[0], sha256: "bad" }],
  ])
    await expect(
      f.a.mutation(api.product.captureOrdered, { ...f.input, assets }),
    ).rejects.toThrow("INVALID_INPUT");
  await expect(
    f.t.mutation(api.product.captureOrdered, {
      ...f.input,
      assets: f.input.assets.slice(0, 1),
    }),
  ).rejects.toThrow();
  expect(await f.t.run((ctx) => ctx.db.query("sources").collect())).toEqual([]);
});
it.each([
  "foreign",
  "expired",
  "retired",
  "bound",
  "oversize",
  "wrong-type",
  "pending",
])(
  "rejects %s assets without a partial source or asset rebind",
  async (kind) => {
    const f = await setup(2);
    await f.t.run(async (ctx) => {
      const asset = (await ctx.db
        .query("assets")
        .withIndex("by_key", (q) => q.eq("key", f.input.assets[1].key))
        .unique())!;
      if (kind === "foreign") {
        const otherOrg = await ctx.db.insert("organizations", {
          name: "Other",
          createdBy: (await ctx.db.query("users").first())!._id,
          status: "active",
          createdAt: Date.now(),
        });
        await ctx.db.patch(asset._id, { organizationId: otherOrg });
      } else if (kind === "expired")
        await ctx.db.patch(asset._id, { expiresAt: Date.now() - 1 });
      else if (kind === "retired")
        await ctx.db.insert("objectDeletions", {
          key: asset.key,
          state: "pending",
          attempts: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      else if (kind === "bound") {
        const id = await ctx.db.insert("sources", {
          organizationId: f.org,
          key: "old-source-key",
          kind: "text",
          title: "Old",
          canonical: "text:old",
          text: "Old",
          rightsAttested: true,
          state: "saved",
          coverage: "caption_only",
          tags: [],
          generation: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        await ctx.db.patch(asset._id, { sourceId: id });
      } else if (kind === "oversize")
        await ctx.db.patch(asset._id, { size: 250000000 });
      else if (kind === "wrong-type")
        await ctx.db.patch(asset._id, { type: "audio/wav" });
      else await ctx.db.patch(asset._id, { state: "pending" });
    });
    await expect(
      f.a.mutation(api.product.captureOrdered, f.input),
    ).rejects.toThrow();
    await f.t.run(async (ctx) => {
      const first = await ctx.db
        .query("assets")
        .withIndex("by_key", (q) => q.eq("key", f.input.assets[0].key))
        .unique();
      expect(first).not.toHaveProperty("sourceId");
      expect(
        (await ctx.db.query("sources").collect()).filter(
          (s) => s.key === f.input.key,
        ),
      ).toEqual([]);
    });
  },
);
it("enforces capture and restore gates and prevents reuse of bound originals under a new key", async () => {
  vi.useFakeTimers();
  const f = await setup();
  vi.stubEnv("DISABLE_CAPTURE", "true");
  await expect(
    f.a.mutation(api.product.captureOrdered, f.input),
  ).rejects.toThrow("Capture is paused");
  vi.unstubAllEnvs();
  vi.stubEnv("RESTORE_LOCK", "true");
  await expect(
    f.a.mutation(api.product.captureOrdered, f.input),
  ).rejects.toThrow("Recovery");
  vi.unstubAllEnvs();
  const id = await f.a.mutation(api.product.captureOrdered, f.input);
  await expect(
    f.a.mutation(api.product.captureOrdered, {
      ...f.input,
      key: crypto.randomUUID(),
    }),
  ).rejects.toThrow("UPLOAD_INVALID");
  await f.a.mutation(api.product.deleteSource, { id });
  const source = (await f.t.run((ctx) => ctx.db.get(id)))!;
  expect(source).not.toHaveProperty("personalOrderedInput");
});
it("quarantines a restored ordered upload before it has any analysis or prepared content", async () => {
  vi.useFakeTimers();
  const f = await setup();
  const id = await f.a.mutation(api.product.captureOrdered, f.input);
  vi.stubEnv("RESTORE_LOCK", "true");
  await f.t.mutation(internal.recovery.quarantinePage, {
    section: "sources",
    cursor: null,
  });
  const source = (await f.t.run((ctx) => ctx.db.get(id)))!;
  expect(source).toMatchObject({
    state: "needs_upload",
    generation: 1,
    coverage: "metadata_only",
    rightsAttested: false,
  });
  expect(source).not.toHaveProperty("objectKey");
  expect(source).not.toHaveProperty("personalOrderedInput");
  expect(source).not.toHaveProperty("personalMedia");
  vi.unstubAllEnvs();
  await expect(
    f.a.mutation(api.product.captureOrdered, f.input),
  ).rejects.toThrow("INPUT_CHANGED");
  await expect(
    f.a.mutation(api.product.processSource, { id, maxCredits: 10 }),
  ).rejects.toThrow();
  vi.stubEnv("PERSONAL_ALPHA_SUBJECTS_JSON", '["provided"]');
  const fresh = f.t.withIdentity({
    subject: "provided",
    auth_time: Math.floor(Date.now() / 1000),
  });
  const deviceId = await fresh.mutation(api.devices.start, {
    organizationId: f.org,
    name: "Current computer",
    fingerprint: "a".repeat(64),
    codeHash: "b".repeat(64),
  });
  await fresh.mutation(api.devices.approve, {
    id: deviceId,
    fingerprint: "a".repeat(64),
    credentialHash: "c".repeat(64),
  });
  await expect(
    fresh.mutation(api.personalAnalysis.approve, {
      id,
      generation: source.generation,
      deviceId,
      model: "synthetic-image-model",
      effort: "medium",
      useOwnPlan: true,
      maxComputeCredits: 10,
    }),
  ).rejects.toThrow("SOURCE_UNAVAILABLE");
  expect(
    await f.t.run((ctx) => ctx.db.query("reservations").collect()),
  ).toEqual([]);
});
it("preserves valid legacy upload deduplication without rebinding its original asset", async () => {
  const f = await setup();
  const args = {
    organizationId: f.org,
    key: crypto.randomUUID(),
    kind: "upload",
    objectKey: f.input.assets[0].key,
    title: "Legacy upload",
    rightsAttested: true,
  };
  const id = await f.a.mutation(api.product.capture, args);
  expect(
    await f.a.mutation(api.product.capture, {
      ...args,
      key: crypto.randomUUID(),
    }),
  ).toBe(id);
  expect(
    (
      await f.t.run((ctx) =>
        ctx.db
          .query("assets")
          .withIndex("by_key", (q) => q.eq("key", args.objectKey))
          .unique(),
      )
    )?.sourceId,
  ).toBe(id);
});

async function prepared() {
  const metadata = providedMediaMetadata.parse({
    schemaVersion: "provided-media-v1",
    submissionId: "submission",
    originalUrl: null,
    publishedAt: null,
    observedAt: Date.now(),
    dateReliability: "unknown",
    provenance: "user_supplied_unverified",
    caption: "Supplied",
    expectedAssetCount: 1,
  });
  const body = {
    ...metadata,
    captionHash: await socialHash(metadata.caption),
    coverage: "complete_manifest" as const,
    assets: [
      {
        id: "child_0",
        index: 0,
        kind: "image" as const,
        contentHash: "a".repeat(64),
        bytes: 4,
        width: 10,
        height: 10,
        mime: "image/png" as const,
        inspected: true,
      },
    ],
  };
  const post = providedMediaSchema.parse({
    ...body,
    revisionHash: await orderedRevisionHash(body),
  });
  const evidence = [
    {
      id: "observation_0",
      kind: "image_observation" as const,
      postRevisionHash: post.revisionHash,
      assetId: "child_0",
      assetIndex: 0,
      text: "Visible label",
      textHash: await socialHash("Visible label"),
      basis: "visible" as const,
      uncertainty: "",
    },
  ];
  const media = { schemaVersion: "ordered-media-v1", post, evidence };
  const analysis = {
    schemaVersion: "3.0.0",
    sourceId: "source",
    processingRunId: "source:1",
    postRevisionHash: post.revisionHash,
    coverage: "ordered_media",
    summary: "A supplied label",
    warnings: [],
    insights: [],
  };
  return { metadata, body, media, analysis };
}
it("validates honest private supplied evidence and refuses service-social validation or forged identity", async () => {
  const f = await prepared();
  expect(
    (await validateOrderedEvidence(f.media.post, f.media.evidence)).post
      .schemaVersion,
  ).toBe("provided-media-v1");
  await expect(
    validateSocialEvidence(f.media.post, f.media.evidence),
  ).rejects.toThrow();
  await expect(
    validateSocialAnalysis(f.analysis, f.media, {
      sourceId: "source",
      generation: 1,
    }),
  ).rejects.toThrow();
  await expect(
    validateOrderedAnalysis(f.analysis, f.media, {
      sourceId: "source",
      generation: 1,
    }),
  ).resolves.toBeDefined();
  expect(
    providedMediaMetadata.safeParse({
      ...f.metadata,
      publishedAt: Date.now(),
      dateReliability: "provider",
    }).success,
  ).toBe(false);
  expect(
    providedMediaMetadata.safeParse({ ...f.metadata, creatorId: "invented" })
      .success,
  ).toBe(false);
  expect(
    providedMediaMetadata.safeParse({
      ...f.metadata,
      originalUrl: "https://user:secret@example.test/",
    }).success,
  ).toBe(false);
  expect(
    await orderedRevisionHash({
      ...f.body,
      originalUrl: "https://example.test/changed",
    }),
  ).not.toBe(f.media.post.revisionHash);
  await expect(
    validateOrderedEvidence(
      {
        ...f.media.post,
        assets: [{ ...f.media.post.assets[0], contentHash: "b".repeat(64) }],
      },
      f.media.evidence,
    ),
  ).rejects.toThrow("HASH_MISMATCH");
});
it("keeps supplied currentness private, binds metadata and exports provenance without raw object keys", async () => {
  const f = await prepared();
  const input = {
    schemaVersion: "ordered-personal-input-v1",
    metadata: f.metadata,
    assets: [
      {
        id: "child_0",
        index: 0,
        kind: "image",
        key: "private/raw-file",
        bytes: 4,
        sha256: "a".repeat(64),
      },
    ],
  };
  const source = {
    _id: "source",
    generation: 1,
    canonical: "provided:submission",
    kind: "upload",
    rightsAttested: true,
    personalOrderedInput: input,
    orderedMedia: f.media,
    analysis: f.analysis,
  } as unknown as Doc<"sources">;
  await expect(currentOrderedSource(source)).resolves.toBeDefined();
  await expect(
    currentOrderedSource({
      ...source,
      personalOrderedInput: {
        ...input,
        metadata: { ...f.metadata, caption: "Changed" },
      },
    }),
  ).rejects.toThrow("PROVIDED_MEDIA_SOURCE_CHANGED");
  await expect(
    currentOrderedSource({
      ...source,
      canonical: "https://www.instagram.com/p/Original/",
    }),
  ).rejects.toThrow("PROVIDED_MEDIA_SOURCE_CHANGED");
  const exported = exportRecord("sources", {
    ...source,
    personalMedia: { objects: [{ key: "private/prepared-object" }] },
  });
  expect(JSON.stringify(exported)).not.toContain("private/raw-file");
  expect(JSON.stringify(exported)).not.toContain("private/prepared-object");
  expect(JSON.stringify(exported)).toContain("user_supplied_unverified");
});
