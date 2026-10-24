import { v } from "convex/values";
import { internalMutation, mutation } from "./lib/projectedMutations";
import { query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { access, limit } from "./lib";
import { ensure } from "../packages/policy";
import { captureAuthorized } from "./product";
import { creatorConfiguration } from "./lib/creatorPolicy";
import {
  serviceCatalogCard,
  serviceCatalogCursor,
  serviceCatalogQuery,
  serviceCatalogPage,
  serviceCatalogPageSize,
  serviceCatalogSummaryLimit,
  type ServiceCatalogCard,
} from "../packages/social/catalog";
import { serviceCatalogTopics } from "../packages/social/catalog-search";
import {
  commitServiceArtifact,
  expireServiceArtifact,
  invalidateServicePolicy,
  invalidateServiceSource,
  serviceArtifactCurrent,
  serviceArtifactDto,
  serviceArtifactSnapshot,
  requireProCatalogAccess,
  scrubServiceArtifactCopies,
  sweepRetainedServiceArtifactCopies,
  serviceArtifactCatalogProjectionCurrent,
  reindexServiceArtifactCatalog,
} from "./lib/serviceArtifacts";

export const commit = internalMutation({
  args: {
    sourceId: v.id("sources"),
    generation: v.number(),
    compatibilityKey: v.string(),
    result: v.any(),
  },
  handler: commitServiceArtifact,
});
export const expire = internalMutation({
  args: { id: v.id("publicArtifacts"), retainUntil: v.number() },
  handler: expireServiceArtifact,
});
export const invalidatePolicy = internalMutation({
  args: { rightsHash: v.string() },
  handler: (ctx, args) => invalidateServicePolicy(ctx, args.rightsHash),
});
export const invalidateSource = internalMutation({
  args: { sourceId: v.id("sources"), maxGeneration: v.number() },
  handler: (ctx, a) =>
    invalidateServiceSource(ctx, a.sourceId, a.maxGeneration),
});
export const scrubCopies = internalMutation({
  args: {
    artifactId: v.id("publicArtifacts"),
    cursor: v.union(v.string(), v.null()),
  },
  handler: scrubServiceArtifactCopies,
});
export const sweepCopies = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: (ctx, a) => sweepRetainedServiceArtifactCopies(ctx, a.cursor),
});
export const reindexCatalog = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: (ctx, a) => {
    const cursor = serviceCatalogCursor.safeParse(a.cursor);
    ensure(
      cursor.success,
      "INVALID_INPUT",
      "Use a valid catalog continuation.",
    );
    return reindexServiceArtifactCatalog(ctx, cursor.data);
  },
});

