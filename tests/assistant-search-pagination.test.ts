import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import { syncDashboardCard } from "../convex/lib/dashboardProjection";
import { analysisVersionFixture } from "./analysis-version-fixture";
import {
  knowledgeSearchCursor,
  knowledgeSearchOutput,
} from "../packages/contracts/knowledge-read";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function fixture(
  scope: "all" | "selected_sources",
  count = 2,
  ideas = 11,
  word = "needle",
) {
  const f = await analysisVersionFixture(false);
  const refs = [];
  for (let index = 0; index < count; index++) {
    vi.setSystemTime(Date.now() + 2100);
    const sourceId = await f.owner.mutation(api.product.capture, {
      organizationId: f.org,
      kind: "text",
      key: `search-page-post-${index}`,
      title: `Synthetic search post ${index}`,
      text: `PRIVATE source text ${index}`,
      rightsAttested: true,
    });
    const row = await f.t.run(async (ctx) => {
      await ctx.db.patch(sourceId, {
        state: "ready",
        analysis: {
          insights: Array.from({ length: ideas }, (_, insight) => ({
            id: `idea-${index}-${insight}`,
            title: `Idea ${insight}`,
            claim: word,
            evidence: [],
          })),
        },
      });
      const source = (await ctx.db.get(sourceId))!;
      await syncDashboardCard(ctx, "sources", sourceId, source);
      return source;
    });
    refs.push({
      sourceId,
      generation: row.generation,
      revision: row.updatedAt,
    });
  }
  const grant = await f.owner.mutation(api.assistantGrants.save, {
    organizationId: f.org,
    clientId: "client_01234567890123456789012345",
    sources: scope === "selected_sources" ? refs : [],
    ...(scope === "all" ? { libraryScope: "all" as const } : {}),
    scopes: ["knowledge:read"],
    expectedVersion: f.grant.version,
    expiresAt: null,
    acknowledged: true,
  });
  const search = (
    args: { cursor?: string; offset?: number; query?: string } = {},
  ) =>
    f.assistant.query(internal.assistant.search, {
      profileId: f.org,
      query: word,
      ...args,
    });
  return { ...f, refs, grant, search };
}

it.each(["all", "selected_sources"] as const)(
  "recovers cross-source overflow for %s grants without repeating the first twenty matches",
  async (scope) => {
    const f = await fixture(scope);
    const first = await f.search();
    expect(first.results).toHaveLength(20);
    expect(first.has_more).toBe(true);
    const second = await f.search({ cursor: first.next_cursor! });
    expect(second.results).toHaveLength(2);
    expect(second).toMatchObject({
      has_more: false,
      exhausted: true,
      truncated: false,
      next_cursor: null,
    });
    const ids = [...first.results, ...second.results].map((row) => row.id);
    expect(new Set(ids).size).toBe(22);
    expect(ids.filter((id) => id.startsWith(f.refs[0].sourceId))).toHaveLength(
      11,
    );
    expect(ids.filter((id) => id.startsWith(f.refs[1].sourceId))).toHaveLength(
      11,
    );
    expect(first.scanned_posts).toBeLessThanOrEqual(5);
    expect(second.scanned_posts).toBeLessThanOrEqual(5);
    expect(knowledgeSearchOutput.parse(first)).toEqual(first);
    expect(knowledgeSearchOutput.parse(second)).toEqual(second);
    expect(JSON.stringify(first)).not.toContain("PRIVATE source text");
  },
);

it("drains matching results before advancing a five-post candidate page", async () => {
  const f = await fixture("all", 9);
  const seen = new Set<string>();
  let cursor: string | undefined;
  let completed = false;
  for (let calls = 0; calls < 12; calls++) {
    const page = await f.search({ cursor });
    expect(page.scanned_posts).toBeLessThanOrEqual(5);
    expect(page.results.length).toBeLessThanOrEqual(20);
    for (const result of page.results) {
      expect(seen.has(result.id)).toBe(false);
      seen.add(result.id);
    }
    if (!page.next_cursor) {
      expect(page.exhausted).toBe(true);
      completed = true;
      break;
    }
    cursor = page.next_cursor;
  }
  expect(completed).toBe(true);
  expect(seen.size).toBe(99);
});

