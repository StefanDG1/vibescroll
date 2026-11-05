import { internalQuery, internalMutation } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { selectedProfile } from "./assistant";
import { assistantGrant } from "./lib/assistantPrincipal";
import { sourceWithinAssistantScope } from "./lib/assistantSourceScope";
import { knowledgeReadContext } from "./lib/knowledgeReadContext";
import { selectedAnalysis, retainedVersion } from "./lib/analysisHistory";
import { exactGrantedSource } from "./knowledgeGrants";
import { ensure, PolicyError } from "../packages/policy";
import {
  workspaceSearchOutput,
  workspaceSearchLimits as limits,
  type WorkspaceSearchResult,
} from "../packages/contracts/workspace-search";
import {
  bumpWorkspaceSearch,
  refreshDirectSearchSource,
  refreshSharedSearchSource,
  workspaceSearchEnabled,
  workspaceSearchState,
} from "./lib/workspaceSearchProjection";

import {
  rankedCursorKey,
  readRankedCursor,
  signRankedCursor,
} from "./lib/workspaceSearchCursor";

import {
  runWorkspaceSearchRequest,
  type CoreSearchArgs,
  type CoreSearchOptions,
} from "./lib/workspaceSearchFederation";
import {
  fitMatch,
  metadataMatchesFilters,
  insightSearchTopics,
  outputSearchTopics,
  sourcePlatform,
  type SearchFilters,
  searchPrefixHash,
} from "./lib/workspaceSearchFilters";

const targetValue = v.union(
  v.literal("posts"),
  v.literal("insights"),
  v.literal("both"),
);
const referenceValue = v.object({
  sourceId: v.string(),
  generation: v.number(),
  revision: v.number(),
  analysisVersionId: v.optional(v.string()),
  sharedGrantId: v.optional(v.string()),
  sharedGrantVersion: v.optional(v.number()),
});
const fitValue = v.object({
  rubric: v.literal("topic-coverage-v1"),
  matched: v.number(),
  total: v.number(),
  criteria_omitted: v.optional(v.number()),
  criteria: v.array(
    v.object({
      category: v.string(),
      matched: v.boolean(),
      terms: v.array(v.string()),
    }),
  ),
});
const accessPathValue = v.object({
  profile_id: v.string(),
  grant_version: v.number(),
  fetch_id: v.string(),
  url: v.string(),
  reference: referenceValue,
});
const outputValue = v.object({
  mode: v.literal("ranked_v1"),
  posts: v.array(
    v.object({
      id: v.string(),
      fetch_id: v.string(),
      title: v.string(),
      url: v.string(),
      reference: referenceValue,
      access_paths: v.optional(v.array(accessPathValue)),
    }),
  ),
  matches: v.array(
    v.object({
      id: v.string(),
      post_id: v.string(),
      kind: v.union(v.literal("post"), v.literal("insight")),
      insight_id: v.optional(v.string()),
      title: v.string(),
      excerpt: v.string(),
      project_fit: v.optional(fitValue),
    }),
  ),
  next_cursor: v.union(v.string(), v.null()),
  has_more: v.boolean(),
  exhausted: v.boolean(),
  truncated: v.boolean(),
  coverage: v.string(),
  profile_id: v.string(),
  grant_version: v.number(),
  scanned_candidates: v.number(),
  loaded_candidates: v.optional(v.number()),
  examined_sources: v.number(),
  loaded_bytes: v.number(),
  session_candidates: v.number(),
  projection_revision: v.number(),
  index_ready: v.boolean(),
  workspaces: v.optional(
    v.array(
      v.object({
        profile_id: v.string(),
        grant_version: v.number(),
        projection_revision: v.number(),
        index_ready: v.boolean(),
        has_more: v.boolean(),
      }),
    ),
  ),
  project: v.optional(
    v.object({
      id: v.string(),
      profile_id: v.string(),
      name: v.string(),
      base_sha: v.string(),
      profile_version: v.number(),
      selection_version: v.number(),
      context_grant_version: v.number(),
    }),
  ),
});
type Reader = Awaited<ReturnType<typeof assistantGrant>>;
type Hydrated = {
  source: Doc<"sources">;
  output: unknown;
  origin: Doc<"workspaceSearchOrigins">;
};
const expectedUnavailable = (error: unknown) =>
  error instanceof PolicyError &&
  [
    "FORBIDDEN",
    "APPROVAL_STALE",
    "SOURCE_UNAVAILABLE",
    "STALE_APPROVAL",
  ].includes(error.code);

