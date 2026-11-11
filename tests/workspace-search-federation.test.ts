import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { analysisVersionFixture } from "./analysis-version-fixture";
import { syncDashboardCard } from "../convex/lib/dashboardProjection";
import { searchWorkspaceCore } from "../convex/workspaceSearch";
import { runWorkspaceSearchRequest } from "../convex/lib/workspaceSearchFederation";

const subject = "user_01234567890123456789012345",
  clientId = "client_01234567890123456789012345";
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
async function fixture(scopes = 2, posts = 5, ideas = 10) {
  const f = await analysisVersionFixture(false),
    orgs = [f.org],
    sources: Id<"sources">[][] = [];
  for (let index = 1; index < scopes; index++)
    orgs.push(
      await f.owner.mutation(api.organizations.create, {
        name: `Scope ${index}`,
      }),
    );
  for (let scope = 0; scope < scopes; scope++) {
    const ids: Id<"sources">[] = [];
    for (let index = 0; index < posts; index++) {
      vi.setSystemTime(Date.now() + 2100);
      const sourceId = await f.owner.mutation(api.product.capture, {
        organizationId: orgs[scope],
        kind: "text",
        key: `federation-${scope}-${index}`,
        title: `Scope ${scope} post ${index}`,
        text: `Synthetic retained text ${scope}:${index}`,
        rightsAttested: true,
      });
      await f.t.run(async (ctx) => {
        await ctx.db.patch(sourceId, {
          state: "ready",
          analysis: {
            insights: Array.from({ length: ideas }, (_, idea) => ({
              id: `idea-${scope}-${index}-${idea}`,
              title: `Idea ${idea}`,
              claim: "needle topic",
              categories: [index % 2 ? "coding" : "marketing"],
              topics: ["onboarding"],
              evidence: [],
            })),
          },
        });
        await syncDashboardCard(
          ctx,
          "sources",
          sourceId,
          (await ctx.db.get(sourceId))!,
        );
      });
      ids.push(sourceId);
    }
    sources.push(ids);
    if (scope)
      await f.owner.mutation(api.assistantGrants.save, {
        organizationId: orgs[scope],
        clientId,
        sources: [],
        libraryScope: "all",
        scopes: ["knowledge:read"],
        expectedVersion: 0,
        expiresAt: null,
        acknowledged: true,
      });
  }
  vi.stubEnv("WORKSPACE_SEARCH_ENABLED", "true");
  vi.stubEnv("WORKSPACE_SEARCH_CURSOR_SECRET", "f".repeat(64));
  const bootstrap = async (org: Id<"organizations">) => {
    for (let count = 0; count < 100; count++)
      if (
        (
          await f.t.mutation(internal.workspaceSearch.bootstrap, {
            organizationId: org,
          })
        ).done
      )
        return;
    throw new Error("Bootstrap did not finish");
  };
  for (const org of orgs) await bootstrap(org);
  const search = (
    args: {
      query?: string;
      workspaceIds?: Id<"organizations">[];
      profileId?: Id<"organizations">;
      target?: "posts" | "insights" | "both";
      filters?: {
        categoryKeys?: string[];
        platforms?: string[];
        addedAfter?: number;
        addedBefore?: number;
      };
      projectId?: Id<"repositories">;
      cursor?: string;
    } = {},
  ) =>
    f.assistant.query(internal.workspaceSearch.search, {
      query: "needle",
      mode: "ranked_v1",
      workspaceIds: orgs,
      ...args,
    });
  return { ...f, orgs, sources, search, bootstrap };
}

it("merges every emitted result from two workspaces without losing overflow", async () => {
  const f = await fixture();
  let page = await f.search();
  const seen = new Set<string>();
  let calls = 0;
  while (true) {
    expect(page.scanned_candidates).toBeLessThanOrEqual(50);
    expect(page.examined_sources).toBeLessThanOrEqual(8);
    expect(page.matches.length).toBeLessThanOrEqual(20);
    expect(page.workspaces).toHaveLength(2);
    for (const match of page.matches) {
      expect(seen.has(match.id)).toBe(false);
      seen.add(match.id);
    }
    for (const post of page.posts) expect(post.access_paths).toHaveLength(1);
    if (!page.next_cursor) break;
    page = await f.search({ cursor: page.next_cursor });
    expect(calls++).toBeLessThan(32);
  }
  expect(seen.size).toBe(100);
  expect(page.session_candidates).toBe(100);
  expect(page.exhausted).toBe(true);
});