it("rejects query, source-access and grant changes while a result page is in progress", async () => {
  const f = await fixture("all");
  const first = await f.search();
  await expect(
    f.search({ cursor: first.next_cursor!, query: "changed" }),
  ).rejects.toThrow("STALE_APPROVAL");
  const noSnapshot = JSON.parse(first.next_cursor!);
  delete noSnapshot.snapshotHash;
  await expect(
    f.search({ cursor: JSON.stringify(noSnapshot) }),
  ).rejects.toThrow("INVALID_INPUT");
  await f.t.run((ctx) =>
    ctx.db.patch(f.refs[0].sourceId, { rightsAttested: false }),
  );
  await expect(f.search({ cursor: first.next_cursor! })).rejects.toThrow(
    "STALE_APPROVAL",
  );
  await f.t.run((ctx) =>
    ctx.db.patch(f.refs[0].sourceId, { rightsAttested: true }),
  );
  await f.t.run((ctx) =>
    ctx.db.patch(f.grant.id, { version: f.grant.version + 1 }),
  );
  await expect(f.search({ cursor: first.next_cursor! })).rejects.toThrow(
    "STALE_APPROVAL",
  );
  await f.owner.mutation(api.assistantGrants.revoke, {
    id: f.grant.id,
    expectedVersion: f.grant.version + 1,
  });
  await expect(f.search({ cursor: first.next_cursor! })).rejects.toThrow(
    "FORBIDDEN",
  );
});

it("rejects a resumed page after the selected retained analysis changes", async () => {
  const f = await fixture("all", 2, 11, "evidence");
  const enrolled = await f.owner.mutation(api.analysisVersions.enroll, {
    sourceId: f.sourceId,
  });
  const first = await f.search();
  expect(first.next_cursor).toBeTruthy();
  const candidate = await f.t.run(async (ctx) => {
    const {
      _id: _versionId,
      _creationTime: _time,
      ...version
    } = (await ctx.db.get(enrolled.versionId))!;
    return ctx.db.insert("analysisVersions", {
      ...version,
      number: version.number + 1,
    });
  });
  await f.owner.mutation(api.analysisVersions.select, {
    sourceId: f.sourceId,
    versionId: candidate,
    expectedSelectionRevision: 0,
  });
  await expect(f.search({ cursor: first.next_cursor! })).rejects.toThrow(
    "STALE_APPROVAL",
  );
});

it("accepts old library cursor envelopes and retains legacy source-offset navigation", async () => {
  const library = await fixture("all", 6, 1);
  const first = await library.search();
  const parsed = knowledgeSearchCursor.parse(JSON.parse(first.next_cursor!));
  expect(parsed.cursor).toBeTypeOf("string");
  const oldCursor = JSON.stringify({
    grant: parsed.grant,
    version: parsed.version,
    scope: parsed.scope,
    query: parsed.query,
    cursor: parsed.cursor,
  });
  expect((await library.search({ cursor: oldCursor })).results).toEqual(
    (await library.search({ cursor: first.next_cursor! })).results,
  );
  const selected = await fixture("selected_sources", 6, 1);
  const selectedFirst = await selected.search();
  expect(selectedFirst.next_offset).toBe(5);
  expect(
    (await selected.search({ offset: selectedFirst.next_offset! })).results,
  ).toEqual(
    (await selected.search({ cursor: selectedFirst.next_cursor! })).results,
  );
});

it("carries an explicit per-post scan limit through the whole cursor chain", async () => {
  const f = await fixture("selected_sources", 1, 129);
  let cursor: string | undefined;
  let count = 0;
  let complete = false;
  for (let calls = 0; calls < 8; calls++) {
    const page = await f.search({ cursor });
    count += page.results.length;
    if (!page.next_cursor) {
      expect(page).toMatchObject({
        exhausted: false,
        truncated: true,
        has_more: false,
      });
      complete = true;
      break;
    }
    cursor = page.next_cursor;
  }
  expect(complete).toBe(true);
  expect(count).toBe(128);
});
