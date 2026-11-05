import { afterEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { createEvidence, registryHash } from "../packages/sources/evidence";
import type { SourceRevision } from "../packages/sources/types";
import legacyInsight from "../fixtures/insight.json";
const modules = import.meta.glob("../convex/**/*.ts");
afterEach(() => vi.unstubAllEnvs());
async function setup(mode: "github" | "supplied" = "github") {
  vi.stubEnv("PUBLIC_KNOWLEDGE_ENABLED", "true");
  vi.stubEnv("DIRECT_SOURCES_ENABLED", "true");
  vi.stubEnv("REDDIT_SOURCE_OAUTH_TOKEN", "fixture-only-oauth");
  vi.stubEnv(
    "REDDIT_SOURCE_ELIGIBILITY_JSON",
    JSON.stringify({
      status: "verified",
      evidenceId: "fixture-only-provider-permission",
      expiresAt: Date.now() + 86400000,
      authentication: "oauth",
      workloads: ["selected_thread_read", "private_summary", "citation_export"],
      retention: { maxAgeMs: 86400000, deletionWithinMs: 3600000 },
    }),
  );
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  const subject = "public-source-provenance-owner";
  const actorId = await t.mutation(internal.accounts.syncUser, {
    subject,
    email: "public-source@example.test",
    name: "Fixture publisher",
    verified: true,
  });
  const owner = t.withIdentity({
    subject,
    auth_time: Math.floor(Date.now() / 1000),
  });
  const organizationId = await owner.mutation(
    api.organizations.createPrivate,
    {},
  );
  const now = Date.now(),
    canonical = "https://github.com/example/project",
    excerpt = "PRIVATE_RAW_SOURCE_SENTINEL\nNever expose original file text.";
  const record =
    mode === "supplied"
      ? await createEvidence({
          kind: "supplied_text",
          originalUrl: canonical,
          canonicalUrl: canonical,
          startOffset: 0,
          endOffset: excerpt.length,
          excerpt,
          observedAt: now,
          provenance: "user_supplied_unverified",
        })
      : await createEvidence({
          kind: "github_file",
          repositoryId: 42,
          repository: "example/project",
          commitSha: "a".repeat(40),
          path: "README.md",
          startLine: 1,
          endLine: 2,
          excerpt,
          canonicalUrl: `${canonical}/blob/${"a".repeat(40)}/README.md`,
          observedAt: now,
        });
  const revision: SourceRevision = {
    schemaVersion: "1.0.0",
    sourceType: mode === "supplied" ? "supplied_text" : "github_repository",
    canonical,
    providerIdentity:
      mode === "supplied"
        ? `supplied:${record.excerptHash}`
        : `github:42:${"a".repeat(40)}`,
    contentHash: await registryHash([record]),
    adapterVersion: "fixture-public-source",
    observedAt: now,
    rightsBasis: "fixture_owner_permission",
    coverage: {
      method: "bounded_fixture",
      retrieved: 1,
      omitted: 0,
      omissions: [],
    },
  };
  const data = await t.run(async (ctx) => {
    const sourceId = await ctx.db.insert("sources", {
      organizationId,
      sourceType: "github_repository",
      kind: "url",
      canonical,
      url: canonical,
      key: "public-source-fixture",
      title: "Reviewed public title",
      summary: "Reviewed public summary",
      text: excerpt,
      tags: ["PRIVATE_TAG_SENTINEL"],
      rightsAttested: true,
      state: "ready",
      generation: 1,
      coverage: "source_text",
      analysisPipelineVersion: "cited-source-v2",
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
    const analysis = {
      ...legacyInsight,
      schemaVersion: "2.0.0",
      sourceId,
      processingRunId: `${sourceId}:1`,
      sourceRevisionId: revisionId,
      sourceContentHash: revision.contentHash,
      coverage: "source_text",
      insights: [
        {
          ...legacyInsight.insights[0],
          id: "reviewed-point",
          claim: "Reviewed supported claim",
          evidence: [
            { kind: record.kind, id: record.id, startMs: null, endMs: null },
          ],
        },
      ],
    };
    await ctx.db.patch(sourceId, { currentRevisionId: revisionId, analysis });
    return { sourceId, revisionId, analysis };
  });
  const prepareArgs = {
    sourceId: data.sourceId,
    generation: 1,
    revision: now,
    slug: "typed-reviewed-edition",
    publisher: "Fixture publisher",
    insightIds: ["reviewed-point"],
    reuseAllowed: true,
    rightsBasis: "licensed" as const,
    permissionReference:
      "Synthetic licensed-rights fixture, no real provider approval",
    permissionExpiresAt: now + 86400000,
  };
  const prepare = () =>
    owner.mutation(api.publicKnowledge.prepareEdition, prepareArgs);
  const publish = (draft: {
    id: Id<"publicEditions">;
    version: number;
    hash: string;
  }) =>
    owner.mutation(api.publicKnowledge.publishEdition, {
      id: draft.id,
      version: draft.version,
      hash: draft.hash,
      explicitlyApproved: true,
    });
  return {
    t,
    owner,
    actorId,
    organizationId,
    ...data,
    record,
    revision,
    prepareArgs,
    prepare,
    publish,
  };
}
it("publishes only source-level typed citations with canonical lines and no private registry bytes", async () => {
  const s = await setup(),
    draft = await s.prepare();
  await s.publish(draft);
  const dto = await s.t.query(api.publicKnowledge.readEdition, {
    slug: s.prepareArgs.slug,
  });
  expect(dto).toMatchObject({
    title: "Reviewed public title",
    schemaVersion: "2.0.0",
    insights: [
      {
        citations: [
          {
            kind: "github_file",
            label: "README.md, lines 1–2",
            url: s.record.canonicalUrl,
          },
        ],
      },
    ],
  });
  const body = JSON.stringify(dto);
  for (const forbidden of [
    "PRIVATE_RAW_SOURCE_SENTINEL",
    "PRIVATE_TAG_SENTINEL",
    s.sourceId,
    s.revisionId,
    s.organizationId,
    s.actorId,
  ])
    expect(body).not.toContain(forbidden);
  const own = await s.owner.query(api.publicKnowledge.own, {
    organizationId: s.organizationId,
  });
  expect(Object.keys(own.editions[0].payload)).toEqual(["title"]);
  expect(JSON.stringify(own)).not.toContain("Reviewed supported claim");
});
const malformed = [
  "hash",
  "revision",
  "source",
  "run",
  "kind",
  "timestamp",
  "missing",
  "empty",
] as const;
type Malformed = (typeof malformed)[number];
async function corrupt(
  s: Awaited<ReturnType<typeof setup>>,
  change: Malformed,
) {
  const analysis = structuredClone(s.analysis);
  if (change === "hash") analysis.sourceContentHash = "b".repeat(64);
  if (change === "revision")
    analysis.sourceRevisionId =
      "another_revision" as typeof analysis.sourceRevisionId;
  if (change === "source")
    analysis.sourceId = "another_source" as typeof analysis.sourceId;
  if (change === "run") analysis.processingRunId = `${s.sourceId}:2`;
  if (change === "kind")
    analysis.insights[0].evidence[0].kind = "reddit_comment";
  if (change === "timestamp")
    (analysis.insights[0].evidence[0] as { startMs: number | null }).startMs =
      1000;
  if (change === "empty") analysis.insights[0].evidence = [];
  await s.t.run((ctx) =>
    ctx.db.patch(
      s.sourceId,
      change === "missing" ? { currentRevisionId: undefined } : { analysis },
    ),
  );
}
it("rejects malformed typed analysis bindings, kinds and timestamps before preparation", async () => {
  for (const change of malformed) {
    const s = await setup();
    await corrupt(s, change);
    await expect(s.prepare(), change).rejects.toThrow();
  }
});
it("rejects changed typed provenance between exact preview and publication", async () => {
  for (const change of malformed) {
    const s = await setup(),
      draft = await s.prepare();
    await corrupt(s, change);
    await expect(s.publish(draft), change).rejects.toThrow();
  }
});
it("hides published content when typed analysis or citations are no longer valid", async () => {
  for (const change of malformed) {
    const s = await setup(),
      draft = await s.prepare();
    await s.publish(draft);
    await corrupt(s, change);
    expect(
      await s.t.query(api.publicKnowledge.readEdition, {
        slug: s.prepareArgs.slug,
      }),
      change,
    ).toBeNull();
    const own = await s.owner.query(api.publicKnowledge.own, {
      organizationId: s.organizationId,
    });
    expect(own.editions[0].payload.title, change).toBe(
      "Unavailable source edition",
    );
    expect(JSON.stringify(own)).not.toContain("Reviewed supported claim");
  }
});
it("keeps owner listings metadata-only after permission or retention expires", async () => {
  for (const expiry of ["permission", "retention"] as const) {
    const s = await setup(),
      draft = await s.prepare();
    await s.publish(draft);
    await s.t.run((ctx) =>
      expiry === "permission"
        ? ctx.db.patch(draft.id, { permissionExpiresAt: Date.now() - 1 })
        : ctx.db.patch(s.sourceId, { sourceRetentionUntil: Date.now() - 1 }),
    );
    expect(
      await s.t.query(api.publicKnowledge.readEdition, {
        slug: s.prepareArgs.slug,
      }),
    ).toBeNull();
    const own = await s.owner.query(api.publicKnowledge.own, {
      organizationId: s.organizationId,
    });
    expect(own.editions[0].payload).toEqual({
      title: "Unavailable source edition",
    });
    for (const forbidden of [
      "Reviewed supported claim",
      "Reviewed public summary",
      "PRIVATE_RAW_SOURCE_SENTINEL",
    ])
      expect(JSON.stringify(own)).not.toContain(forbidden);
  }
});
it("preserves explicitly supplied provenance when direct retrieval is disabled", async () => {
  const s = await setup("supplied");
  vi.stubEnv("DIRECT_SOURCES_ENABLED", "false");
  vi.stubEnv("REDDIT_SOURCE_OAUTH_TOKEN", "");
  const draft = await s.prepare();
  await s.publish(draft);
  expect(
    await s.t.query(api.publicKnowledge.readEdition, {
      slug: s.prepareArgs.slug,
    }),
  ).toMatchObject({
    insights: [
      {
        citations: [
          {
            kind: "supplied_text",
            label: "User-supplied excerpt, not provider-verified",
          },
        ],
      },
    ],
  });
});
it("binds the reviewed payload hash to content while tolerating transport key ordering", async () => {
  const s = await setup(),
    draft = await s.prepare();
  await s.t.run(async (ctx) => {
    const edition = (await ctx.db.get(draft.id))!;
    await ctx.db.patch(draft.id, {
      payload: Object.fromEntries(
        Object.entries(edition.payload).reverse(),
      ) as typeof edition.payload,
    });
  });
  await expect(s.publish(draft)).resolves.toMatchObject({ published: true });
  const altered = await setup(),
    other = await altered.prepare();
  await altered.t.run(async (ctx) => {
    const edition = (await ctx.db.get(other.id))!;
    await ctx.db.patch(other.id, {
      payload: { ...edition.payload, summary: "Unreviewed replacement" },
    });
  });
  await expect(altered.publish(other)).rejects.toThrow("APPROVAL_STALE");
});
it("finds the newest compatible public artifact beyond ten historical versions and exports valid canonical payloads", async () => {
  const s = await setup(),
    draft = await s.prepare();
  await s.t.run(async (ctx) => {
    await ctx.db.patch(draft.id, { version: 12 });
    for (let version = 1; version < 12; version++)
      await ctx.db.insert("publicArtifacts", {
        organizationId: s.organizationId,
        editionId: draft.id,
        editionVersion: version,
        compatibilityKey: `obsolete-${version}`,
        contentHash: "a".repeat(64),
        language: "en",
        pipelineVersion: "older-fixture",
        schemaVersion: "2.0.0",
        coverage: "source_text",
        state: "eligible",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
  });
  await s.publish({ ...draft, version: 12 });
  const saved = await s.owner.mutation(api.publicKnowledge.saveEdition, {
    organizationId: s.organizationId,
    slug: s.prepareArgs.slug,
    expectedVersion: 12,
  });
  expect(saved.chargedCredits).toBe(0);
  await s.t.run(async (ctx) => {
    const edition = (await ctx.db.get(draft.id))!;
    await ctx.db.patch(draft.id, {
      payload: Object.fromEntries(
        Object.entries(edition.payload).reverse(),
      ) as typeof edition.payload,
    });
    const imported = await ctx.db
      .query("publicImports")
      .withIndex("by_source", (q) => q.eq("sourceId", saved.sourceId))
      .unique();
    const artifact = (await ctx.db.get(imported!.artifactId))!;
    expect("editionVersion" in artifact && artifact.editionVersion).toBe(12);
  });
  const exported = await s.owner.query(api.jobs.exportPage, {
    organizationId: s.organizationId,
    section: "publicEditions",
    cursor: null,
    asOf: Date.now(),
  });
  expect(exported.page[0]).toMatchObject({
    payload: {
      title: "Reviewed public title",
      summary: "Reviewed public summary",
    },
  });
  const collection = await s.owner.mutation(
    api.publicKnowledge.saveCollection,
    {
      organizationId: s.organizationId,
      expectedVersion: 0,
      slug: "canonical-export-collection",
      title: "Current canonical collection",
      description: "An explicitly reviewed fixture",
      topic: "engineering",
      editions: [draft.id],
    },
  );
  await s.owner.mutation(api.publicKnowledge.publishCollection, {
    ...collection,
    explicitlyApproved: true,
  });
  const collectionExport = await s.owner.query(api.jobs.exportPage, {
    organizationId: s.organizationId,
    section: "publicCollections",
    cursor: null,
    asOf: Date.now(),
  });
  expect(collectionExport.page[0]).toMatchObject({
    title: "Current canonical collection",
    bindings: [{ version: 12, hash: draft.hash }],
  });
  expect(
    await s.t.run((ctx) => ctx.db.query("reservations").collect()),
  ).toEqual([]);
});
it("lists only bounded open report metadata and inspects current public content only after moderator authorization", async () => {
  const s = await setup(),
    draft = await s.prepare();
  await s.publish(draft);
  await s.t.mutation(api.publicKnowledge.report, {
    slug: s.prepareArgs.slug,
    key: "explicit-public-report",
    reason: "privacy",
  });
  const report = (
    await s.t.run((ctx) => ctx.db.query("publicReports").collect())
  )[0];
  await expect(s.owner.query(api.publicKnowledge.reports, {})).rejects.toThrow(
    "FORBIDDEN",
  );
  await expect(
    s.owner.query(api.publicKnowledge.inspectReport, { id: report._id }),
  ).rejects.toThrow("FORBIDDEN");
  vi.stubEnv(
    "PUBLIC_MODERATOR_SUBJECTS_JSON",
    JSON.stringify(["public-source-provenance-owner"]),
  );
  await s.t.run(async (ctx) => {
    for (let n = 0; n < 60; n++)
      await ctx.db.insert("publicReports", {
        organizationId: s.organizationId,
        editionId: draft.id,
        key: `dismissed-${n}`,
        reason: "privacy",
        state: "dismissed",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
  });
  const rows = await s.owner.query(api.publicKnowledge.reports, {});
  expect(rows).toEqual([
    {
      _id: report._id,
      editionId: draft.id,
      reason: "privacy",
      state: "open",
      createdAt: report.createdAt,
      updatedAt: report.updatedAt,
    },
  ]);
  expect(JSON.stringify(rows)).not.toContain(s.organizationId);
  const inspected = await s.owner.query(api.publicKnowledge.inspectReport, {
    id: report._id,
  });
  expect(inspected).toMatchObject({
    edition: {
      title: "Reviewed public title",
      summary: "Reviewed public summary",
    },
  });
  for (const secret of [
    s.sourceId,
    s.revisionId,
    s.actorId,
    s.organizationId,
    "PRIVATE_RAW_SOURCE_SENTINEL",
  ])
    expect(JSON.stringify(inspected)).not.toContain(secret);
  await s.t.run((ctx) =>
    ctx.db.patch(s.sourceId, { sourceRetentionUntil: Date.now() - 1 }),
  );
  expect(
    await s.owner.query(api.publicKnowledge.inspectReport, { id: report._id }),
  ).toEqual({ reportId: report._id, edition: null });
  await s.t.run((ctx) => ctx.db.patch(report._id, { state: "dismissed" }));
  expect(await s.owner.query(api.publicKnowledge.reports, {})).toEqual([]);
});
