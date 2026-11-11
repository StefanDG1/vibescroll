import { afterEach, expect, it, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import { analysisVersionFixture } from "./analysis-version-fixture";
import { postContextPageOutput } from "../packages/contracts/post-context";
import { knowledgeFetchOutput } from "../packages/contracts/knowledge-read";
import {
  knowledgeFetchLegacyOutput,
  knowledgeFetchStructuredOutput,
} from "../packages/contracts/knowledge-read";
import { makePreparedEvidence } from "../packages/contracts/prepared-evidence";
import { cloudCatalogFixture } from "./cloud-catalog-fixture";
import {
  associateContributedCloudVersion,
  currentCloudArtifact,
} from "../convex/lib/cloudCatalog";
import { syncDashboardCard } from "../convex/lib/dashboardProjection";

vi.mock("../packages/providers/storage", () => ({
  signedObject: () => "https://storage.example.test/post-context",
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllTimers();
  vi.useRealTimers();
});

async function fixture() {
  vi.useFakeTimers();
  const f = await analysisVersionFixture();
  await f.request(); // Existing immutable baseline, before the read-under-test.
  const source = (await f.t.run((ctx) => ctx.db.get(f.sourceId)))!;
  const versionId = source.selectedAnalysisVersionId!;
  const version = (await f.t.run((ctx) => ctx.db.get(versionId)))!;
  return { ...f, versionId, version };
}

it("expands one immutable retained post with shared evidence identities and no writes", async () => {
  const f = await fixture();
  const snapshot = () =>
    f.t.run(async (ctx) => ({
      source: await ctx.db.get(f.sourceId),
      assets: await ctx.db.query("assets").collect(),
      attempts: await ctx.db.query("analysisAttempts").collect(),
      wallets: await ctx.db.query("wallets").collect(),
    }));
  const before = await snapshot();
  const value = await f.assistant.query(internal.assistant.fetch, {
    id: f.sourceId,
    profileId: f.org,
    format: "post_context_v1",
  });
  const result = postContextPageOutput.parse(value);
  expect(knowledgeFetchOutput.safeParse(result).success).toBe(true);
  expect(result.id).toBe(`${f.sourceId}@${f.versionId}`);
  expect(result.context.complete).toBe(true);
  expect(result.context.frames).toHaveLength(1);
  expect(
    result.context.items.find((i) => i.kind === "transcript")?.value,
  ).toMatchObject({
    id: "speech-1",
    text: "Check the evidence before acting.",
  });
  expect(
    result.context.items.find((i) => i.kind === "observation")?.value,
  ).toMatchObject({ id: "speech-1", segmentId: "speech-1", text: null });
  expect(JSON.stringify(result)).not.toContain("original-frame");
  expect(await snapshot()).toEqual(before);
});

it("expands a valid insight-result reference into the same whole-post context", async () => {
  const f = await fixture();
  const read = (id: string) =>
    f.assistant.query(internal.assistant.fetch, {
      id,
      profileId: f.org,
      format: "post_context_v1",
    });
  const whole = postContextPageOutput.parse(
    await read(`${f.sourceId}@${f.versionId}`),
  );
  expect(
    postContextPageOutput.parse(await read(`${f.sourceId}@${f.versionId}~0`)),
  ).toEqual(whole);
  expect(postContextPageOutput.parse(await read(`${f.sourceId}~0`))).toEqual(
    whole,
  );
  for (const suffix of ["128", "-1", "oops", "0~1", "1x", ""]) {
    await expect(
      read(`${f.sourceId}@${f.versionId}~${suffix}`),
    ).rejects.toThrow(/INVALID_INPUT/);
  }
});

it("pages long Unicode transcripts under100k and follows its returned exact reference", async () => {
  const f = await fixture();
  await f.t.run(async (ctx) => {
    const evidence = (await ctx.db.get(f.version.evidenceId))!;
    const prepared = structuredClone(evidence.prepared);
    prepared.post.segments = Array.from({ length: 85 }, (_, index) => ({
      id: `long-${index}`,
      startMs: index,
      endMs: index + 1,
      text: "界".repeat(6000),
      textHash: "a".repeat(64),
    }));
    await ctx.db.patch(evidence._id, { prepared });
  });
  let id: string = `${f.sourceId}@${f.versionId}~0`,
    cursor: string | undefined;
  const transcript: string[] = [];
  for (let pages = 0; pages < 30; pages++) {
    const result = postContextPageOutput.parse(
      await f.assistant.query(internal.assistant.fetch, {
        id,
        profileId: f.org,
        format: "post_context_v1",
        ...(cursor ? { cursor } : {}),
      }),
    );
    expect(
      new TextEncoder().encode(JSON.stringify(result)).length,
    ).toBeLessThanOrEqual(100000);
    transcript.push(
      ...result.context.items
        .filter((item) => item.kind === "transcript")
        .map((item) => item.value.id),
    );
    id = result.id;
    if (result.context.complete) break;
    cursor = result.context.next_cursor!;
  }
  expect(transcript).toEqual(
    Array.from({ length: 85 }, (_, index) => `long-${index}`),
  );
});

it("rejects stale/revoked continuation and exact versions from another post", async () => {
  const f = await fixture();
  const initial = postContextPageOutput.parse(
    await f.assistant.query(internal.assistant.fetch, {
      id: f.sourceId,
      format: "post_context_v1",
    }),
  );
  await expect(
    f.assistant.query(internal.assistant.fetch, {
      id: initial.id,
      format: "post_context_v1",
      cursor: JSON.stringify({
        version: 1,
        binding: "0".repeat(64),
        offset: 1,
      }),
    }),
  ).rejects.toThrow();
  await f.t.run((ctx) => ctx.db.patch(f.grant.id, { state: "revoked" }));
  await expect(
    f.assistant.query(internal.assistant.fetch, {
      id: initial.id,
      format: "post_context_v1",
    }),
  ).rejects.toThrow();
});

it("returns real frame bytes with ordinary read authorization and no worker acknowledgment", async () => {
  const f = await fixture();
  const attempts = await f.t.run((ctx) =>
    ctx.db.query("analysisAttempts").collect(),
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(f.bytes, { headers: { "content-type": "image/jpeg" } }),
    ),
  );
  const result = await f.assistant.action(internal.postContextFrames.read, {
    sourceId: f.sourceId,
    analysisVersionId: f.versionId,
    frameId: "frame-1",
    expectedEvidenceHash: (await f.t.run((ctx) =>
      ctx.db.get(f.version.evidenceId),
    ))!.evidenceHash,
  });
  expect(Buffer.from(result.data, "base64")).toEqual(Buffer.from(f.bytes));
  expect(
    await f.t.run((ctx) => ctx.db.query("analysisAttempts").collect()),
  ).toEqual(attempts);
});

it.each(["changed_bytes", "oversize", "revoked_during_read"])(
  "denies %s before ordinary image disclosure",
  async (failure) => {
    const f = await fixture();
    const evidence = (await f.t.run((ctx) =>
      ctx.db.get(f.version.evidenceId),
    ))!;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        if (failure === "revoked_during_read")
          await f.t.run((ctx) =>
            ctx.db.patch(f.grant.id, { state: "revoked" }),
          );
        const bytes =
          failure === "oversize" ? new Uint8Array(150001) : f.bytes.slice();
        if (failure === "changed_bytes") bytes[bytes.length - 1] ^= 1;
        return new Response(bytes, {
          headers: { "content-type": "image/jpeg" },
        });
      }),
    );
    await expect(
      f.assistant.action(internal.postContextFrames.read, {
        sourceId: f.sourceId,
        analysisVersionId: f.versionId,
        frameId: "frame-1",
        expectedEvidenceHash: evidence.evidenceHash,
      }),
    ).rejects.toThrow();
  },
);

