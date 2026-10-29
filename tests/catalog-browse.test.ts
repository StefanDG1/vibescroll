import { afterEach, expect, it, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import { cloudCatalogFixture } from "./cloud-catalog-fixture";

vi.mock("../packages/providers/storage", () => ({
  signedObject: (key: string) =>
    `https://storage.example.test/${encodeURIComponent(key)}`,
}));
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("shares a cache association into an individually entitled team without copying analysis or charging another account", async () => {
  vi.useFakeTimers();
  const f = await published();
  const subject = "user_03234567890123456789012345";
  const readerId = await f.t.mutation(internal.accounts.syncUser, {
    subject,
    email: "cache-reader@example.test",
    name: "Cache reader",
  });
  const reader = f.t.withIdentity({ subject });
  const account = await reader.mutation(api.organizations.createPrivate, {});
  const now = Date.now();
  await f.t.run((ctx) => ctx.db.patch(readerId, { profileVerifiedAt: now }));
  vi.stubEnv(
    "CLOUD_CATALOG_ALPHA_ACCESS_JSON",
    JSON.stringify({
      version: "catalog-operator-alpha-access-v1",
      subjects: [subject, "user_01234567890123456789012345"],
      reviewedAt: now,
      expiresAt: now + 86400000,
      reviewReference:
        "Synthetic independent account entitlements, not paid billing",
    }),
  );
  // The fixture's original owner is already profile-verified for source access.
  await f.t.run(async (ctx) => {
    const original = await ctx.db
      .query("users")
      .withIndex("by_subject", (q) =>
        q.eq("subject", "user_01234567890123456789012345"),
      )
      .unique();
    await ctx.db.patch(original!._id, { profileVerifiedAt: now });
  });
  const team = await f.owner.mutation(api.organizations.createTeam, {
    name: "Shared insights",
  });
  const tokenHash = "c".repeat(64);
  await f.owner.mutation(api.organizations.invite, {
    organizationId: team,
    email: "cache-reader@example.test",
    role: "member",
    tokenHash,
  });
  await reader.mutation(api.organizations.acceptInvite, { tokenHash });
  const fundingBefore = await f.t.run((ctx) =>
    ctx.db.query("reservations").take(10),
  );
  const sourceId = await reader.mutation(api.product.capture, {
    organizationId: account,
    kind: "url",
    url: f.prepared.post.canonical,
    key: "cache-team-test",
    title: "Reader's saved post",
    rightsAttested: true,
  });
  const source = (await f.t.run((ctx) => ctx.db.get(sourceId)))!;
  expect(source.state).toBe("ready");
  expect(source.publicImportId).toBeDefined();
  expect(source.analysis).toBeUndefined();
  const grant = await reader.mutation(api.knowledgeGrants.save, {
    organizationId: account,
    recipientOrganizationId: team,
    expectedVersion: 0,
    sources: [
      { sourceId, generation: source.generation, revision: source.updatedAt },
    ],
    expiresAt: now + 86400000,
    acknowledged: true,
  });
  const shared = await f.owner.query(api.knowledgeGrants.fetchShared, {
    organizationId: team,
    grantId: grant.id,
    sourceId,
  });
  expect(shared.insights).toHaveLength(f.output.insights.length);
  expect(shared.insights[0].reference.analysisVersionId).toBe(
    f.artifact.versionId,
  );
  expect(
    (await f.t.run((ctx) => ctx.db.get(sourceId)))!.analysis,
  ).toBeUndefined();
  expect(await f.t.run((ctx) => ctx.db.query("reservations").take(10))).toEqual(
    fundingBefore,
  );
  expect(
    (
      await f.owner.query(api.posts.recent, { organizationId: f.org })
    ).items.some((post) => post.id === sourceId),
  ).toBe(false);
  await f.owner.mutation(api.cloudCatalog.withdrawContribution, {
    contributionId: f.contribution._id,
  });
  await expect(
    f.owner.query(api.knowledgeGrants.fetchShared, {
      organizationId: team,
      grantId: grant.id,
      sourceId,
    }),
  ).rejects.toThrow(/unavailable|changed/);
});
async function published() {
  const f = await cloudCatalogFixture();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === "PUT"
        ? new Response(null, { status: 200 })
        : new Response(f.bytes, { headers: { "content-type": "image/jpeg" } }),
    ),
  );
  const result = await f.contribute();
  const contribution = (await f.t.run((ctx) =>
    ctx.db.get(result.contributionId),
  ))!;
  const artifact = (await f.t.run((ctx) =>
    ctx.db.get(contribution.artifactId),
  ))!;
  if (!("familyId" in artifact)) throw Error("Missing synthetic cloud family");
  const assessment = {
    rubric: "evidence-review-v1" as const,
    fidelity: 4,
    completeness: 4,
    citationAccuracy: 4,
    uncertainty: 4,
    usefulness: 4,
    reason: "Synthetic browse selection review",
  };
  const review = await f.operator.query(api.cloudCatalog.reviewRecommendation, {
    artifactId: artifact._id,
    assessment,
  });
  await f.operator.mutation(api.cloudCatalog.selectRecommendation, {
    artifactId: artifact._id,
    assessment,
    expectedSelectionRevision: 0,
    reviewHash: review.reviewHash,
  });
  return { ...f, contribution, artifact, familyId: artifact.familyId };
}

