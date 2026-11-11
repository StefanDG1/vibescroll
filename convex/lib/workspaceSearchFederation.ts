import { z } from "zod";
import type { QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { assistantGrant } from "./assistantPrincipal";
import { assistantProject } from "./assistantProject";
import { selectedProfile } from "../assistant";
import { knowledgeReadContext } from "./knowledgeReadContext";
import { ensure } from "../../packages/policy";
import { canonicalJson } from "../../packages/contracts/canonical-json.mjs";
import {
  workspaceSearchInput,
  workspaceSearchOutput,
  workspaceSearchLimits as limits,
  type WorkspaceSearchResult,
} from "../../packages/contracts/workspace-search";
import {
  normalizeSearchFilters,
  type SearchFilters,
  type SearchProject,
} from "./workspaceSearchFilters";
import { rankedCursorKey } from "./workspaceSearchCursor";
import { workspaceSearchState } from "./workspaceSearchProjection";

export type CoreSearchArgs = {
  profileId?: Id<"organizations">;
  query: string;
  mode: "ranked_v1";
  target?: "posts" | "insights" | "both";
  cursor?: string;
};
export type CoreSearchOptions = {
  reader?: Awaited<ReturnType<typeof assistantGrant>>;
  candidateLimit?: number;
  sourceLimit?: number;
  resultLimit?: number;
  responseBytes?: number;
  remainingCandidates?: number;
  sharedReadBudget?: { bytes: number };
  filters?: SearchFilters;
  project?: SearchProject;
  prefix?: {
    offset: number;
    hash: string | null;
    sessionLimit: number;
    nextOffset: number;
    nextHash: string | null;
    incomplete: boolean;
  };
};
type Core = (
  ctx: QueryCtx,
  args: CoreSearchArgs,
  options?: CoreSearchOptions,
) => Promise<WorkspaceSearchResult>;
const purpose = "vibescroll-ranked-workspace-search-v2\n";
const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
async function fingerprint(value: unknown) {
  return hex(
    new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(canonicalJson(value)),
      ),
    ),
  );
}
const scopeCursor = z.strictObject({
  profileId: z.string().max(100),
  grantId: z.string().max(100),
  grantVersion: z.number().int().positive(),
  projectionRevision: z.number().int().nonnegative(),
  offset: z.number().int().min(0).max(200),
  prefixHash: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable(),
  limit: z.number().int().min(1).max(200),
  done: z.boolean(),
  indexReady: z.boolean(),
});
const outerCursor = z.strictObject({
  version: z.literal(2),
  request: z.string().max(3000),
  project: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable(),
  scopes: z.array(scopeCursor).min(1).max(3),
  visited: z.number().int().min(0).max(200),
  emitted: z.array(z.string().regex(/^[a-f0-9]{32}$/)).max(200),
  incomplete: z.boolean(),
  pages: z.number().int().min(1).max(32),
});
type Outer = z.infer<typeof outerCursor>;
async function readOuter(key: CryptoKey, token: string) {
  ensure(
    new TextEncoder().encode(token).length <= 24576,
    "INVALID_INPUT",
    "Invalid federated search cursor.",
  );
  let raw: unknown;
  try {
    raw = JSON.parse(token);
  } catch {
    ensure(false, "INVALID_INPUT", "Invalid federated search cursor.");
  }
  ensure(
    raw &&
      typeof raw === "object" &&
      Object.keys(raw).length === 2 &&
      "payload" in raw &&
      "mac" in raw &&
      typeof raw.payload === "string" &&
      typeof raw.mac === "string" &&
      /^[a-f0-9]{64}$/.test(raw.mac),
    "INVALID_INPUT",
    "Invalid federated search cursor.",
  );
  const signature = Uint8Array.from(raw.mac.match(/../g)!, (part) =>
    Number.parseInt(part, 16),
  );
  ensure(
    await crypto.subtle.verify(
      "HMAC",
      key,
      signature,
      new TextEncoder().encode(purpose + raw.payload),
    ),
    "INVALID_INPUT",
    "Invalid federated search cursor.",
  );
  try {
    return outerCursor.parse(JSON.parse(raw.payload));
  } catch {
    ensure(false, "INVALID_INPUT", "Invalid federated search cursor.");
  }
}
async function signOuter(key: CryptoKey, value: Outer) {
  const payload = canonicalJson(outerCursor.parse(value));
  const mac = hex(
    new Uint8Array(
      await crypto.subtle.sign(
        "HMAC",
        key,
        new TextEncoder().encode(purpose + payload),
      ),
    ),
  );
  const token = JSON.stringify({ payload, mac });
  return new TextEncoder().encode(token).length <= 24576 ? token : null;
}

