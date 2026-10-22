import { afterEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { syncDashboardCard } from "../convex/lib/dashboardProjection";
import { createEvidence, registryHash } from "../packages/sources/evidence";
import { typedCitationSummary } from "../packages/sources/citations";
import {
  sourceProposalOutput,
  validateTypedProposal,
} from "../packages/proposals/evidence";
import { proposalOutput, sourceInsightOutput } from "../packages/contracts";
import { exportRecord } from "../packages/privacy/export";
import type { SourceRevision } from "../packages/sources/types";
import legacyProposal from "../fixtures/proposal.json";
import legacyInsight from "../fixtures/insight.json";
const modules = import.meta.glob("../convex/**/*.ts");
const issuer = "https://typed-fixture.authkit.app",
  clientId = "client_01234567890123456789012345",
  subject = "user_01234567890123456789012345";
afterEach(() => vi.unstubAllEnvs());
async function evidenceFixture(mode: "github" | "supplied" = "github") {
  const record =
    mode === "supplied"
      ? await createEvidence({
          kind: "supplied_text",
          originalUrl: "https://github.com/example/project",
          canonicalUrl: "https://github.com/example/project",
          startOffset: 0,
          endOffset: 8,
          excerpt: "Supplied",
          observedAt: Date.now(),
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
          excerpt:
            "PRIVATE_PROVIDER_TEXT\nNever disclose through a clipped grant.",
          canonicalUrl: `https://github.com/example/project/blob/${"a".repeat(40)}/README.md`,
          observedAt: Date.now(),
        });
  const revision: SourceRevision = {
    schemaVersion: "1.0.0",
    sourceType: mode === "supplied" ? "supplied_text" : "github_repository",
    canonical: "https://github.com/example/project",
    providerIdentity:
      mode === "supplied"
        ? `supplied:${record.excerptHash}`
        : `github:42:${"a".repeat(40)}`,
    contentHash: await registryHash([record]),
    adapterVersion: "fixture",
    observedAt: record.observedAt,
    rightsBasis: "fixture_owner_permission",
    coverage: {
      method: "selected_file_fixture",
      retrieved: 1,
      omitted: 0,
      omissions: [],
    },
  };
  const ref = { kind: record.kind, id: record.id, startMs: null, endMs: null };
  const insight = { ...legacyInsight.insights[0], evidence: [ref] };
  return { record, revision, ref, insight };
}
it("preserves v1 proposals while requiring a separately versioned typed proposal and exact immutable bindings", async () => {
  const f = await evidenceFixture();
  const context = {
    sourceId: "source_fixture",
    sourceRevisionId: "revision_fixture",
    sourceContentHash: f.revision.contentHash,
    revision: f.revision,
    evidence: [f.record],
    insights: [f.insight],
  };
  const proposal = {
    ...legacyProposal,
    schemaVersion: "2.0.0",
    sourceId: context.sourceId,
    sourceRevisionId: context.sourceRevisionId,
    sourceContentHash: context.sourceContentHash,
    sourceEvidence: [f.ref],
  };
  expect(proposalOutput.parse(legacyProposal)).toEqual(legacyProposal);
  expect(() => proposalOutput.parse(proposal)).toThrow();
  expect(() => sourceProposalOutput.parse(legacyProposal)).toThrow();
  await expect(validateTypedProposal(proposal, context)).resolves.toEqual(
    proposal,
  );
  for (const changed of [
    { ...proposal, sourceRevisionId: "other_revision" },
    { ...proposal, sourceContentHash: "b".repeat(64) },
    { ...proposal, insightIds: ["unknown"] },
    { ...proposal, insightIds: [f.insight.id, f.insight.id] },
    { ...proposal, sourceEvidence: [{ ...f.ref, id: "forged" }] },
    { ...proposal, sourceEvidence: [{ ...f.ref, startMs: 0 }] },
    { ...proposal, sourceEvidence: [{ ...f.ref, kind: "frame" }] },
    { ...proposal, sourceEvidence: [] },
    { ...proposal, permission: "invented" },
  ])
    await expect(validateTypedProposal(changed, context)).rejects.toThrow();
  const output = {
    ...legacyInsight,
    schemaVersion: "2.0.0",
    sourceId: context.sourceId,
    processingRunId: `${context.sourceId}:1`,
    sourceRevisionId: context.sourceRevisionId,
    sourceContentHash: context.sourceContentHash,
    coverage: "source_text",
    insights: [f.insight],
  };
  expect(sourceInsightOutput.parse(output)).toEqual(output);
});
it("rejects citations borrowed from another selected insight and keeps typed provenance in owner exports", async () => {
  const f = await evidenceFixture();
  if (f.record.kind !== "github_file") throw Error("Expected GitHub fixture");
  const other = await createEvidence({
    ...f.record,
    path: "OTHER.md",
    canonicalUrl: `https://github.com/example/project/blob/${"a".repeat(40)}/OTHER.md`,
  });
  const evidence = [f.record, other],
    revision = {
      ...f.revision,
      contentHash: await registryHash(evidence),
      coverage: { ...f.revision.coverage, retrieved: 2 },
    };
  const otherRef = { ...f.ref, id: other.id };
  const context = {
    sourceId: "source_fixture",
    sourceRevisionId: "revision_fixture",
    sourceContentHash: revision.contentHash,
    revision,
    evidence,
    insights: [f.insight, { id: "other_insight", evidence: [otherRef] }],
  };
  const proposal = {
    ...legacyProposal,
    schemaVersion: "2.0.0",
    sourceId: context.sourceId,
    sourceRevisionId: context.sourceRevisionId,
    sourceContentHash: context.sourceContentHash,
    sourceEvidence: [otherRef],
  };
  await expect(validateTypedProposal(proposal, context)).rejects.toThrow(
    "excluded proposal citation",
  );
  const exported = exportRecord("proposals", {
    detail: { ...proposal, sourceEvidence: [f.ref] },
    plan: { scope: "A private editable plan" },
    signedUrl: "private-bearer",
  });
  expect(exported).toMatchObject({
    detail: {
      schemaVersion: "2.0.0",
      sourceRevisionId: context.sourceRevisionId,
      sourceEvidence: [f.ref],
    },
    plan: { scope: "A private editable plan" },
  });
  expect(JSON.stringify(exported)).not.toContain("private-bearer");
  const summary = typedCitationSummary(f.ref, evidence);
  expect(summary).toMatchObject({
    id: f.record.id,
    kind: "github_file",
    commitSha: "a".repeat(40),
    path: "README.md",
    startLine: 1,
    endLine: 2,
    startMs: null,
    endMs: null,
  });
  expect(summary).not.toHaveProperty("excerpt");
  expect(JSON.stringify(summary)).not.toContain("PRIVATE_PROVIDER_TEXT");
});
async function setup(mode: "github" | "supplied" = "github") {
  vi.stubEnv("DIRECT_SOURCES_ENABLED", "true");
  vi.stubEnv("REDDIT_SOURCE_OAUTH_TOKEN", "fixture-oauth-not-live");
  vi.stubEnv(
    "REDDIT_SOURCE_ELIGIBILITY_JSON",
    JSON.stringify({
      status: "verified",
      evidenceId: "fixture-contract-not-live",
      expiresAt: Date.now() + 86400000,
      authentication: "oauth",
      workloads: ["selected_thread_read", "private_summary", "citation_export"],
      retention: { maxAgeMs: 86400000, deletionWithinMs: 3600000 },
    }),
  );
  vi.stubEnv("MCP_ENABLED", "true");
  vi.stubEnv("MCP_AUTH_ISSUER", issuer);
  vi.stubEnv(
    "MCP_CLIENTS",
    JSON.stringify([
      {
        id: clientId,
        name: "Typed fixture client",
        scopes: ["knowledge:read"],
      },
    ]),
  );
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  const ownerId = await t.mutation(internal.accounts.syncUser, {
    subject,
    email: "typed@example.test",
    name: "Typed fixture owner",
  });
  const readerId = await t.mutation(internal.accounts.syncUser, {
    subject: "typed-reader",
    email: "reader@example.test",
    name: "Typed fixture reader",
  });
  const owner = t.withIdentity({
    subject,
    auth_time: Math.floor(Date.now() / 1000),
  });
  const reader = t.withIdentity({ subject: "typed-reader" });
  const assistant = t.withIdentity({
    subject,
    issuer,
    client_id: clientId,
    scope: "knowledge:read",
    sid: "app_consent_01234567890123456789012345",
  });
  const organizationId = await owner.mutation(
    api.organizations.createPrivate,
    {},
  );
  const recipientOrganizationId = await owner.mutation(
    api.organizations.create,
    { name: "Typed recipient workspace" },
  );
  await t.run((ctx) =>
    ctx.db.insert("memberships", {
      organizationId: recipientOrganizationId,
      userId: readerId,
      role: "viewer",
    }),
  );
  const f = await evidenceFixture(mode),
    timestamp = Date.now();
  const data = await t.run(async (ctx) => {
    const sourceId = await ctx.db.insert("sources", {
      organizationId,
      sourceType: "github_repository",
      key: "typed-fixture-source",
      kind: "url",
      canonical: f.revision.canonical,
      url: f.revision.canonical,
      title: "Typed fixture source",
      text: f.record.excerpt,
      state: "ready",
      coverage: "source_text",
      tags: [],
      rightsAttested: true,
      generation: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    const revisionId = await ctx.db.insert("sourceRevisions", {
      organizationId,
      sourceId,
      generation: 1,
      contentHash: f.revision.contentHash,
      revision: f.revision,
      evidence: [f.record],
      text: f.record.excerpt,
      state: "current",
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    const analysis = {
      ...legacyInsight,
      schemaVersion: "2.0.0",
      sourceId,
      processingRunId: `${sourceId}:1`,
      sourceRevisionId: revisionId,
      sourceContentHash: f.revision.contentHash,
      coverage: "source_text",
      insights: [f.insight],
    };
    await ctx.db.patch(sourceId, { currentRevisionId: revisionId, analysis });
    await syncDashboardCard(
      ctx,
      "sources",
      sourceId,
      (await ctx.db.get(sourceId))!,
    );
    return { sourceId, revisionId, analysis };
  });
  const references = [
    { sourceId: data.sourceId, generation: 1, revision: timestamp },
  ];
  const assistantGrant = await owner.mutation(api.assistantGrants.save, {
    organizationId,
    clientId,
    sources: references,
    scopes: ["knowledge:read"],
    expectedVersion: 0,
    expiresAt: Date.now() + 86400000,
    acknowledged: true,
  });
  const teamGrant = await owner.mutation(api.knowledgeGrants.save, {
    organizationId,
    recipientOrganizationId,
    sources: references,
    expectedVersion: 0,
    expiresAt: Date.now() + 86400000,
    acknowledged: true,
  });
  return {
    ...f,
    ...data,
    t,
    owner,
    reader,
    assistant,
    organizationId,
    recipientOrganizationId,
    ownerId,
    assistantGrant,
    teamGrant,
  };
}
it("propagates protected typed citation metadata through assistant and team grants without raw excerpts", async () => {
  const s = await setup();
  const fetched = await s.assistant.query(internal.assistant.fetch, {
    profileId: s.organizationId,
    id: s.sourceId,
  });
  const body = JSON.parse(fetched.text);
  expect(body).toMatchObject({
    sourceRevisionId: s.revisionId,
    sourceContentHash: s.revision.contentHash,
    insights: [
      {
        evidence: [
          expect.objectContaining({
            id: s.record.id,
            kind: "github_file",
            path: "README.md",
            startLine: 1,
            startMs: null,
          }),
        ],
      },
    ],
  });
  const shared = await s.reader.query(api.knowledgeGrants.fetchShared, {
    organizationId: s.recipientOrganizationId,
    grantId: s.teamGrant.id,
    sourceId: s.sourceId,
  });
  expect(shared).toMatchObject({
    sourceRevisionId: s.revisionId,
    insights: [
      {
        evidence: [
          expect.objectContaining({
            id: s.record.id,
            kind: "github_file",
            endLine: 2,
          }),
        ],
      },
    ],
  });
  expect(JSON.stringify([fetched, shared])).not.toContain(
    "PRIVATE_PROVIDER_TEXT",
  );
  const exported = await s.owner.query(api.jobs.exportPage, {
    organizationId: s.organizationId,
    section: "sourceRevisions",
    cursor: null,
    asOf: Date.now(),
  });
  expect(exported.page).toHaveLength(1);
  expect(exported.page[0]).toMatchObject({
    evidence: [s.record],
    revision: s.revision,
  });
  await s.t.run((ctx) => ctx.db.patch(s.revisionId, { state: "removed" }));
  await expect(
    s.assistant.query(internal.assistant.fetch, {
      profileId: s.organizationId,
      id: s.sourceId,
    }),
  ).rejects.toThrow("FORBIDDEN");
  await expect(
    s.reader.query(api.knowledgeGrants.fetchShared, {
      organizationId: s.recipientOrganizationId,
      grantId: s.teamGrant.id,
      sourceId: s.sourceId,
    }),
  ).rejects.toThrow("FORBIDDEN");
  expect(
    (
      await s.owner.query(api.jobs.exportPage, {
        organizationId: s.organizationId,
        section: "sourceRevisions",
        cursor: null,
        asOf: Date.now(),
      })
    ).page,
  ).toEqual([]);
});
it("denies missing/mismatched typed pointers and expired retention rather than falling back to media labels", async () => {
  for (const change of [
    "pointer",
    "analysis",
    "retention",
    "policy",
  ] as const) {
    const s = await setup();
    if (change === "policy") vi.stubEnv("DIRECT_SOURCES_ENABLED", "false");
    else
      await s.t.run((ctx) =>
        ctx.db.patch(
          s.sourceId,
          change === "pointer"
            ? { currentRevisionId: undefined }
            : change === "analysis"
              ? {
                  analysis: {
                    ...s.analysis,
                    sourceContentHash: "b".repeat(64),
                  },
                }
              : { sourceRetentionUntil: Date.now() - 1 },
        ),
      );
    await expect(
      s.assistant.query(internal.assistant.fetch, {
        profileId: s.organizationId,
        id: s.sourceId,
      }),
    ).rejects.toThrow("FORBIDDEN");
  }
});
it("labels Reddit dates and supplied offsets without inventing a media timeline", async () => {
  const now = Date.now();
  const comment = await createEvidence({
    kind: "reddit_comment",
    postId: "abc123",
    itemId: "def456",
    parentId: "t3_abc123",
    author: "reader",
    role: "commenter",
    availability: "available",
    createdAt: 1700000000000,
    editedAt: null,
    excerpt: "Private original comment body",
    canonicalUrl: "https://www.reddit.com/r/example/comments/abc123/def456/",
    observedAt: now,
  });
  const supplied = await createEvidence({
    kind: "supplied_text",
    originalUrl: "https://github.com/example/project",
    canonicalUrl: "https://github.com/example/project",
    startOffset: 10,
    endOffset: 13,
    excerpt: "abc",
    observedAt: now,
    provenance: "user_supplied_unverified",
  });
  const commentSummary = typedCitationSummary(
    { kind: comment.kind, id: comment.id, startMs: null, endMs: null },
    [comment],
  );
  expect(commentSummary).toMatchObject({
    kind: "reddit_comment",
    postId: "abc123",
    itemId: "def456",
    parentId: "t3_abc123",
    author: "reader",
    createdAt: 1700000000000,
    startMs: null,
    endMs: null,
  });
  expect(JSON.stringify(commentSummary)).not.toContain(
    "Private original comment body",
  );
  expect(
    typedCitationSummary(
      { kind: supplied.kind, id: supplied.id, startMs: null, endMs: null },
      [supplied],
    ),
  ).toMatchObject({
    kind: "supplied_text",
    provenance: "user_supplied_unverified",
    startOffset: 10,
    endOffset: 13,
    startMs: null,
    endMs: null,
  });
});
it("hides shared list points on provider revocation while preserving separately supplied provenance", async () => {
  for (const mode of ["github", "supplied"] as const) {
    const s = await setup(mode);
    const args = { organizationId: s.recipientOrganizationId };
    const before = await s.reader.query(api.knowledgeGrants.shared, args);
    expect(before.items).toHaveLength(1);
    expect(before.items[0].mainPoints).toEqual([s.insight.title]);
    vi.stubEnv("DIRECT_SOURCES_ENABLED", "false");
    const after = await s.reader.query(api.knowledgeGrants.shared, args);
    expect(after.items).toHaveLength(mode === "supplied" ? 1 : 0);
    expect(JSON.stringify(after)).not.toContain("PRIVATE_PROVIDER_TEXT");
  }
});
it("does not trust a current-looking shared card when its canonical typed registry is stale", async () => {
  const s = await setup();
  await s.t.run((ctx) => ctx.db.patch(s.revisionId, { state: "removed" }));
  expect(
    (
      await s.reader.query(api.knowledgeGrants.shared, {
        organizationId: s.recipientOrganizationId,
      })
    ).items,
  ).toEqual([]);
});
