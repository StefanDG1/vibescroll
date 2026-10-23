import { afterEach, expect, it, vi } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { wallet } from "../convex/product";

const modules = import.meta.glob("../convex/**/*.ts");
type Test = TestConvex<typeof schema>;
let sequence = 0;
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
async function makeActor(t: Test, label: string) {
  const subject = `public-${label}-${++sequence}`;
  const id = await t.mutation(internal.accounts.syncUser, {
    subject,
    email: `${subject}@example.test`,
    name: "Synthetic contributor",
    verified: true,
  });
  const client = t.withIdentity({
    subject,
    auth_time: Math.floor(Date.now() / 1000),
  });
  const org = await client.mutation(api.organizations.create, {
    name: "Synthetic public test",
  });
  return { id, subject, client, org };
}
async function makeSource(
  t: Test,
  actor: Awaited<ReturnType<typeof makeActor>>,
  extra: Record<string, unknown> = {},
) {
  const number = ++sequence;
  const sourceId = await actor.client.mutation(api.product.capture, {
    organizationId: actor.org,
    key: `public-source-${number}`,
    kind: "text",
    title: "A reviewable public idea",
    text: `PRIVATE RAW TRANSCRIPT ${number}. This raw text is not a public edition.`,
    rightsAttested: true,
  });
  await t.run((ctx) =>
    ctx.db.patch(sourceId, {
      state: "ready",
      coverage: "caption_only",
      summary: "A short explicitly reviewed public summary.",
      analysisPipelineVersion: "synthetic-v1",
      updatedAt: Date.now() - 1000,
      analysis: {
        schemaVersion: "1.0.0",
        sourceId,
        processingRunId: `private-run-${number}`,
        coverage: "caption_only",
        summary: "A short explicitly reviewed public summary.",
        privateNote: "PRIVATE NOTE SENTINEL",
        repositoryContext: "PRIVATE REPOSITORY SENTINEL",
        insights: [
          {
            id: "checked-idea",
            title: "Inspect evidence before acting",
            claim: "Inspect the cited source before accepting a change.",
            interpretation: "Human review remains useful.",
            categories: ["Evidence"],
            topics: ["Review"],
            evidence: [
              {
                id: "supplied_text",
                kind: "user_note",
                startMs: null,
                endMs: null,
              },
            ],
            confidence: "supported",
            verificationNeeds: ["This is a synthetic supplied-text example."],
          },
        ],
      },
      ...extra,
    }),
  );
  return sourceId;
}
async function setup() {
  vi.stubEnv("PUBLIC_KNOWLEDGE_ENABLED", "true");
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  const publisher = await makeActor(t, "publisher");
  const recipient = await makeActor(t, "recipient");
  const viewer = await makeActor(t, "viewer");
  await t.run((ctx) =>
    ctx.db.insert("memberships", {
      organizationId: publisher.org,
      userId: viewer.id,
      role: "viewer",
    }),
  );
  const sourceId = await makeSource(t, publisher);
  return { t, publisher, recipient, viewer, sourceId };
}
async function prepare(
  s: Awaited<ReturnType<typeof setup>>,
  sourceId = s.sourceId,
  options: Record<string, unknown> = {},
) {
  const source = await s.t.run((ctx) => ctx.db.get(sourceId));
  return s.publisher.client.mutation(api.publicKnowledge.prepareEdition, {
    sourceId,
    generation: source!.generation,
    revision: source!.updatedAt,
    slug: `reviewed-edition-${++sequence}`,
    publisher: "Synthetic publisher",
    insightIds: ["checked-idea"],
    reuseAllowed: true,
    rightsBasis: "owner_created",
    permissionReference: "Synthetic rights fixture",
    permissionExpiresAt: Date.now() + 86400000,
    ...options,
  });
}
async function published(
  s: Awaited<ReturnType<typeof setup>>,
  sourceId = s.sourceId,
  options: Record<string, unknown> = {},
) {
  const edition = await prepare(s, sourceId, options);
  const result = await s.publisher.client.mutation(
    api.publicKnowledge.publishEdition,
    {
      id: edition.id,
      version: edition.version,
      hash: edition.hash,
      explicitlyApproved: true,
    },
  );
  return { ...edition, slug: result.slug };
}
async function save(
  s: Awaited<ReturnType<typeof setup>>,
  edition: Awaited<ReturnType<typeof published>>,
) {
  return s.recipient.client.mutation(api.publicKnowledge.saveEdition, {
    organizationId: s.recipient.org,
    slug: edition.slug,
    expectedVersion: edition.version,
  });
}