async function hydrateOrigin(
  ctx: QueryCtx,
  reader: Reader,
  doc: Doc<"workspaceSearchDocuments">,
  budget: { remaining: number; bytes: number; examined: number },
  filters?: SearchFilters,
): Promise<{ value: Hydrated | null; limited: boolean }> {
  const paths = await ctx.db
    .query("workspaceSearchOrigins")
    .withIndex("by_post", (q) =>
      q
        .eq("organizationId", reader.organization._id)
        .eq("canonicalKey", doc.canonicalKey)
        .eq("analysisKey", doc.analysisKey),
    )
    .take(limits.originsPerPost + 1);
  let limited = paths.length > limits.originsPerPost;
  for (const origin of paths.slice(0, limits.originsPerPost)) {
    if (
      origin.grantId &&
      (filters?.addedAfter !== undefined || filters?.addedBefore !== undefined)
    ) {
      limited = true;
      continue;
    }
    if (budget.remaining <= 0) return { value: null, limited: true };
    try {
      let source: Doc<"sources"> | null = null;
      if (origin.grantId) {
        if (reader.grant.libraryScope !== "all") continue;
        budget.remaining--;
        budget.examined++;
        const shared = await exactGrantedSource(
          ctx,
          reader.organization._id,
          origin.grantId,
          origin.sourceId,
          origin.grantVersion,
        );
        source = shared.source;
        if (shared.reference.analysisVersionId !== origin.analysisVersionId)
          continue;
      } else {
        budget.remaining--;
        budget.examined++;
        source = await ctx.db.get(origin.sourceId);
        if (
          !(await sourceWithinAssistantScope(
            ctx,
            reader.grant,
            reader.organization,
            reader.actor._id,
            source,
          ))
        )
          continue;
      }
      if (
        !source ||
        source.generation !== origin.generation ||
        source.updatedAt !== origin.revision
      )
        continue;
      if (
        (filters?.addedAfter !== undefined &&
          source.createdAt < filters.addedAfter) ||
        (filters?.addedBefore !== undefined &&
          source.createdAt > filters.addedBefore)
      )
        continue;
      const selected =
        origin.grantId && origin.analysisVersionId
          ? (await retainedVersion(ctx, source, origin.analysisVersionId))
              .version
          : await selectedAnalysis(ctx, source);
      const selectedId =
        selected && "metadata" in selected
          ? selected.metadata.id
          : selected?._id;
      if (selectedId !== origin.analysisVersionId) continue;
      return {
        value: { source, origin, output: selected?.output ?? source.analysis },
        limited,
      };
    } catch (error) {
      if (
        error instanceof PolicyError &&
        error.code === "RETRIEVAL_BUDGET_REACHED"
      ) {
        budget.remaining = 0;
        return { value: null, limited: true };
      }
      if (!expectedUnavailable(error)) throw error;
    }
  }
  return { value: null, limited };
}