export async function runWorkspaceSearchRequest(
  rawCtx: QueryCtx,
  rawInput: unknown,
  core: Core,
): Promise<WorkspaceSearchResult> {
  const parsed = workspaceSearchInput.safeParse(rawInput);
  ensure(
    parsed.success,
    "INVALID_INPUT",
    "Use one profile or up to three distinct workspaces, bounded filters and a valid continuation.",
  );
  const args = parsed.data;
  const ctx = knowledgeReadContext(rawCtx);
  const normalize = (value: string) => {
    const id = ctx.db.normalizeId("organizations", value);
    ensure(id, "INVALID_INPUT", "Invalid workspace identifier.");
    return id;
  };
  const ids = args.workspaceIds?.map(normalize) ?? [
    await selectedProfile(
      ctx,
      args.profileId ? normalize(args.profileId) : undefined,
      "knowledge:read",
    ),
  ];
  // Authorize every explicit scope before any candidate lookup or key inspection.
  const readers = [];
  for (const id of ids)
    readers.push(await assistantGrant(ctx, id, "knowledge:read"));
  ensure(
    readers.every((reader) => reader.grant.libraryScope === "all"),
    "INVALID_INPUT",
    "Use search without ranked_v1 mode for source- or space-limited grants. Access was not widened.",
  );
  const extended = !!(args.workspaceIds || args.filters || args.projectId);
  if (!extended)
    return core(
      ctx,
      {
        query: args.query,
        mode: "ranked_v1",
        profileId: ids[0],
        target: args.target,
        ...(args.cursor ? { cursor: args.cursor } : {}),
      },
      { reader: readers[0] },
    );
  const filters = normalizeSearchFilters(args.filters);
  let project: SearchProject | undefined;
  if (args.projectId) {
    const projectId = ctx.db.normalizeId("repositories", args.projectId);
    ensure(projectId, "INVALID_INPUT", "Invalid project identifier.");
    const row = await ctx.db.get(projectId);
    ensure(row, "FORBIDDEN", "Project unavailable.");
    const reader = await assistantGrant(
      ctx,
      row.organizationId,
      "context:read",
    );
    const repository = await assistantProject(ctx, reader, projectId);
    project = {
      id: repository._id,
      profileId: repository.organizationId,
      name: repository.fullName.slice(0, 200),
      profile: repository.profile,
      baseSha: repository.sha,
      profileVersion: repository.profileVersion,
      selectionVersion: repository.selectionVersion ?? 0,
      grantVersion: reader.grant.version,
    };
  }
  const key = await rankedCursorKey();
  const request = canonicalJson({
    query: args.query,
    target: args.target ?? "both",
    workspaceIds: ids,
    filters: filters ?? null,
    projectId: args.projectId ?? null,
  });
  const projectHash = project ? await fingerprint(project) : null;
  const count = ids.length;
  const states = [];
  for (const reader of readers) {
    const state = await workspaceSearchState(ctx, reader.organization._id);
    states.push({
      profileId: reader.organization._id as string,
      grantId: reader.grant._id as string,
      grantVersion: reader.grant.version,
      projectionRevision: state?.revision ?? 0,
      offset: 0,
      prefixHash: null as string | null,
      limit: Math.floor(200 / count) + (states.length < 200 % count ? 1 : 0),
      done: false,
      indexReady: state?.phase === "ready",
    });
  }
  let visited = 0,
    incomplete = false,
    pages = 0;
  const emitted = new Set<string>();
  if (args.cursor) {
    const prior = await readOuter(key, args.cursor);
    ensure(
      prior.request === request &&
        prior.project === projectHash &&
        prior.scopes.length === states.length,
      "APPROVAL_STALE",
      "Search filters, workspaces or project context changed. Start a new search.",
    );
    for (let index = 0; index < states.length; index++) {
      const expected = states[index],
        previous = prior.scopes[index];
      ensure(
        expected.profileId === previous.profileId &&
          expected.grantId === previous.grantId &&
          expected.grantVersion === previous.grantVersion &&
          expected.projectionRevision === previous.projectionRevision &&
          expected.limit === previous.limit,
        "APPROVAL_STALE",
        "Workspace search access or index changed. Start a new search.",
      );
      states[index] = { ...previous };
    }
    ensure(
      prior.visited ===
        prior.scopes.reduce((sum, scope) => sum + scope.offset, 0),
      "INVALID_INPUT",
      "Invalid cumulative search budget.",
    );
    visited = prior.visited;
    incomplete = prior.incomplete;
    pages = prior.pages;
    for (const hash of prior.emitted) emitted.add(hash);
  }
  const candidateLimit = Math.floor(limits.candidatesPerPage / count),
    sourceLimit = Math.floor(limits.sourceHydrations / count),
    resultLimit = Math.floor(limits.results / count);
  const sharedReadBudget = { bytes: 0 };
  const result: WorkspaceSearchResult = {
    mode: "ranked_v1",
    posts: [],
    matches: [],
    next_cursor: null,
    has_more: false,
    exhausted: false,
    truncated: false,
    coverage:
      "Explicit authorized workspace search with fixed per-workspace quotas. Native lexical matches are deduplicated by canonical post/version. Exhaustion applies only to indexed entries; recent saves and shares may still be indexing. No global catalog or semantic search is performed.",
    profile_id: ids[0],
    grant_version: readers[0].grant.version,
    scanned_candidates: 0,
    loaded_candidates: 0,
    examined_sources: 0,
    loaded_bytes: 0,
    session_candidates: visited,
    projection_revision: states[0].projectionRevision,
    index_ready: states.every((state) => state.indexReady),
    workspaces: [],
  };
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
  const initialVisited = visited;
  const postMap = new Map<string, WorkspaceSearchResult["posts"][number]>();
  for (let index = 0; index < ids.length; index++) {
    const state = states[index];
    if (
      state.done ||
      state.offset >= state.limit ||
      visited >= limits.candidatesPerSession ||
      sharedReadBudget.bytes >= limits.loadedBytes
    )
      continue;
    const prefix = {
      offset: state.offset,
      hash: state.prefixHash,
      sessionLimit: state.limit,
      nextOffset: state.offset,
      nextHash: state.prefixHash,
      incomplete: false,
    };
    const page = await core(
      ctx,
      {
        query: args.query,
        mode: "ranked_v1",
        profileId: ids[index],
        target: args.target,
      },
      {
        reader: readers[index],
        candidateLimit,
        sourceLimit,
        resultLimit,
        responseBytes: Math.floor(38_000 / count),
        remainingCandidates: limits.candidatesPerSession - visited,
        sharedReadBudget,
        filters,
        project,
        prefix,
      },
    );
    visited += page.scanned_candidates;
    result.scanned_candidates += page.scanned_candidates;
    result.examined_sources += page.examined_sources;
    state.offset = prefix.nextOffset;
    state.prefixHash = prefix.nextHash;
    result.loaded_candidates! += page.loaded_candidates ?? 0;
    state.done = !page.has_more && page.index_ready;
    state.indexReady = page.index_ready;
    incomplete ||= prefix.incomplete;
    for (const post of page.posts) {
      const existing = postMap.get(post.id);
      const access = {
        profile_id: ids[index] as string,
        grant_version: readers[index].grant.version,
        fetch_id: post.fetch_id,
        url: post.url,
        reference: post.reference,
      };
      if (existing) {
        if (
          count > 1 &&
          !existing.access_paths!.some(
            (path) => path.profile_id === access.profile_id,
          )
        )
          existing.access_paths!.push(access);
      } else
        postMap.set(post.id, {
          ...post,
          ...(count > 1 ? { access_paths: [access] } : {}),
        });
    }
    for (const match of page.matches) {
      const hash = (await fingerprint(match.id)).slice(0, 32);
      if (!emitted.has(hash)) {
        emitted.add(hash);
        result.matches.push(match);
      }
    }
  }
  const usedPosts = new Set(result.matches.map((match) => match.post_id));
  result.posts = [...postMap.values()].filter((post) => usedPosts.has(post.id));
  if (project)
    result.matches.sort((a, b) => {
      const aa = a.project_fit!,
        bb = b.project_fit!;
      return bb.matched * (aa.total || 1) - aa.matched * (bb.total || 1);
    });
  result.loaded_bytes = sharedReadBudget.bytes;
  result.session_candidates = visited;
  result.workspaces = states.map((state) => ({
    profile_id: state.profileId,
    grant_version: state.grantVersion,
    projection_revision: state.projectionRevision,
    index_ready: state.indexReady,
    has_more: !state.done,
  }));
  result.index_ready = states.every((state) => state.indexReady);
  result.has_more = states.some((state) => !state.done);
  result.exhausted = !result.has_more && !incomplete;
  result.truncated = incomplete || result.has_more;
  const canContinue =
    states.some(
      (state) => !state.done && state.indexReady && state.offset < state.limit,
    ) &&
    visited < limits.candidatesPerSession &&
    pages < 31;
  if (canContinue && (visited > initialVisited || result.matches.length > 0)) {
    const token = await signOuter(key, {
      version: 2,
      request,
      project: projectHash,
      scopes: states,
      visited,
      emitted: [...emitted],
      incomplete,
      pages: pages + 1,
    });
    if (
      token &&
      workspaceSearchInput.safeParse({ ...args, cursor: token }).success
    )
      result.next_cursor = token;
    else
      result.coverage +=
        " The continuation footprint limit was reached. Narrow the requested scopes.";
  }
  if (canContinue && visited === initialVisited && result.matches.length === 0)
    result.coverage +=
      " No bounded progress was possible; narrow the query or workspace list instead of retrying the same continuation.";
  if (visited >= limits.candidatesPerSession && result.has_more)
    result.coverage +=
      " The global 200-candidate session budget was reached. Narrow the query.";
  if (pages >= 31 && result.has_more)
    result.coverage +=
      " The 32-page session budget was reached. Narrow the query.";
  if (
    result.has_more &&
    states.every((state) => state.done || state.offset >= state.limit)
  )
    result.coverage +=
      " Fixed workspace candidate shares are exhausted; narrow the workspace list to use a larger share for one workspace.";
  if (filters)
    result.coverage +=
      " Filters apply within bounded candidates. Date filters use direct-save creation times; shared workspace-added dates are unknown and omitted.";
  if (project)
    result.coverage +=
      " Project topic fit reorders only the emitted page and does not claim a globally best match or measured benefit.";
  ensure(
    new TextEncoder().encode(JSON.stringify(result)).length <=
      limits.responseBytes,
    "POLICY_BLOCKED",
    "Narrow the search to keep its response bounded.",
  );
  return workspaceSearchOutput.parse(result);
}
