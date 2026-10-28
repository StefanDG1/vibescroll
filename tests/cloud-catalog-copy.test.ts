import { retireCloudArtifact } from "../convex/lib/cloudCatalogRetention";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import { cloudCatalogFixture } from "./cloud-catalog-fixture";
import { currentCloudArtifact } from "../convex/lib/cloudCatalog";
vi.mock("../packages/providers/storage", () => ({
  signedObject: (key: string) =>
    `https://storage.example.test/${encodeURIComponent(key)}`,
}));
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.clearAllTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
it("reserves catalog storage before copying and rejects an exhausted reviewed allowance without IO", async () => {
  const s = await cloudCatalogFixture();
  vi.stubEnv(
    "CLOUD_CATALOG_CONFIGURATION_JSON",
    JSON.stringify({
      ...s.configuration,
      maximumStorageBytes: s.bytes.length - 1,
    }),
  );
  const network = vi.fn();
  vi.stubGlobal("fetch", network);
  await expect(s.contribute()).rejects.toThrow(/STORAGE_LIMIT/);
  expect(network).not.toHaveBeenCalled();
  expect(
    await s.t.run((ctx) =>
      ctx.db
        .query("assets")
        .withIndex("by_org", (q) => q.eq("organizationId", s.serviceOrg))
        .take(1),
    ),
  ).toEqual([]);
});
it("preserves withdrawal during storage IO and prevents late upload or publication", async () => {
  const s = await cloudCatalogFixture();
  let puts = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PUT") {
        puts++;
        return new Response(null, { status: 200 });
      }
      const row = (
        await s.t.run((ctx) =>
          ctx.db
            .query("catalogContributions")
            .withIndex("by_source", (q) => q.eq("sourceId", s.sourceId))
            .take(1),
        )
      )[0];
      await s.owner.mutation(api.cloudCatalog.withdrawContribution, {
        contributionId: row._id,
      });
      return new Response(s.bytes, {
        headers: { "content-type": "image/jpeg" },
      });
    }),
  );
  const result = await s.contribute();
  expect(result.state).toBe("withdrawn");
  expect(puts).toBe(0);
  const row = (await s.t.run((ctx) => ctx.db.get(result.contributionId)))!;
  expect(row.state).toBe("withdrawn");
  await expect(
    s.t.run((ctx) => currentCloudArtifact(ctx, row.artifactId)),
  ).rejects.toThrow();
});
it("reuses one service evidence bundle across candidates and deletes its bytes only after the last eligible artifact retires", async () => {
  const s = await cloudCatalogFixture();
  let puts = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PUT") {
        puts++;
        return new Response(null, { status: 200 });
      }
      return new Response(s.bytes, {
        headers: { "content-type": "image/jpeg" },
      });
    }),
  );
  const first = await s.contribute(),
    firstRow = (await s.t.run((ctx) => ctx.db.get(first.contributionId)))!;
  const attempt = await s.request("new-neutral-variant");
  const claim = await s.assistant.mutation(internal.analysisVersions.dispatch, {
    sourceId: s.sourceId,
    attemptId: attempt.attemptId,
    taskId: "second-neutral-variant",
    operation: "claim",
  });
  const lease = {
    sourceId: s.sourceId,
    attemptId: attempt.attemptId,
    taskId: "second-neutral-variant",
    leaseToken: claim.leaseToken,
  };
  const input = await s.assistant.query(internal.analysisVersions.input, lease);
  await s.assistant.mutation(internal.analysisVersions.acknowledgeFrame, {
    ...lease,
    frameId: "frame-1",
  });
  const done = await s.assistant.mutation(internal.analysisVersions.dispatch, {
    ...lease,
    operation: "complete",
    output: {
      schemaVersion: "analysis-version-output-v1",
      sourceId: s.sourceId,
      attemptId: attempt.attemptId,
      evidenceHash: input.evidenceHash,
      postRevisionHash: input.postRevisionHash,
      summary: "Another reviewed candidate",
      warnings: [],
      insights: s.output.insights,
    },
  });
  const preview = await s.owner.query(api.cloudCatalog.preview, {
    sourceId: s.sourceId,
    versionId: done.versionId!,
  });
  const second = await s.owner.action(api.cloudCatalogActions.contribute, {
    sourceId: s.sourceId,
    versionId: done.versionId!,
    key: "second-contribution",
    consent: preview.consent,
  });
  const secondRow = (await s.t.run((ctx) =>
    ctx.db.get(second.contributionId),
  ))!;
  const a = await s.t.run((ctx) =>
      currentCloudArtifact(ctx, firstRow.artifactId),
    ),
    b = await s.t.run((ctx) => currentCloudArtifact(ctx, secondRow.artifactId));
  expect(a.evidence._id).toBe(b.evidence._id);
  expect(puts).toBe(1);
  const usage = () =>
    s.t.run((ctx) =>
      ctx.db
        .query("storageUsage")
        .withIndex("by_org", (q) => q.eq("organizationId", s.serviceOrg))
        .unique(),
    );
  expect((await usage())?.bytes).toBe(s.bytes.length);
  await s.t.run((ctx) => retireCloudArtifact(ctx, firstRow.artifactId));
  expect(
    (await s.t.run((ctx) => currentCloudArtifact(ctx, secondRow.artifactId)))
      .output.summary,
  ).toBe("Another reviewed candidate");
  expect(
    await s.t.run((ctx) =>
      ctx.db
        .query("objectDeletions")
        .withIndex("by_key", (q) => q.eq("key", b.evidence.frames[0].key))
        .unique(),
    ),
  ).toBeNull();
  await s.t.run((ctx) => retireCloudArtifact(ctx, secondRow.artifactId));
  expect((await usage())?.bytes).toBe(s.bytes.length);
  const deletion = (await s.t.run((ctx) =>
    ctx.db
      .query("objectDeletions")
      .withIndex("by_key", (q) => q.eq("key", b.evidence.frames[0].key))
      .unique(),
  ))!;
  await s.t.mutation(internal.assets.deleteReceipt, {
    key: deletion.key,
    attempt: deletion.attempts,
    reservedAt: deletion.updatedAt,
  });
  expect((await usage())?.bytes).toBe(0);
  expect((await s.t.run((ctx) => ctx.db.get(b.evidence._id)))?.state).toBe(
    "removed",
  );
  expect(
    await s.t.run((ctx) =>
      ctx.db
        .query("objectDeletions")
        .withIndex("by_key", (q) => q.eq("key", b.evidence.frames[0].key))
        .unique(),
    ),
  ).not.toBeNull();
});
it("reconciles an already-committed copy without deleting its independently owned evidence", async () => {
  const s = await cloudCatalogFixture();
  const p = await s.owner.mutation(internal.cloudCatalog.prepare, {
    sourceId: s.sourceId,
    versionId: s.versionId,
    key: "lost-completion-ack",
    consent: s.preview.consent,
  });
  expect(p.copyToken).toBeTruthy();
  const binding = { contributionId: p.contributionId, copyToken: p.copyToken! };
  await s.owner.mutation(internal.cloudCatalog.commitCopy, binding);
  expect(
    await s.owner.mutation(internal.cloudCatalog.failCopy, binding),
  ).toEqual({ state: "published" });
  const row = (await s.t.run((ctx) => ctx.db.get(p.contributionId)))!;
  expect(
    (await s.t.run((ctx) => currentCloudArtifact(ctx, row.artifactId))).artifact
      .state,
  ).toBe("eligible");
});