it("enforces one 200-candidate budget over three explicitly authorized workspaces", async () => {
  const f = await fixture(3, 8, 10);
  let page = await f.search();
  const seen = new Set<string>();
  let count = 0;
  while (true) {
    expect(page.matches.length).toBeLessThanOrEqual(18);
    expect(page.scanned_candidates).toBeLessThanOrEqual(48);
    expect(page.examined_sources).toBeLessThanOrEqual(6);
    for (const match of page.matches) {
      expect(seen.has(match.id)).toBe(false);
      seen.add(match.id);
    }
    if (!page.next_cursor) break;
    page = await f.search({ cursor: page.next_cursor });
    expect(count++).toBeLessThan(32);
  }
  expect(page.session_candidates).toBe(200);
  expect(seen.size).toBe(200);
  expect(page).toMatchObject({
    has_more: true,
    exhausted: false,
    next_cursor: null,
  });
  expect(page.coverage).toContain("global 200-candidate");
});

it("binds filters/workspace order and authenticates the outer budget", async () => {
  const f = await fixture();
  const first = await f.search();
  expect(first.next_cursor).toBeTruthy();
  await expect(
    f.search({
      cursor: first.next_cursor!,
      workspaceIds: [...f.orgs].reverse(),
    }),
  ).rejects.toThrow(/APPROVAL_STALE/);
  await expect(
    f.search({
      cursor: first.next_cursor!,
      filters: { categoryKeys: ["coding"] },
    }),
  ).rejects.toThrow(/APPROVAL_STALE/);
  const envelope = JSON.parse(first.next_cursor!);
  const payload = JSON.parse(envelope.payload);
  payload.visited = 0;
  await expect(
    f.search({
      cursor: JSON.stringify({ ...envelope, payload: JSON.stringify(payload) }),
    }),
  ).rejects.toThrow(/INVALID_INPUT/);
  await expect(
    f.search({ workspaceIds: [f.orgs[0], f.orgs[0]] }),
  ).rejects.toThrow(/INVALID_INPUT/);
  await expect(f.search({ profileId: f.orgs[0] })).rejects.toThrow(
    /INVALID_INPUT/,
  );
});

it("filters current categories, known platform and direct-save timestamps without a new index", async () => {
  const f = await fixture(1, 3, 1);
  const date = (await f.t.run((ctx) => ctx.db.get(f.sources[0][1])))!.createdAt;
  const categories = await f.search({ filters: { categoryKeys: ["coding"] } });
  expect(categories.matches).toHaveLength(1);
  expect(categories.posts[0].reference.sourceId).toBe(f.sources[0][1]);
  const dates = await f.search({
    filters: { addedAfter: date, addedBefore: date },
  });
  expect(dates.matches).toHaveLength(1);
  expect(dates.posts[0].reference.sourceId).toBe(f.sources[0][1]);
  expect(
    (await f.search({ filters: { platforms: ["instagram"] } })).matches,
  ).toEqual([]);
  expect(
    (await f.search({ filters: { platforms: ["text"] } })).matches,
  ).toHaveLength(3);
  await f.t.run(async (ctx) => {
    const rows = await ctx.db
      .query("workspaceSearchDocuments")
      .withIndex("by_post", (q) => q.eq("organizationId", f.org))
      .take(30);
    for (const row of rows)
      await ctx.db.patch(row._id, {
        metadataVersion: undefined,
        platform: undefined,
        categoryKeys: undefined,
      });
  });
  expect(
    (await f.search({ filters: { categoryKeys: ["coding"] } })).matches,
  ).toHaveLength(1);
});

