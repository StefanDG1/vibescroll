import { internalQuery, internalMutation } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { v, type Infer } from "convex/values";
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
  scheduleSearchVectors,
  workspaceSearchEnabled,
  workspaceSearchState,
} from "./lib/workspaceSearchProjection";

import { access } from "./lib";
import {
  assistantProject,
  currentPlanningProject,
} from "./lib/assistantProject";
import { sourceRetained } from "./lib/sourceAuthority";
import { sharedTypedCitations } from "./lib/sourceCitations";
import { cloudSourceMetadata } from "./lib/cloudCatalog";
import { canonicalJson } from "../packages/contracts/canonical-json.mjs";
import {
  assistantSearchArgs,
  projectValue,
  scopeValue,
  vectorResultValue,
} from "./lib/workspaceSearchValues";
import {
  namedSearchReference,
  recordRequirement,
  splitProjectTasks,
} from "../packages/search/intent";
import {
  combineSearchTasks,
  containsPhrase,
  normalizeSearchText,
  rankSearchUnits,
  rankedLexicalQuery,
  searchTerms,
  type SearchUnit,
} from "../packages/search/ranking";
import {
  fitMatch,
  metadataMatchesFilters,
  type SearchFilters,
} from "./lib/workspaceSearchFilters";
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
export const outputValue = v.object({
  mode: v.literal("hybrid"),
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
      evidence_ids: v.optional(v.array(v.string())),
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
  semantic: v.boolean(),
  status: v.union(
    v.literal("results"),
    v.literal("no-matches"),
    v.literal("exact-name-missing"),
    v.literal("needs-project-record"),
    v.literal("needs-current-data"),
    v.literal("index-pending"),
  ),
  facets: v.optional(
    v.array(
      v.object({
        query: v.string(),
        post_id: v.optional(v.string()),
        match_id: v.optional(v.string()),
      }),
    ),
  ),
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
        if (reader.grant && reader.grant.libraryScope !== "all") continue;
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
        if (reader.grant) {
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
        } else {
          if (
            !source ||
            source.organizationId !== reader.organization._id ||
            source.state === "deleted" ||
            !source.rightsAttested ||
            !sourceRetained(source.sourceRetentionUntil)
          )
            continue;
          await sharedTypedCitations(ctx, source);
        }
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

export const authorize = internalQuery({
  args: {
    ...assistantSearchArgs,
    libraryId: v.optional(v.id("organizations")),
  },
  returns: v.array(
    v.object({ scope: scopeValue, project: v.optional(projectValue) }),
  ),
  handler: async (rawCtx, args) => {
    const ctx = knowledgeReadContext(rawCtx);
    const ids = args.libraryId
      ? [args.libraryId]
      : (args.workspaceIds ?? [
          await selectedProfile(ctx, args.profileId, "knowledge:read"),
        ]);
    const readers = await Promise.all(
      ids.map((id) => searchReader(ctx, id, !!args.libraryId)),
    );
    return Promise.all(
      readers.map(async (reader) => ({
        scope: await currentScope(ctx, reader),
        project: await searchProject(ctx, reader, args.query, args.projectId),
      })),
    );
  },
});

type WebsiteReader = Awaited<ReturnType<typeof access>> & { grant?: undefined };
type Reader = Awaited<ReturnType<typeof assistantGrant>> | WebsiteReader;

async function searchReader(
  ctx: QueryCtx,
  id: Id<"organizations">,
  website: boolean,
): Promise<Reader> {
  return website ? access(ctx, id) : assistantGrant(ctx, id, "knowledge:read");
}

async function currentScope(ctx: QueryCtx, reader: Reader) {
  const state = await workspaceSearchState(ctx, reader.organization._id);
  const semantic =
    !!process.env.WORKSPACE_SEARCH_EMBEDDING_SECRET &&
    (!reader.grant || reader.grant.libraryScope === "all") &&
    !!(await ctx.db
      .query("workspaceSearchVectors")
      .withIndex("by_pending", (q) =>
        q.eq("organizationId", reader.organization._id).eq("pending", false),
      )
      .first());
  return {
    organizationId: reader.organization._id,
    actorId: reader.actor._id,
    key:
      reader.grant?._id ?? `${reader.membership._id}:${reader.membership.role}`,
    version: reader.grant?.version ?? 1,
    revision: state?.revision ?? 0,
    ready: state?.phase === "ready",
    narrow: !!reader.grant && reader.grant.libraryScope !== "all",
    semantic,
  };
}

async function searchProject(
  ctx: QueryCtx,
  reader: Reader,
  query: string,
  projectId?: Id<"repositories">,
) {
  const org = reader.organization._id;
  const contextReader = reader.grant
    ? reader.grant.scopes.includes("context:read")
      ? await assistantGrant(ctx, org, "context:read").catch(
          (error: unknown) => {
            if (
              projectId ||
              !(error instanceof PolicyError) ||
              error.code !== "FORBIDDEN"
            )
              throw error;
            return undefined;
          },
        )
      : undefined
    : undefined;
  if (!projectId && reader.grant && !contextReader) return undefined;
  const resolve = async (id: Id<"repositories">) => {
    if (reader.grant) {
      ensure(
        contextReader,
        "FORBIDDEN",
        "This workspace cannot read the requested project.",
      );
      return assistantProject(ctx, contextReader, id);
    }
    return currentPlanningProject(ctx, org, id);
  };
  let repository:
    Awaited<ReturnType<typeof currentPlanningProject>> | undefined;
  if (projectId) {
    const project = await ctx.db.get(projectId);
    ensure(project, "FORBIDDEN", "Project unavailable.");
    if (project.organizationId !== org) return undefined;
    repository = await resolve(projectId);
  } else if (query.length > 3) {
    const names = await ctx.db
      .query("repositories")
      .withIndex("by_org", (q) => q.eq("organizationId", org))
      .take(51);
    if (names.length > 50) return undefined;
    const matching = names.filter((item) => {
      const name = item.fullName.split("/").at(-1)!;
      return (
        item.confirmed &&
        item.enabled &&
        name.length > 2 &&
        containsPhrase(query, name.replaceAll("-", " "))
      );
    });
    if (matching.length === 1) {
      try {
        repository = await resolve(matching[0]._id);
      } catch (error) {
        if (!expectedUnavailable(error)) throw error;
      }
    }
  }
  if (!repository) return undefined;
  const shortName = repository.fullName.split("/").at(-1)!;
  return {
    id: repository._id,
    profileId: org,
    name: (containsPhrase(query, shortName.replaceAll("-", " "))
      ? shortName.replaceAll("-", " ")
      : shortName
    ).slice(0, 200),
    profile: repository.profile,
    baseSha: repository.sha,
    profileVersion: repository.profileVersion,
    selectionVersion: repository.selectionVersion ?? 0,
    grantVersion: contextReader?.grant.version ?? 1,
  };
}

type SearchDocument = Doc<"workspaceSearchDocuments">;
type Unit = SearchUnit & { document: SearchDocument };
type Scope = Infer<typeof scopeValue>;

const unit = (doc: SearchDocument): Unit => ({
  id: `${doc.canonicalKey}:${doc.analysisKey}:${doc.itemKey}`,
  post: `${doc.canonicalKey}:${doc.analysisKey}`,
  title: doc.title,
  text: doc.excerpt || doc.searchText,
  topics: doc.categoryKeys ?? [],
  document: doc,
});

const emptySearch = (scope: Scope): WorkspaceSearchResult => ({
  mode: "hybrid",
  posts: [],
  matches: [],
  next_cursor: null,
  has_more: false,
  exhausted: false,
  truncated: !scope.ready,
  coverage: "",
  profile_id: scope.organizationId,
  grant_version: scope.version,
  scanned_candidates: 0,
  examined_sources: 0,
  loaded_bytes: 0,
  session_candidates: 0,
  projection_revision: scope.revision,
  index_ready: scope.ready,
  status: scope.ready ? "no-matches" : "index-pending",
  semantic: false,
});

async function originDocuments(
  ctx: QueryCtx,
  origin: Doc<"workspaceSearchOrigins"> | null,
) {
  if (!origin) return [];
  return ctx.db
    .query("workspaceSearchDocuments")
    .withIndex("by_post", (q) =>
      q
        .eq("organizationId", origin.organizationId)
        .eq("canonicalKey", origin.canonicalKey)
        .eq("analysisKey", origin.analysisKey),
    )
    .take(161);
}

const directOrigin = (
  ctx: QueryCtx,
  id: Id<"organizations">,
  source: Id<"sources">,
) =>
  ctx.db
    .query("workspaceSearchOrigins")
    .withIndex("by_path", (q) =>
      q.eq("organizationId", id).eq("pathKey", `direct:${source}`),
    )
    .unique();

async function selectedOrigin(
  ctx: QueryCtx,
  reader: Reader,
  sourceId: Id<"sources">,
) {
  if (!reader.grant)
    return directOrigin(ctx, reader.organization._id, sourceId);
  const source = await ctx.db.get(sourceId);
  if (
    !(await sourceWithinAssistantScope(
      ctx,
      reader.grant,
      reader.organization,
      reader.actor._id,
      source,
    ))
  )
    return null;
  return directOrigin(ctx, reader.organization._id, sourceId);
}

function acceptsDocument(
  doc: SearchDocument,
  target: "posts" | "insights" | "both",
  filters?: SearchFilters,
) {
  const creator =
    filters?.creator && normalizeSearchText(filters.creator).replace(/^@/, "");
  return (
    (target === "both" ||
      doc.kind === (target === "posts" ? "post" : "insight")) &&
    (!creator || doc.creatorKey === creator) &&
    metadataMatchesFilters(doc, filters)
  );
}

function acceptsState(state: string | undefined, source: Doc<"sources">) {
  if (!state) return true;
  if (state === "not_analyzed") return source.state !== "ready";
  if (state === "in_progress")
    return source.state === "queued" || source.state === "processing";
  return source.state === state;
}

const scopePage = v.object({
  result: outputValue,
  next: v.union(v.string(), v.null()),
  scores: v.array(v.object({ id: v.string(), score: v.number() })),
});

export const retrieve = internalQuery({
  args: {
    ...assistantSearchArgs,
    scope: scopeValue,
    project: v.optional(projectValue),
    library: v.boolean(),
    state: v.optional(v.string()),
    vectors: v.array(vectorResultValue),
    page: v.union(v.string(), v.null()),
  },
  returns: scopePage,
  handler: async (rawCtx, args) => {
    const ctx = knowledgeReadContext(rawCtx);
    const org = args.scope.organizationId;
    const reader = await searchReader(ctx, org, args.library);
    const scope = await currentScope(ctx, reader);
    const { key, actorId, version, revision } = args.scope;
    ensure(
      key === scope.key &&
        actorId === scope.actorId &&
        version === scope.version &&
        revision === scope.revision,
      "APPROVAL_STALE",
      "Search access or index changed. Start a new search.",
    );
    const project = await searchProject(
      ctx,
      reader,
      args.query,
      args.projectId,
    );
    ensure(
      canonicalJson(project) === canonicalJson(args.project),
      "APPROVAL_STALE",
      "Search project changed. Start a new search.",
    );
    const result = emptySearch(scope);
    const scores: { id: string; score: number }[] = [];
    if (!scope.ready) {
      result.coverage =
        "This workspace is still indexing. Exact post links can be opened directly.";
      return { result, next: null, scores };
    }
    const query = args.query;
    const filters = args.filters as SearchFilters | undefined;
    const creator =
      filters?.creator &&
      normalizeSearchText(filters.creator).replace(/^@/, "");
    const target = args.target ?? "both";
    const eligible = (doc: SearchDocument) =>
      doc.organizationId === org && acceptsDocument(doc, target, filters);
    const reference = namedSearchReference(query);
    const required = recordRequirement(query, project);
    const facets =
      args.review || required ? [] : splitProjectTasks(query, project);
    const budget = {
      remaining: args.review ? 24 : limits.sourceHydrations,
      examined: 0,
      bytes: 0,
    };
    const measuredCtx = {
      ...ctx,
      db: new Proxy(ctx.db, {
        get(target, property) {
          if (property === "get")
            return async (...parameters: unknown[]) => {
              ensure(
                budget.bytes < limits.loadedBytes,
                "RETRIEVAL_BUDGET_REACHED",
                "Narrow the query to read more evidence.",
              );
              const value = await Reflect.apply(target.get, target, parameters);
              budget.bytes += new TextEncoder().encode(
                JSON.stringify(value),
              ).length;
              return value;
            };
          const value = Reflect.get(target, property, target);
          return typeof value === "function" ? value.bind(target) : value;
        },
      }),
    };
    let next: string | null = null;
    let narrowDocs: SearchDocument[] | undefined;
    let reviewOrigins:
      NonNullable<Awaited<ReturnType<typeof directOrigin>>>[] | undefined;
    const space =
      reader.grant?.libraryScope === "personal" ||
      reader.grant?.libraryScope === "business"
        ? reader.grant.libraryScope
        : undefined;
    if (space)
      ensure(
        reader.organization.privateOwnerId === reader.actor._id,
        "FORBIDDEN",
        "This private space is unavailable.",
      );
    if (reader.grant && !reader.grant.libraryScope) {
      const ids = [
        ...new Set(reader.grant.sources.map(({ sourceId }) => sourceId)),
      ];
      const offset = args.review && args.page ? Number(args.page) : 0;
      const current = args.review ? ids.slice(offset, offset + 8) : ids;
      reviewOrigins = (
        await Promise.all(current.map((id) => selectedOrigin(ctx, reader, id)))
      ).filter((item) => item !== null);
      for (const origin of reviewOrigins) {
        const docs = (await originDocuments(ctx, origin)).filter(eligible);
        narrowDocs ??= [];
        narrowDocs.push(...docs);
      }
      narrowDocs ??= [];
      next = args.review && offset + 8 < ids.length ? String(offset + 8) : null;
    } else if (space && args.review) {
      const page = await ctx.db
        .query("sourceSpaces")
        .withIndex("by_space", (q) =>
          q.eq("organizationId", org).eq("space", space),
        )
        .paginate({ cursor: args.page, numItems: 8 });
      reviewOrigins = (
        await Promise.all(
          page.page.map(({ sourceId }) =>
            selectedOrigin(ctx, reader, sourceId),
          ),
        )
      ).filter((item) => item !== null);
      narrowDocs = (
        await Promise.all(
          reviewOrigins.map((origin) => originDocuments(ctx, origin)),
        )
      )
        .flat()
        .filter(eligible);
      next = page.isDone ? null : page.continueCursor;
    } else if (args.review && creator) {
      const page = await ctx.db
        .query("workspaceSearchDocuments")
        .withIndex("by_creator", (q) =>
          q
            .eq("organizationId", org)
            .eq("creatorKey", creator)
            .eq("itemKey", "post"),
        )
        .paginate({ cursor: args.page, numItems: 8 });
      narrowDocs = (
        await Promise.all(
          page.page.map((doc) =>
            ctx.db
              .query("workspaceSearchDocuments")
              .withIndex("by_post", (q) =>
                q
                  .eq("organizationId", org)
                  .eq("canonicalKey", doc.canonicalKey)
                  .eq("analysisKey", doc.analysisKey),
              )
              .take(161),
          ),
        )
      )
        .flat()
        .filter(eligible);
      next = page.isDone ? null : page.continueCursor;
    } else if (args.review) {
      const page = await ctx.db
        .query("workspaceSearchOrigins")
        .withIndex("by_path", (q) => q.eq("organizationId", org))
        .paginate({ cursor: args.page, numItems: 8 });
      reviewOrigins = page.page;
      next = page.isDone ? null : page.continueCursor;
      narrowDocs = (
        await Promise.all(
          reviewOrigins.map((origin) => originDocuments(ctx, origin)),
        )
      )
        .flat()
        .filter(eligible);
    }
    const lexicalSearch = async (text: string) => {
      if (narrowDocs) {
        const words = searchTerms(text);
        return narrowDocs
          .map((doc) => ({
            doc,
            overlap: words.filter((word) =>
              searchTerms(doc.searchText).includes(word),
            ).length,
          }))
          .filter(({ overlap, doc }) =>
            args.review
              ? words.length
                ? overlap === words.length
                : !text || containsPhrase(doc.searchText, text)
              : overlap || !words.length,
          )
          .sort((a, b) => b.overlap - a.overlap)
          .slice(0, args.review ? undefined : 50)
          .map(({ doc }) => doc);
      }
      const term = rankedLexicalQuery(text);
      if (!term) return [];
      return (
        await ctx.db
          .query("workspaceSearchDocuments")
          .withSearchIndex("search_text", (q) => {
            let search = q.search("searchText", term).eq("organizationId", org);
            if (target !== "both")
              search = search.eq(
                "kind",
                target === "posts" ? "post" : "insight",
              );
            if (creator) search = search.eq("creatorKey", creator);
            if (space) search = search.eq(space, true);
            return search;
          })
          .take(50)
      ).filter(eligible);
    };
    const lexicalReads = new Map<string, ReturnType<typeof lexicalSearch>>();
    const lexical = (text: string) => {
      let read = lexicalReads.get(text);
      if (!read) {
        read = lexicalSearch(text);
        lexicalReads.set(text, read);
      }
      return read;
    };
    const vector = async (text: string) => {
      const ids = args.vectors.find((entry) => entry.query === text)?.ids ?? [];
      if (!ids.length || narrowDocs) return [];
      const values = await Promise.all(
        ids.slice(0, 50).map(async (id) => {
          const row = await ctx.db.get(id);
          if (!row || row.organizationId !== org) return null;
          const doc = await ctx.db.get(row.documentId);
          return doc && doc.updatedAt === row.documentRevision && eligible(doc)
            ? doc
            : null;
        }),
      );
      return values.filter((value) => value !== null);
    };
    const ranked = async (text: string) => {
      const [words, meaning] = await Promise.all([lexical(text), vector(text)]);
      result.semantic ||= args.vectors.some((value) => value.query === text);
      result.scanned_candidates += words.length + meaning.length;
      return rankSearchUnits(
        text,
        [words.map(unit), meaning.map(unit)],
        project,
      );
    };
    const exactText = reference ?? query;
    const sourceId = ctx.db.normalizeId("sources", exactText);
    const direct = sourceId
      ? await originDocuments(ctx, await selectedOrigin(ctx, reader, sourceId))
      : [];
    const exactIndex =
      !args.review && !narrowDocs && !space && exactText
        ? await ctx.db
            .query("workspaceSearchDocuments")
            .withIndex(
              /^https?:\/\//i.test(exactText) ? "by_url" : "by_title",
              (q) =>
                /^https?:\/\//i.test(exactText)
                  ? q.eq("organizationId", org).eq("canonicalUrl", exactText)
                  : q
                      .eq("organizationId", org)
                      .eq("normalizedTitle", normalizeSearchText(exactText)),
            )
            .take(12)
        : [];
    const anchors = !args.review
      ? rankSearchUnits(exactText, [
          [
            ...direct,
            ...exactIndex,
            ...(reference ? await lexical(reference) : []),
          ]
            .filter(
              (doc) =>
                eligible(doc) &&
                (direct.some((item) => item._id === doc._id) ||
                  exactIndex.some((item) => item._id === doc._id) ||
                  containsPhrase(doc.title, exactText) ||
                  containsPhrase(doc.excerpt, exactText)),
            )
            .map(unit),
        ])
      : [];
    const anchoredIds = new Set(anchors.map(({ id }) => id));
    const [base, ...parts] = await Promise.all([
      ranked(args.review && reference ? reference : query),
      ...facets.map((part) =>
        reference && containsPhrase(part, reference) ? anchors : ranked(part),
      ),
    ]);
    const taskResults = facets.map((query, index) => ({
      query,
      results: parts[index],
    }));
    const combined = combineSearchTasks(
      [...anchors, ...base.filter(({ id }) => !anchoredIds.has(id))],
      taskResults,
    );
    let matchedExact = false;
    for (const hit of combined.hits) {
      if (budget.remaining <= 0 || result.matches.length >= limits.results) {
        result.truncated = true;
        break;
      }
      const first = hit.units[0].document;
      const { value, limited } = await hydrateOrigin(
        measuredCtx,
        reader,
        first,
        budget,
        filters,
      );
      if (!value) continue;
      result.truncated ||=
        limited || hit.units.some(({ document }) => document.truncated);
      const { source, origin } = value;
      if (!acceptsState(args.state, source)) continue;
      if (
        args.review &&
        reviewOrigins &&
        !reviewOrigins.some((item) => item._id === origin._id)
      )
        continue;
      const publicId = hit.id;
      matchedExact ||= anchoredIds.has(publicId);
      const post = {
        id: publicId,
        fetch_id: `${source._id}${origin.analysisVersionId ? `@${origin.analysisVersionId}` : ""}`,
        title: source.title.slice(0, 200),
        url: origin.grantId
          ? `https://scroll.companynerve.com/app/${org}/shared?grant=${origin.grantId}&source=${source._id}`
          : `https://scroll.companynerve.com/app/${org}/posts/${source._id}`,
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
      };
      const matches: WorkspaceSearchResult["matches"] = hit.units
        .slice(0, args.review ? 2 : 3)
        .map(({ document, id }) => ({
          id,
          post_id: publicId,
          kind: document.kind,
          title: document.title,
          excerpt: document.excerpt,
          ...(document.insightId ? { insight_id: document.insightId } : {}),
          ...(document.evidenceIds?.length
            ? { evidence_ids: document.evidenceIds }
            : {}),
          ...(project
            ? { project_fit: fitMatch(project, document.categoryKeys ?? []) }
            : {}),
        }))
        .slice(0, limits.results - result.matches.length);
      if (
        new TextEncoder().encode(
          JSON.stringify([...result.matches, ...matches]),
        ).length > 44_000
      ) {
        result.truncated = true;
        break;
      }
      scores.push({ id: publicId, score: 1 / (1 + scores.length) });
      result.posts.push(post);
      result.matches.push(...matches);
    }
    result.facets = combined.support.map((facet) =>
      result.matches.some(({ id }) => id === facet.match_id)
        ? facet
        : { query: facet.query },
    );
    result.examined_sources = budget.examined;
    result.loaded_bytes = budget.bytes;
    result.session_candidates = result.scanned_candidates;
    result.has_more = next !== null;
    result.exhausted = !!args.review && !next && !result.truncated;
    result.status =
      required ??
      (reference && !matchedExact && !args.review
        ? "exact-name-missing"
        : result.posts.length
          ? "results"
          : "no-matches");
    result.coverage = args.review
      ? "Complete review visits the authorized saved index in bounded pages. Follow next_cursor until exhausted."
      : scope.narrow
        ? "Search is scoped to the current grant. A private space can be reviewed in bounded pages."
        : result.semantic
          ? "Ranked search combines saved text and multilingual embeddings across the authorized workspace. Use review for complete traversal."
          : "Ranked search uses saved text. Semantic indexing or inference is unavailable for this request. Use review for complete traversal.";
    if (result.status === "needs-project-record")
      result.coverage += " Saved examples cannot establish this project fact.";
    if (result.status === "needs-current-data")
      result.coverage +=
        " Saved examples cannot establish current external trends.";
    if (result.status === "exact-name-missing")
      result.coverage +=
        " No exact named reference appeared in the searched candidates.";
    if (filters?.addedAfter !== undefined || filters?.addedBefore !== undefined)
      result.coverage +=
        " Date filters omit team shares whose workspace-added dates are unknown.";
    result.coverage += " Recent saves and shares may still be indexing.";
    if (project)
      result.project = {
        id: project.id,
        profile_id: project.profileId,
        name: project.name,
        base_sha: project.baseSha,
        profile_version: project.profileVersion,
        selection_version: project.selectionVersion,
        context_grant_version: project.grantVersion,
      };
    return { result: workspaceSearchOutput.parse(result), next, scores };
  },
});

export const libraryItems = internalQuery({
  args: {
    organizationId: v.id("organizations"),
    posts: v.array(
      v.object({
        sourceId: v.string(),
        url: v.string(),
        revision: v.number(),
        generation: v.number(),
        share: v.optional(v.string()),
        shareVersion: v.optional(v.number()),
        version: v.optional(v.string()),
        matches: v.array(v.object({ title: v.string(), excerpt: v.string() })),
      }),
    ),
  },
  returns: v.array(v.any()),
  handler: async (rawCtx, { organizationId, posts }) => {
    const ctx = knowledgeReadContext(rawCtx);
    await access(ctx, organizationId);
    const items = [];
    for (const post of posts.slice(0, 20)) {
      const id = ctx.db.normalizeId("sources", post.sourceId);
      if (!id) continue;
      let source: Doc<"sources"> | null;
      if (post.share) {
        const share = ctx.db.normalizeId("teamKnowledgeGrants", post.share);
        if (!share) continue;
        try {
          const shared = await exactGrantedSource(
            ctx,
            organizationId,
            share,
            id,
            post.shareVersion,
          );
          if (shared.reference.analysisVersionId !== post.version) continue;
          source = shared.source;
        } catch (error) {
          if (!expectedUnavailable(error)) throw error;
          continue;
        }
      } else {
        source = await ctx.db.get(id);
        if (source?.organizationId !== organizationId) continue;
      }
      if (
        !source ||
        source.state === "deleted" ||
        !source.rightsAttested ||
        !sourceRetained(source.sourceRetentionUntil) ||
        source.generation !== post.generation ||
        source.updatedAt !== post.revision
      )
        continue;
      const selected =
        post.share && post.version
          ? undefined
          : await selectedAnalysis(ctx, source);
      if (!post.share && selected?.metadata.id !== post.version) continue;
      const first = post.matches[0];
      if (post.share) {
        items.push({
          _id: source._id,
          organizationId,
          title: source.title,
          state: source.state,
          kind: source.kind,
          createdAt: source.createdAt,
          updatedAt: source.updatedAt,
          summary: first?.excerpt ?? "",
          insightCount: post.matches.length,
          mainPoints: post.matches.map(({ title }) => title),
          tags: [],
          searchHref: post.url,
          coverage: source.coverage,
        });
        continue;
      }
      const {
        text: _text,
        analysis,
        objectKey: _objectKey,
        searchable: _searchable,
        selectedAnalysisSummary,
        selectedAnalysisInsightCount,
        selectedAnalysisMainPoints,
        ...card
      } = source;
      const shared = await cloudSourceMetadata(ctx, source);
      items.push({
        ...card,
        ...(shared ? { sharedAvailable: shared.available } : {}),
        summary:
          first?.excerpt ||
          (shared
            ? shared.summary
            : (selectedAnalysisSummary ?? source.summary)),
        insightCount:
          (shared ? shared.insightCount : selectedAnalysisInsightCount) ??
          analysis?.insights?.length ??
          0,
        mainPoints:
          (shared ? shared.mainPoints : selectedAnalysisMainPoints) ??
          analysis?.insights
            ?.slice(0, 3)
            .map((i: { title: string }) => i.title) ??
          [],
      });
    }
    return items;
  },
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
    rebuild: v.optional(v.boolean()),
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
    if (state.phase === "ready" && args.rebuild && state.indexVersion !== 2) {
      await ctx.db.patch(state._id, {
        phase: "sources",
        cursor: null,
        shareOffset: 0,
      });
      state = { ...state, phase: "sources", cursor: null, shareOffset: 0 };
    }
    let visited = 0;
    if (state.phase === "sources") {
      const page = await ctx.db
        .query("sources")
        .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
        .paginate({ cursor: state.cursor, numItems: 1 });
      for (const source of page.page) {
        await refreshDirectSearchSource(ctx, args.organizationId, source._id);
        if (source.searchable !== undefined)
          await ctx.db.patch(source._id, { searchable: undefined });
        const links = await ctx.db
          .query("sourceCategories")
          .withIndex("by_source", (q) => q.eq("sourceId", source._id))
          .take(64);
        for (const link of links)
          if (link.searchable !== undefined)
            await ctx.db.patch(link._id, { searchable: undefined });
        visited++;
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
          ...(doneGrant && page.isDone ? { indexVersion: 2 as const } : {}),
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
          indexVersion: 2,
          cursor: null,
          shareOffset: 0,
          updatedAt: Date.now(),
        });
    }
    await bumpWorkspaceSearch(ctx, args.organizationId);
    await scheduleSearchVectors(ctx, args.organizationId);
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
      indexVersion: 2,
      cursor: null,
      shareOffset: 0,
    });
    return null;
  },
});

