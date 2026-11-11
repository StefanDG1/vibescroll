import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  type ActionCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { v, type Infer } from "convex/values";
import { z } from "zod";
import { containsSecret, ensure } from "../packages/policy";
import {
  workspaceSearchInput,
  workspaceSearchOutput,
  type WorkspaceSearchResult,
} from "../packages/contracts/workspace-search";
import { canonicalJson } from "../packages/contracts/canonical-json.mjs";
import {
  splitProjectTasks,
  namedSearchReference,
  recordRequirement,
} from "../packages/search/intent";
import {
  assistantSearchArgs,
  scopeValue,
  projectValue,
  vectorResultValue,
} from "./lib/workspaceSearchValues";
import { rankedCursorKey } from "./lib/workspaceSearchCursor";
import { workspaceSearchState } from "./lib/workspaceSearchProjection";
import { outputValue } from "./workspaceSearch";

const dimensions = 384;
const embedding = z.array(z.number().finite()).length(dimensions);
const endpoint =
  "https://scroll.companynerve.com/api/internal/search-embeddings";
const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");

async function embed(texts: string[], timeout: number) {
  const secret = process.env.WORKSPACE_SEARCH_EMBEDDING_SECRET;
  if (!secret || !/^[a-f0-9]{64}$/.test(secret) || !texts.length)
    return undefined;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      redirect: "error",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ texts }),
      signal: AbortSignal.timeout(timeout),
    });
    if (!response.ok) return undefined;
    const value = z
      .strictObject({ vectors: z.array(embedding).length(texts.length) })
      .safeParse(await response.json());
    return value.success ? value.data.vectors : undefined;
  } catch {
    return undefined;
  }
}

const cursor = z.strictObject({
  binding: z.string().regex(/^[0-9a-f]{64}$/),
  scope: z.number().int().min(0).max(2),
  page: z.string().max(16_000).nullable(),
  partial: z.boolean(),
});
type Cursor = z.infer<typeof cursor>;
const envelope = z.strictObject({
  payload: z.string().max(20_000),
  mac: z.string().regex(/^[a-f0-9]{64}$/),
});
const cursorPurpose = "vibescroll-search-review-v1\n";

async function signSearchCursor(data: Cursor) {
  const key = await rankedCursorKey();
  const payload = canonicalJson(cursor.parse(data));
  const mac = hex(
    new Uint8Array(
      await crypto.subtle.sign(
        "HMAC",
        key,
        new TextEncoder().encode(cursorPurpose + payload),
      ),
    ),
  );
  return JSON.stringify({ payload, mac });
}

async function readSearchCursor(token: string, binding: string) {
  let decoded;
  try {
    decoded = envelope.parse(JSON.parse(token));
  } catch {
    ensure(false, "INVALID_INPUT", "Invalid search continuation.");
  }
  const key = await rankedCursorKey();
  const mac = Uint8Array.from(decoded.mac.match(/../g)!, (value) =>
    Number.parseInt(value, 16),
  );
  ensure(
    await crypto.subtle.verify(
      "HMAC",
      key,
      mac,
      new TextEncoder().encode(cursorPurpose + decoded.payload),
    ),
    "INVALID_INPUT",
    "Invalid search continuation.",
  );
  const value = cursor.parse(JSON.parse(decoded.payload));
  ensure(
    value.binding === binding,
    "APPROVAL_STALE",
    "Search access, project, filters or index changed. Start again.",
  );
  return value;
}

type Scope = Infer<typeof scopeValue>;
type Project = Infer<typeof projectValue>;
type Input = Infer<ReturnType<typeof v.object<typeof assistantSearchArgs>>>;

type Library = { id: Id<"organizations">; state?: string; category?: string };
type SearchPage = {
  result: WorkspaceSearchResult;
  next: string | null;
  scores: { id: string; score: number }[];
};
type VectorResults = Infer<typeof vectorResultValue>[];