it("rejects an unauthorized scope before returning any authorized results", async () => {
  const f = await fixture(1);
  const foreign = await f.t.run(async (ctx) => {
    const { _id, _creationTime, ...row } = (await ctx.db.get(f.org))!;
    return ctx.db.insert("organizations", { ...row, name: "No membership" });
  });
  await expect(f.search({ workspaceIds: [f.org, foreign] })).rejects.toThrow(
    /FORBIDDEN/,
  );
});

it("reorders only emitted matches using an authorized confirmed project and binds its revision", async () => {
  const f = await fixture(1, 4, 10);
  const now = Date.now();
  const projectId = await f.t.run((ctx) =>
    ctx.db.insert("repositories", {
      organizationId: f.org,
      installationId: 42,
      providerId: 55,
      fullName: "owned/synthetic",
      branch: "main",
      sha: "a".repeat(40),
      enabled: true,
      confirmed: true,
      profile:
        "Purpose: A software development product for coding and testing.\n\nNon-goals: marketing and advertising",
      profileVersion: 1,
      manifest: ["README.md"],
      status: "connected",
      context: "PRIVATE CODE MUST NOT APPEAR",
      createdAt: now,
      updatedAt: now,
    }),
  );
  const scopes = ["knowledge:read", "context:read"];
  vi.stubEnv(
    "MCP_CLIENTS",
    JSON.stringify([{ id: clientId, name: "Scoped project test", scopes }]),
  );
  await f.owner.mutation(api.assistantGrants.save, {
    organizationId: f.org,
    clientId,
    sources: [],
    libraryScope: "all",
    scopes,
    expectedVersion: f.grant.version,
    expiresAt: null,
    acknowledged: true,
    repositories: [
      {
        repositoryId: projectId,
        baseSha: "a".repeat(40),
        profileVersion: 1,
        selectionVersion: 0,
      },
    ],
  });
  const assistant = f.t.withIdentity({
    subject,
    issuer: "https://fixture.authkit.app",
    client_id: clientId,
    scope: scopes.join(" "),
    sid: "app_consent_01234567890123456789012345",
  });
  const page = await assistant.query(internal.workspaceSearch.search, {
    profileId: f.org,
    query: "needle",
    mode: "ranked_v1",
    projectId,
  });
  expect(page.project?.id).toBe(projectId);
  expect(page.matches).toHaveLength(20);
  expect(page.matches[0].project_fit?.matched).toBeGreaterThan(0);
  expect(page.matches.at(-1)?.project_fit?.matched).toBe(0);
  expect(page.coverage).toContain("only the emitted page");
  expect(JSON.stringify(page)).not.toContain("PRIVATE CODE");
  expect(page.next_cursor).toBeTruthy();
  await f.t.run((ctx) => ctx.db.patch(projectId, { profileVersion: 2 }));
  await expect(
    assistant.query(internal.workspaceSearch.search, {
      profileId: f.org,
      query: "needle",
      mode: "ranked_v1",
      projectId,
      cursor: page.next_cursor!,
    }),
  ).rejects.toThrow(/APPROVAL_STALE/);
});

it("rejects a reordered consumed prefix even if the workspace revision marker is unchanged", async () => {
  const f = await fixture();
  const first = await f.search();
  expect(first.next_cursor).toBeTruthy();
  await f.t.run(async (ctx) => {
    const docs = await ctx.db
      .query("workspaceSearchDocuments")
      .withIndex("by_post", (q) => q.eq("organizationId", f.org))
      .take(100);
    const doc = docs.find(
      (doc) => doc.kind === "insight" && doc.searchText.includes("needle"),
    )!;
    await ctx.db.patch(doc._id, { searchText: "unrelated replacement" });
  });
  await expect(f.search({ cursor: first.next_cursor! })).rejects.toThrow(
    /APPROVAL_STALE/,
  );
});