it("copies actual JPEG bytes once into independent ownership and preserves them after personal source deletion", async () => {
  const s = await cloudCatalogFixture();
  const writes = new Map<string, Uint8Array>();
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "PUT") {
      writes.set(
        decodeURIComponent(new URL(url).pathname.slice(1)),
        new Uint8Array(init.body as Uint8Array),
      );
      return new Response(null, { status: 200 });
    }
    return new Response(s.bytes, { headers: { "content-type": "image/jpeg" } });
  });
  vi.stubGlobal("fetch", fetch);
  const done = await s.contribute();
  expect(done.state).toBe("published");
  const contribution = (await s.t.run((ctx) =>
    ctx.db.get(done.contributionId),
  ))!;
  const shared = await s.t.run((ctx) =>
    currentCloudArtifact(ctx, contribution.artifactId),
  );
  expect(shared.evidence.owner).toBe("service");
  expect(shared.evidence.sourceId).toBeUndefined();
  expect(shared.evidence.organizationId).toBe(s.serviceOrg);
  expect(shared.evidence.frames[0].key).not.toContain(s.org);
  expect(writes.get(shared.evidence.frames[0].key)).toEqual(s.bytes);
  expect(JSON.stringify(shared.output)).not.toContain(s.sourceId);
  expect(await s.contribute()).toEqual(done);
  expect(writes.size).toBe(1);
  vi.useFakeTimers();
  await s.owner.mutation(api.product.deleteSource, { id: s.sourceId });
  expect(
    (await s.t.run((ctx) => currentCloudArtifact(ctx, contribution.artifactId)))
      .output.summary,
  ).toBe("Neutral fixture candidate");
  expect(
    await s.t.run((ctx) =>
      ctx.db
        .query("objectDeletions")
        .withIndex("by_key", (q) => q.eq("key", shared.evidence.frames[0].key))
        .unique(),
    ),
  ).toBeNull();
});
it.each(["changed_pixels", "revoked_before_upload", "put_failure"])(
  "keeps %s out of the ready shared catalog",
  async (failure) => {
    const s = await cloudCatalogFixture();
    let puts = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        if (init?.method === "PUT") {
          puts++;
          return new Response(null, { status: 503 });
        }
        if (failure === "revoked_before_upload")
          vi.stubEnv("CLOUD_CATALOG_VERIFIED", "false");
        const bytes = s.bytes.slice();
        if (failure === "changed_pixels") bytes[bytes.length - 1] ^= 1;
        return new Response(bytes, {
          headers: { "content-type": "image/jpeg" },
        });
      }),
    );
    const done = await s.contribute();
    expect(done.state).toBe("unknown");
    const row = (await s.t.run((ctx) => ctx.db.get(done.contributionId)))!;
    const artifact = (await s.t.run((ctx) => ctx.db.get(row.artifactId)))!;
    expect(artifact.state).toBe("blocked");
    expect(puts).toBe(failure === "put_failure" ? 1 : 0);
    await expect(
      s.t.run((ctx) => currentCloudArtifact(ctx, row.artifactId)),
    ).rejects.toThrow();
    expect((await s.t.run((ctx) => ctx.db.get(s.sourceId)))?.analysis).toEqual(
      s.output,
    );
  },
);
it("does not admit expired or altered consent, or enable publication from an old connection grant", async () => {
  const s = await cloudCatalogFixture();
  await expect(
    s.owner.action(api.cloudCatalogActions.contribute, {
      sourceId: s.sourceId,
      versionId: s.versionId,
      key: "changed-consent",
      consent: { ...s.preview.consent, outputHash: "f".repeat(64) },
    }),
  ).rejects.toThrow(/APPROVAL_STALE/);
  vi.stubEnv("CLOUD_CATALOG_VERIFIED", "false");
  await expect(s.contribute()).rejects.toThrow(/POLICY_BLOCKED/);
  expect(
    await s.t.run((ctx) =>
      ctx.db
        .query("publicArtifacts")
        .withIndex("by_org", (q) => q.eq("organizationId", s.serviceOrg))
        .take(1),
    ),
  ).toEqual([]);
});
it("requires a separate current operator review to change the shared recommendation", async () => {
  const s = await cloudCatalogFixture();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === "PUT"
        ? new Response(null, { status: 200 })
        : new Response(s.bytes, { headers: { "content-type": "image/jpeg" } }),
    ),
  );
  const done = await s.contribute(),
    row = (await s.t.run((ctx) => ctx.db.get(done.contributionId)))!;
  const a = await s.t.run((ctx) => currentCloudArtifact(ctx, row.artifactId));
  expect(a.family.selectedArtifactId).toBeUndefined();
  const assessment = {
    rubric: "evidence-review-v1" as const,
    fidelity: 4,
    completeness: 4,
    citationAccuracy: 4,
    uncertainty: 4,
    usefulness: 4,
    reason: "Reviewed against the retained speech and images.",
  };
  await expect(
    s.owner.mutation(api.cloudCatalog.selectRecommendation, {
      artifactId: row.artifactId,
      expectedSelectionRevision: 0,
      assessment,
      reviewHash: "a".repeat(64),
    }),
  ).rejects.toThrow();
  const review = await s.operator.query(api.cloudCatalog.reviewRecommendation, {
    artifactId: row.artifactId,
    assessment,
  });
  await expect(
    s.operator.mutation(api.cloudCatalog.selectRecommendation, {
      artifactId: row.artifactId,
      expectedSelectionRevision: 0,
      assessment,
      reviewHash: "f".repeat(64),
    }),
  ).rejects.toThrow(/APPROVAL_STALE/);
  const weakAssessment = { ...assessment, fidelity: 1 };
  const weakReview = await s.operator.query(
    api.cloudCatalog.reviewRecommendation,
    { artifactId: row.artifactId, assessment: weakAssessment },
  );
  await expect(
    s.operator.mutation(api.cloudCatalog.selectRecommendation, {
      artifactId: row.artifactId,
      expectedSelectionRevision: 0,
      assessment: weakAssessment,
      reviewHash: weakReview.reviewHash,
    }),
  ).rejects.toThrow(/POLICY_BLOCKED/);
  expect(
    await s.operator.mutation(api.cloudCatalog.selectRecommendation, {
      artifactId: row.artifactId,
      expectedSelectionRevision: 0,
      assessment,
      reviewHash: review.reviewHash,
    }),
  ).toEqual({ selectionRevision: 1 });
  await expect(
    s.operator.mutation(api.cloudCatalog.selectRecommendation, {
      artifactId: row.artifactId,
      expectedSelectionRevision: 0,
      assessment,
      reviewHash: review.reviewHash,
    }),
  ).rejects.toThrow(/APPROVAL_STALE/);
});
