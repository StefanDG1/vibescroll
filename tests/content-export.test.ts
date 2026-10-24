import { expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { exportRecord } from "../packages/privacy/export";
const modules = import.meta.glob("../convex/**/*.ts");

it("exports only the query-projected saved service analysis and authored notes", () => {
  const layer = {
    origin: "service",
    sourceId: "private-copy",
    privateNote: "My own note",
    corrections: [],
    snapshot: { payload: "unvalidated internal snapshot" },
    artifactId: "catalog-artifact",
    compatibilityKey: "private-policy-binding",
    savedAnalysis: { summary: "Validated saved copy", insights: [] },
  };
  expect(exportRecord("publicImports", layer)).toEqual({
    sourceId: "private-copy",
    privateNote: "My own note",
    corrections: [],
    savedAnalysis: { summary: "Validated saved copy", insights: [] },
  });
  expect(
    exportRecord("publicImports", { ...layer, origin: "edition" }),
  ).toEqual({
    sourceId: "private-copy",
    privateNote: "My own note",
    corrections: [],
  });
});

it("retains user plans and PR evidence without exporting repository raw context or nested bearer material", () => {
  const repo = exportRecord("repositories", {
    fullName: "owned/synthetic",
    sha: "a".repeat(40),
    profile: "Owned project",
    manifest: ["README.md"],
    context: "temporary raw code",
    contextExcerpts: [{ content: "temporary raw code" }],
    snapshotDelta: { changed: ["private"] },
  });
  expect(repo).toEqual({
    fullName: "owned/synthetic",
    sha: "a".repeat(40),
    profile: "Owned project",
    manifest: ["README.md"],
  });
  const run = exportRecord("runs", {
    planHash: "hash",
    prState: "merged",
    mergedAt: "2026-10-02",
    credentialRevision: "private binding",
    changes: [
      {
        objectKey: "private-capability",
        signedUrl: "private-link",
        content: "Owned patch",
      },
    ],
    report: "Checks passed",
  });
  expect(run).toEqual({
    planHash: "hash",
    prState: "merged",
    mergedAt: "2026-10-02",
    changes: [{ content: "Owned patch" }],
    report: "Checks passed",
  });
});

it("pages repository provenance beyond the first batch and rejects an interrupted export after revocation", async () => {
  const t = convexTest(schema, modules);
  const user = await t.mutation(internal.accounts.syncUser, {
    subject: "synthetic-export-owner",
    email: "export@example.test",
    name: "Synthetic",
  });
  const owner = t.withIdentity({ subject: "synthetic-export-owner" });
  const org = await owner.mutation(api.organizations.create, {
    name: "Synthetic export",
  });
  await t.run(async (ctx) => {
    for (let i = 0; i < 12; i++)
      await ctx.db.insert("repositories", {
        organizationId: org,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        installationId: 1,
        providerId: i,
        fullName: `owned/synthetic-${i}`,
        branch: "main",
        sha: "a".repeat(40),
        enabled: true,
        confirmed: true,
        profile: "Owned project",
        profileVersion: 1,
        manifest: ["README.md"],
        context: "temporary raw code",
        status: "ready",
      });
  });
  const asOf = Date.now();
  let cursor: string | null = null;
  const records: unknown[] = [];
  do {
    const result: { page: unknown[]; isDone: boolean; continueCursor: string } =
      await owner.query(api.jobs.exportPage, {
        organizationId: org,
        section: "repositories",
        cursor,
        asOf,
      });
    records.push(...result.page);
    cursor = result.isDone ? null : result.continueCursor;
  } while (cursor !== null);
  expect(records).toHaveLength(12);
  expect(JSON.stringify(records)).not.toContain("temporary raw code");
  const first = await owner.query(api.jobs.exportPage, {
    organizationId: org,
    section: "repositories",
    cursor: null,
    asOf,
  });
  await t.run(async (ctx) => {
    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_pair", (q) =>
        q.eq("organizationId", org).eq("userId", user),
      )
      .unique();
    await ctx.db.delete(membership!._id);
  });
  await expect(
    owner.query(api.jobs.exportPage, {
      organizationId: org,
      section: "repositories",
      cursor: first.continueCursor,
      asOf,
    }),
  ).rejects.toThrow();
});