export async function searchWorkspaceCore(
  rawCtx: QueryCtx,
  args: CoreSearchArgs,
  options: CoreSearchOptions = {},
): Promise<WorkspaceSearchResult> {
  const ctx = knowledgeReadContext(rawCtx);
  ensure(
    args.query.trim().length > 0 && args.query.length <= 200,
    "INVALID_INPUT",
    "Use a short search query.",
  );
  const query = args.query.trim(),
    target = args.target ?? "both";
  const reader =
    options.reader ??
    (await assistantGrant(
      ctx,
      await selectedProfile(ctx, args.profileId, "knowledge:read"),
      "knowledge:read",
    ));
  ensure(
    reader.grant.libraryScope === "all",
    "INVALID_INPUT",
    "Use search without ranked_v1 mode for this source- or space-limited grant. Access was not widened.",
  );
  const cursorKey = await rankedCursorKey();
  const state = await workspaceSearchState(ctx, reader.organization._id),
    revision = state?.revision ?? 0;
  const ready = workspaceSearchEnabled() && state?.phase === "ready";
  const result: WorkspaceSearchResult = {
    mode: "ranked_v1",
    posts: [],
    matches: [],
    next_cursor: null,
    has_more: false,
    exhausted: false,
    truncated: !ready,
    coverage: ready
      ? "Ranked text matches from the current authorized workspace. Text projections are bounded; no transcript or semantic search is performed. Exhaustion refers only to indexed entries. Recent saves and shares may still be indexing; an empty result does not prove whole-library absence."
      : "Workspace search indexing is pending. Use legacy search or exact fetch while the operator completes bounded indexing.",
    profile_id: reader.organization._id,
    grant_version: reader.grant.version,
    scanned_candidates: 0,
    examined_sources: 0,
    loaded_bytes: 0,
    session_candidates: 0,
    projection_revision: revision,
    index_ready: !!ready,
  };
  let pageStart: string | null = null,
    offset = 0,
    visited = 0,
    incomplete = false;
  if (args.cursor) {
    ensure(
      args.cursor.length <= 4096,
      "INVALID_INPUT",
      "Invalid workspace search cursor.",
    );
    const cursor = await readRankedCursor(cursorKey, args.cursor);
    ensure(
      cursor.profileId === reader.organization._id &&
        cursor.grantId === reader.grant._id &&
        cursor.grantVersion === reader.grant.version &&
        cursor.projectionRevision === revision &&
        cursor.query === query &&
        cursor.target === target,
      "APPROVAL_STALE",
      "Workspace search access, query or index changed. Start a new search.",
    );
    pageStart = cursor.page;
    offset = cursor.offset;
    visited = cursor.visited;
    incomplete = cursor.incomplete;
  }
  if (!ready) return workspaceSearchOutput.parse(result);
  const candidates = ctx.db
    .query("workspaceSearchDocuments")
    .withSearchIndex("search_text", (q) => {
      const search = q
        .search("searchText", query)
        .eq("organizationId", reader.organization._id);
      return target === "both"
        ? search
        : search.eq("kind", target === "posts" ? "post" : "insight");
    });
  let page: {
    page: Doc<"workspaceSearchDocuments">[];
    isDone: boolean;
    continueCursor: string;
  };
  if (options.prefix) {
    offset = options.prefix.offset;
    visited = offset;
    ensure(
      offset <= options.prefix.sessionLimit,
      "INVALID_INPUT",
      "Invalid workspace candidate share.",
    );
    const amount = Math.min(
      options.prefix.sessionLimit,
      offset + (options.candidateLimit ?? limits.candidatesPerPage),
    );
    const rows = await candidates.take(amount);
    if (offset)
      ensure(
        rows.length >= offset &&
          (await searchPrefixHash(
            rows.slice(0, offset).map((row) => row._id),
          )) === options.prefix.hash,
        "APPROVAL_STALE",
        "Indexed candidate order changed. Start a new search.",
      );
    page = { page: rows, isDone: rows.length < amount, continueCursor: "" };
    result.loaded_candidates = rows.length;
  } else
    page = await candidates.paginate({
      cursor: pageStart,
      numItems: options.candidateLimit ?? limits.candidatesPerPage,
    });
  const hydrated = new Map<
    string,
    Promise<{ value: Hydrated | null; limited: boolean }>
  >();
  const sharedReadBudget = options.sharedReadBudget ?? { bytes: 0 };
  const initialBytes = sharedReadBudget.bytes;
  const hydrationBudget = {
    remaining: options.sourceLimit ?? limits.sourceHydrations,
    examined: 0,
    get bytes() {
      return sharedReadBudget.bytes;
    },
    set bytes(value: number) {
      sharedReadBudget.bytes = value;
    },
  };
  const sessionMaximum = Math.min(
    limits.candidatesPerSession,
    options.prefix?.sessionLimit ?? limits.candidatesPerSession,
    visited + (options.remainingCandidates ?? limits.candidatesPerSession),
  );
  const measuredCtx = {
    ...ctx,
    db: new Proxy(ctx.db, {
      get(target, property) {
        if (property === "get")
          return async (...args: unknown[]) => {
            ensure(
              hydrationBudget.bytes < limits.loadedBytes,
              "RETRIEVAL_BUDGET_REACHED",
              "Narrow the query to read more evidence.",
            );
            const value = await Reflect.apply(target.get, target, args);
            hydrationBudget.bytes += new TextEncoder().encode(
              JSON.stringify(value),
            ).length;
            return value;
          };
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    }),
  };
  let index = offset;
  for (
    ;
    index < page.page.length &&
    result.matches.length < (options.resultLimit ?? limits.results) &&
    visited < sessionMaximum;
    index++
  ) {
    const doc = page.page[index];
    const postId = `${doc.canonicalKey}:${doc.analysisKey}`;
    if (!hydrated.has(postId) && hydrationBudget.remaining <= 0) {
      incomplete = true;
      break;
    }
    visited++;
    result.scanned_candidates++;
    if (
      doc.metadataVersion === 2 &&
      !metadataMatchesFilters(doc, options.filters)
    )
      continue;
    let current = hydrated.get(postId);
    if (!current) {
      current = hydrateOrigin(
        measuredCtx,
        reader,
        doc,
        hydrationBudget,
        options.filters,
      );
      hydrated.set(postId, current);
    }
    const { value, limited } = await current;
    incomplete ||= limited || doc.truncated;
    if (!value) {
      incomplete = true;
      continue;
    }
    const { source, origin } = value;
    let title = source.title.slice(0, 200),
      excerpt = "";
    let topics: string[] = [],
      categories: string[] = [];
    if (doc.kind === "insight") {
      const raw =
        value.output && typeof value.output === "object"
          ? (value.output as { insights?: unknown })
          : {};
      const insight = Array.isArray(raw.insights)
        ? raw.insights.find(
            (entry: unknown) =>
              entry &&
              typeof entry === "object" &&
              "id" in entry &&
              entry.id === doc.insightId,
          )
        : null;
      if (
        !insight ||
        typeof insight.title !== "string" ||
        typeof insight.claim !== "string"
      ) {
        incomplete = true;
        continue;
      }
      topics = insightSearchTopics(insight);
      categories = insightSearchTopics(insight, false);
      title = insight.title.slice(0, 200);
      excerpt = insight.claim.slice(0, 700);
    } else {
      excerpt = doc.excerpt;
      topics = outputSearchTopics(value.output);
      categories = outputSearchTopics(value.output, false);
    }
    const platform =
      doc.metadataVersion === 2
        ? doc.platform
        : sourcePlatform(source.url ?? "", source.kind);
    if (
      !metadataMatchesFilters(
        { platform, categoryKeys: categories },
        options.filters,
      )
    )
      continue;
    const oldPosts = result.posts.length;
    if (!result.posts.some((post) => post.id === postId))
      result.posts.push({
        id: postId,
        fetch_id: `${source._id}${origin.analysisVersionId ? `@${origin.analysisVersionId}` : ""}`,
        title: source.title.slice(0, 200),
        url: origin.grantId
          ? `https://scroll.companynerve.com/app/${reader.organization._id}/shared?grant=${origin.grantId}&source=${source._id}`
          : `https://scroll.companynerve.com/app/${reader.organization._id}/posts/${source._id}`,
        reference: {
          sourceId: source._id,
          generation: source.generation,
          revision: source.updatedAt,
          ...(origin.analysisVersionId
            ? { analysisVersionId: origin.analysisVersionId }
            : {}),
          ...(origin.grantId
            ? {
                sharedGrantId: origin.grantId,
                sharedGrantVersion: origin.grantVersion,
              }
            : {}),
        },
      });
    result.matches.push({
      id: `${postId}:${doc.itemKey}`,
      post_id: postId,
      kind: doc.kind,
      ...(doc.insightId ? { insight_id: doc.insightId } : {}),
      title,
      excerpt,
      ...(options.project
        ? { project_fit: fitMatch(options.project, topics) }
        : {}),
    });
    if (
      new TextEncoder().encode(JSON.stringify(result)).length >
      (options.responseBytes ?? limits.responseBytes) - 6000
    ) {
      // A valid first item may exceed a soft per-workspace share. Emit it
      // once if it remains globally bounded, rather than returning a cursor
      // that can never advance. Federation reserves room for three such items.
      if (
        result.matches.length === 1 &&
        new TextEncoder().encode(JSON.stringify(result)).length <= 16_000
      ) {
        index++;
        break;
      }
      result.matches.pop();
      result.posts.splice(oldPosts);
      visited--;
      result.scanned_candidates--;
      incomplete = true;
      break;
    }
  }
  const remaining = index < page.page.length || !page.isDone;
  const budgetReached = visited >= sessionMaximum;
  result.session_candidates = visited;
  result.examined_sources = hydrationBudget.examined;
  result.loaded_bytes = hydrationBudget.bytes - initialBytes;
  result.has_more = remaining;
  result.truncated = incomplete || remaining;
  result.exhausted = !remaining && !incomplete;
  if (options.prefix) {
    options.prefix.nextOffset = index;
    options.prefix.nextHash = await searchPrefixHash(
      page.page.slice(0, index).map((row) => row._id),
    );
    options.prefix.incomplete = incomplete;
  }
  if (remaining && !budgetReached && !options.prefix)
    result.next_cursor = await signRankedCursor(cursorKey, {
      version: 1,
      profileId: reader.organization._id,
      grantId: reader.grant._id,
      grantVersion: reader.grant.version,
      projectionRevision: revision,
      query,
      target,
      page: index < page.page.length ? pageStart : page.continueCursor,
      offset: index < page.page.length ? index : 0,
      visited,
      incomplete,
    });
  if (budgetReached && remaining)
    result.coverage =
      "The 200-candidate retrieval budget was reached. Narrow the query or filters; no automatic full-workspace traversal occurred.";
  if (options.filters)
    result.coverage +=
      " Filters inspect only bounded candidates; date filters use known direct-save times and omit shared paths whose workspace-added date is unknown.";
  if (options.project) {
    result.matches.sort((a, b) => {
      const aa = a.project_fit!,
        bb = b.project_fit!;
      return bb.matched * (aa.total || 1) - aa.matched * (bb.total || 1);
    });
    result.coverage +=
      " Project fit reorders this emitted page only; it is not a global or semantic relevance score.";
  }
  return workspaceSearchOutput.parse(result);
}

export const search = internalQuery({
  args: {
    profileId: v.optional(v.id("organizations")),
    workspaceIds: v.optional(v.array(v.id("organizations"))),
    query: v.string(),
    mode: v.literal("ranked_v1"),
    target: v.optional(targetValue),
    filters: v.optional(
      v.object({
        categoryKeys: v.optional(v.array(v.string())),
        platforms: v.optional(v.array(v.string())),
        addedAfter: v.optional(v.number()),
        addedBefore: v.optional(v.number()),
      }),
    ),
    projectId: v.optional(v.id("repositories")),
    cursor: v.optional(v.string()),
  },
  returns: outputValue,
  handler: (ctx, args) =>
    runWorkspaceSearchRequest(ctx, args, searchWorkspaceCore),
});

export const refreshSource = internalMutation({
  args: { organizationId: v.id("organizations"), sourceId: v.id("sources") },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!workspaceSearchEnabled() || process.env.RESTORE_LOCK === "true")
      return null;
    await refreshDirectSearchSource(ctx, args.organizationId, args.sourceId);
    const grants = await ctx.db
      .query("teamKnowledgeGrants")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .take(51);
    ensure(
      grants.length <= 50,
      "POLICY_BLOCKED",
      "Workspace sharing requires bounded operator review.",
    );
    for (const grant of grants)
      if (grant.sources.some((ref) => ref.sourceId === args.sourceId))
        await ctx.scheduler.runAfter(
          0,
          internal.workspaceSearch.refreshShared,
          {
            organizationId: grant.recipientOrganizationId,
            grantId: grant._id,
            sourceId: args.sourceId,
          },
        );
    return null;
  },
});
export const refreshShared = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    grantId: v.id("teamKnowledgeGrants"),
    sourceId: v.id("sources"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (workspaceSearchEnabled() && process.env.RESTORE_LOCK !== "true")
      await refreshSharedSearchSource(
        ctx,
        args.organizationId,
        args.grantId,
        args.sourceId,
      );
    return null;
  },
});