const importArgs = {
  organizationId: v.id("organizations"),
  artifactId: v.id("publicArtifacts"),
  expectedCompatibilityKey: v.string(),
};
type ImportArgs = {
  organizationId: Id<"organizations">;
  artifactId: Id<"publicArtifacts">;
  expectedCompatibilityKey: string;
};
async function privateOwner(
  ctx: QueryCtx,
  organizationId: Id<"organizations">,
) {
  const authorization = await access(ctx, organizationId, ["owner"]);
  ensure(
    authorization.organization.privateOwnerId === authorization.actor._id,
    "FORBIDDEN",
    "Save shared analysis in your own private library.",
  );
  return authorization;
}
export async function browseServiceArtifactsCore(
  ctx: QueryCtx,
  a: {
    organizationId: Id<"organizations">;
    cursor: string | null;
    query?: string;
  },
) {
  await privateOwner(ctx, a.organizationId);
  await requireProCatalogAccess(ctx, a.organizationId);
  const cursor = serviceCatalogCursor.safeParse(a.cursor);
  ensure(cursor.success, "INVALID_INPUT", "Use a valid catalog continuation.");
  const parsedQuery = serviceCatalogQuery.optional().safeParse(a.query);
  ensure(
    parsedQuery.success,
    "INVALID_INPUT",
    "Use a valid catalog search query.",
  );
  const search = parsedQuery.data;
  if (
    process.env.CREATOR_SERVICE_REUSE_ENABLED !== "true" ||
    !creatorConfiguration()
  )
    return serviceCatalogPage.parse({
      version: "service-catalog-v2",
      availability: "unavailable",
      page: [],
      continueCursor: null,
      isDone: true,
      query: search ?? null,
      searchCoverage: "indexed-eligible-generic-analysis",
    });
  const candidates = search
    ? ctx.db
        .query("publicArtifacts")
        .withSearchIndex("service_catalog_search", (q) =>
          q
            .search("catalogSearchText", search)
            .eq("origin", "service")
            .eq("state", "eligible"),
        )
    : ctx.db
        .query("publicArtifacts")
        .withIndex("by_service_expiry", (q) =>
          q.eq("origin", "service").eq("state", "eligible"),
        )
        .order("desc");
  const rows = await candidates.paginate({
    cursor: cursor.data,
    numItems: serviceCatalogPageSize,
  });
  const page: ServiceCatalogCard[] = [];
  for (const row of rows.page) {
    const current = await serviceArtifactCurrent(ctx, row);
    if (!current) continue;
    if (search && !(await serviceArtifactCatalogProjectionCurrent(current)))
      continue;
    const dto = serviceArtifactDto(current);
    const card = serviceCatalogCard.safeParse({
      artifactId: row._id,
      compatibilityKey: current.artifact.compatibilityKey,
      title: (dto.insights[0]?.title || dto.title).slice(0, 240),
      summary: dto.summary.slice(0, serviceCatalogSummaryLimit),
      summaryTruncated: dto.summary.length > serviceCatalogSummaryLimit,
      sourceUrl: dto.sourceUrl,
      platform: current.prepared.post.platform,
      language: dto.language,
      insightCount: dto.insights.length,
      availableUntil: current.artifact.retainUntil,
      ...serviceCatalogTopics(current.analysis),
      creatorId: current.prepared.post.creatorId,
      publishedAt: current.prepared.post.publishedAt,
    });
    if (card.success) page.push(card.data);
  }
  return serviceCatalogPage.parse({
    version: "service-catalog-v2",
    availability: "ready",
    page,
    continueCursor: rows.isDone ? null : rows.continueCursor,
    isDone: rows.isDone,
    query: search ?? null,
    searchCoverage: "indexed-eligible-generic-analysis",
  });
}
export const browse = query({
  args: {
    organizationId: v.id("organizations"),
    cursor: v.union(v.string(), v.null()),
    query: v.optional(v.string()),
  },
  handler: browseServiceArtifactsCore,
});
export const preview = query({
  args: importArgs,
  handler: async (ctx, a) => {
    await privateOwner(ctx, a.organizationId);
    await requireProCatalogAccess(ctx, a.organizationId);
    const current = await serviceArtifactCurrent(
      ctx,
      await ctx.db.get(a.artifactId),
    );
    return current?.artifact.compatibilityKey === a.expectedCompatibilityKey
      ? serviceArtifactDto(current)
      : null;
  },
});
export async function saveServiceArtifactCore(ctx: MutationCtx, a: ImportArgs) {
  const authorization = await privateOwner(ctx, a.organizationId);
  await requireProCatalogAccess(ctx, a.organizationId);
  await limit(ctx, `service-artifact-save:${authorization.actor._id}`, 30);
  const base = await serviceArtifactCurrent(
    ctx,
    await ctx.db.get(a.artifactId),
  );
  ensure(
    base && base.artifact.compatibilityKey === a.expectedCompatibilityKey,
    "SOURCE_UNAVAILABLE",
    "This shared analysis is unavailable for reuse.",
  );
  const previous = await ctx.db
    .query("publicImports")
    .withIndex("by_actor_artifact", (q) =>
      q.eq("actor", authorization.actor._id).eq("artifactId", a.artifactId),
    )
    .take(30);
  const same = previous.find(
    (row) =>
      row.origin === "service" && row.organizationId === a.organizationId,
  );
  if (same?.origin === "service") {
    const source = await ctx.db.get(same.sourceId);
    ensure(
      source &&
        source.organizationId === a.organizationId &&
        source.state !== "deleted" &&
        source.publicImportId === same._id &&
        same.compatibilityKey === a.expectedCompatibilityKey,
      "SOURCE_UNAVAILABLE",
      "The removed saved source cannot be recreated.",
    );
    if (!same.snapshot)
      await ctx.db.patch(same._id, {
        snapshot: await serviceArtifactSnapshot(base),
        updatedAt: Math.max(Date.now(), same.updatedAt + 1),
      });
    return {
      sourceId: source._id,
      reused: true as const,
      chargedCredits: 0,
      processingStarted: false,
    };
  }
  const sourceId = await captureAuthorized(
    ctx,
    {
      organizationId: a.organizationId,
      key: `service:${authorization.actor._id}:${a.artifactId}`,
      kind: "text",
      title: "Saved shared analysis",
      text: `Saved insight copy ${a.artifactId} for ${authorization.actor._id}.`,
      rightsAttested: true,
    },
    authorization,
    false,
    true,
  );
  const source = await ctx.db.get(sourceId);
  ensure(
    source && source.state !== "deleted" && !source.publicImportId,
    "SOURCE_UNAVAILABLE",
    "This saved source is unavailable.",
  );
  const now = Date.now();
  const layerId = await ctx.db.insert("publicImports", {
    origin: "service",
    organizationId: a.organizationId,
    actor: authorization.actor._id,
    sourceId,
    artifactId: a.artifactId,
    compatibilityKey: a.expectedCompatibilityKey,
    snapshot: await serviceArtifactSnapshot(base),
    privateNote: "",
    corrections: [],
    createdAt: now,
    updatedAt: now,
  });
  await ctx.db.patch(sourceId, { publicImportId: layerId });
  return {
    sourceId,
    reused: true as const,
    chargedCredits: 0,
    processingStarted: false,
  };
}
export const save = mutation({
  args: importArgs,
  handler: saveServiceArtifactCore,
});