it("serves only metadata pages to an enabled add-on viewer and never populates their personal library", async () => {
  const f = await published(),
    scope = { organizationId: f.org };
  await expect(f.owner.query(api.catalogBrowse.list, scope)).rejects.toThrow(
    /add-on/,
  );
  await f.t.mutation(internal.catalogAccess.grantOperatorAccess, {
    subject: "user_01234567890123456789012345",
    enabled: true,
    reason: "Owner admin catalogue test",
  });
  const page = await f.owner.query(api.catalogBrowse.list, scope);
  expect(page.items).toHaveLength(1);
  expect(page.next).toBeNull();
  expect(page.items[0]).not.toHaveProperty("analysis");
  expect(page.items[0]).not.toHaveProperty("transcript");
  const before = await f.t.run(async (ctx) => ({
    sources: await ctx.db.query("sources").take(10),
    imports: await ctx.db.query("publicImports").take(10),
  }));
  const detail = await f.owner.mutation(api.catalogBrowse.detail, {
    ...scope,
    familyId: f.familyId,
  });
  expect(detail.frames).toHaveLength(1);
  expect(detail.analysis.insights).toHaveLength(f.output.insights.length);
  const after = await f.t.run(async (ctx) => ({
    sources: await ctx.db.query("sources").take(10),
    imports: await ctx.db.query("publicImports").take(10),
  }));
  expect(after).toEqual(before);
});

it("honors toggle-off and withdrawal on detail and frame access", async () => {
  const f = await published(),
    scope = { organizationId: f.org };
  await f.t.mutation(internal.catalogAccess.grantOperatorAccess, {
    subject: "user_01234567890123456789012345",
    enabled: true,
    reason: "Owner admin catalogue test",
  });
  const binding = {
    ...scope,
    familyId: f.familyId,
    artifactId: f.artifact._id,
    frameId: "frame-1",
  };
  expect(
    await f.owner.mutation(api.catalogBrowse.frame, binding),
  ).toMatchObject({ size: f.bytes.length });
  await f.owner.mutation(api.catalogAccess.setEnabled, { enabled: false });
  await expect(
    f.owner.mutation(api.catalogBrowse.frame, binding),
  ).rejects.toThrow(/Turn on/);
  await f.owner.mutation(api.catalogAccess.setEnabled, { enabled: true });
  await f.owner.mutation(api.cloudCatalog.withdrawContribution, {
    contributionId: f.contribution._id,
  });
  expect((await f.owner.query(api.catalogBrowse.list, scope)).items).toEqual(
    [],
  );
  await expect(
    f.owner.mutation(api.catalogBrowse.detail, {
      ...scope,
      familyId: f.familyId,
    }),
  ).rejects.toThrow();
  await expect(
    f.owner.mutation(api.catalogBrowse.frame, binding),
  ).rejects.toThrow();
});
