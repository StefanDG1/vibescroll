import { query } from "./_generated/server";
import { mutation, internalMutation } from "./lib/projectedMutations";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { access, user, recentAuthentication, limit, short } from "./lib";
import { ensure, containsSecret } from "../packages/policy";
import { digest, captureAuthorized } from "./product";
import {
  editionCurrent,
  publicEnabled,
  publicSourceUrl,
  publicEdition,
  reusableArtifact,
  editionDto,
} from "./lib/publicKnowledge";
import { validateEvidenceRegistry } from "../packages/sources/evidence";
import { sharedTypedCitations } from "./lib/sourceCitations";
import { sourceRetained } from "./lib/sourceAuthority";
import { canonicalJson } from "../packages/contracts/canonical-json.mjs";
import { knowledgeReadContext } from "./lib/knowledgeReadContext";

const org = { organizationId: v.id("organizations") };
function enabled() {
  ensure(
    publicEnabled(),
    "POLICY_BLOCKED",
    "Public knowledge is awaiting release review.",
  );
}
function clean(value: string, max: number) {
  const text = short(value, max);
  ensure(
    !containsSecret(text),
    "POLICY_BLOCKED",
    "Remove private credentials before publishing.",
  );
  return text;
}
function slug(value: string) {
  ensure(
    /^[a-z0-9][a-z0-9-]{2,79}$/.test(value),
    "INVALID_INPUT",
    "Use a public slug of 3 to 80 lowercase letters, numbers and hyphens.",
  );
  return value;
}
async function publicationSource(ctx: QueryCtx, id: Id<"sources">) {
  const source = await ctx.db.get(id);
  ensure(
    source &&
      source.state === "ready" &&
      source.rightsAttested &&
      sourceRetained(source.sourceRetentionUntil) &&
      !source.publicImportId,
    "SOURCE_UNAVAILABLE",
    "Choose a current original analyzed source.",
  );
  const { actor } = await access(ctx, source!.organizationId, [
    "owner",
    "admin",
  ]);
  await sharedTypedCitations(ctx, source);
  return { source: source!, actor };
}
async function payload(
  ctx: QueryCtx,
  source: Doc<"sources">,
  selected: string[],
  publisher: string,
) {
  const analysis = source.analysis;
  ensure(
    analysis &&
      Array.isArray(analysis.insights) &&
      selected.length > 0 &&
      selected.length <= 20 &&
      new Set(selected).size === selected.length,
    "INVALID_INPUT",
    "Choose current source-level insights.",
  );
  let registry: any[] = [];
  await sharedTypedCitations(ctx, source);
  if (source.currentRevisionId) {
    const revision = await ctx.db.get(source.currentRevisionId);
    ensure(
      revision?.state === "current" &&
        revision.organizationId === source.organizationId &&
        revision.sourceId === source._id &&
        revision.generation === source.generation &&
        (!revision.revision?.retention ||
          revision.revision.retention.retainUntil > Date.now()),
      "SOURCE_UNAVAILABLE",
      "The source revision is unavailable.",
    );
    registry = (
      await validateEvidenceRegistry(revision!.revision, revision!.evidence)
    ).evidence;
  }
  const sourceUrl = publicSourceUrl(source.url);
  const insights = selected.map((id, index) => {
    const item = analysis.insights.find((i: any) => i.id === id);
    ensure(
      item,
      "INVALID_EVIDENCE",
      "An insight changed before publication review.",
    );
    return {
      id: `point-${index + 1}`,
      title: clean(item.title, 160),
      claim: clean(item.claim, 2000),
      interpretation: clean(item.interpretation, 2000),
      uncertainty: (item.verificationNeeds ?? [])
        .slice(0, 10)
        .map((s: string) => clean(s, 500)),
      citations: (item.evidence ?? []).slice(0, 30).map((e: any) => {
        const record = registry.find(
          (r) =>
            r.id === e.id &&
            r.kind === e.kind &&
            e.startMs === null &&
            e.endMs === null,
        );
        if (record)
          return {
            label:
              record.kind === "github_file"
                ? `${record.path}, lines ${record.startLine}–${record.endLine}`
                : record.kind === "supplied_text"
                  ? "User-supplied excerpt, not provider-verified"
                  : `${record.role === "op" ? "Original post" : "Comment"} by ${record.author}`,
            url: record.canonicalUrl,
            kind: record.kind,
          };
        ensure(
          !source.currentRevisionId &&
            ["transcript", "frame", "caption", "user_note"].includes(e.kind),
          "INVALID_EVIDENCE",
          "A citation is no longer current.",
        );
        return {
          label:
            e.startMs === null
              ? "Untimed source evidence"
              : `Source evidence at ${Math.floor(e.startMs / 1000)} seconds`,
          url: sourceUrl,
          kind: e.kind,
        };
      }),
    };
  });
  ensure(
    insights.every((i) => i.citations.length > 0),
    "INVALID_EVIDENCE",
    "Each public insight needs a source citation.",
  );
  return {
    title: clean(source.title, 160),
    summary: clean(source.summary ?? analysis.summary, 1500),
    publisher: clean(publisher, 100),
    sourceUrl,
    coverage: source.coverage,
    language: "en",
    pipelineVersion: source.analysisPipelineVersion ?? "legacy-unverified",
    schemaVersion: analysis.schemaVersion,
    insights,
  };
}
export const own = query({
  args: org,
  handler: async (ctx, a) => {
    await access(ctx, a.organizationId, ["owner", "admin"]);
    const editions = await ctx.db
      .query("publicEditions")
      .withIndex("by_org", (q) => q.eq("organizationId", a.organizationId))
      .take(30);
    const safeEditions = await Promise.all(
      editions.map(async (row) => ({
        _id: row._id,
        slug: row.slug,
        state: row.state,
        version: row.version,
        payload: {
          title: (await editionCurrent(ctx, row))
            ? row.payload.title
            : "Unavailable source edition",
        },
      })),
    );
    return {
      enabled: publicEnabled(),
      editions: safeEditions,
      collections: (
        await ctx.db
          .query("publicCollections")
          .withIndex("by_org", (q) => q.eq("organizationId", a.organizationId))
          .take(30)
      ).map((row) => ({
        _id: row._id,
        slug: row.slug,
        state: row.state,
        version: row.version,
        title: "Reviewed collection",
      })),
      geography: await ctx.db
        .query("publicGeography")
        .withIndex("by_org", (q) => q.eq("organizationId", a.organizationId))
        .take(20),
    };
  },
});
export const prepareEdition = mutation({
  args: {
    sourceId: v.id("sources"),
    generation: v.number(),
    revision: v.number(),
    slug: v.string(),
    publisher: v.string(),
    insightIds: v.array(v.string()),
    reuseAllowed: v.boolean(),
    rightsBasis: v.union(
      v.literal("owner_created"),
      v.literal("licensed"),
      v.literal("public_domain"),
    ),
    permissionReference: v.string(),
    permissionExpiresAt: v.number(),
  },
  handler: async (ctx, a) => {
    enabled();
    await recentAuthentication(ctx);
    const { source, actor } = await publicationSource(ctx, a.sourceId);
    ensure(
      source.generation === a.generation && source.updatedAt === a.revision,
      "APPROVAL_STALE",
      "Review the changed source again.",
    );
    ensure(
      a.permissionExpiresAt > Date.now() &&
        a.permissionExpiresAt <= Date.now() + 366 * 86400000,
      "INVALID_INPUT",
      "Review publication rights within one year.",
    );
    const existing = await ctx.db
      .query("publicEditions")
      .withIndex("by_slug", (q) => q.eq("slug", slug(a.slug)))
      .unique();
    ensure(
      !existing ||
        (existing.actor === actor._id && existing.sourceId === source._id),
      "INVALID_INPUT",
      "Choose another public slug.",
    );
    const editions = await ctx.db
      .query("publicEditions")
      .withIndex("by_source", (q) => q.eq("sourceId", source._id))
      .take(6);
    ensure(
      existing || editions.length < 5,
      "LIMIT_REACHED",
      "This source already has five public editions.",
    );
    const publicData = await payload(ctx, source, a.insightIds, a.publisher);
    ensure(
      !a.reuseAllowed || publicData.pipelineVersion !== "legacy-unverified",
      "PROVENANCE_REQUIRED",
      "This older extraction has no verified pipeline version. Publish without reuse or explicitly analyze a new revision.",
    );
    const fields = {
      organizationId: source.organizationId,
      actor: actor._id,
      sourceId: source._id,
      sourceGeneration: source.generation,
      sourceRevision: source.updatedAt,
      state: "draft" as const,
      version: (existing?.version ?? 0) + 1,
      slug: a.slug,
      payload: publicData,
      payloadHash: await digest(canonicalJson(publicData)),
      rightsBasis: a.rightsBasis,
      permissionReference: clean(a.permissionReference, 500),
      permissionExpiresAt: a.permissionExpiresAt,
      reuseAllowed: a.reuseAllowed,
      updatedAt: Date.now(),
    };
    const id = existing
      ? (await ctx.db.patch(existing._id, fields), existing._id)
      : await ctx.db.insert("publicEditions", {
          ...fields,
          createdAt: Date.now(),
        });
    return {
      id,
      version: fields.version,
      hash: fields.payloadHash,
      payload: publicData,
    };
  },
});
export const publishEdition = mutation({
  args: {
    id: v.id("publicEditions"),
    version: v.number(),
    hash: v.string(),
    explicitlyApproved: v.literal(true),
  },
  handler: async (ctx, a) => {
    enabled();
    await recentAuthentication(ctx);
    const edition = await ctx.db.get(a.id);
    ensure(edition, "SOURCE_UNAVAILABLE", "Publication is unavailable.");
    const { source, actor } = await publicationSource(ctx, edition!.sourceId);
    ensure(
      edition!.actor === actor._id &&
        edition!.state === "draft" &&
        edition!.version === a.version &&
        edition!.payloadHash === a.hash &&
        edition!.payloadHash ===
          (await digest(canonicalJson(edition!.payload))) &&
        edition!.sourceGeneration === source.generation &&
        edition!.sourceRevision === source.updatedAt &&
        edition!.permissionExpiresAt > Date.now(),
      "APPROVAL_STALE",
      "Review the exact current public edition again.",
    );
    await ctx.db.patch(a.id, {
      state: "published",
      publishedAt: Date.now(),
      updatedAt: Date.now(),
    });
    if (edition!.reuseAllowed) {
      const p = edition!.payload;
      const contentHash = await digest(
        JSON.stringify([source.currentRevisionId ?? source.canonical, p]),
      );
      const compatibilityKey = await digest(
        JSON.stringify([
          contentHash,
          p.language,
          p.pipelineVersion,
          p.schemaVersion,
          p.coverage,
          edition!.rightsBasis,
          edition!.permissionReference,
          edition!.version,
        ]),
      );
      await ctx.db.insert("publicArtifacts", {
        organizationId: edition!.organizationId,
        editionId: a.id,
        editionVersion: edition!.version,
        contentHash,
        compatibilityKey,
        language: p.language,
        pipelineVersion: p.pipelineVersion,
        schemaVersion: p.schemaVersion,
        coverage: p.coverage,
        state: "eligible",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
    return { published: true, slug: edition!.slug };
  },
});
export const withdrawEdition = mutation({
  args: {
    id: v.id("publicEditions"),
    version: v.number(),
    correction: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    const edition = await ctx.db.get(a.id);
    ensure(edition, "SOURCE_UNAVAILABLE", "Publication unavailable.");
    await access(ctx, edition!.organizationId, ["owner", "admin"]);
    ensure(
      edition!.version === a.version,
      "APPROVAL_STALE",
      "Publication changed.",
    );
    await ctx.db.patch(a.id, { state: "withdrawn", updatedAt: Date.now() });
    if (a.correction)
      await ctx.db.insert("publicCorrections", {
        organizationId: edition!.organizationId,
        editionId: a.id,
        version: a.version,
        note: clean(a.correction, 500),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    return { withdrawn: true };
  },
});
export const readEdition = query({
  args: { slug: v.string() },
  handler: async (ctx, a) => {
    if (!publicEnabled() || !/^[a-z0-9-]{3,80}$/.test(a.slug)) return null;
    const row = await ctx.db
      .query("publicEditions")
      .withIndex("by_slug", (q) => q.eq("slug", a.slug))
      .unique();
    if (!(await editionCurrent(ctx, row))) return null;
    return {
      ...editionDto(row!),
      corrections: (
        await ctx.db
          .query("publicCorrections")
          .withIndex("by_edition", (q) => q.eq("editionId", row!._id))
          .take(20)
      ).map((c) => ({ version: c.version, note: c.note })),
    };
  },
});
export const saveEdition = mutation({
  args: { ...org, slug: v.string(), expectedVersion: v.number() },
  handler: async (ctx, a) => {
    enabled();
    const authorized = await access(ctx, a.organizationId, [
      "owner",
      "admin",
      "member",
    ]);
    const { actor } = authorized;
    const edition = await ctx.db
      .query("publicEditions")
      .withIndex("by_slug", (q) => q.eq("slug", a.slug))
      .unique();
    ensure(
      edition &&
        (await editionCurrent(ctx, edition)) &&
        edition.version === a.expectedVersion &&
        edition.reuseAllowed,
      "SOURCE_UNAVAILABLE",
      "This public artifact is unavailable for reuse.",
    );
    const candidates = await ctx.db
      .query("publicArtifacts")
      .withIndex("by_edition", (q) => q.eq("editionId", edition!._id))
      .order("desc")
      .take(10);
    const artifact = candidates.find(
      (a) =>
        "editionVersion" in a &&
        a.editionVersion === edition!.version &&
        a.state === "eligible",
    );
    ensure(
      artifact && (await reusableArtifact(ctx, artifact._id)),
      "SOURCE_UNAVAILABLE",
      "This public artifact is unavailable for reuse.",
    );
    const previous = await ctx.db
      .query("publicImports")
      .withIndex("by_actor_artifact", (q) =>
        q.eq("actor", actor._id).eq("artifactId", artifact!._id),
      )
      .take(30);
    const same = previous.find((p) => p.organizationId === a.organizationId);
    if (same)
      return { sourceId: same.sourceId, reused: true, chargedCredits: 0 };
    // Keep only an opaque public reference in the private source. The base output
    // is joined after current permission checks, so withdrawal cannot leave a copy.
    const sourceId = await captureAuthorized(
      ctx,
      {
        organizationId: a.organizationId,
        key: `public:${actor._id}:${artifact!._id}`,
        kind: "text",
        title: "Saved public edition",
        text: `Public artifact reference ${artifact!._id} for ${actor._id}. Open the current permitted artifact.`,
        rightsAttested: true,
      },
      authorized,
      false,
      true,
    );
    const existingSource = (await ctx.db.get(sourceId))!;
    if (existingSource.publicImportId)
      return { sourceId, reused: true, chargedCredits: 0 };
    const id = await ctx.db.insert("publicImports", {
      organizationId: a.organizationId,
      actor: actor._id,
      sourceId,
      artifactId: artifact!._id,
      editionVersion: edition!.version,
      compatibilityKey: artifact!.compatibilityKey,
      privateNote: "",
      corrections: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await ctx.db.patch(sourceId, { publicImportId: id });
    return { sourceId, reused: true, chargedCredits: 0 };
  },
});
export const savedDetail = query({
  args: { sourceId: v.id("sources") },
  handler: async (ctx, a) => {
    const source = await ctx.db.get(a.sourceId);
    ensure(source, "SOURCE_UNAVAILABLE", "Source unavailable.");
    const { actor } = await access(ctx, source!.organizationId);
    const layer = source!.publicImportId
      ? await ctx.db.get(source!.publicImportId)
      : null;
    if (!layer || source!.state === "deleted") return null;
    const base = await reusableArtifact(ctx, layer.artifactId);
    const available =
      !!base &&
      base.artifact.compatibilityKey === layer.compatibilityKey &&
      "editionVersion" in layer &&
      base.edition.version === layer.editionVersion;
    return {
      available,
      edition: available ? editionDto(base!.edition) : null,
      privateNote: layer.actor === actor._id ? layer.privateNote : "",
      corrections: layer.actor === actor._id ? layer.corrections : [],
      updatedAt: layer.updatedAt,
      canEdit: layer.actor === actor._id,
    };
  },
});
export const savePersonalLayer = mutation({
  args: {
    sourceId: v.id("sources"),
    expectedUpdatedAt: v.number(),
    note: v.string(),
    corrections: v.array(v.object({ insightId: v.string(), text: v.string() })),
  },
  handler: async (ctx, a) => {
    const source = await ctx.db.get(a.sourceId);
    ensure(
      source && source.state !== "deleted" && source.publicImportId,
      "SOURCE_UNAVAILABLE",
      "Source unavailable.",
    );
    const { actor } = await access(ctx, source!.organizationId, [
      "owner",
      "admin",
      "member",
    ]);
    const layer = (await ctx.db.get(source!.publicImportId!))!;
    ensure(
      layer.actor === actor._id,
      "FORBIDDEN",
      "These personal notes belong to another user.",
    );
    ensure(
      layer.updatedAt === a.expectedUpdatedAt &&
        a.note.length <= 4000 &&
        !containsSecret(a.note) &&
        a.corrections.length <= 20,
      "APPROVAL_STALE",
      "Review the current private notes.",
    );
    const base = await reusableArtifact(ctx, layer.artifactId);
    ensure(
      base &&
        a.corrections.every(
          (c) =>
            base.edition.payload.insights.some((i) => i.id === c.insightId) &&
            c.text.length <= 2000 &&
            !containsSecret(c.text),
        ),
      "INVALID_EVIDENCE",
      "Correct only current published insights.",
    );
    await ctx.db.patch(layer._id, {
      privateNote: a.note,
      corrections: a.corrections,
      updatedAt: Math.max(Date.now(), layer.updatedAt + 1),
    });
    return { saved: true };
  },
});
export const saveCollection = mutation({
  args: {
    ...org,
    id: v.optional(v.id("publicCollections")),
    expectedVersion: v.number(),
    slug: v.string(),
    title: v.string(),
    description: v.string(),
    topic: v.string(),
    editions: v.array(v.id("publicEditions")),
  },
  handler: async (ctx, a) => {
    enabled();
    const { actor } = await access(ctx, a.organizationId, ["owner", "admin"]);
    ensure(
      a.editions.length > 0 &&
        a.editions.length <= 25 &&
        new Set(a.editions).size === a.editions.length,
      "INVALID_INPUT",
      "Choose up to 25 different published editions.",
    );
    const bindings = [];
    for (const id of a.editions) {
      const edition = await publicEdition(ctx, id);
      ensure(edition, "SOURCE_UNAVAILABLE", "An edition is no longer public.");
      bindings.push({
        id,
        version: edition!.version,
        hash: edition!.payloadHash,
      });
    }
    const old = a.id ? await ctx.db.get(a.id) : null;
    ensure(
      (!old && a.expectedVersion === 0) ||
        (old?.organizationId === a.organizationId &&
          old.version === a.expectedVersion),
      "APPROVAL_STALE",
      "Collection changed.",
    );
    const duplicate = await ctx.db
      .query("publicCollections")
      .withIndex("by_slug", (q) => q.eq("slug", slug(a.slug)))
      .unique();
    ensure(
      !duplicate || duplicate._id === a.id,
      "INVALID_INPUT",
      "Choose another public slug.",
    );
    const fields = {
      organizationId: a.organizationId,
      actor: actor._id,
      slug: a.slug,
      title: clean(a.title, 160),
      description: clean(a.description, 1500),
      topic: clean(a.topic, 48),
      editions: a.editions,
      bindings,
      state: "draft" as const,
      version: (old?.version ?? 0) + 1,
      updatedAt: Date.now(),
    };
    const hash = await digest(
      JSON.stringify([
        fields.title,
        fields.description,
        fields.topic,
        fields.bindings,
      ]),
    );
    const id = old
      ? (await ctx.db.patch(old._id, { ...fields, reviewedHash: hash }),
        old._id)
      : await ctx.db.insert("publicCollections", {
          ...fields,
          reviewedHash: hash,
          createdAt: Date.now(),
        });
    return { id, version: fields.version, hash };
  },
});
export const publishCollection = mutation({
  args: {
    id: v.id("publicCollections"),
    version: v.number(),
    hash: v.string(),
    explicitlyApproved: v.literal(true),
  },
  handler: async (ctx, a) => {
    enabled();
    await recentAuthentication(ctx);
    const row = await ctx.db.get(a.id);
    ensure(row, "SOURCE_UNAVAILABLE", "Collection unavailable.");
    await access(ctx, row!.organizationId, ["owner", "admin"]);
    ensure(
      row!.state === "draft" &&
        row!.version === a.version &&
        row!.reviewedHash === a.hash,
      "APPROVAL_STALE",
      "Review the current collection.",
    );
    for (const binding of row!.bindings) {
      const edition = await publicEdition(ctx, binding.id);
      ensure(
        edition &&
          edition.version === binding.version &&
          edition.payloadHash === binding.hash,
        "APPROVAL_STALE",
        "An edition changed. Review this collection again.",
      );
    }
    await ctx.db.patch(a.id, { state: "published", updatedAt: Date.now() });
    return { published: true };
  },
});
export const withdrawCollection = mutation({
  args: { id: v.id("publicCollections"), version: v.number() },
  handler: async (ctx, a) => {
    const row = await ctx.db.get(a.id);
    ensure(row, "SOURCE_UNAVAILABLE", "Collection unavailable.");
    await access(ctx, row!.organizationId, ["owner", "admin"]);
    ensure(row!.version === a.version, "APPROVAL_STALE", "Collection changed.");
    await ctx.db.patch(a.id, { state: "withdrawn", updatedAt: Date.now() });
    return { withdrawn: true };
  },
});
// Anonymous pages share a finite number of full source/registry validations.
// The cache belongs to this immutable query, never to another actor/request.
function publicReadBudget(ctx: QueryCtx, maximum: number) {
  let remaining = maximum;
  const checked = new Map<string, Promise<Doc<"publicEditions"> | null>>();
  const current = (edition: Doc<"publicEditions">) => {
    const cached = checked.get(edition._id);
    if (cached) return cached;
    if (remaining <= 0) return Promise.resolve(null);
    remaining--;
    const result = editionCurrent(ctx, edition).then((valid) =>
      valid ? edition : null,
    );
    checked.set(edition._id, result);
    return result;
  };
  return {
    remaining: () => remaining,
    canRead: (ids: Id<"publicEditions">[]) =>
      new Set(ids.filter((id) => !checked.has(id))).size <= remaining,
    current,
    async read(id: Id<"publicEditions">) {
      const cached = checked.get(id);
      if (cached) return cached;
      if (remaining <= 0) return null;
      const edition = await ctx.db.get(id);
      if (edition) return current(edition);
      remaining--;
      const absent = Promise.resolve(null);
      checked.set(id, absent);
      return absent;
    },
  };
}
async function collectionDto(
  ctx: QueryCtx,
  row: Doc<"publicCollections">,
  budget = publicReadBudget(ctx, 25),
) {
  if (
    !row.bindings.length ||
    row.bindings.length > 25 ||
    row.bindings.length !== row.editions.length ||
    new Set(row.editions).size !== row.editions.length ||
    row.bindings.some((binding, index) => binding.id !== row.editions[index]) ||
    !budget.canRead(row.editions)
  )
    return null;
  const [org, actor, member] = await Promise.all([
    ctx.db.get(row.organizationId),
    ctx.db.get(row.actor),
    ctx.db
      .query("memberships")
      .withIndex("by_pair", (q) =>
        q.eq("organizationId", row.organizationId).eq("userId", row.actor),
      )
      .unique(),
  ]);
  if (
    row.state !== "published" ||
    org?.status !== "active" ||
    actor?.status !== "active" ||
    !member ||
    !["owner", "admin"].includes(member.role)
  )
    return null;
  const editions = [];
  for (const binding of row.bindings) {
    const edition = await budget.read(binding.id);
    if (
      !edition ||
      edition.version !== binding.version ||
      edition.payloadHash !== binding.hash
    )
      return null;
    editions.push(editionDto(edition));
  }
  return editions.length
    ? {
        slug: row.slug,
        title: row.title,
        description: row.description,
        topic: row.topic,
        editions,
      }
    : null;
}
export const readCollection = query({
  args: { slug: v.string() },
  handler: async (ctx, a) => {
    if (!publicEnabled()) return null;
    ctx = knowledgeReadContext(ctx);
    const row = await ctx.db
      .query("publicCollections")
      .withIndex("by_slug", (q) => q.eq("slug", a.slug))
      .unique();
    return row ? collectionDto(ctx, row) : null;
  },
});
export const discover = query({
  args: {
    topic: v.optional(v.string()),
    cursor: v.union(v.string(), v.null()),
  },
  handler: async (ctx, a) => {
    if (!publicEnabled()) return { page: [], isDone: true, continueCursor: "" };
    ctx = knowledgeReadContext(ctx);
    const budget = publicReadBudget(ctx, 24);
    const rows = await (
      a.topic
        ? ctx.db
            .query("publicCollections")
            .withIndex("by_topic", (q) =>
              q.eq("state", "published").eq("topic", a.topic!),
            )
        : ctx.db
            .query("publicCollections")
            .withIndex("by_state", (q) => q.eq("state", "published"))
    ).paginate({ cursor: a.cursor, numItems: 4 });
    const page = [];
    for (const row of rows.page) {
      const item = await collectionDto(ctx, row, budget);
      if (item) page.push(item);
    }
    return { page, isDone: rows.isDone, continueCursor: rows.continueCursor };
  },
});
export const report = mutation({
  args: {
    slug: v.string(),
    key: v.string(),
    reason: v.union(
      v.literal("copyright"),
      v.literal("privacy"),
      v.literal("inaccuracy"),
      v.literal("abuse"),
    ),
  },
  handler: async (ctx, a) => {
    enabled();
    const row = await ctx.db
      .query("publicEditions")
      .withIndex("by_slug", (q) => q.eq("slug", a.slug))
      .unique();
    ensure(
      row && (await editionCurrent(ctx, row)),
      "SOURCE_UNAVAILABLE",
      "This public edition is unavailable.",
    );
    ensure(
      /^[A-Za-z0-9_-]{16,100}$/.test(a.key),
      "INVALID_INPUT",
      "Invalid report key.",
    );
    const previous = await ctx.db
      .query("publicReports")
      .withIndex("by_key", (q) => q.eq("editionId", row!._id).eq("key", a.key))
      .unique();
    if (previous) return { received: true };
    await limit(ctx, `public-report:${row!._id}`, 10);
    await ctx.db.insert("publicReports", {
      organizationId: row!.organizationId,
      editionId: row!._id,
      key: a.key,
      reason: a.reason,
      state: "open",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return { received: true };
  },
});
async function moderator(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  const actor = await user(ctx);
  let subjects: unknown;
  try {
    subjects = JSON.parse(process.env.PUBLIC_MODERATOR_SUBJECTS_JSON ?? "[]");
  } catch {
    subjects = [];
  }
  ensure(
    identity && Array.isArray(subjects) && subjects.includes(identity.subject),
    "FORBIDDEN",
    "Moderator authority is required.",
  );
  return actor;
}
export const reports = query({
  args: {},
  handler: async (ctx) => {
    await moderator(ctx);
    const rows = await ctx.db
      .query("publicReports")
      .withIndex("by_state", (q) => q.eq("state", "open"))
      .order("desc")
      .take(50);
    return rows.map(
      ({ _id, editionId, reason, state, createdAt, updatedAt }) => ({
        _id,
        editionId,
        reason,
        state,
        createdAt,
        updatedAt,
      }),
    );
  },
});
export const inspectReport = query({
  args: { id: v.id("publicReports") },
  handler: async (ctx, a) => {
    await moderator(ctx);
    ctx = knowledgeReadContext(ctx);
    const report = await ctx.db.get(a.id);
    ensure(report, "SOURCE_UNAVAILABLE", "Report unavailable.");
    const edition =
      report.state === "open"
        ? await publicEdition(ctx, report.editionId)
        : null;
    return {
      reportId: report._id,
      edition: edition ? editionDto(edition) : null,
    };
  },
});
export const moderate = mutation({
  args: {
    reportId: v.id("publicReports"),
    action: v.union(v.literal("dismiss"), v.literal("remove")),
  },
  handler: async (ctx, a) => {
    const actor = await moderator(ctx);
    await recentAuthentication(ctx);
    const report = await ctx.db.get(a.reportId);
    ensure(report, "INVALID_INPUT", "Report unavailable.");
    if (a.action === "remove")
      await ctx.db.patch(report!.editionId, {
        state: "removed",
        removalReason: report!.reason,
        updatedAt: Date.now(),
      });
    await ctx.db.patch(a.reportId, {
      state: a.action === "remove" ? "removed" : "dismissed",
      reviewedBy: actor._id,
      updatedAt: Date.now(),
    });
    return { reviewed: true };
  },
});
export const setGeography = mutation({
  args: {
    ...org,
    cell: v.union(v.string(), v.null()),
    explicitlyOptedIn: v.boolean(),
  },
  returns: v.object({ sharing: v.literal(false) }),
  handler: async (ctx, a) => {
    const { actor } = await access(ctx, a.organizationId, ["owner", "admin"]);
    ensure(
      a.cell === null,
      "POLICY_BLOCKED",
      "Region sharing has been retired. Existing sharing can be withdrawn.",
    );
    const old = await ctx.db
      .query("publicGeography")
      .withIndex("by_actor", (q) => q.eq("actor", actor._id))
      .take(50);
    for (const row of old) await ctx.db.delete(row._id);
    return { sharing: false as const };
  },
});
// Compatibility for old clients. Retirement never reads regional aggregates.
export const geography = query({
  args: {},
  returns: v.array(v.any()),
  handler: async () => [],
});
export async function invalidatePublicEditions(
  ctx: MutationCtx,
  sourceId: Id<"sources">,
) {
  for (const row of await ctx.db
    .query("publicEditions")
    .withIndex("by_source", (q) => q.eq("sourceId", sourceId))
    .take(6))
    await ctx.db.patch(row._id, {
      state: "removed",
      payload: {
        ...row.payload,
        title: "Removed source",
        summary: "",
        insights: [],
        sourceUrl: null,
        publisher: "",
      },
      permissionReference: "Removed",
      removalReason: "source_removed",
      updatedAt: Date.now(),
    });
}
export const invalidateEditions = internalMutation({
  args: { sourceId: v.id("sources") },
  handler: (ctx, a) => invalidatePublicEditions(ctx, a.sourceId),
});
export async function invalidatePublicSource(
  ctx: MutationCtx,
  sourceId: Id<"sources">,
) {
  await invalidatePublicEditions(ctx, sourceId);
  for (const row of await ctx.db
    .query("sourceRevisions")
    .withIndex("by_source", (q) => q.eq("sourceId", sourceId))
    .filter((q) => q.neq(q.field("state"), "removed"))
    .take(25))
    await ctx.db.patch(row._id, {
      state: "removed",
      text: "",
      evidence: [],
      revision: { schemaVersion: "1.0.0", removed: true },
      updatedAt: Date.now(),
    });
  const more = await ctx.db
    .query("sourceRevisions")
    .withIndex("by_source", (q) => q.eq("sourceId", sourceId))
    .filter((q) => q.neq(q.field("state"), "removed"))
    .first();
  if (more)
    await ctx.scheduler.runAfter(0, internal.publicKnowledge.invalidateSource, {
      sourceId,
    });
  const imports = await ctx.db
    .query("publicImports")
    .withIndex("by_source", (q) => q.eq("sourceId", sourceId))
    .take(5);
  for (const row of imports) await ctx.db.delete(row._id);
}
export const invalidateSource = internalMutation({
  args: { sourceId: v.id("sources") },
  handler: (ctx, a) => invalidatePublicSource(ctx, a.sourceId),
});