// Explicit operator work, one source per call. Ordinary search never writes.
export const bootstrap = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    expectedRevision: v.optional(v.number()),
  },
  returns: v.object({
    done: v.boolean(),
    revision: v.number(),
    phase: v.string(),
    visited: v.number(),
  }),
  handler: async (ctx, args) => {
    ensure(
      workspaceSearchEnabled() && process.env.RESTORE_LOCK !== "true",
      "POLICY_BLOCKED",
      "Workspace search indexing is unavailable.",
    );
    const org = await ctx.db.get(args.organizationId);
    ensure(org?.status === "active", "FORBIDDEN", "Workspace unavailable.");
    let state = await workspaceSearchState(ctx, args.organizationId);
    ensure(
      args.expectedRevision === undefined ||
        args.expectedRevision === (state?.revision ?? 0),
      "APPROVAL_STALE",
      "Index state changed.",
    );
    if (!state) {
      await bumpWorkspaceSearch(ctx, args.organizationId);
      state = (await workspaceSearchState(ctx, args.organizationId))!;
    }
    let visited = 0;
    if (state.phase === "sources") {
      const page = await ctx.db
        .query("dashboardCards")
        .withIndex("by_org_kind_updated", (q) =>
          q.eq("organizationId", args.organizationId).eq("kind", "source"),
        )
        .paginate({ cursor: state.cursor, numItems: 1 });
      for (const card of page.page) {
        const sourceId = ctx.db.normalizeId("sources", card.entityId);
        if (sourceId) {
          await refreshDirectSearchSource(ctx, args.organizationId, sourceId);
          visited++;
        }
      }
      await ctx.db.patch(state._id, {
        phase: page.isDone ? "shares" : "sources",
        cursor: page.isDone ? null : page.continueCursor,
        shareOffset: 0,
        updatedAt: Date.now(),
      });
    } else if (state.phase === "shares") {
      const page = await ctx.db
        .query("teamKnowledgeGrants")
        .withIndex("by_recipient", (q) =>
          q.eq("recipientOrganizationId", args.organizationId),
        )
        .paginate({ cursor: state.cursor, numItems: 1 });
      const grant = page.page[0];
      if (grant) {
        ensure(
          grant.sources.length <= 50,
          "POLICY_BLOCKED",
          "Workspace sharing requires bounded operator review.",
        );
        const ref = grant.sources[state.shareOffset];
        if (ref) {
          await refreshSharedSearchSource(
            ctx,
            args.organizationId,
            grant._id,
            ref.sourceId,
          );
          visited++;
        }
        const next = state.shareOffset + 1,
          doneGrant = next >= grant.sources.length;
        await ctx.db.patch(state._id, {
          phase: doneGrant && page.isDone ? "ready" : "shares",
          cursor: doneGrant
            ? page.isDone
              ? null
              : page.continueCursor
            : state.cursor,
          shareOffset: doneGrant ? 0 : next,
          updatedAt: Date.now(),
        });
      } else
        await ctx.db.patch(state._id, {
          phase: "ready",
          cursor: null,
          shareOffset: 0,
          updatedAt: Date.now(),
        });
    }
    await bumpWorkspaceSearch(ctx, args.organizationId);
    const final = (await workspaceSearchState(ctx, args.organizationId))!;
    return {
      done: final.phase === "ready",
      revision: final.revision,
      phase: final.phase,
      visited,
    };
  },
});

