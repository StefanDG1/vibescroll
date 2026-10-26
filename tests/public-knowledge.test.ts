import { afterEach, expect, it, vi } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";

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
    { kind: "user_note", label: "Untimed source evidence", url: null },
  ]);
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
});
it("retires regional opt-in and aggregates while preserving existing consent until withdrawal", async () => {
  const s = await setup();
  const ids = await s.t.run(async (ctx) => {
    const rows = [];
    for (let i = 0; i < 5; i++)
      rows.push(
        await ctx.db.insert("publicGeography", {
          organizationId: s.publisher.org,
          actor: s.publisher.id,
          cell: "europe",
          enabled: true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }),
      );
    return rows;
  });
  for (const cell of ["europe", "52.5,13.4"])
    await expect(
      s.publisher.client.mutation(api.publicKnowledge.setGeography, {
        organizationId: s.publisher.org,
        cell,
        explicitlyOptedIn: true,
      }),
    ).rejects.toThrow("POLICY_BLOCKED");
  expect(await s.t.query(api.publicKnowledge.geography, {})).toEqual([]);
  const retained = await s.t.run((ctx) =>
    Promise.all(ids.map((id) => ctx.db.get(id))),
  );
  expect(retained.every(Boolean)).toBe(true);
  await expect(
    s.recipient.client.mutation(api.publicKnowledge.setGeography, {
      organizationId: s.publisher.org,
      cell: null,
      explicitlyOptedIn: false,
    }),
  ).rejects.toThrow();
  await s.publisher.client.mutation(api.publicKnowledge.setGeography, {
    organizationId: s.publisher.org,
    cell: null,
    explicitlyOptedIn: false,
  });
  expect(
    await s.t.run((ctx) => Promise.all(ids.map((id) => ctx.db.get(id)))),
  ).toEqual(ids.map(() => null));
});
it("fails closed behind release/restore gates while keeping voluntary withdrawal available when the feature is off", async () => {
  const s = await setup();
  const edition = await published(s);
  await s.t.run((ctx) =>
    ctx.db.insert("publicGeography", {
      organizationId: s.publisher.org,
      actor: s.publisher.id,
      cell: "europe",
      enabled: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  );
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