export const migrationWorkspaces = internalQuery({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.object({
    workspaces: v.array(
      v.object({
        id: v.id("organizations"),
        ready: v.boolean(),
        semantic: v.boolean(),
      }),
    ),
    next: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db
      .query("organizations")
      .paginate({ cursor, numItems: 20 });
    const workspaces = await Promise.all(
      page.page
        .filter(({ status }) => status === "active")
        .map(async ({ _id }) => {
          const state = await workspaceSearchState(ctx, _id);
          const pending = await ctx.db
            .query("workspaceSearchVectors")
            .withIndex("by_pending", (q) =>
              q.eq("organizationId", _id).eq("pending", true),
            )
            .first();
          return {
            id: _id,
            ready: state?.phase === "ready" && state.indexVersion === 2,
            semantic: !pending,
          };
        }),
    );
    return { workspaces, next: page.isDone ? null : page.continueCursor };
  },
});

export const resumeVectors = internalMutation({
  args: { organizationId: v.id("organizations") },
  returns: v.null(),
  handler: async (ctx, { organizationId }) => {
    await scheduleSearchVectors(ctx, organizationId);
    return null;
  },
});

export const retireObsoleteFields = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    cursor: v.union(v.string(), v.null()),
  },
  returns: v.object({
    next: v.union(v.string(), v.null()),
    cleared: v.number(),
  }),
  handler: async (ctx, { organizationId, cursor }) => {
    ensure(
      process.env.RESTORE_LOCK !== "true",
      "POLICY_BLOCKED",
      "Search migration is paused.",
    );
    const state = await workspaceSearchState(ctx, organizationId);
    ensure(
      state?.phase === "ready" && state.indexVersion === 2,
      "APPROVAL_STALE",
      "Complete the search projection first.",
    );
    const page = await ctx.db
      .query("sources")
      .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
      .paginate({ cursor, numItems: 8 });
    let cleared = 0;
    for (const source of page.page) {
      if (source.searchable !== undefined) {
        await ctx.db.patch(source._id, { searchable: undefined });
        cleared++;
      }
      const links = await ctx.db
        .query("sourceCategories")
        .withIndex("by_source", (q) => q.eq("sourceId", source._id))
        .take(64);
      for (const link of links)
        if (link.searchable !== undefined) {
          await ctx.db.patch(link._id, { searchable: undefined });
          cleared++;
        }
    }
    return { next: page.isDone ? null : page.continueCursor, cleared };
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