it("reads only the pinned post version shared into the selected team", async () => {
  const f = await fixture();
  const team = await f.owner.mutation(api.organizations.create, {
    name: "Post context team",
  });
  const source = (await f.t.run((ctx) => ctx.db.get(f.sourceId)))!;
  const share = await f.owner.mutation(api.knowledgeGrants.save, {
    organizationId: f.org,
    recipientOrganizationId: team,
    expectedVersion: 0,
    sources: [
      {
        sourceId: f.sourceId,
        generation: source.generation,
        revision: source.updatedAt,
      },
    ],
    expiresAt: Date.now() + 86400000,
    acknowledged: true,
  });
  await f.owner.mutation(api.assistantGrants.save, {
    organizationId: team,
    clientId: "client_01234567890123456789012345",
    sources: [],
    libraryScope: "all",
    scopes: ["knowledge:read"],
    expectedVersion: 0,
    expiresAt: null,
    acknowledged: true,
  });
  const args = {
    id: f.sourceId,
    profileId: team,
    format: "post_context_v1" as const,
    sharedGrantId: share.id,
    sharedGrantVersion: share.version,
  };
  const result = postContextPageOutput.parse(
    await f.assistant.query(internal.assistant.fetch, args),
  );
  expect(result.context.analysisVersionId).toBe(f.versionId);
  await expect(
    f.assistant.query(internal.assistant.fetch, {
      ...args,
      sharedGrantId: undefined,
      sharedGrantVersion: undefined,
    }),
  ).rejects.toThrow();
  await f.owner.mutation(api.knowledgeGrants.revoke, {
    organizationId: f.org,
    id: share.id,
    expectedVersion: share.version,
  });
  await expect(
    f.assistant.query(internal.assistant.fetch, args),
  ).rejects.toThrow();
});

