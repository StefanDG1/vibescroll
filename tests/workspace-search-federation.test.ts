import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { analysisVersionFixture } from "./analysis-version-fixture";
import { syncDashboardCard } from "../convex/lib/dashboardProjection";

const clientId = "client_01234567890123456789012345";
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
      review?: boolean;
    } = {},
  ) =>
    f.assistant.action(internal.workspaceSearchActions.search, {
      query: "needle",

      workspaceIds: orgs,
      ...args,
    });
  return { ...f, orgs, sources, search, bootstrap };
}

it("ranks across two authorized workspaces and reviews every result through continuation", async () => {
  const f = await fixture(2, 11, 2);
  const ranked = await f.search();
  expect(ranked.workspaces?.map(({ profile_id }) => profile_id)).toEqual(
    f.orgs,
  );
  expect(
    ranked.posts.some(
      (post) => post.access_paths?.[0].profile_id === f.orgs[1],
    ),
  ).toBe(true);
  let cursor: string | undefined;
  const ids: string[] = [];
  for (let page = 0; page < 8; page++) {
    const result = await f.search({
      review: true,
      ...(cursor ? { cursor } : {}),
    });
    ids.push(...result.posts.map(({ reference }) => reference.sourceId));
    cursor = result.next_cursor ?? undefined;
    if (!cursor) {
      expect(result.exhausted).toBe(true);
      break;
    }
  }
  expect(ids).toHaveLength(22);
  expect(new Set(ids)).toEqual(new Set(f.sources.flat()));
});

it("rejects changed filters and unauthorized workspace requests before returning matches", async () => {
  const f = await fixture(2, 10, 1);
  const first = await f.search({ review: true });
  expect(first.next_cursor).toBeTruthy();
  await expect(
    f.search({
      review: true,
      cursor: first.next_cursor!,
      filters: { categoryKeys: ["coding"] },
    }),
  ).rejects.toThrow("APPROVAL_STALE");
  const foreign = await f.owner.mutation(api.organizations.create, {
    name: "No approved grant",
  });
  await expect(f.search({ workspaceIds: [f.org, foreign] })).rejects.toThrow(
    "FORBIDDEN",
  );
});