it("requires fresh exact-version/hash publication and denies foreign tenants and viewers", async () => {
  const s = await setup();
  const draft = await prepare(s);
  const args = {
    id: draft.id,
    version: draft.version,
    hash: draft.hash,
    explicitlyApproved: true as const,
  };
  await expect(
    s.recipient.client.mutation(api.publicKnowledge.publishEdition, args),
  ).rejects.toThrow();
  await expect(
    s.viewer.client.mutation(api.publicKnowledge.publishEdition, args),
  ).rejects.toThrow();
  const stale = s.t.withIdentity({
    subject: s.publisher.subject,
    auth_time: Math.floor(Date.now() / 1000) - 301,
  });
  await expect(
    stale.mutation(api.publicKnowledge.publishEdition, args),
  ).rejects.toThrow(/Sign in again/);
  await expect(
    s.publisher.client.mutation(api.publicKnowledge.publishEdition, {
      ...args,
      hash: "0".repeat(64),
    }),
  ).rejects.toThrow("APPROVAL_STALE");
  await expect(
    s.publisher.client.mutation(api.publicKnowledge.publishEdition, {
      ...args,
      version: 2,
    }),
  ).rejects.toThrow("APPROVAL_STALE");
  await s.t.run(async (ctx) => {
    const source = (await ctx.db.get(s.sourceId))!;
    await ctx.db.patch(s.sourceId, { updatedAt: source.updatedAt + 1 });
  });
  await expect(
    s.publisher.client.mutation(api.publicKnowledge.publishEdition, args),
  ).rejects.toThrow("APPROVAL_STALE");
  expect(
    await s.t.query(api.publicKnowledge.readEdition, {
      slug: (await s.t.run((ctx) => ctx.db.get(draft.id)))!.slug,
    }),
  ).toBeNull();
});
it("returns an anonymous source-level DTO without private content, internal identifiers or precise publication time", async () => {
  const s = await setup();
  const edition = await published(s);
  const dto = await s.t.query(api.publicKnowledge.readEdition, {
    slug: edition.slug,
  });
  expect(dto).toMatchObject({
    slug: edition.slug,
    title: "A reviewable public idea",
    reuseAllowed: true,
  });
  const encoded = JSON.stringify(dto);
  for (const forbidden of [
    s.sourceId,
    s.publisher.id,
    s.publisher.org,
    edition.id,
    "PRIVATE RAW TRANSCRIPT",
    "PRIVATE NOTE SENTINEL",
    "PRIVATE REPOSITORY SENTINEL",
    "private-run-",
  ])
    expect(encoded).not.toContain(forbidden);
  for (const field of [
    "id",
    "_id",
    "organizationId",
    "sourceId",
    "actor",
    "createdAt",
    "updatedAt",
    "publishedAt",
  ])
    expect(dto).not.toHaveProperty(field);
  expect(dto!.insights[0].citations).toEqual([
    {
      kind: "user_note",
      label: "User-supplied text and reference, not provider-verified",
      url: null,
    },
  ]);
});
it("keeps moderator restrictions across slugs, recapture, publisher workspaces and workspace administrators", async () => {
  const s = await setup();
  const edition = await published(s);
  const stale = await prepare(s);
  const imported = await save(s, edition);
  await s.t.mutation(api.publicKnowledge.report, {
    slug: edition.slug,
    key: "durable-moderation-report",
    reason: "privacy",
  });
  const report = (
    await s.t.run((ctx) => ctx.db.query("publicReports").collect())
  )[0];
  vi.stubEnv(
    "PUBLIC_MODERATOR_SUBJECTS_JSON",
    JSON.stringify([s.recipient.subject]),
  );
  await s.recipient.client.mutation(api.publicKnowledge.moderate, {
    reportId: report._id,
    action: "remove",
  });
  const source = (await s.t.run((ctx) => ctx.db.get(s.sourceId)))!;
  await s.publisher.client.mutation(api.publicKnowledge.withdrawEdition, {
    id: edition.id,
    version: edition.version,
  });
  await expect(prepare(s)).rejects.toThrow("PUBLIC_MODERATION_BLOCKED");
  await expect(
    s.publisher.client.mutation(api.publicKnowledge.publishEdition, {
      id: stale.id,
      version: stale.version,
      hash: stale.hash,
      explicitlyApproved: true,
    }),
  ).rejects.toThrow("PUBLIC_MODERATION_BLOCKED");
  expect(
    await s.t.query(api.publicKnowledge.readEdition, { slug: edition.slug }),
  ).toBeNull();
  expect(
    await s.recipient.client.query(api.publicKnowledge.savedDetail, {
      sourceId: imported.sourceId,
    }),
  ).toMatchObject({ available: false, edition: null });
  const recaptured = await makeSource(s.t, s.publisher, {
    canonical: source.canonical,
  });
  await expect(prepare(s, recaptured)).rejects.toThrow(
    "PUBLIC_MODERATION_BLOCKED",
  );
  const otherOrg = await s.publisher.client.mutation(api.organizations.create, {
    name: "Another publisher workspace",
  });
  await s.t.run(async (ctx) => {
    const current = await wallet(ctx, otherOrg);
    await ctx.db.patch(current._id, { granted: 100 });
  });
  const moved = await makeSource(
    s.t,
    { ...s.publisher, org: otherOrg },
    { canonical: source.canonical },
  );
  await expect(prepare(s, moved)).rejects.toThrow("PUBLIC_MODERATION_BLOCKED");
  const admin = await makeActor(s.t, "moderation-admin");
  await s.t.run((ctx) =>
    ctx.db.insert("memberships", {
      organizationId: s.publisher.org,
      userId: admin.id,
      role: "admin",
    }),
  );
  const adminSource = await makeSource(
    s.t,
    { ...admin, org: s.publisher.org },
    { canonical: source.canonical },
  );
  await expect(
    prepare({ ...s, publisher: admin }, adminSource),
  ).rejects.toThrow("PUBLIC_MODERATION_BLOCKED");
  const unrelated = await makeSource(s.t, s.recipient, {
    canonical: source.canonical,
  });
  await expect(
    prepare({ ...s, publisher: s.recipient }, unrelated),
  ).resolves.toHaveProperty("hash");
});
it("requires fresh explicit versioned moderator release and never republishes automatically", async () => {
  const s = await setup(),
    edition = await published(s);
  await s.t.mutation(api.publicKnowledge.report, {
    slug: edition.slug,
    key: "release-moderation-report",
    reason: "copyright",
  });
  const report = (
    await s.t.run((ctx) => ctx.db.query("publicReports").collect())
  )[0];
  vi.stubEnv(
    "PUBLIC_MODERATOR_SUBJECTS_JSON",
    JSON.stringify([s.recipient.subject]),
  );
  await s.recipient.client.mutation(api.publicKnowledge.moderate, {
    reportId: report._id,
    action: "remove",
  });
  const blocks = await s.recipient.client.query(
    api.publicKnowledge.moderationBlocks,
    { cursor: null },
  );
  const block = blocks.page[0];
  expect(Object.keys(block).sort()).toEqual(
    [
      "_id",
      "reportId",
      "reason",
      "state",
      "version",
      "createdAt",
      "updatedAt",
    ].sort(),
  );
  const release = {
    id: block._id,
    expectedVersion: block.version,
    note: "Rights evidence reviewed; publisher must prepare a fresh edition.",
    explicitlyApproved: true as const,
  };
  await expect(
    s.publisher.client.mutation(
      api.publicKnowledge.releaseModerationBlock,
      release,
    ),
  ).rejects.toThrow("FORBIDDEN");
  await expect(
    s.t
      .withIdentity({
        subject: s.recipient.subject,
        auth_time: Math.floor(Date.now() / 1000) - 301,
      })
      .mutation(api.publicKnowledge.releaseModerationBlock, release),
  ).rejects.toThrow(/Sign in again/);
  await expect(
    s.recipient.client.mutation(api.publicKnowledge.releaseModerationBlock, {
      ...release,
      expectedVersion: 0,
    }),
  ).rejects.toThrow("APPROVAL_STALE");
  await expect(
    s.recipient.client.mutation(api.publicKnowledge.releaseModerationBlock, {
      ...release,
      note: "",
    }),
  ).rejects.toThrow();
  vi.stubEnv("RESTORE_LOCK", "true");
  await expect(
    s.recipient.client.mutation(
      api.publicKnowledge.releaseModerationBlock,
      release,
    ),
  ).rejects.toThrow(/Recovery is in progress/);
  vi.stubEnv("RESTORE_LOCK", "false");
  await s.recipient.client.mutation(
    api.publicKnowledge.releaseModerationBlock,
    release,
  );
  expect(
    await s.t.query(api.publicKnowledge.readEdition, { slug: edition.slug }),
  ).toBeNull();
  await expect(
    s.recipient.client.mutation(
      api.publicKnowledge.releaseModerationBlock,
      release,
    ),
  ).rejects.toThrow("APPROVAL_STALE");
  const fresh = await published(s, s.sourceId, { slug: edition.slug });
  expect(
    await s.t.query(api.publicKnowledge.readEdition, { slug: fresh.slug }),
  ).toHaveProperty("version", fresh.version);
});
it("normalizes legacy removal with an indexed global barrier and leaves missing identities for explicit repair", async () => {
  const s = await setup(),
    edition = await published(s);
  const otherSource = await makeSource(s.t, s.publisher);
  const original = (await s.t.run((ctx) => ctx.db.get(otherSource)))!;
  await s.t.run(async (ctx) => {
    await ctx.db.patch(edition.id, {
      state: "removed",
      removalReason: "privacy",
    });
    await ctx.db.insert("publicReports", {
      organizationId: s.publisher.org,
      editionId: edition.id,
      key: "legacy-removed-report",
      reason: "privacy",
      state: "removed",
      reviewedBy: s.recipient.id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });
  await expect(prepare(s, otherSource)).rejects.toThrow(
    "PUBLIC_MODERATION_BLOCKED",
  );
  const normalized = await s.t.mutation(
    internal.publicKnowledge.normalizeLegacyModeration,
    {},
  );
  expect(normalized).toMatchObject({
    normalized: 1,
    done: true,
    pendingReports: [],
    pendingEditions: [],
  });
  await expect(prepare(s, otherSource)).resolves.toHaveProperty("hash");
  await expect(prepare(s)).rejects.toThrow("PUBLIC_MODERATION_BLOCKED");
  const second = await published(s, otherSource);
  const reportId = await s.t.run(async (ctx) => {
    await ctx.db.patch(second.id, {
      state: "removed",
      removalReason: "privacy",
    });
    await ctx.db.delete(otherSource);
    return ctx.db.insert("publicReports", {
      organizationId: s.publisher.org,
      editionId: second.id,
      key: "missing-identity-report",
      reason: "privacy",
      state: "removed",
      reviewedBy: s.recipient.id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });
  expect(
    await s.t.mutation(internal.publicKnowledge.normalizeLegacyModeration, {}),
  ).toMatchObject({ done: false, pendingReports: [reportId] });
  vi.stubEnv(
    "PUBLIC_MODERATOR_SUBJECTS_JSON",
    JSON.stringify([s.recipient.subject]),
  );
  const { excerptHash } = await import("../packages/sources/evidence");
  await s.recipient.client.mutation(
    api.publicKnowledge.repairLegacyModeration,
    {
      editionId: second.id,
      reportId,
      expectedEditionVersion: second.version,
      canonicalHash: await excerptHash(original.canonical),
      note: "Original canonical identity recovered from retained review evidence.",
      explicitlyApproved: true,
    },
  );
  expect(
    await s.t.mutation(internal.publicKnowledge.normalizeLegacyModeration, {}),
  ).toMatchObject({ done: true });
});
it("retains genuine legacy removals before source invalidation or workspace purge without inventing report actors", async () => {
  for (const cleanup of ["source", "workspace"] as const) {
    const s = await setup(),
      edition = await published(s);
    await s.t.run((ctx) =>
      ctx.db.patch(edition.id, { state: "removed", removalReason: "privacy" }),
    );
    if (cleanup === "source")
      await s.publisher.client.mutation(api.product.deleteSource, {
        id: s.sourceId,
      });
    else {
      await s.t.run((ctx) =>
        ctx.db.patch(s.publisher.org, { status: "deleting" }),
      );
      await s.t.mutation(internal.maintenance.purgeOrganization, {
        organizationId: s.publisher.org,
      });
    }
    const blocks = await s.t.run((ctx) =>
      ctx.db.query("publicModerationBlocks").collect(),
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      origin: "legacy_removal",
      publisher: s.publisher.id,
      sourceId: s.sourceId,
      organizationId: s.publisher.org,
      state: "active",
      reason: "privacy",
    });
    expect(blocks[0]).not.toHaveProperty("moderator");
    expect(blocks[0]).not.toHaveProperty("reportId");
  }
});
it("preserves legacy restriction identity before restore quarantine overwrites edition metadata", async () => {
  const s = await setup(),
    edition = await published(s);
  const canonical = (await s.t.run((ctx) => ctx.db.get(s.sourceId)))!.canonical;
  await s.t.run((ctx) =>
    ctx.db.patch(edition.id, { state: "removed", removalReason: "privacy" }),
  );
  vi.stubEnv("RESTORE_LOCK", "true");
  await s.t.mutation(internal.recovery.quarantinePage, {
    section: "publicEditions",
    cursor: null,
  });
  const block = (
    await s.t.run((ctx) => ctx.db.query("publicModerationBlocks").collect())
  )[0];
  expect(block).toMatchObject({
    origin: "legacy_removal",
    state: "active",
    reason: "privacy",
    publisher: s.publisher.id,
  });
  await s.t.mutation(internal.recovery.quarantinePage, {
    section: "publicModerationBlocks",
    cursor: null,
  });
  expect(await s.t.run((ctx) => ctx.db.get(block._id))).toEqual(block);
  await s.t.mutation(internal.recovery.quarantinePage, {
    section: "sources",
    cursor: null,
  });
  vi.stubEnv("RESTORE_LOCK", "false");
  expect(
    await s.t.query(api.publicKnowledge.readEdition, { slug: edition.slug }),
  ).toBeNull();
  const fresh = await makeSource(s.t, s.publisher, { canonical });
  await expect(prepare(s, fresh)).rejects.toThrow("PUBLIC_MODERATION_BLOCKED");
});
it("bounds legacy normalization at five reports and keeps authority closed until the remaining row is normalized", async () => {
  const s = await setup(),
    edition = await published(s);
  await s.t.run(async (ctx) => {
    await ctx.db.patch(edition.id, {
      state: "removed",
      removalReason: "privacy",
    });
    for (let i = 0; i < 6; i++)
      await ctx.db.insert("publicReports", {
        organizationId: s.publisher.org,
        editionId: edition.id,
        key: `legacy-many-report-${i}`,
        reason: "privacy",
        state: "removed",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
  });
  expect(
    await s.t.mutation(internal.publicKnowledge.normalizeLegacyModeration, {}),
  ).toMatchObject({ normalized: 5, done: false });
  expect(
    await s.t.run((ctx) =>
      ctx.db
        .query("publicReports")
        .withIndex("by_state_block", (q) =>
          q.eq("state", "removed").eq("moderationBlockId", undefined),
        )
        .collect(),
    ),
  ).toHaveLength(1);
  expect(
    await s.t.mutation(internal.publicKnowledge.normalizeLegacyModeration, {}),
  ).toMatchObject({ normalized: 1, done: true });
  expect(
    await s.t.run((ctx) => ctx.db.query("publicModerationBlocks").collect()),
  ).toHaveLength(1);
});
it("refuses destructive legacy cleanup without canonical identity until an explicit moderator repair", async () => {
  const s = await setup(),
    edition = await published(s);
  const { excerptHash } = await import("../packages/sources/evidence");
  const canonicalHash = await s.t.run(async (ctx) => {
    const source = (await ctx.db.get(s.sourceId))!;
    await ctx.db.patch(edition.id, {
      state: "removed",
      removalReason: "privacy",
    });
    await ctx.db.delete(source._id);
    await ctx.db.patch(s.publisher.org, { status: "deleting" });
    return excerptHash(source.canonical);
  });
  await expect(
    s.t.mutation(internal.maintenance.purgeOrganization, {
      organizationId: s.publisher.org,
    }),
  ).rejects.toThrow("MODERATION_REPAIR_REQUIRED");
  expect(await s.t.run((ctx) => ctx.db.get(edition.id))).not.toBeNull();
  vi.stubEnv(
    "PUBLIC_MODERATOR_SUBJECTS_JSON",
    JSON.stringify([s.recipient.subject]),
  );
  await s.recipient.client.mutation(
    api.publicKnowledge.repairLegacyModeration,
    {
      editionId: edition.id,
      expectedEditionVersion: edition.version,
      canonicalHash,
      note: "Recovered original canonical identity from archived moderation metadata.",
      explicitlyApproved: true,
    },
  );
  await s.t.mutation(internal.maintenance.purgeOrganization, {
    organizationId: s.publisher.org,
  });
  expect(await s.t.run((ctx) => ctx.db.get(edition.id))).toBeNull();
  const blocks = await s.t.run((ctx) =>
    ctx.db.query("publicModerationBlocks").collect(),
  );
  expect(blocks).toHaveLength(1);
  expect(blocks[0].canonicalHash).toBe(canonicalHash);
});
it("preserves minimal restrictions through source and organization content purge", async () => {
  const s = await setup(),
    edition = await published(s);
  await s.t.mutation(api.publicKnowledge.report, {
    slug: edition.slug,
    key: "purge-moderation-report",
    reason: "privacy",
  });
  const report = (
    await s.t.run((ctx) => ctx.db.query("publicReports").collect())
  )[0];
  vi.stubEnv(
    "PUBLIC_MODERATOR_SUBJECTS_JSON",
    JSON.stringify([s.recipient.subject]),
  );
  await s.recipient.client.mutation(api.publicKnowledge.moderate, {
    reportId: report._id,
    action: "remove",
  });
  const before = (
    await s.t.run((ctx) => ctx.db.query("publicModerationBlocks").collect())
  )[0];
  await s.publisher.client.mutation(api.product.deleteSource, {
    id: s.sourceId,
  });
  await s.t.run((ctx) => ctx.db.patch(s.publisher.org, { status: "deleting" }));
  await s.t.mutation(internal.maintenance.purgeOrganization, {
    organizationId: s.publisher.org,
  });
  expect(await s.t.run((ctx) => ctx.db.get(before._id))).toEqual(before);
  expect(JSON.stringify(before)).not.toContain("PRIVATE RAW");
  expect(JSON.stringify(before)).not.toContain("https://");
});
it("binds an explicitly reviewed pinned supplied reference to the exact text-only preview without retrieval", async () => {
  const s = await setup();
  const url = `https://github.com/example/project/blob/${"a".repeat(40)}/README.md`;
  const preview = await prepare(s, s.sourceId, {
    suppliedReference: { url, explicitlyReviewed: true },
  });
  expect(preview.payload).toMatchObject({
    sourceUrl: url,
    sourceProvenance: "supplied_text_unverified",
    coverage: "source_text",
  });
  expect(preview.payload.insights[0].citations).toEqual([
    {
      kind: "user_note",
      label: "User-supplied text and reference, not provider-verified",
      url,
    },
  ]);
  const changed = await prepare(s, s.sourceId, {
    slug: (await s.t.run((ctx) => ctx.db.get(preview.id)))!.slug,
    suppliedReference: {
      url: url.replace("a".repeat(40), "b".repeat(40)),
      explicitlyReviewed: true,
    },
  });
  expect(changed.hash).not.toBe(preview.hash);
  await expect(
    s.publisher.client.mutation(api.publicKnowledge.publishEdition, {
      id: preview.id,
      version: preview.version,
      hash: preview.hash,
      explicitlyApproved: true,
    }),
  ).rejects.toThrow("APPROVAL_STALE");
  await s.publisher.client.mutation(api.publicKnowledge.publishEdition, {
    id: changed.id,
    version: changed.version,
    hash: changed.hash,
    explicitlyApproved: true,
  });
  for (const bad of [
    url.replace("a".repeat(40), "main"),
    url + "?token=private",
    url + "#private",
    url.replace("https://", "http://"),
    url.replace("github.com", "github.com.evil.invalid"),
    url.replace("/README.md", "/../secret"),
    url.replace("README.md", ".env"),
  ])
    await expect(
      prepare(s, s.sourceId, {
        suppliedReference: { url: bad, explicitlyReviewed: true },
      }),
    ).rejects.toThrow("INVALID_SUPPLIED_REFERENCE");
  expect(
    await s.t.run(async (ctx) => ({
      requests: (await ctx.db.query("sourceAcquisitions").collect()).length,
      reservations: (await ctx.db.query("reservations").collect()).length,
    })),
  ).toEqual({ requests: 0, reservations: 0 });
});
it("rejects legacy-pipeline reuse while allowing a separately reviewed nonreusable public edition", async () => {
  const s = await setup();
  await s.t.run((ctx) =>
    ctx.db.patch(s.sourceId, { analysisPipelineVersion: undefined }),
  );
  await expect(prepare(s)).rejects.toThrow("PROVENANCE_REQUIRED");
  const edition = await published(s, s.sourceId, { reuseAllowed: false });
  expect(
    await s.t.query(api.publicKnowledge.readEdition, { slug: edition.slug }),
  ).toMatchObject({ reuseAllowed: false });
  await expect(save(s, edition)).rejects.toThrow("SOURCE_UNAVAILABLE");
  expect(
    await s.t.run((ctx) => ctx.db.query("publicArtifacts").collect()),
  ).toHaveLength(0);
});
it("imports only a recipient-owned opaque reference without searching/copying private artifacts or charging inference", async () => {
  const s = await setup();
  const shadow = await makeSource(s.t, s.recipient, {
    summary: "PRIVATE EXISTING ANALYSIS",
  });
  const edition = await published(s);
  const before = await s.t.run((ctx) =>
    ctx.db
      .query("wallets")
      .withIndex("by_org", (q) => q.eq("organizationId", s.recipient.org))
      .unique(),
  );
  const first = await save(s, edition);
  const replay = await save(s, edition);
  expect(first).toEqual(replay);
  expect(first).toMatchObject({ reused: true, chargedCredits: 0 });
  expect(first.sourceId).not.toBe(shadow);
  const source = await s.t.run((ctx) => ctx.db.get(first.sourceId));
  expect(source).toMatchObject({ organizationId: s.recipient.org });
  expect(source!.analysis).toBeUndefined();
  expect(source!.summary).not.toBe("PRIVATE EXISTING ANALYSIS");
  expect(source!.text).not.toContain("Inspect the cited source");
  const layer = await s.t.run((ctx) => ctx.db.get(source!.publicImportId!));
  expect(layer).toMatchObject({
    organizationId: s.recipient.org,
    actor: s.recipient.id,
    sourceId: first.sourceId,
    privateNote: "",
    corrections: [],
  });
  expect(
    await s.t.run((ctx) => ctx.db.query("publicImports").collect()),
  ).toHaveLength(1);
  const after = await s.t.run((ctx) =>
    ctx.db
      .query("wallets")
      .withIndex("by_org", (q) => q.eq("organizationId", s.recipient.org))
      .unique(),
  );
  expect(after?.spent).toBe(before?.spent);
  expect(after?.reserved).toBe(before?.reserved);
  expect(
    await s.t.run((ctx) => ctx.db.query("reservations").collect()),
  ).toHaveLength(0);
  expect(
    await s.recipient.client.query(api.publicKnowledge.savedDetail, {
      sourceId: first.sourceId,
    }),
  ).toMatchObject({ available: true, canEdit: true });
  await expect(
    s.publisher.client.query(api.publicKnowledge.savedDetail, {
      sourceId: first.sourceId,
    }),
  ).rejects.toThrow();
});
it("keeps personal corrections actor-private and does not change the public base on a replay", async () => {
  vi.spyOn(Date, "now").mockReturnValue(Date.now());
  const s = await setup();
  const edition = await published(s);
  const imported = await save(s, edition);
  const original = (await s.recipient.client.query(
    api.publicKnowledge.savedDetail,
    { sourceId: imported.sourceId },
  ))!;
  const publicInsightId = original.edition!.insights[0].id;
  expect(publicInsightId).not.toBe("checked-idea");
  await s.recipient.client.mutation(api.publicKnowledge.savePersonalLayer, {
    sourceId: imported.sourceId,
    expectedUpdatedAt: original.updatedAt,
    note: "PRIVATE PERSONAL NOTE",
    corrections: [
      { insightId: publicInsightId, text: "PRIVATE PERSONAL CORRECTION" },
    ],
  });
  await expect(
    s.recipient.client.mutation(api.publicKnowledge.savePersonalLayer, {
      sourceId: imported.sourceId,
      expectedUpdatedAt: original.updatedAt,
      note: "Stale competing correction",
      corrections: [],
    }),
  ).rejects.toThrow("APPROVAL_STALE");
  await s.t.run((ctx) =>
    ctx.db.insert("memberships", {
      organizationId: s.recipient.org,
      userId: s.viewer.id,
      role: "member",
    }),
  );
  const teammate = await s.viewer.client.query(
    api.publicKnowledge.savedDetail,
    { sourceId: imported.sourceId },
  );
  expect(teammate).toMatchObject({
    available: true,
    privateNote: "",
    corrections: [],
    canEdit: false,
  });
  await expect(
    s.viewer.client.mutation(api.publicKnowledge.savePersonalLayer, {
      sourceId: imported.sourceId,
      expectedUpdatedAt: original.updatedAt,
      note: "Take over",
      corrections: [],
    }),
  ).rejects.toThrow("FORBIDDEN");
  await save(s, edition);
  const again = await s.recipient.client.query(
    api.publicKnowledge.savedDetail,
    { sourceId: imported.sourceId },
  );
  expect(again!.privateNote).toBe("PRIVATE PERSONAL NOTE");
  const publicText = JSON.stringify(
    await s.t.query(api.publicKnowledge.readEdition, { slug: edition.slug }),
  );
  expect(publicText).not.toContain("PRIVATE PERSONAL");
});
it.each([
  "withdrawal",
  "source_correction",
  "rights_revocation",
  "permission_expiry",
  "role_loss",
  "deletion",
])("immediately denies anonymous access and reuse after %s", async (cause) => {
  const s = await setup();
  const edition = await published(s);
  const imported = await save(s, edition);
  if (cause === "withdrawal")
    await s.publisher.client.mutation(api.publicKnowledge.withdrawEdition, {
      id: edition.id,
      version: edition.version,
      correction: "This edition was withdrawn for correction.",
    });
  if (cause === "source_correction")
    await s.publisher.client.mutation(api.product.editSource, {
      id: s.sourceId,
      summary: "Corrected public summary",
      correctedText: "New corrected source input.",
      tags: [],
    });
  if (cause === "rights_revocation")
    await s.t.run((ctx) => ctx.db.patch(s.sourceId, { rightsAttested: false }));
  if (cause === "permission_expiry")
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 2 * 86400000);
  if (cause === "role_loss")
    await s.t.run(async (ctx) => {
      const m = (await ctx.db
        .query("memberships")
        .withIndex("by_pair", (q) =>
          q.eq("organizationId", s.publisher.org).eq("userId", s.publisher.id),
        )
        .unique())!;
      await ctx.db.patch(m._id, { role: "viewer" });
    });
  if (cause === "deletion")
    await s.publisher.client.mutation(api.product.deleteSource, {
      id: s.sourceId,
    });
  expect(
    await s.t.query(api.publicKnowledge.readEdition, { slug: edition.slug }),
  ).toBeNull();
  await expect(save(s, edition)).rejects.toThrow("SOURCE_UNAVAILABLE");
  const detail = await s.recipient.client.query(
    api.publicKnowledge.savedDetail,
    { sourceId: imported.sourceId },
  );
  expect(detail).toMatchObject({ available: false, edition: null });
});
it("rejects changed public-artifact compatibility and malformed foreign citation registries before reuse/publication", async () => {
  const s = await setup();
  const edition = await published(s);
  const artifact = (
    await s.t.run((ctx) => ctx.db.query("publicArtifacts").collect())
  )[0];
  await s.t.run((ctx) =>
    ctx.db.patch(artifact._id, { pipelineVersion: "different-pipeline" }),
  );
  await expect(save(s, edition)).rejects.toThrow("SOURCE_UNAVAILABLE");
  const revisionId = await s.t.run((ctx) =>
    ctx.db.insert("sourceRevisions", {
      organizationId: s.recipient.org,
      sourceId: s.sourceId,
      generation: 0,
      contentHash: "a".repeat(64),
      state: "current",
      revision: {
        schemaVersion: "1.0.0",
        retention: { retainUntil: Date.now() + 86400000 },
      },
      evidence: [
        {
          id: "supplied_text",
          kind: "supplied_text",
          canonicalUrl: "https://private.invalid/?signed=PRIVATE_URL_SENTINEL",
        },
      ],
      text: "PRIVATE FOREIGN REGISTRY",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  );
  await s.t.run((ctx) =>
    ctx.db.patch(s.sourceId, { currentRevisionId: revisionId }),
  );
  await expect(prepare(s)).rejects.toThrow();
});
it("binds collection publication to reviewed edition versions and hashes, then hides withdrawn or changed entries", async () => {
  const s = await setup();
  const a = await published(s);
  const second = await makeSource(s.t, s.publisher);
  const b = await published(s, second);
  const collection = await s.publisher.client.mutation(
    api.publicKnowledge.saveCollection,
    {
      organizationId: s.publisher.org,
      expectedVersion: 0,
      slug: `collection-${++sequence}`,
      title: "Synthetic collection",
      description: "Two permitted examples",
      topic: "Review",
      editions: [a.id, b.id],
    },
  );
  const publishArgs = {
    id: collection.id,
    version: collection.version,
    hash: collection.hash,
    explicitlyApproved: true as const,
  };
  await expect(
    s.publisher.client.mutation(api.publicKnowledge.publishCollection, {
      ...publishArgs,
      hash: "bad",
    }),
  ).rejects.toThrow("APPROVAL_STALE");
  const changed = await prepare(s, s.sourceId, {
    slug: a.slug,
    publisher: "Different reviewed publisher",
  });
  await s.publisher.client.mutation(api.publicKnowledge.publishEdition, {
    id: changed.id,
    version: changed.version,
    hash: changed.hash,
    explicitlyApproved: true,
  });
  await expect(
    s.publisher.client.mutation(
      api.publicKnowledge.publishCollection,
      publishArgs,
    ),
  ).rejects.toThrow();
  const stored = (await s.t.run((ctx) => ctx.db.get(collection.id)))!;
  const reviewed = await s.publisher.client.mutation(
    api.publicKnowledge.saveCollection,
    {
      organizationId: s.publisher.org,
      id: collection.id,
      expectedVersion: collection.version,
      slug: stored.slug,
      title: stored.title,
      description: stored.description,
      topic: stored.topic,
      editions: [a.id, b.id],
    },
  );
  expect(reviewed.hash).not.toBe(collection.hash);
  await s.publisher.client.mutation(api.publicKnowledge.publishCollection, {
    id: reviewed.id,
    version: reviewed.version,
    hash: reviewed.hash,
    explicitlyApproved: true,
  });
  expect(
    (await s.t.query(api.publicKnowledge.readCollection, {
      slug: stored.slug,
    }))!.editions,
  ).toHaveLength(2);
  await s.publisher.client.mutation(api.publicKnowledge.withdrawEdition, {
    id: b.id,
    version: b.version,
  });
  expect(
    await s.t.query(api.publicKnowledge.readCollection, { slug: stored.slug }),
  ).toBeNull();
  expect(
    (await s.t.query(api.publicKnowledge.discover, { cursor: null })).page,
  ).toEqual([]);
});
it("deduplicates anonymous reports and limits moderation to fresh allowlisted identities", async () => {
  const s = await setup();
  const edition = await published(s);
  const args = {
    slug: edition.slug,
    key: "synthetic-report-0001",
    reason: "privacy" as const,
  };
  await s.t.mutation(api.publicKnowledge.report, args);
  await s.t.mutation(api.publicKnowledge.report, args);
  const rows = await s.t.run((ctx) => ctx.db.query("publicReports").collect());
  expect(rows).toHaveLength(1);
  await expect(
    s.publisher.client.query(api.publicKnowledge.reports, {}),
  ).rejects.toThrow("FORBIDDEN");
  await expect(s.t.query(api.publicKnowledge.reports, {})).rejects.toThrow();
  vi.stubEnv(
    "PUBLIC_MODERATOR_SUBJECTS_JSON",
    JSON.stringify([s.recipient.subject]),
  );
  await expect(
    s.publisher.client.mutation(api.publicKnowledge.moderate, {
      reportId: rows[0]._id,
      action: "remove",
    }),
  ).rejects.toThrow("FORBIDDEN");
  const expired = s.t.withIdentity({
    subject: s.recipient.subject,
    auth_time: Math.floor(Date.now() / 1000) - 301,
  });
  await expect(
    expired.mutation(api.publicKnowledge.moderate, {
      reportId: rows[0]._id,
      action: "remove",
    }),
  ).rejects.toThrow(/Sign in again/);
  await s.recipient.client.mutation(api.publicKnowledge.moderate, {
    reportId: rows[0]._id,
    action: "remove",
  });
  expect(
    await s.t.query(api.publicKnowledge.readEdition, { slug: edition.slug }),
  ).toBeNull();
  await expect(prepare(s, s.sourceId, { slug: edition.slug })).rejects.toThrow(
    "PUBLIC_MODERATION_BLOCKED",
  );
  await expect(prepare(s)).rejects.toThrow("PUBLIC_MODERATION_BLOCKED");
});
it("counts distinct current voluntary contributors, hides groups below five and returns only broad aggregate geography", async () => {
  const s = await setup();
  await published(s);
  await expect(
    s.publisher.client.mutation(api.publicKnowledge.setGeography, {
      organizationId: s.publisher.org,
      cell: "europe",
      explicitlyOptedIn: false,
    }),
  ).rejects.toThrow("INVALID_INPUT");
  await expect(
    s.publisher.client.mutation(api.publicKnowledge.setGeography, {
      organizationId: s.publisher.org,
      cell: "52.5,13.4",
      explicitlyOptedIn: true,
    }),
  ).rejects.toThrow("INVALID_INPUT");
  await s.publisher.client.mutation(api.publicKnowledge.setGeography, {
    organizationId: s.publisher.org,
    cell: "europe",
    explicitlyOptedIn: true,
  });
  await s.t.run(async (ctx) => {
    for (let i = 0; i < 4; i++)
      await ctx.db.insert("publicGeography", {
        organizationId: s.publisher.org,
        actor: s.publisher.id,
        cell: "europe",
        enabled: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
  });
  expect(await s.t.query(api.publicKnowledge.geography, {})).toEqual([]);
  const contributors = [];
  for (let i = 0; i < 4; i++) {
    const person = await makeActor(s.t, `region-${i}`);
    const source = await makeSource(s.t, person);
    await published({ ...s, publisher: person, sourceId: source });
    await person.client.mutation(api.publicKnowledge.setGeography, {
      organizationId: person.org,
      cell: "europe",
      explicitlyOptedIn: true,
    });
    contributors.push(person);
  }
  const regions = await s.t.query(api.publicKnowledge.geography, {});
  expect(regions).toHaveLength(1);
  expect(regions[0]).toEqual({
    id: "europe",
    label: "Europe",
    latitude: 50,
    longitude: 15,
    contributors: "5–9",
    coverage: "bounded_snapshot",
  });
  const publicText = JSON.stringify(regions);
  for (const person of [s.publisher, ...contributors]) {
    expect(publicText).not.toContain(person.id);
    expect(publicText).not.toContain(person.org);
    expect(publicText).not.toContain(person.subject);
  }
  expect(publicText).not.toMatch(
    /createdAt|updatedAt|publishedAt|lastSeen|count":5/,
  );
  const last = contributors.at(-1)!;
  await last.client.mutation(api.publicKnowledge.setGeography, {
    organizationId: last.org,
    cell: null,
    explicitlyOptedIn: false,
  });
  expect(await s.t.query(api.publicKnowledge.geography, {})).toEqual([]);
});
it("fails closed behind release/restore gates while keeping voluntary withdrawal available when the feature is off", async () => {
  const s = await setup();
  const edition = await published(s);
  await s.publisher.client.mutation(api.publicKnowledge.setGeography, {
    organizationId: s.publisher.org,
    cell: "europe",
    explicitlyOptedIn: true,
  });
  vi.stubEnv("PUBLIC_KNOWLEDGE_ENABLED", "false");
  expect(
    await s.t.query(api.publicKnowledge.readEdition, { slug: edition.slug }),
  ).toBeNull();
  expect(await s.t.query(api.publicKnowledge.geography, {})).toEqual([]);
  await expect(save(s, edition)).rejects.toThrow("POLICY_BLOCKED");
  await s.publisher.client.mutation(api.publicKnowledge.setGeography, {
    organizationId: s.publisher.org,
    cell: null,
    explicitlyOptedIn: false,
  });
  expect(
    await s.t.run((ctx) => ctx.db.query("publicGeography").collect()),
  ).toEqual([]);
  vi.stubEnv("PUBLIC_KNOWLEDGE_ENABLED", "true");
  vi.stubEnv("RESTORE_LOCK", "true");
  expect(
    await s.t.query(api.publicKnowledge.readEdition, { slug: edition.slug }),
  ).toBeNull();
});