it("expands server-prepared evidence and links visible observations to one frame manifest", async () => {
  const f = await fixture();
  const prepared = await makePreparedEvidence({
    requestedCanonical: f.prepared.post.canonical,
    canonical: f.prepared.post.canonical,
    platform: "instagram",
    sourceHash: "a".repeat(64),
    recipeHash: "b".repeat(64),
    downloaderVersion: "synthetic",
    title: "Prepared post",
    authorName: "Prepared author",
    durationMs: 10000,
    language: "en",
    observedAt: Date.now() - 1000,
    transcript: {
      origin: "api_asr",
      model: "synthetic",
      provider: "synthetic",
      inputSha256: "d".repeat(64),
    },
    segments: [
      {
        id: "speech-1",
        startMs: 0,
        endMs: 1000,
        text: "Check the evidence before acting.",
      },
    ],
    frames: f.prepared.post.frames,
  });
  await f.t.run(async (ctx) => {
    await ctx.db.patch(f.version.evidenceId, {
      prepared,
      evidenceHash: prepared.evidence.evidenceHash,
      revisionHash: prepared.evidence.sourceRevisionHash,
    });
    await ctx.db.patch(f.assetId, { kind: "prepared_frame" });
  });
  const result = postContextPageOutput.parse(
    await f.assistant.query(internal.assistant.fetch, {
      id: f.sourceId,
      format: "post_context_v1",
    }),
  );
  expect(result.context.frames).toHaveLength(1);
  expect(
    result.context.items.find(
      (item) => item.kind === "observation" && item.value.id === "frame-1",
    )?.value,
  ).toMatchObject({ frameIds: ["frame-1"], segmentId: null });
  expect(result.context.authorName).toBe("Prepared author");
  expect(result.context.durationMs).toBe(10000);
});

it("does not let an explicit retained version bypass a different source or a restricted grant", async () => {
  const f = await fixture();
  const secondSource = await f.owner.mutation(api.product.capture, {
    organizationId: f.org,
    key: "different-retained-post",
    title: "Different post",
    kind: "url",
    url: "https://www.instagram.com/reel/Xyzabc12345/",
    rightsAttested: true,
  });
  await expect(
    f.assistant.query(internal.assistant.fetch, {
      id: `${secondSource}@${f.versionId}`,
      format: "post_context_v1",
    }),
  ).rejects.toThrow();
  await f.t.run((ctx) =>
    ctx.db.patch(f.grant.id, { libraryScope: undefined, sources: [] }),
  );
  await expect(
    f.assistant.query(internal.assistant.fetch, {
      id: f.sourceId,
      format: "post_context_v1",
    }),
  ).rejects.toThrow();
});

it("resolves shared canonical evidence through the requesting user's saved association", async () => {
  vi.useFakeTimers();
  const f = await cloudCatalogFixture();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === "PUT"
        ? new Response(null, { status: 200 })
        : new Response(f.bytes, { headers: { "content-type": "image/jpeg" } }),
    ),
  );
  const copy = await f.contribute();
  const row = (await f.t.run((ctx) => ctx.db.get(copy.contributionId)))!;
  const shared = await f.t.run((ctx) =>
    currentCloudArtifact(ctx, row.artifactId),
  );
  const assessment = {
    rubric: "evidence-review-v1" as const,
    fidelity: 4,
    completeness: 4,
    citationAccuracy: 4,
    uncertainty: 4,
    usefulness: 4,
    reason: "Synthetic post context review",
  };
  const review = await f.operator.query(api.cloudCatalog.reviewRecommendation, {
    artifactId: shared.artifact._id,
    assessment,
  });
  await f.operator.mutation(api.cloudCatalog.selectRecommendation, {
    artifactId: shared.artifact._id,
    expectedSelectionRevision: 0,
    assessment,
    reviewHash: review.reviewHash,
  });
  vi.stubEnv(
    "CLOUD_CATALOG_ALPHA_ACCESS_JSON",
    JSON.stringify({
      version: "catalog-operator-alpha-access-v1",
      reviewedAt: Date.now() - 1000,
      expiresAt: Date.now() + 86400000,
      subjects: ["user_01234567890123456789012345"],
      reviewReference: "Synthetic retained context",
    }),
  );
  await f.owner.run(async (ctx) => {
    const source = (await ctx.db.get(f.sourceId))!;
    const organization = (await ctx.db.get(f.org))!;
    await ctx.db.patch(organization.privateOwnerId!, {
      profileVerifiedAt: Date.now(),
    });
    expect(
      await associateContributedCloudVersion(
        ctx,
        source,
        organization.privateOwnerId!,
        shared.artifact._id,
      ),
    ).toBe(true);
  });
  const result = postContextPageOutput.parse(
    await f.assistant.query(internal.assistant.fetch, {
      id: f.sourceId,
      format: "post_context_v1",
    }),
  );
  expect(result.context.analysisVersionId).toBe(shared.version._id);
  expect(result.context.evidenceHash).toBe(shared.evidence.evidenceHash);
  const image = await f.assistant.action(internal.postContextFrames.read, {
    sourceId: f.sourceId,
    analysisVersionId: shared.version._id,
    expectedEvidenceHash: result.context.evidenceHash,
    frameId: "frame-1",
  });
  expect(Buffer.from(image.data, "base64")).toEqual(Buffer.from(f.bytes));
});

