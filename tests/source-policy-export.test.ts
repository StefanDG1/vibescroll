import { afterEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { createEvidence, registryHash } from "../packages/sources/evidence";
import type { SourceRevision } from "../packages/sources/types";
const modules = import.meta.glob("../convex/**/*.ts");
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
function policy(
  evidenceId = "fixture-policy",
  expiresAt = Date.now() + 86400000,
) {
  vi.stubEnv("DIRECT_SOURCES_ENABLED", "true");
  vi.stubEnv("GITHUB_SOURCES_ENABLED", "true");
  vi.stubEnv("REDDIT_SOURCES_ENABLED", "true");
  vi.stubEnv("REDDIT_SOURCE_OAUTH_TOKEN", "fixture-only");
  vi.stubEnv(
    "REDDIT_SOURCE_ELIGIBILITY_JSON",
    JSON.stringify({
      status: "verified",
      evidenceId,
      expiresAt,
      authentication: "oauth",
      workloads: ["selected_thread_read", "private_summary", "citation_export"],
      retention: { maxAgeMs: 86400000, deletionWithinMs: 3600000 },
    }),
  );
}
async function setup(mode: "github" | "reddit" | "supplied" | "legacy") {
  vi.useFakeTimers();
  policy();
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  await t.mutation(internal.accounts.syncUser, {
    subject: "policy-export",
    email: "export@example.test",
    name: "Fixture owner",
  });
  const owner = t.withIdentity({ subject: "policy-export" });
  const org = await owner.mutation(api.organizations.create, {
    name: "Fixture export",
  });
  const now = Date.now(),
    excerpt = "PERMITTED FIXTURE CONTENT",
    canonical =
      mode === "reddit"
        ? "https://www.reddit.com/r/example/comments/abc123/"
        : "https://github.com/example/project";
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
      mode === "reddit"
        ? "reddit_thread"
        : mode === "supplied"
          ? "supplied_text"
          : "github_repository",
    canonical,
    providerIdentity:
      mode === "reddit"
        ? "reddit:abc123"
        : mode === "supplied"
          ? "fixture"
          : `github:42:${"a".repeat(40)}`,
    contentHash: await registryHash([record]),
    adapterVersion: "fixture",
    observedAt: now,
    rightsBasis:
      mode === "reddit"
        ? "verified_reddit_contract:fixture-policy"
        : "fixture-permitted",
    coverage: { method: "fixture", retrieved: 1, omitted: 0, omissions: [] },
    ...(mode === "reddit"
      ? {
          retention: {
            retainUntil: now + 3600000,
            deletionWithinMs: 3600000,
            policyEvidenceId: "fixture-policy",
          },
        }
      : {}),
  };
  const sourceId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("sources", {
      organizationId: org,
      createdAt: now,
      updatedAt: now,
      key: "export-fixture",
      canonical,
      sourceType:
        mode === "legacy"
          ? undefined
          : mode === "reddit"
            ? "reddit_thread"
            : "github_repository",
      kind: mode === "legacy" ? "text" : "url",
      title: "Fixture",
      text: excerpt,
      summary: "PERMITTED SUMMARY",
      analysis: { insights: [] },
      tags: [],
      state: "ready",
      generation: 1,
      coverage: "caption_only",
      rightsAttested: true,
      sourceRetentionUntil: revision.retention?.retainUntil,
    });
    if (mode !== "legacy") {
      const revisionId = await ctx.db.insert("sourceRevisions", {
        organizationId: org,
        sourceId: id,
        generation: 1,
        contentHash: revision.contentHash,
        revision,
        evidence: [record],
        text: excerpt,
        state: "current",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.patch(id, { currentRevisionId: revisionId });
    }
    return id;
  });
  const exported = async (section: "sources" | "sourceRevisions") =>
    (
      await owner.query(api.jobs.exportPage, {
        organizationId: org,
        section,
        cursor: null,
        asOf: Date.now(),
      })
    ).page;
  return { t, sourceId, exported, excerpt };
}
it.each(["github", "reddit"] as const)(
  "refuses raw %s export after the direct gate closes",
  async (mode) => {
    const s = await setup(mode);
    expect(JSON.stringify(await s.exported("sourceRevisions"))).toContain(
      s.excerpt,
    );
    vi.stubEnv("DIRECT_SOURCES_ENABLED", "false");
    expect(await s.exported("sourceRevisions")).toEqual([]);
    const sources = await s.exported("sources");
    expect(JSON.stringify(sources)).not.toContain(s.excerpt);
    expect(JSON.stringify(sources)).not.toContain("PERMITTED SUMMARY");
  },
);
it.each(["changed", "expired", "workload_revoked", "oauth_revoked"])(
  "refuses raw Reddit exports under a %s eligibility before retained bytes expire",
  async (changed) => {
    const s = await setup("reddit");
    policy(
      changed === "changed" ? "different-policy" : "fixture-policy",
      changed === "expired" ? Date.now() - 1 : Date.now() + 86400000,
    );
    if (changed === "workload_revoked") {
      const eligibility = JSON.parse(
        process.env.REDDIT_SOURCE_ELIGIBILITY_JSON!,
      );
      eligibility.workloads = ["selected_thread_read", "private_summary"];
      vi.stubEnv("REDDIT_SOURCE_ELIGIBILITY_JSON", JSON.stringify(eligibility));
    }
    if (changed === "oauth_revoked")
      vi.stubEnv("REDDIT_SOURCE_OAUTH_TOKEN", "");
    expect(await s.exported("sourceRevisions")).toEqual([]);
    expect(JSON.stringify(await s.exported("sources"))).not.toContain(
      s.excerpt,
    );
  },
);
it.each(["malformed", "expired", "oauth_revoked", "disabled"])(
  "keeps GitHub exports available with Reddit %s and revokes only the selected provider",
  async (changed) => {
    const s = await setup("github");
    if (changed === "malformed")
      vi.stubEnv("REDDIT_SOURCE_ELIGIBILITY_JSON", "{");
    if (changed === "expired") policy("fixture-policy", Date.now() - 1);
    if (changed === "oauth_revoked")
      vi.stubEnv("REDDIT_SOURCE_OAUTH_TOKEN", "");
    if (changed === "disabled") vi.stubEnv("REDDIT_SOURCES_ENABLED", "false");
    expect(JSON.stringify(await s.exported("sourceRevisions"))).toContain(
      s.excerpt,
    );
    expect(JSON.stringify(await s.exported("sources"))).toContain(s.excerpt);
    vi.stubEnv("GITHUB_SOURCES_ENABLED", "false");
    expect(await s.exported("sourceRevisions")).toEqual([]);
    expect(JSON.stringify(await s.exported("sources"))).not.toContain(
      s.excerpt,
    );
  },
);
it.each(["supplied", "legacy"] as const)(
  "preserves explicit %s export with direct providers disabled",
  async (mode) => {
    const s = await setup(mode);
    vi.stubEnv("DIRECT_SOURCES_ENABLED", "false");
    expect(JSON.stringify(await s.exported("sources"))).toContain(s.excerpt);
    if (mode === "supplied")
      expect(JSON.stringify(await s.exported("sourceRevisions"))).toContain(
        s.excerpt,
      );
  },
);