function mergeRanked(pages: SearchPage[]): WorkspaceSearchResult {
  if (pages.length === 1) return pages[0].result;
  const result = {
    ...pages[0].result,
    posts: [],
    matches: [],
  } as WorkspaceSearchResult;
  const ranked = pages
    .flatMap(({ result: page, scores }) =>
      page.posts.map((post, index) => ({
        post,
        page,
        score: scores[index]?.score ?? 0,
      })),
    )
    .sort((a, b) => b.score - a.score);
  const posts = new Map<string, WorkspaceSearchResult["posts"][number]>();
  for (const { post, page } of ranked) {
    const path = {
      profile_id: page.profile_id,
      grant_version: page.grant_version,
      fetch_id: post.fetch_id,
      url: post.url,
      reference: post.reference,
    };
    const current = posts.get(post.id);
    if (current) {
      current.access_paths!.push(path);
      continue;
    }
    if (posts.size >= 20 || result.matches.length >= 20) continue;
    posts.set(post.id, { ...post, access_paths: [path] });
    result.matches.push(
      ...page.matches
        .filter((match) => match.post_id === post.id)
        .slice(0, 20 - result.matches.length),
    );
  }
  result.posts = [...posts.values()];
  result.index_ready = pages.every(({ result }) => result.index_ready);
  result.semantic = pages.some(({ result }) => result.semantic);
  result.truncated = pages.some(({ result }) => result.truncated);
  result.scanned_candidates = pages.reduce(
    (total, { result }) => total + result.scanned_candidates,
    0,
  );
  result.session_candidates = result.scanned_candidates;
  result.loaded_bytes = pages.reduce(
    (total, { result }) => total + result.loaded_bytes,
    0,
  );
  result.status = result.posts.length
    ? "results"
    : result.index_ready
      ? "no-matches"
      : "index-pending";
  result.facets = [
    ...new Set(
      pages.flatMap(
        ({ result }) => result.facets?.map(({ query }) => query) ?? [],
      ),
    ),
  ]
    .slice(0, 3)
    .map(
      (query) =>
        pages
          .flatMap(({ result }) => result.facets ?? [])
          .find(
            (facet) =>
              facet.query === query &&
              result.matches.some(({ id }) => id === facet.match_id),
          ) ?? { query },
    );
  result.workspaces = pages.map(({ result }) => ({
    profile_id: result.profile_id,
    grant_version: result.grant_version,
    projection_revision: result.projection_revision,
    index_ready: result.index_ready,
    has_more: result.has_more,
  }));
  result.coverage =
    "Ranked matches from the requested authorized workspaces. Use review for complete traversal.";
  return result;
}