it("does not create an immutable baseline or an analysis job as a side effect of reading", async () => {
  vi.useFakeTimers();
  const f = await analysisVersionFixture();
  const versions = await f.t.run((ctx) =>
    ctx.db.query("analysisVersions").collect(),
  );
  const attempts = await f.t.run((ctx) =>
    ctx.db.query("analysisAttempts").collect(),
  );
  await expect(
    f.assistant.query(internal.assistant.fetch, {
      id: f.sourceId,
      format: "post_context_v1",
    }),
  ).rejects.toThrow();
  expect(
    await f.t.run((ctx) => ctx.db.query("analysisVersions").collect()),
  ).toEqual(versions);
  expect(
    await f.t.run((ctx) => ctx.db.query("analysisAttempts").collect()),
  ).toEqual(attempts);
});

async function shareForSummary(
  f: Awaited<ReturnType<typeof analysisVersionFixture>>,
) {
  const team = await f.owner.mutation(api.organizations.create, {
    name: "Summary reading team",
  });
  const source = (await f.t.run((ctx) => ctx.db.get(f.sourceId)))!;
  const share = await f.owner.mutation(api.knowledgeGrants.save, {
    organizationId: f.org,
    recipientOrganizationId: team,
    expectedVersion: 0,
    sources: [
      {
        sourceId: f.sourceId,
        generation: source.generation,
        revision: source.updatedAt,
      },
    ],
    expiresAt: Date.now() + 86400000,
    acknowledged: true,
  });
  const assistantGrant = await f.owner.mutation(api.assistantGrants.save, {
    organizationId: team,
    clientId: "client_01234567890123456789012345",
    sources: [],
    libraryScope: "all",
    scopes: ["knowledge:read"],
    expectedVersion: 0,
    expiresAt: null,
    acknowledged: true,
  });
  return {
    team,
    share,
    assistantGrant,
    args: {
      id: f.sourceId,
      profileId: team,
      sharedGrantId: share.id,
      sharedGrantVersion: share.version,
    },
  };
}

it("reads pinned team insights through ordinary structured and legacy fetch without transcript or image bodies", async () => {
  const f = await fixture(),
    shared = await shareForSummary(f);
  const before = await f.t.run(async (ctx) => ({
    attempts: await ctx.db.query("analysisAttempts").collect(),
    versions: await ctx.db.query("analysisVersions").collect(),
  }));
  const structured = knowledgeFetchStructuredOutput.parse(
    await f.assistant.query(internal.assistant.fetch, {
      ...shared.args,
      format: "structured_v1",
    }),
  );
  const legacy = knowledgeFetchLegacyOutput.parse(
    await f.assistant.query(internal.assistant.fetch, shared.args),
  );
  expect(structured.analysis).toEqual(JSON.parse(legacy.text));
  expect(structured.analysis.insights[0].reference.analysisVersionId).toBe(
    f.versionId,
  );
  expect(structured.url).toBe(
    `https://scroll.companynerve.com/app/${shared.team}/shared?grant=${shared.share.id}&source=${f.sourceId}`,
  );
  for (const result of [structured, legacy]) {
    expect(result).not.toHaveProperty("context");
    expect(JSON.stringify(result)).not.toContain('"segments"');
    expect(JSON.stringify(result)).not.toContain('"frames"');
    expect(JSON.stringify(result)).not.toContain("original-frame");
  }
  const idea = knowledgeFetchStructuredOutput.parse(
    await f.assistant.query(internal.assistant.fetch, {
      ...shared.args,
      id: `${f.sourceId}@${f.versionId}~0`,
      format: "structured_v1",
    }),
  );
  expect(idea.analysis.insights).toHaveLength(1);
  expect(
    await f.t.run(async (ctx) => ({
      attempts: await ctx.db.query("analysisAttempts").collect(),
      versions: await ctx.db.query("analysisVersions").collect(),
    })),
  ).toEqual(before);
});

