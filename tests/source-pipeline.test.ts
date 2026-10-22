import { afterEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import {
  createEvidence,
  excerptHash,
  registryHash,
} from "../packages/sources/evidence";
import type { SourceRevision } from "../packages/sources/types";
import legacyInsight from "../fixtures/insight.json";
import legacyProposal from "../fixtures/proposal.json";
const modules = import.meta.glob("../convex/**/*.ts");
afterEach(() => vi.unstubAllEnvs());
async function setup(mode: "github" | "reddit" | "supplied" = "github") {
  const now = Date.now(),
    permissionId = "fixture-commercial-access-not-live";
  vi.stubEnv("DIRECT_SOURCES_ENABLED", "true");
  vi.stubEnv("REDDIT_SOURCE_OAUTH_TOKEN", "fixture-oauth-not-live");
  vi.stubEnv(
    "REDDIT_SOURCE_ELIGIBILITY_JSON",
    JSON.stringify({
      status: "verified",
      evidenceId: permissionId,
      expiresAt: now + 86400000,
      authentication: "oauth",
      workloads: ["selected_thread_read", "private_summary", "citation_export"],
      retention: { maxAgeMs: 86400000, deletionWithinMs: 3600000 },
    }),
  );
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  const actorId = await t.mutation(internal.accounts.syncUser, {
    subject: "pipeline-owner",
    email: "pipeline@example.test",
    name: "Fixture pipeline owner",
  });
  const owner = t.withIdentity({ subject: "pipeline-owner" });
  const organizationId = await owner.mutation(
    api.organizations.createPrivate,
    {},
  );
  const otherOrganizationId = await owner.mutation(api.organizations.create, {
    name: "Other fixture workspace",
  });
  const canonical =
    mode === "reddit"
      ? "https://www.reddit.com/r/example/comments/abc123/"
      : "https://github.com/example/project";
  const excerpt = "A rights-cleared fixture claim.";
  const record =
    mode === "reddit"
      ? await createEvidence({
          kind: "reddit_post",
          postId: "abc123",
          itemId: "abc123",
          parentId: null,
          author: "writer",
          role: "op",
          availability: "available",
          createdAt: 1000,
          editedAt: null,
          canonicalUrl: canonical,
          excerpt,
          observedAt: now,
        })
      : mode === "supplied"
        ? await createEvidence({
            kind: "supplied_text",
            originalUrl: canonical,
            canonicalUrl: canonical,
            startOffset: 0,
            endOffset: excerpt.length,
            provenance: "user_supplied_unverified",
            excerpt,
            observedAt: now,
          })
        : await createEvidence({
            kind: "github_file",
            repositoryId: 42,
            repository: "example/project",
            commitSha: "a".repeat(40),
            path: "README.md",
            startLine: 1,
            endLine: 1,
            canonicalUrl: `${canonical}/blob/${"a".repeat(40)}/README.md`,
            excerpt,
            observedAt: now,
          });
  const revision: SourceRevision = {
    schemaVersion: "1.0.0",
    sourceType:
      mode === "supplied"
        ? "supplied_text"
        : mode === "reddit"
          ? "reddit_thread"
          : "github_repository",
    canonical,
    providerIdentity:
      mode === "supplied"
        ? `supplied:${await excerptHash(excerpt)}`
        : mode === "reddit"
          ? "reddit:abc123"
          : `github:42:${"a".repeat(40)}`,
    contentHash: await registryHash([record]),
    adapterVersion: "fixture-pipeline",
    observedAt: now,
    rightsBasis:
      mode === "reddit"
        ? `verified_reddit_contract:${permissionId}`
        : "fixture_owner_permission",
    ...(mode === "reddit"
      ? {
          retention: {
            retainUntil: now + 3600000,
            deletionWithinMs: 3600000,
            policyEvidenceId: permissionId,
          },
        }
      : {}),
    coverage: {
      method: "bounded_fixture",
      retrieved: 1,
      omitted: 0,
      omissions: [],
    },
  };
  const ref = { kind: record.kind, id: record.id, startMs: null, endMs: null };
  const data = await t.run(async (ctx) => {
    const sourceId = await ctx.db.insert("sources", {
      organizationId,
      sourceType: mode === "reddit" ? "reddit_thread" : "github_repository",
      key: "pipeline-source-fixture",
      kind: "url",
      canonical,
      url: canonical,
      title: "Pipeline fixture",
      text: excerpt,
      state: "queued",
      coverage: "metadata_only",
      tags: [],
      rightsAttested: true,
      typedAnalysisActor: actorId,
      generation: 1,
      sourceRetentionUntil: revision.retention?.retainUntil,
      createdAt: now,
      updatedAt: now,
    });
    const revisionId = await ctx.db.insert("sourceRevisions", {
      organizationId,
      sourceId,
      generation: 1,
      contentHash: revision.contentHash,
      revision,
      evidence: [record],
      text: excerpt,
      state: "current",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(sourceId, { currentRevisionId: revisionId });
    return { sourceId, revisionId };
  });
  const output = {
    ...legacyInsight,
    schemaVersion: "2.0.0",
    sourceId: data.sourceId,
    processingRunId: `${data.sourceId}:1`,
    sourceRevisionId: data.revisionId,
    sourceContentHash: revision.contentHash,
    coverage: "source_text",
    insights: [{ ...legacyInsight.insights[0], evidence: [ref] }],
  };
  const commit = (result: unknown = output) =>
    t.mutation(internal.product.commitAnalysis, {
      id: data.sourceId,
      generation: 1,
      output: result,
      credits: 0,
    });
  return {
    t,
    owner,
    actorId,
    organizationId,
    otherOrganizationId,
    ...data,
    record,
    revision,
    ref,
    output,
    commit,
  };
}
async function matchingFixture() {
  const s = await setup();
  await s.commit();
  const repositoryId = await s.t.run((ctx) =>
    ctx.db.insert("repositories", {
      organizationId: s.organizationId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      installationId: 42,
      providerId: 42,
      fullName: "fixture/current-proposals",
      branch: "main",
      sha: "a".repeat(40),
      enabled: true,
      confirmed: true,
      profile: "Fixture project",
      profileVersion: 1,
      manifest: legacyProposal.repositoryEvidence.map((e) => e.path),
      context: "Fixture only",
      status: "ready",
      contextExcerpts: legacyProposal.repositoryEvidence.map((e) => ({
        path: e.path,
        startLine: 1,
        endLine: 25,
        blobSha: "b".repeat(40),
        content: Array.from({ length: 25 }, () => "Fixture observed line").join(
          "\n",
        ),
      })),
    }),
  );
  const request = { id: s.sourceId, repositoryId, maxCredits: 10 };
  const reserved = await s.owner.mutation(api.jobs.reserveMatch, request);
  const detail = {
    ...legacyProposal,
    schemaVersion: "2.0.0",
    sourceId: s.sourceId,
    sourceRevisionId: s.revisionId,
    sourceContentHash: s.revision.contentHash,
    repositoryId,
    insightIds: s.output.insights.map((i) => i.id),
    sourceEvidence: [s.ref],
  };
  const args = {
    sourceId: s.sourceId,
    repositoryId,
    detail,
    matchKey: reserved.semanticKey,
    sourceGeneration: 1,
  };
  const proposalId = (await s.t.mutation(internal.product.addProposal, args))!;
  await s.t.mutation(internal.jobs.finishMatch, {
    organizationId: s.organizationId,
    key: reserved.key,
    semanticKey: reserved.semanticKey,
    credits: 0,
    proposalId,
  });
  return { ...s, repositoryId, request, reserved, detail, args, proposalId };
}
it("reuses a current typed proposal but rematches metadata revisions and rejects the old completion", async () => {
  const s = await matchingFixture();
  expect(
    (await s.owner.mutation(api.jobs.reserveMatch, s.request)).cached,
  ).toBe(true);
  expect(await s.t.mutation(internal.product.addProposal, s.args)).toBe(
    s.proposalId,
  );
  const before = (await s.t.run((ctx) => ctx.db.get(s.sourceId)))!;
  await s.owner.mutation(api.product.editSource, {
    id: s.sourceId,
    summary: "My reviewed source summary",
    tags: ["reviewed"],
  });
  const current = (await s.t.run((ctx) => ctx.db.get(s.sourceId)))!;
  expect(current.generation).toBe(before.generation);
  expect(current.updatedAt).toBeGreaterThan(before.updatedAt);
  await expect(
    s.t.mutation(internal.product.addProposal, s.args),
  ).rejects.toThrow("APPROVAL_STALE");
  const refreshed = await s.owner.mutation(api.jobs.reserveMatch, s.request);
  expect(refreshed.cached).toBe(false);
  expect(refreshed.semanticKey).not.toBe(s.reserved.semanticKey);
  const newId = await s.t.mutation(internal.product.addProposal, {
    ...s.args,
    matchKey: refreshed.semanticKey,
  });
  expect(newId).not.toBe(s.proposalId);
  await s.t.run(async (ctx) => {
    expect((await ctx.db.get(newId!))!.references).toEqual(
      s.output.insights.map((i) => ({
        sourceId: s.sourceId,
        generation: current.generation,
        revision: current.updatedAt,
        insightId: i.id,
      })),
    );
  });
});
it("never replays foreign, wrong-actor, stale-reference or malformed typed cached proposals", async () => {
  for (const scenario of [
    "organization",
    "source",
    "repository",
    "actor",
    "references",
    "citation",
  ] as const) {
    const s = await matchingFixture();
    await s.t.run(async (ctx) => {
      const proposal = (await ctx.db.get(s.proposalId))!;
      if (scenario === "organization")
        await ctx.db.patch(s.proposalId, {
          organizationId: s.otherOrganizationId,
        });
      if (scenario === "source") {
        const source = (await ctx.db.get(s.sourceId))!,
          { _id, _creationTime, ...fields } = source;
        const other = await ctx.db.insert("sources", {
          ...fields,
          key: "other-cached-source",
          canonical: "text:other-cache",
        });
        await ctx.db.patch(s.proposalId, { sourceId: other });
      }
      if (scenario === "repository") {
        const repository = (await ctx.db.get(s.repositoryId))!,
          { _id, _creationTime, ...fields } = repository;
        const other = await ctx.db.insert("repositories", {
          ...fields,
          providerId: 43,
        });
        await ctx.db.patch(s.proposalId, { repositoryId: other });
      }
      if (scenario === "actor") {
        const actor = await ctx.db.insert("users", {
          subject: "wrong-proposal-actor",
          name: "Other actor",
          status: "active",
          email: "other@example.test",
          createdAt: Date.now(),
        });
        const job = (await ctx.db
          .query("matchingJobs")
          .withIndex("by_key", (q) => q.eq("key", s.reserved.semanticKey))
          .unique())!;
        await ctx.db.patch(job._id, { actor });
      }
      if (scenario === "references")
        await ctx.db.patch(s.proposalId, {
          references: proposal.references!.map((ref) => ({
            ...ref,
            revision: ref.revision + 1,
          })),
        });
      if (scenario === "citation")
        await ctx.db.patch(s.proposalId, {
          detail: {
            ...proposal.detail,
            sourceEvidence: [{ ...s.ref, kind: "frame", startMs: 0 }],
          },
        });
    });
    await expect(
      s.t.mutation(internal.product.addProposal, s.args),
      scenario,
    ).rejects.toThrow();
    const fresh = await s.owner.mutation(api.jobs.reserveMatch, s.request);
    expect(fresh.cached, scenario).toBe(false);
    const job = await s.t.run((ctx) =>
      ctx.db
        .query("matchingJobs")
        .withIndex("by_key", (q) => q.eq("key", fresh.semanticKey))
        .unique(),
    );
    expect(job?.proposalId, scenario).toBeUndefined();
    expect(job?.actor, scenario).toBe(s.actorId);
  }
});
it("reads and commits only the exact typed source revision without starting a workflow or charging", async () => {
  const s = await setup();
  expect(
    await s.t.query(internal.product.workerSourceRevision, {
      id: s.sourceId,
      generation: 1,
    }),
  ).toMatchObject({
    id: s.revisionId,
    revision: s.revision,
    evidence: [s.record],
  });
  await s.commit();
  await s.t.run(async (ctx) => {
    const source = (await ctx.db.get(s.sourceId))!;
    expect(source).toMatchObject({
      state: "ready",
      coverage: "source_text",
      analysisPipelineVersion: "cited-source-v2",
      analysis: {
        sourceRevisionId: s.revisionId,
        sourceContentHash: s.revision.contentHash,
        insights: [{ evidence: [s.ref] }],
      },
    });
    expect(await ctx.db.query("reservations").collect()).toEqual([]);
    expect(await ctx.db.query("runs").collect()).toEqual([]);
  });
  // Duplicate completion is a no-op even when a replacement payload is invalid.
  await s.commit({ fabricated: true });
  expect(
    (await s.t.run((ctx) => ctx.db.get(s.sourceId)))!.analysis
      .sourceContentHash,
  ).toBe(s.revision.contentHash);
});
it("rejects forged IDs, foreign kinds, invented timestamps and altered revision bindings", async () => {
  const s = await setup();
  const badRefs = [
    { ...s.ref, id: "ev_forged" },
    { ...s.ref, kind: "reddit_comment" },
    { ...s.ref, startMs: 0 },
    { ...s.ref, endMs: 1000 },
  ];
  for (const ref of badRefs)
    await expect(
      s.commit({
        ...s.output,
        insights: [{ ...s.output.insights[0], evidence: [ref] }],
      }),
    ).rejects.toThrow();
  for (const output of [
    { ...s.output, sourceRevisionId: "another_revision" },
    { ...s.output, sourceContentHash: "b".repeat(64) },
    { ...s.output, sourceId: "another_source" },
    { ...s.output, processingRunId: `${s.sourceId}:2` },
    { ...s.output, insights: [{ ...s.output.insights[0], evidence: [] }] },
  ])
    await expect(s.commit(output)).rejects.toThrow();
  expect((await s.t.run((ctx) => ctx.db.get(s.sourceId)))!.state).toBe(
    "queued",
  );
});
it("rejects foreign, removed, stale and hash-inconsistent registries before inference or commit", async () => {
  for (const change of ["foreign", "removed", "generation", "hash"] as const) {
    const s = await setup();
    await s.t.run((ctx) =>
      ctx.db.patch(
        s.revisionId,
        change === "foreign"
          ? { organizationId: s.otherOrganizationId }
          : change === "removed"
            ? { state: "removed" }
            : change === "generation"
              ? { generation: 2 }
              : { contentHash: "b".repeat(64) },
      ),
    );
    await expect(
      s.t.query(internal.product.workerSourceRevision, {
        id: s.sourceId,
        generation: 1,
      }),
      change,
    ).rejects.toThrow();
    await expect(s.commit(), change).rejects.toThrow();
  }
});
it("fences revoked actor/membership/rights and stale source generations", async () => {
  for (const change of ["actor", "membership", "rights"] as const) {
    const s = await setup();
    await s.t.run(async (ctx) => {
      if (change === "actor")
        await ctx.db.patch(s.actorId, { status: "deleting" });
      if (change === "rights")
        await ctx.db.patch(s.sourceId, { rightsAttested: false });
      if (change === "membership") {
        const member = await ctx.db
          .query("memberships")
          .withIndex("by_pair", (q) =>
            q.eq("organizationId", s.organizationId).eq("userId", s.actorId),
          )
          .unique();
        await ctx.db.delete(member!._id);
      }
    });
    await expect(
      s.t.query(internal.product.workerSourceRevision, {
        id: s.sourceId,
        generation: 1,
      }),
    ).rejects.toThrow();
    await expect(s.commit(), change).rejects.toThrow();
  }
  const s = await setup();
  await s.t.run((ctx) => ctx.db.patch(s.sourceId, { generation: 2 }));
  await expect(
    s.t.query(internal.product.workerSourceRevision, {
      id: s.sourceId,
      generation: 1,
    }),
  ).rejects.toThrow();
  await s.commit();
  expect((await s.t.run((ctx) => ctx.db.get(s.sourceId)))!.state).toBe(
    "queued",
  );
});
it("denies expired or changed Reddit retention policy and disabled direct providers", async () => {
  for (const change of [
    "retention",
    "source_retention",
    "policy",
    "disabled",
  ] as const) {
    const s = await setup("reddit");
    if (change === "retention")
      await s.t.run((ctx) =>
        ctx.db.patch(s.revisionId, {
          revision: {
            ...s.revision,
            retention: {
              ...s.revision.retention!,
              retainUntil: Date.now() - 1,
            },
          },
        }),
      );
    if (change === "policy") {
      const permission = JSON.parse(
        process.env.REDDIT_SOURCE_ELIGIBILITY_JSON!,
      );
      vi.stubEnv(
        "REDDIT_SOURCE_ELIGIBILITY_JSON",
        JSON.stringify({ ...permission, evidenceId: "changed_contract" }),
      );
    }
    if (change === "source_retention")
      await s.t.run((ctx) =>
        ctx.db.patch(s.sourceId, { sourceRetentionUntil: Date.now() - 1 }),
      );
    if (change === "disabled") vi.stubEnv("DIRECT_SOURCES_ENABLED", "false");
    await expect(
      s.t.query(internal.product.workerSourceRevision, {
        id: s.sourceId,
        generation: 1,
      }),
    ).rejects.toThrow();
    await expect(s.commit()).rejects.toThrow();
  }
});
it("keeps explicit supplied-text recovery usable with direct adapters disabled", async () => {
  const s = await setup("supplied");
  vi.stubEnv("DIRECT_SOURCES_ENABLED", "false");
  vi.stubEnv("REDDIT_SOURCE_OAUTH_TOKEN", "");
  expect(
    await s.t.query(internal.product.workerSourceRevision, {
      id: s.sourceId,
      generation: 1,
    }),
  ).toMatchObject({
    revision: { sourceType: "supplied_text" },
    evidence: [{ kind: "supplied_text" }],
  });
  await s.commit();
  expect((await s.t.run((ctx) => ctx.db.get(s.sourceId)))!.state).toBe("ready");
});
it("preserves v1 supplied text and verified media evidence while rejecting a typed-source downgrade", async () => {
  for (const mode of ["text", "upload"] as const) {
    const s = await setup();
    const evidence =
      mode === "text"
        ? [
            {
              kind: "user_note",
              id: "supplied_text",
              startMs: null,
              endMs: null,
            },
          ]
        : legacyInsight.insights[0].evidence;
    const output = {
      ...legacyInsight,
      sourceId: s.sourceId,
      processingRunId: `${s.sourceId}:1`,
      coverage: mode === "text" ? "caption_only" : "full_sampled",
      insights: [{ ...legacyInsight.insights[0], evidence }],
    };
    await s.t.run((ctx) =>
      ctx.db.patch(s.sourceId, {
        kind: mode,
        sourceType: "media",
        currentRevisionId: undefined,
        mediaCoverage: mode === "upload" ? "full_sampled" : undefined,
        mediaEvidence: evidence,
        typedAnalysisActor: undefined,
      }),
    );
    expect(
      await s.t.query(internal.product.workerSourceRevision, {
        id: s.sourceId,
        generation: 1,
      }),
    ).toBeNull();
    await s.commit(output);
    expect(
      (await s.t.run((ctx) => ctx.db.get(s.sourceId)))!.analysisPipelineVersion,
    ).toBe("legacy-media-text-v1");
  }
  const s = await setup();
  await s.t.run((ctx) =>
    ctx.db.patch(s.sourceId, {
      currentRevisionId: undefined,
      mediaCoverage: "full_sampled",
      mediaEvidence: legacyInsight.insights[0].evidence,
    }),
  );
  await expect(
    s.commit({
      ...legacyInsight,
      sourceId: s.sourceId,
      processingRunId: `${s.sourceId}:1`,
    }),
  ).rejects.toThrow();
});