it("resumes Unicode byte-bound federation windows without losing any emitted match", async () => {
  const f = await fixture(3, 2, 10);
  for (let scope = 0; scope < f.orgs.length; scope++) {
    await f.t.run(async (ctx) => {
      for (const sourceId of f.sources[scope]) {
        const source = (await ctx.db.get(sourceId))!;
        const insights = (source.analysis!.insights as { id: string }[]).map(
          (insight) => ({
            ...insight,
            title: "\u6f22".repeat(200),
            claim: "needle " + "\u6f22".repeat(700),
            evidence: [],
          }),
        );
        await ctx.db.patch(sourceId, { analysis: { insights } });
      }
    });
    for (const sourceId of f.sources[scope])
      await f.t.mutation(internal.workspaceSearch.refreshSource, {
        organizationId: f.orgs[scope],
        sourceId,
      });
  }
  let page = await f.search();
  const seen = new Set<string>();
  let calls = 0;
  while (true) {
    expect(
      new TextEncoder().encode(JSON.stringify(page)).length,
    ).toBeLessThanOrEqual(64000);
    expect(page.loaded_candidates).toBeLessThanOrEqual(200);
    for (const match of page.matches) {
      expect(seen.has(match.id)).toBe(false);
      seen.add(match.id);
    }
    if (!page.next_cursor) break;
    page = await f.search({ cursor: page.next_cursor });
    expect(calls++).toBeLessThan(32);
  }
  expect(seen.size).toBe(60);
  expect(page.has_more).toBe(false);
  expect(page.exhausted).toBe(false); // Long claims explicitly truncate search text.
});

it("finds a late direct-date match through bounded empty pages instead of claiming absence", async () => {
  const f = await fixture(1, 20, 1);
  const boundary = (await f.t.run((ctx) => ctx.db.get(f.sources[0][19])))!
    .createdAt;
  let page = await f.search({ filters: { addedAfter: boundary } });
  expect(page.matches).toEqual([]);
  expect(page.has_more).toBe(true);
  expect(page.next_cursor).toBeTruthy();
  let calls = 0;
  const hits: string[] = [];
  while (true) {
    hits.push(...page.posts.map((post) => post.reference.sourceId));
    if (!page.next_cursor) break;
    page = await f.search({
      filters: { addedAfter: boundary },
      cursor: page.next_cursor,
    });
    expect(calls++).toBeLessThan(32);
  }
  expect(hits).toEqual([f.sources[0][19]]);
  expect(calls).toBeGreaterThan(0);
});

it("shares one read-byte allowance across workspace calls", async () => {
  const f = await fixture(2, 5, 1);
  await f.t.run(async (ctx) => {
    for (const ids of f.sources)
      for (const sourceId of ids) {
        const source = (await ctx.db.get(sourceId))!;
        await ctx.db.patch(sourceId, {
          analysis: { ...source.analysis, padding: "x".repeat(950000) },
        });
      }
  });
  const page = await f.search();
  expect(page.examined_sources).toBe(8);
  expect(page.matches).toHaveLength(8);
  expect(page.loaded_bytes).toBeGreaterThan(7_000_000);
  expect(page.loaded_bytes).toBeLessThan(8_000_000);
  expect(page.loaded_candidates).toBeLessThanOrEqual(200);
  expect(page.next_cursor).toBeTruthy();
});

it("emits a valid first match once even when it exceeds a soft workspace byte share", async () => {
  const f = await fixture(1, 2, 1);
  const page = await f.assistant.run((ctx) =>
    searchWorkspaceCore(
      ctx,
      { profileId: f.org, query: "needle", mode: "ranked_v1" },
      { responseBytes: 6500 },
    ),
  );
  expect(page.matches.length).toBeGreaterThan(0);
  expect(page.session_candidates).toBeGreaterThan(0);
});