// Only the new-organization trigger schedules this. Existing workspaces retain
// their explicit bounded bootstrap requirement. Ready means initial population,
// not a guarantee that every asynchronous projection is current.
export const initializeNewWorkspace = internalMutation({
  args: { organizationId: v.id("organizations") },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!workspaceSearchEnabled() || process.env.RESTORE_LOCK === "true")
      return null;
    const organization = await ctx.db.get(args.organizationId);
    if (!organization || organization.status !== "active") return null;
    await bumpWorkspaceSearch(ctx, args.organizationId);
    const state = (await workspaceSearchState(ctx, args.organizationId))!;
    await ctx.db.patch(state._id, {
      phase: "ready",
      cursor: null,
      shareOffset: 0,
    });
    return null;
  },
});

export const refreshFamily = internalMutation({
  args: { familyId: v.id("catalogFamilies"), cursor: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!workspaceSearchEnabled() || process.env.RESTORE_LOCK === "true")
      return null;
    const page = await ctx.db
      .query("workspaceSearchOrigins")
      .withIndex("by_canonical", (q) =>
        q.eq("canonicalKey", `shared:${args.familyId}`),
      )
      .paginate({ cursor: args.cursor ?? null, numItems: 10 });
    for (const origin of page.page)
      if (!origin.grantId)
        await ctx.scheduler.runAfter(
          0,
          internal.workspaceSearch.refreshSource,
          { organizationId: origin.organizationId, sourceId: origin.sourceId },
        );
    if (!page.isDone)
      await ctx.scheduler.runAfter(0, internal.workspaceSearch.refreshFamily, {
        familyId: args.familyId,
        cursor: page.continueCursor,
      });
    return null;
  },
});
