import { afterEach, expect, it, vi } from "vitest";
import { makeFunctionReference } from "convex/server";
import { api, internal } from "../convex/_generated/api";
import { cloudCatalogFixture } from "./cloud-catalog-fixture";
import { widgetOutputs } from "../packages/widget/outputs";

const readCatalogFrame = makeFunctionReference<"action">(
  "widgetCatalogFrames:read",
);

vi.mock("../packages/providers/storage", () => ({
  signedObject: (key: string) =>
    `https://storage.example.test/${encodeURIComponent(key)}`,
  deleteObject: vi.fn(async () => {}),
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

it("lets a knowledge-only widget read canonical catalog metadata, a selected post and its exact evidence without saving it", async () => {
  const f = await published();
  const widget = f.t.withIdentity({
    subject: "user_01234567890123456789012345",
    issuer: "https://fixture.authkit.app",
    client_id: "client_01234567890123456789012345",
    scope: "knowledge:read",
    sid: "app_consent_01234567890123456789012345",
  });
  await f.t.mutation(internal.catalogAccess.grantOperatorAccess, {
    subject: "user_01234567890123456789012345",
    enabled: true,
    reason: "Explicit widget catalog test",
  });
  const snapshot = () =>
    f.t.run(async (ctx) => ({
      sources: await ctx.db.query("sources").take(100),
      imports: await ctx.db.query("publicImports").take(100),
      reservations: await ctx.db.query("reservations").take(100),
      jobs: await ctx.db.query("mediaPreparations").take(100),
      wallets: await ctx.db.query("wallets").take(100),
    }));
  const before = await snapshot();
  const state = await widget.query(internal.assistantWidget.state, {
    profileId: f.org,
  });
  expect(state.actions).toMatchObject({
    catalog: true,
    context: false,
    save: false,
  });
  expect(state.catalog).toMatchObject({
    entitled: true,
    enabled: true,
    available: true,
    allowed: true,
    source: "operator",
  });
  const page = await widget.query(internal.assistantWidget.browse, {
    profileId: f.org,
    kind: "catalog",
  });
  expect(widgetOutputs.widget_browse.parse(page)).toEqual(page);
  expect(page.items).toHaveLength(1);
  expect(page.items[0]).toMatchObject({
    id: f.familyId,
    family_id: f.familyId,
    artifact_id: f.artifact._id,
    kind: "catalog",
  });
  expect(JSON.stringify(page)).not.toContain('"analysis"');
  expect(JSON.stringify(page)).not.toContain('"transcript"');
  const binding = {
    profileId: f.org,
    familyId: f.familyId,
    artifactId: f.artifact._id,
  };
  const post = await widget.query(
    internal.assistantWidget.catalogPost,
    binding,
  );
  expect(widgetOutputs.widget_catalog_post.parse(post)).toEqual(post);
  expect(post.analysis.insights).toHaveLength(f.output.insights.length);
  expect(post.frames[0].reference).toContain(
    `catalog-browse~${f.org}~${f.familyId}~${f.artifact._id}~`,
  );
  expect(post).not.toHaveProperty("source_id");
  const frame = await widget.mutation(internal.assistantWidget.catalogFrame, {
    ...binding,
    frameId: "frame-1",
  });
  expect(frame).toMatchObject({ size: f.bytes.length });
  expect(await snapshot()).toEqual(before);
  await f.owner.mutation(api.catalogAccess.setEnabled, { enabled: false });
  expect(
    (await widget.query(internal.assistantWidget.state, { profileId: f.org }))
      .catalog.allowed,
  ).toBe(false);
  await expect(
    widget.query(internal.assistantWidget.catalogPost, binding),
  ).rejects.toThrow(/Turn on/);
  await expect(
    widget.mutation(internal.assistantWidget.catalogFrame, {
      ...binding,
      frameId: "frame-1",
    }),
  ).rejects.toThrow(/Turn on/);
  await f.owner.mutation(api.catalogAccess.setEnabled, { enabled: true });
  await f.t.mutation(internal.catalogAccess.revokeOperatorAccess, {
    subject: "user_01234567890123456789012345",
  });
  await expect(
    widget.query(internal.assistantWidget.browse, {
      profileId: f.org,
      kind: "catalog",
    }),
  ).rejects.toThrow(/add-on/);
  await expect(
    widget.mutation(internal.assistantWidget.catalogFrame, {
      ...binding,
      frameId: "frame-1",
    }),
  ).rejects.toThrow(/add-on/);
});

it("does not widen a source-only grant or base cache entitlement into catalog browsing", async () => {
  const f = await published();
  await expect(
    f.assistant.query(internal.assistantWidget.browse, {
      profileId: f.org,
      kind: "catalog",
    }),
  ).rejects.toThrow(/add-on/);
  await f.t.mutation(internal.catalogAccess.grantOperatorAccess, {
    subject: "user_01234567890123456789012345",
    enabled: true,
    reason: "Restricted grant isolation test",
  });
  await f.t.run(async (ctx) => {
    const grant = (await ctx.db
      .query("assistantGrants")
      .withIndex("by_org", (q) => q.eq("organizationId", f.org))
      .first())!;
    const source = (await ctx.db.get(f.sourceId))!;
    await ctx.db.patch(grant._id, {
      libraryScope: undefined,
      sources: [
        {
          sourceId: f.sourceId,
          generation: source.generation,
          revision: source.updatedAt,
        },
      ],
    });
  });
  const args = {
    profileId: f.org,
    familyId: f.familyId,
    artifactId: f.artifact._id,
  };
  expect(
    (
      await f.assistant.query(internal.assistantWidget.state, {
        profileId: f.org,
      })
    ).catalog,
  ).toMatchObject({ allowed: false, entitled: false, source: null });
  await expect(
    f.assistant.query(internal.assistantWidget.browse, {
      profileId: f.org,
      kind: "catalog",
    }),
  ).rejects.toThrow(/full-library/);
  await expect(
    f.assistant.query(internal.assistantWidget.catalogPost, args),
  ).rejects.toThrow(/full-library/);
  await expect(
    f.assistant.mutation(internal.assistantWidget.catalogFrame, {
      ...args,
      frameId: "frame-1",
    }),
  ).rejects.toThrow(/full-library/);
  await expect(
    f.assistant.query(api.catalogBrowse.list, { organizationId: f.org }),
  ).rejects.toThrow(/full-library/);
  await expect(
    f.assistant.mutation(api.catalogBrowse.frame, {
      organizationId: f.org,
      familyId: f.familyId,
      artifactId: f.artifact._id,
      frameId: "frame-1",
    }),
  ).rejects.toThrow(/full-library/);
  await f.owner.query(api.product.detail, {
    organizationId: f.org,
    id: f.sourceId,
  });
});

it("paginates physical catalog candidates without filling past unavailable families and binds continuation to the grant", async () => {
  const f = await published();
  await f.t.mutation(internal.catalogAccess.grantOperatorAccess, {
    subject: "user_01234567890123456789012345",
    enabled: true,
    reason: "Bounded widget catalog pagination",
  });
  await f.t.run(async (ctx) => {
    const original = (await ctx.db.get(f.familyId))!;
    const { _id, _creationTime, ...fields } = original;
    for (let i = 0; i < 10; i++)
      await ctx.db.insert("catalogFamilies", {
        ...fields,
        key: `unavailable-page-${i}`,
        state: "blocked",
      });
  });
  const first = await f.assistant.query(internal.assistantWidget.browse, {
    profileId: f.org,
    kind: "catalog",
  });
  expect(first.items).toEqual([]);
  expect(first.next_cursor).toBeTypeOf("string");
  const second = await f.assistant.query(internal.assistantWidget.browse, {
    profileId: f.org,
    kind: "catalog",
    cursor: first.next_cursor,
  });
  expect(second.items.map((item: { id: string }) => item.id)).toEqual([
    f.familyId,
  ]);
  expect(second.next_cursor).toBeNull();
  await expect(
    f.assistant.query(internal.assistantWidget.browse, {
      profileId: f.org,
      kind: "sources",
      cursor: first.next_cursor,
    }),
  ).rejects.toThrow(/Access changed/);
  await f.t.run(async (ctx) => {
    const grant = (await ctx.db
      .query("assistantGrants")
      .withIndex("by_org", (q) => q.eq("organizationId", f.org))
      .first())!;
    await ctx.db.patch(grant._id, { version: grant.version + 1 });
  });
  await expect(
    f.assistant.query(internal.assistantWidget.browse, {
      profileId: f.org,
      kind: "catalog",
      cursor: first.next_cursor,
    }),
  ).rejects.toThrow(/Access changed/);
});

it("returns a byte-verified native catalog JPEG without its storage locator", async () => {
  const f = await published();
  await f.t.mutation(internal.catalogAccess.grantOperatorAccess, {
    subject: "user_01234567890123456789012345",
    enabled: true,
    reason: "Native catalog frame verification",
  });
  const args = {
    profileId: f.org,
    familyId: f.familyId,
    artifactId: f.artifact._id,
    frameId: "frame-1",
  };
  const result = await f.assistant.action(readCatalogFrame, args);
  expect(result).toMatchObject({
    mimeType: "image/jpeg",
    familyId: f.familyId,
    artifactId: f.artifact._id,
    frameId: "frame-1",
    size: f.bytes.length,
    width: 2,
    height: 2,
  });
  expect(Uint8Array.from(atob(result.data), (c) => c.charCodeAt(0))).toEqual(
    f.bytes,
  );
  expect(result).not.toHaveProperty("key");
  expect(result).not.toHaveProperty("grantId");
  expect(JSON.stringify(result)).not.toContain("catalog/");
});

it("refuses a catalog image whose stored bytes no longer match the retained hash", async () => {
  const f = await published();
  await f.t.mutation(internal.catalogAccess.grantOperatorAccess, {
    subject: "user_01234567890123456789012345",
    enabled: true,
    reason: "Native catalog corrupt-byte test",
  });
  const corrupt = Uint8Array.from(f.bytes);
  corrupt[corrupt.length - 3] ^= 1;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(corrupt, { headers: { "content-type": "image/jpeg" } }),
    ),
  );
  await expect(
    f.assistant.action(readCatalogFrame, {
      profileId: f.org,
      familyId: f.familyId,
      artifactId: f.artifact._id,
      frameId: "frame-1",
    }),
  ).rejects.toThrow(/Retained image bytes changed/);
});

it.each(["toggle", "grant_version"] as const)(
  "refuses bytes when %s changes during catalog storage retrieval",
  async (change) => {
    const f = await published();
    await f.t.mutation(internal.catalogAccess.grantOperatorAccess, {
      subject: "user_01234567890123456789012345",
      enabled: true,
      reason: "Native catalog authority race test",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        if (change === "toggle") {
          await f.owner.mutation(api.catalogAccess.setEnabled, {
            enabled: false,
          });
        } else {
          await f.t.run(async (ctx) => {
            const grant = (await ctx.db
              .query("assistantGrants")
              .withIndex("by_org", (q) => q.eq("organizationId", f.org))
              .first())!;
            await ctx.db.patch(grant._id, { version: grant.version + 1 });
          });
        }
        return new Response(f.bytes, {
          headers: { "content-type": "image/jpeg" },
        });
      }),
    );
    await expect(
      f.assistant.action(readCatalogFrame, {
        profileId: f.org,
        familyId: f.familyId,
        artifactId: f.artifact._id,
        frameId: "frame-1",
      }),
    ).rejects.toThrow(change === "toggle" ? /Turn on/ : /APPROVAL_STALE/);
  },
);