it("bounds post fit disclosure for maximum topic context across three workspaces", async () => {
  const f = await fixture(3, 1, 1);
  for (let index = 0; index < 3; index++) {
    const sourceId = f.sources[index][0];
    await f.t.run(async (ctx) => {
      await ctx.db.patch(sourceId, {
        title: "\u6f22".repeat(200),
        analysis: {
          summary: "needle " + "\u6f22".repeat(700),
          insights: Array.from({ length: 40 }, (_, number) => ({
            id: `topic-${number}`,
            title: "Topic",
            claim: "needle",
            categories: ["coding"],
            topics: ["\u6f22".repeat(40) + number],
            evidence: [],
          })),
        },
      });
    });
    await f.t.mutation(internal.workspaceSearch.refreshSource, {
      organizationId: f.orgs[index],
      sourceId,
    });
  }
  const now = Date.now();
  const projectId = await f.t.run((ctx) =>
    ctx.db.insert("repositories", {
      organizationId: f.org,
      installationId: 42,
      providerId: 56,
      fullName: "owned/large-profile",
      branch: "main",
      sha: "b".repeat(40),
      enabled: true,
      confirmed: true,
      profile: "Purpose: software development coding",
      profileVersion: 1,
      manifest: ["README.md"],
      status: "connected",
      context: "",
      createdAt: now,
      updatedAt: now,
    }),
  );
  const scopes = ["knowledge:read", "context:read"];
  vi.stubEnv(
    "MCP_CLIENTS",
    JSON.stringify([{ id: clientId, name: "Bounded context", scopes }]),
  );
  await f.owner.mutation(api.assistantGrants.save, {
    organizationId: f.org,
    clientId,
    sources: [],
    libraryScope: "all",
    scopes,
    expectedVersion: f.grant.version,
    expiresAt: null,
    acknowledged: true,
    repositories: [
      {
        repositoryId: projectId,
        baseSha: "b".repeat(40),
        profileVersion: 1,
        selectionVersion: 0,
      },
    ],
  });
  const assistant = f.t.withIdentity({
    subject,
    issuer: "https://fixture.authkit.app",
    client_id: clientId,
    scope: scopes.join(" "),
    sid: "app_consent_01234567890123456789012345",
  });
  const page = await assistant.query(internal.workspaceSearch.search, {
    workspaceIds: f.orgs,
    query: "needle",
    mode: "ranked_v1",
    target: "posts",
    projectId,
  });
  expect(page.matches).toHaveLength(3);
  for (const match of page.matches) {
    expect(match.project_fit?.total).toBe(40);
    expect(match.project_fit?.criteria.length).toBeLessThanOrEqual(8);
    expect(match.project_fit?.criteria_omitted).toBeGreaterThanOrEqual(32);
  }
  expect(new TextEncoder().encode(JSON.stringify(page)).length).toBeLessThan(
    64000,
  );
  expect(page.session_candidates).toBeGreaterThan(0);
});

it("rejects mixed full and narrowed grants before invoking any workspace candidate core", async () => {
  const f = await fixture();
  const row = await f.t.run(async (ctx) => {
    const org = (await ctx.db.get(f.org))!;
    return ctx.db
      .query("assistantGrants")
      .withIndex("by_pair", (q) =>
        q
          .eq("organizationId", f.orgs[1])
          .eq("actor", org.privateOwnerId!)
          .eq("clientId", clientId),
      )
      .unique();
  });
  const source = (await f.t.run((ctx) => ctx.db.get(f.sources[1][0])))!;
  expect(row).toBeTruthy();
  await f.owner.mutation(api.assistantGrants.save, {
    organizationId: f.orgs[1],
    clientId,
    sources: [
      {
        sourceId: source._id,
        generation: source.generation,
        revision: source.updatedAt,
      },
    ],
    scopes: ["knowledge:read"],
    expectedVersion: row!.version,
    expiresAt: null,
    acknowledged: true,
  });
  let calls = 0;
  await expect(
    f.assistant.run((ctx) =>
      runWorkspaceSearchRequest(
        ctx,
        { workspaceIds: f.orgs, query: "needle", mode: "ranked_v1" },
        async () => {
          calls++;
          throw new Error("Unexpected candidate core");
        },
      ),
    ),
  ).rejects.toThrow(/INVALID_INPUT/);
  expect(calls).toBe(0);
});