async function runSearch(
  ctx: ActionCtx,
  raw: Input,
  library?: Library,
): Promise<WorkspaceSearchResult> {
  const parsed = workspaceSearchInput.safeParse(raw);
  ensure(
    parsed.success,
    "INVALID_INPUT",
    "Use a valid search query, filter and continuation.",
  );
  const input: Input = { ...raw, query: parsed.data.query };
  ensure(
    !containsSecret(input.query),
    "INVALID_INPUT",
    "Search queries cannot include credentials.",
  );
  const { cursor: token, ...request } = input;
  ensure(
    !token || input.review || library,
    "INVALID_INPUT",
    "Use review with the returned continuation.",
  );
  const scopes: { scope: Scope; project?: Project }[] = await ctx.runQuery(
    internal.workspaceSearch.authorize,
    {
      ...request,
      ...(library ? { libraryId: library.id } : {}),
    },
  );
  ensure(
    !input.projectId ||
      scopes.some(({ project }) => project?.id === input.projectId),
    "FORBIDDEN",
    "Choose a project in the searched workspaces.",
  );
  const binding = hex(
    new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(
          canonicalJson({
            request: { ...request, review: true },
            library: library ?? null,
            scopes: scopes.map(
              ({ scope: { semantic: _semantic, ...scope }, project }) => ({
                scope,
                project: project ?? null,
              }),
            ),
          }),
        ),
      ),
    ),
  );
  const previous = token ? await readSearchCursor(token, binding) : undefined;
  const position = previous?.scope ?? 0;
  const review = !!input.review || !!previous;
  ensure(
    position < scopes.length,
    "INVALID_INPUT",
    "Invalid search workspace continuation.",
  );
  const targeted = review ? [scopes[position]] : scopes;
  const querySets = targeted.map(({ scope, project }) => {
    if (review || !scope.semantic || !scope.ready || input.filters?.creator)
      return [];
    const parts = recordRequirement(input.query, project)
      ? []
      : splitProjectTasks(input.query, project);
    return [input.query, ...parts].filter(
      (part) => !namedSearchReference(part),
    );
  });
  const queries = [...new Set(querySets.flat())].slice(0, 10);
  const vectors = await embed(queries, 6500);
  const pages = await Promise.all(
    targeted.map(
      async ({ scope, project }, scopeIndex): Promise<SearchPage> => {
        const resultVectors: VectorResults = [];
        if (vectors && scope.semantic) {
          const scopedQueries = querySets[scopeIndex].filter((query) =>
            queries.includes(query),
          );
          const results = await Promise.allSettled(
            scopedQueries.map(async (query) => {
              const hits = await ctx.vectorSearch(
                "workspaceSearchVectors",
                "semantic",
                {
                  vector: vectors[queries.indexOf(query)],
                  limit: 50,
                  filter: (q) =>
                    q.eq("searchableWorkspace", scope.organizationId),
                },
              );
              return {
                query,
                ids: hits
                  .filter(({ _score }) => _score >= 0.13)
                  .map(({ _id }) => _id),
              };
            }),
          );
          for (const candidate of results)
            if (candidate.status === "fulfilled")
              resultVectors.push(candidate.value);
        }
        return ctx.runQuery(internal.workspaceSearch.retrieve, {
          ...request,
          review,
          scope,
          ...(project ? { project } : {}),
          library: !!library,
          ...(library?.state ? { state: library.state } : {}),
          vectors: resultVectors,
          page: previous?.page ?? null,
        });
      },
    ),
  );
  const result = mergeRanked(pages);
  if (review) {
    result.profile_id = scopes[0].scope.organizationId;
    result.grant_version = scopes[0].scope.version;
    const following =
      pages[0].next !== null
        ? { scope: position, page: pages[0].next }
        : position + 1 < scopes.length
          ? { scope: position + 1, page: null }
          : null;
    const partial = !!previous?.partial || result.truncated;
    result.next_cursor = following
      ? await signSearchCursor({ binding, ...following, partial })
      : null;
    result.has_more = !!following;
    result.exhausted &&= !following && !partial;
    result.truncated = partial;
  } else if (library && result.index_ready) {
    result.next_cursor = await signSearchCursor({
      binding,
      scope: 0,
      page: null,
      partial: false,
    });
    result.has_more = true;
  }
  return workspaceSearchOutput.parse(result);
}

export const search = internalAction({
  args: assistantSearchArgs,
  returns: outputValue,
  handler: (ctx, args): Promise<WorkspaceSearchResult> => runSearch(ctx, args),
});