it("rejects a wrong pinned version, unshared access, restricted scope and revoked team summaries", async () => {
  const f = await fixture(),
    shared = await shareForSummary(f);
  const otherVersion = await f.t.run(async (ctx) => {
    const { _id, _creationTime, ...version } = (await ctx.db.get(f.versionId))!;
    return ctx.db.insert("analysisVersions", {
      ...version,
      number: version.number + 1,
    });
  });
  await expect(
    f.assistant.query(internal.assistant.fetch, {
      ...shared.args,
      id: `${f.sourceId}@${otherVersion}`,
      format: "structured_v1",
    }),
  ).rejects.toThrow(/FORBIDDEN/);
  await expect(
    f.assistant.query(internal.assistant.fetch, {
      ...shared.args,
      sharedGrantId: undefined,
      sharedGrantVersion: undefined,
      format: "structured_v1",
    }),
  ).rejects.toThrow(/FORBIDDEN/);
  await f.t.run((ctx) =>
    ctx.db.patch(shared.assistantGrant.id, {
      libraryScope: undefined,
      sources: [],
    }),
  );
  await expect(
    f.assistant.query(internal.assistant.fetch, {
      ...shared.args,
      format: "structured_v1",
    }),
  ).rejects.toThrow(/FORBIDDEN/);
  await f.t.run((ctx) =>
    ctx.db.patch(shared.assistantGrant.id, { libraryScope: "all" }),
  );
  await f.owner.mutation(api.knowledgeGrants.revoke, {
    organizationId: f.org,
    id: shared.share.id,
    expectedVersion: shared.share.version,
  });
  await expect(
    f.assistant.query(internal.assistant.fetch, {
      ...shared.args,
      format: "structured_v1",
    }),
  ).rejects.toThrow(/FORBIDDEN/);
});

it("keeps legacy team summaries on generation/revision data without freezing or upgrading selected versions", async () => {
  vi.useFakeTimers();
  const f = await analysisVersionFixture();
  await f.t.run(async (ctx) =>
    syncDashboardCard(
      ctx,
      "sources",
      f.sourceId,
      (await ctx.db.get(f.sourceId))!,
    ),
  );
  const shared = await shareForSummary(f);
  const before = await f.t.run(async (ctx) => ({
    attempts: await ctx.db.query("analysisAttempts").collect(),
    versions: await ctx.db.query("analysisVersions").collect(),
  }));
  const initial = knowledgeFetchStructuredOutput.parse(
    await f.assistant.query(internal.assistant.fetch, {
      ...shared.args,
      format: "structured_v1",
    }),
  );
  expect(initial.analysis.insights[0].reference).not.toHaveProperty(
    "analysisVersionId",
  );
  expect(initial.analysis.insights[0].claim).toBe(f.output.insights[0].claim);
  expect(
    await f.t.run(async (ctx) => ({
      attempts: await ctx.db.query("analysisAttempts").collect(),
      versions: await ctx.db.query("analysisVersions").collect(),
    })),
  ).toEqual(before);
  await f.request(); // Explicit unrelated authorized enrollment, never triggered by a read.
  const current = (await f.t.run((ctx) => ctx.db.get(f.sourceId)))!;
  expect(current.selectedAnalysisVersionId).toBeTruthy();
  const after = knowledgeFetchStructuredOutput.parse(
    await f.assistant.query(internal.assistant.fetch, {
      ...shared.args,
      format: "structured_v1",
    }),
  );
  expect(after.analysis).toEqual(initial.analysis);
  expect(after.analysis.insights[0].reference).not.toHaveProperty(
    "analysisVersionId",
  );
  await expect(
    f.assistant.query(internal.assistant.fetch, {
      ...shared.args,
      id: `${f.sourceId}@${current.selectedAnalysisVersionId}`,
      format: "structured_v1",
    }),
  ).rejects.toThrow(/FORBIDDEN/);
});