export const library = action({
  args: {
    organizationId: v.id("organizations"),
    query: v.string(),
    state: v.optional(v.string()),
    category: v.optional(v.string()),
    cursor: v.optional(v.string()),
  },
  returns: v.object({
    items: v.array(v.any()),
    next: v.union(v.string(), v.null()),
    total: v.null(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ items: unknown[]; next: string | null; total: null }> => {
    const result = await runSearch(
      ctx,
      {
        query: args.query,
        ...(args.category
          ? { filters: { categoryKeys: [args.category] } }
          : {}),
        ...(args.cursor ? { cursor: args.cursor } : {}),
      },
      { id: args.organizationId, ...(args.state ? { state: args.state } : {}) },
    );
    const items = await ctx.runQuery(internal.workspaceSearch.libraryItems, {
      organizationId: args.organizationId,
      posts: result.posts.map((post) => ({
        url: post.url,
        sourceId: post.reference.sourceId,
        revision: post.reference.revision,
        generation: post.reference.generation,
        ...(post.reference.sharedGrantId
          ? {
              share: post.reference.sharedGrantId,
              shareVersion: post.reference.sharedGrantVersion,
            }
          : {}),
        ...(post.reference.analysisVersionId
          ? { version: post.reference.analysisVersionId }
          : {}),
        matches: result.matches
          .filter((match) => match.post_id === post.id)
          .map((match) => ({ title: match.title, excerpt: match.excerpt })),
      })),
    });
    return { items, next: result.next_cursor, total: null };
  },
});

const item = v.object({
  id: v.id("workspaceSearchVectors"),
  documentRevision: v.number(),
  text: v.string(),
});
export const pending = internalQuery({
  args: { organizationId: v.id("organizations") },
  returns: v.array(item),
  handler: async (ctx, { organizationId }) => {
    if (
      process.env.RESTORE_LOCK === "true" ||
      (await ctx.db.get(organizationId))?.status !== "active"
    )
      return [];
    const rows = await ctx.db
      .query("workspaceSearchVectors")
      .withIndex("by_pending", (q) =>
        q.eq("organizationId", organizationId).eq("pending", true),
      )
      .take(16);
    const documents = await Promise.all(
      rows.map(async (row) => {
        const document = await ctx.db.get(row.documentId);
        return document && document.updatedAt === row.documentRevision
          ? {
              id: row._id,
              documentRevision: row.documentRevision,
              text: document.searchText.slice(0, 2400),
            }
          : null;
      }),
    );
    return documents.filter((row) => row !== null);
  },
});

export const migrateWorkspace = internalAction({
  args: {
    organizationId: v.id("organizations"),
    expectedRevision: v.optional(v.number()),
  },
  returns: v.object({
    done: v.boolean(),
    revision: v.number(),
    visited: v.number(),
  }),
  handler: async (
    ctx,
    { organizationId, expectedRevision },
  ): Promise<{ done: boolean; revision: number; visited: number }> => {
    let done = false,
      visited = 0;
    let revision = expectedRevision;
    for (let index = 0; index < 16 && !done; index++) {
      const page: { done: boolean; revision: number; visited: number } =
        await ctx.runMutation(internal.workspaceSearch.bootstrap, {
          organizationId,
          rebuild: true,
          ...(revision === undefined ? {} : { expectedRevision: revision }),
        });
      done = page.done;
      visited += page.visited;
      revision = page.revision;
    }
    return { done, visited, revision: revision ?? 0 };
  },
});

export const index = internalAction({
  args: { organizationId: v.id("organizations"), failures: v.number() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const rows: Infer<typeof item>[] = await ctx.runQuery(
      internal.workspaceSearchActions.pending,
      { organizationId: args.organizationId },
    );
    const vectors = rows.length
      ? await embed(
          rows.map(({ text }) => text),
          28_000,
        )
      : undefined;
    await ctx.runMutation(internal.workspaceSearchActions.finishIndexBatch, {
      organizationId: args.organizationId,
      failures: !rows.length ? args.failures : vectors ? 0 : args.failures + 1,
      batch: rows.flatMap(({ id, documentRevision }, index) =>
        vectors ? [{ id, documentRevision, embedding: vectors[index] }] : [],
      ),
    });
    return null;
  },
});

export const finishIndexBatch = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    failures: v.number(),
    batch: v.array(
      v.object({
        id: v.id("workspaceSearchVectors"),
        documentRevision: v.number(),
        embedding: v.array(v.float64()),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, { organizationId, batch, failures }) => {
    const state = await workspaceSearchState(ctx, organizationId);
    if (!state) return null;
    if (process.env.RESTORE_LOCK === "true") {
      await ctx.db.patch(state._id, { vectorJob: undefined });
      return null;
    }
    for (const entry of batch) {
      const row = await ctx.db.get(entry.id);
      if (
        row?.organizationId === organizationId &&
        row.pending &&
        row.documentRevision === entry.documentRevision &&
        embedding.safeParse(entry.embedding).success
      )
        await ctx.db.patch(row._id, {
          embedding: entry.embedding,
          searchableWorkspace: organizationId,
          pending: false,
        });
    }
    const pending = await ctx.db
      .query("workspaceSearchVectors")
      .withIndex("by_pending", (q) =>
        q.eq("organizationId", organizationId).eq("pending", true),
      )
      .first();
    if (
      !pending ||
      failures >= 4 ||
      !process.env.WORKSPACE_SEARCH_EMBEDDING_SECRET
    ) {
      await ctx.db.patch(state._id, { vectorJob: undefined });
      return null;
    }
    const vectorJob = await ctx.scheduler.runAfter(
      failures ? 60_000 * 3 ** failures : 1000,
      internal.workspaceSearchActions.index,
      { organizationId, failures },
    );
    await ctx.db.patch(state._id, { vectorJob });
    return null;
  },
});
