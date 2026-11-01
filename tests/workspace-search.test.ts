import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { analysisVersionFixture } from "./analysis-version-fixture";
import { cloudCatalogFixture } from "./cloud-catalog-fixture";
import {
  associateContributedCloudVersion,
  cloudArtifact,
} from "../convex/lib/cloudCatalog";
import { removeSearchOrigin } from "../convex/lib/workspaceSearchProjection";
import { syncDashboardCard } from "../convex/lib/dashboardProjection";
import {
  workspaceSearchOutput,
  workspaceSearchMcpOutput,
} from "../packages/contracts/workspace-search";

vi.mock("../packages/providers/storage", () => ({
  signedObject: (key: string) =>
    `https://storage.example.test/${encodeURIComponent(key)}`,
}));
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
async function fixture(count = 12, ideas = 1, needleOnlyAt = 0) {
  const f = await analysisVersionFixture(false);
  const ids: Id<"sources">[] = [];
  for (let index = 0; index < count; index++) {
    vi.setSystemTime(Date.now() + 2100);
    const id = await f.owner.mutation(api.product.capture, {
      organizationId: f.org,
      kind: "text",
      key: `ranked-source-${index}`,
      title: `Source ${index}`,
      text: `Synthetic source ${index}`,
      rightsAttested: true,
    });
    await f.t.run(async (ctx) => {
      await ctx.db.patch(id, {
        state: "ready",
        analysis: {
          insights: Array.from({ length: ideas }, (_, idea) => ({
            id: `idea-${index}-${idea}`,
            title: `Idea ${index} ${idea}`,
            claim:
              index === needleOnlyAt || needleOnlyAt < 0
                ? "onboarding friction needle"
                : "ordinary unrelated material",
            evidence: [],
          })),
        },
      });
      await syncDashboardCard(ctx, "sources", id, (await ctx.db.get(id))!);
    });
    ids.push(id);
  }
  vi.stubEnv("WORKSPACE_SEARCH_ENABLED", "true");
  vi.stubEnv("WORKSPACE_SEARCH_CURSOR_SECRET", "e".repeat(64));
  const search = (
    args: {
      cursor?: string;
      query?: string;
      target?: "posts" | "insights" | "both";
    } = {},
  ) =>
    f.assistant.query(internal.workspaceSearch.search, {
      profileId: f.org,
      mode: "ranked_v1",
      query: "needle",
      ...args,
    });
  const bootstrap = async () => {
    let done = false,
      calls = 0;
    while (!done && calls++ < 100) {
      done = (
        await f.t.mutation(internal.workspaceSearch.bootstrap, {
          organizationId: f.org,
        })
      ).done;
    }
    expect(done).toBe(true);
    return calls;
  };
  return { ...f, ids, search, bootstrap };
}

it("finds an older matching post with compact indexed discovery rather than scanning five recent full analyses", async () => {
  const f = await fixture();
  const legacy = await f.assistant.query(internal.assistant.search, {
    profileId: f.org,
    query: "needle",
  });
  expect(legacy.results).toHaveLength(0);
  expect(legacy.scanned_posts).toBe(5);
  expect(await f.search()).toMatchObject({
    index_ready: false,
    exhausted: false,
    truncated: true,
    matches: [],
  });
  expect(
    await f.t.run((ctx) => ctx.db.query("workspaceSearchDocuments").take(1)),
  ).toHaveLength(0);
  await f.bootstrap();
  const ranked = workspaceSearchOutput.parse(await f.search());
  expect(ranked.index_ready).toBe(true);
  expect(ranked.matches).toHaveLength(1);
  expect(ranked.posts[0].reference.sourceId).toBe(f.ids[0]);
  const expanded = await f.assistant.query(internal.assistant.fetch, {
    profileId: f.org,
    id: ranked.posts[0].fetch_id,
    format: "structured_v1",
  });
  if (!("analysis" in expanded))
    throw new Error("Expected structured analysis");
  expect(expanded.analysis?.insights[0].reference.sourceId).toBe(f.ids[0]);
  expect(ranked.scanned_candidates).toBe(1);
  expect(workspaceSearchMcpOutput.safeParse(ranked).success).toBe(true);
});

it("pages all ranked matches without repeats and rejects changed query or index", async () => {
  const f = await fixture(7, 11, -1);
  await f.bootstrap();
  let page = await f.search();
  const seen = new Set<string>();
  while (true) {
    expect(page.matches.length).toBeLessThanOrEqual(20);
    expect(page.examined_sources).toBeLessThanOrEqual(8);
    for (const match of page.matches) {
      expect(seen.has(match.id)).toBe(false);
      seen.add(match.id);
    }
    if (!page.next_cursor) break;
    if (seen.size === 20)
      await expect(
        f.search({ cursor: page.next_cursor, query: "different" }),
      ).rejects.toThrow(/APPROVAL_STALE/);
    page = await f.search({ cursor: page.next_cursor });
  }
  expect(seen.size).toBe(77);
  expect(page.exhausted).toBe(true);
  expect(JSON.stringify(page)).not.toContain("Synthetic source");
  const first = await f.search();
  await f.t.run(async (ctx) => {
    const source = (await ctx.db.get(f.ids[0]))!;
    await ctx.db.patch(source._id, {
      title: "Changed title",
      updatedAt: source.updatedAt + 1,
    });
  });
  await f.t.mutation(internal.workspaceSearch.refreshSource, {
    organizationId: f.org,
    sourceId: f.ids[0],
  });
  await expect(f.search({ cursor: first.next_cursor! })).rejects.toThrow(
    /APPROVAL_STALE/,
  );
});

it("rechecks explicit source scope and excludes another workspace's index", async () => {
  const f = await fixture(4, 1, -1);
  await f.bootstrap();
  const source = (await f.t.run((ctx) => ctx.db.get(f.ids[0])))!;
  await f.owner.mutation(api.assistantGrants.save, {
    organizationId: f.org,
    clientId: "client_01234567890123456789012345",
    sources: [
      {
        sourceId: source._id,
        generation: source.generation,
        revision: source.updatedAt,
      },
    ],
    scopes: ["knowledge:read"],
    expectedVersion: f.grant.version,
    expiresAt: null,
    acknowledged: true,
  });
  expect(
    (await f.search()).posts.map((post) => post.reference.sourceId),
  ).toEqual([f.ids[0]]);
  const foreign = await f.t.run(async (ctx) => {
    const { _id, _creationTime, ...original } = (await ctx.db.get(f.org))!;
    const org = await ctx.db.insert("organizations", {
      ...original,
      name: "Foreign workspace",
    });
    await ctx.db.insert("workspaceSearchDocuments", {
      organizationId: org,
      canonicalKey: "foreign",
      analysisKey: "foreign",
      itemKey: "post",
      kind: "post",
      title: "Foreign needle",
      excerpt: "private",
      searchText: "needle",
      truncated: false,
      updatedAt: Date.now(),
    });
    return org;
  });
  expect((await f.search()).matches).toHaveLength(1);
  await expect(
    f.assistant.query(internal.workspaceSearch.search, {
      profileId: foreign,
      mode: "ranked_v1",
      query: "needle",
    }),
  ).rejects.toThrow(/FORBIDDEN/);
});

it("caps cumulative candidate traversal even if many pages remain", async () => {
  const f = await fixture(24, 10, -1);
  await f.bootstrap();
  let page = await f.search(),
    count = page.matches.length,
    loops = 0;
  while (page.next_cursor && loops++ < 20) {
    page = await f.search({ cursor: page.next_cursor });
    count += page.matches.length;
  }
  expect(count).toBe(200);
  expect(page.session_candidates).toBe(200);
  expect(page).toMatchObject({
    next_cursor: null,
    has_more: true,
    exhausted: false,
    truncated: true,
  });
});

it("authenticates cursor budget/offset and fails closed without its dedicated key", async () => {
  const f = await fixture(5, 10, -1);
  await f.bootstrap();
  const first = await f.search();
  const envelope = JSON.parse(first.next_cursor!);
  for (const change of [{ visited: 0 }, { offset: 0 }]) {
    const tampered = {
      ...envelope,
      payload: JSON.stringify({ ...JSON.parse(envelope.payload), ...change }),
    };
    await expect(
      f.search({ cursor: JSON.stringify(tampered) }),
    ).rejects.toThrow(/INVALID_INPUT/);
  }
  vi.stubEnv("WORKSPACE_SEARCH_CURSOR_SECRET", "");
  await expect(f.search()).rejects.toThrow(/POLICY_BLOCKED/);
});

it("preserves the omitted Unicode match when the response-byte guard fires", async () => {
  const f = await fixture(4, 10, -1);
  await f.t.run(async (ctx) => {
    for (const sourceId of f.ids) {
      const source = (await ctx.db.get(sourceId))!;
      const insights = (source.analysis!.insights as { id: string }[]).map(
        (insight) => ({
          ...insight,
          title: "\u6f22".repeat(200),
          claim: "needle " + "\u6f22".repeat(700),
          evidence: [],
        }),
      );
      await ctx.db.patch(sourceId, {
        title: "\u6f22".repeat(200),
        analysis: { insights },
      });
    }
  });
  await f.bootstrap();
  let page = await f.search({ target: "insights" });
  expect(page.matches.length).toBeLessThan(20);
  const seen = new Set<string>();
  while (true) {
    expect(
      new TextEncoder().encode(JSON.stringify(page)).length,
    ).toBeLessThanOrEqual(64000);
    for (const match of page.matches) {
      expect(seen.has(match.id)).toBe(false);
      seen.add(match.id);
    }
    if (!page.next_cursor) break;
    page = await f.search({ target: "insights", cursor: page.next_cursor });
  }
  expect(seen.size).toBe(40);
});

it("does not rewrite identical projections or invalidate a continuation on a no-op refresh", async () => {
  const f = await fixture(4, 10, -1);
  await f.bootstrap();
  const first = await f.search();
  const before = await f.t.run((ctx) =>
    ctx.db
      .query("workspaceSearchDocuments")
      .withIndex("by_post", (q) => q.eq("organizationId", f.org))
      .take(130),
  );
  await f.t.mutation(internal.workspaceSearch.refreshSource, {
    organizationId: f.org,
    sourceId: f.ids[0],
  });
  const after = await f.t.run((ctx) =>
    ctx.db
      .query("workspaceSearchDocuments")
      .withIndex("by_post", (q) => q.eq("organizationId", f.org))
      .take(130),
  );
  expect(after).toEqual(before);
  expect(
    (await f.search({ cursor: first.next_cursor! })).matches.length,
  ).toBeGreaterThan(0);
});

it("initializes new workspaces without an operator bootstrap and labels async index lag", async () => {
  const f = await fixture(0);
  const team = await f.owner.mutation(api.organizations.create, {
    name: "New indexed team",
  });
  await vi.advanceTimersByTimeAsync(0);
  await f.t.finishInProgressScheduledFunctions();
  await f.owner.mutation(api.assistantGrants.save, {
    organizationId: team,
    clientId: "client_01234567890123456789012345",
    sources: [],
    libraryScope: "all",
    scopes: ["knowledge:read"],
    expectedVersion: 0,
    expiresAt: null,
    acknowledged: true,
  });
  const sourceId = await f.owner.mutation(api.product.capture, {
    organizationId: team,
    key: "new-workspace-post",
    kind: "text",
    title: "needle",
    text: "Synthetic",
    rightsAttested: true,
  });
  const immediate = await f.assistant.query(internal.workspaceSearch.search, {
    profileId: team,
    mode: "ranked_v1",
    query: "needle",
  });
  expect(immediate.index_ready).toBe(true);
  expect(immediate.coverage).toContain(
    "Recent saves and shares may still be indexing",
  );
  await vi.advanceTimersByTimeAsync(0);
  await f.t.finishInProgressScheduledFunctions();
  const ready = await f.assistant.query(internal.workspaceSearch.search, {
    profileId: team,
    mode: "ranked_v1",
    query: "needle",
  });
  expect(ready.posts.some((post) => post.reference.sourceId === sourceId)).toBe(
    true,
  );
});

it("caps full-source hydration independently of compact candidates and denies retired data", async () => {
  const f = await fixture(9, 1, -1);
  await f.bootstrap();
  await f.t.run(async (ctx) => {
    for (const sourceId of f.ids)
      await ctx.db.patch(sourceId, { state: "deleted" });
  });
  const page = await f.search();
  expect(page.examined_sources).toBe(8);
  expect(page.scanned_candidates).toBe(8);
  expect(page.matches).toEqual([]);
  expect(page).toMatchObject({
    exhausted: false,
    truncated: true,
    has_more: true,
  });
});

async function pro(
  f: Awaited<ReturnType<typeof analysisVersionFixture>>,
  organizationId: Id<"organizations">,
) {
  await f.t.run(async (ctx) => {
    const now = Date.now(),
      end = now + 86400000;
    const wallet = await ctx.db
      .query("wallets")
      .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
      .unique();
    if (wallet) await ctx.db.patch(wallet._id, { tier: "pro", periodEnd: end });
    else
      await ctx.db.insert("wallets", {
        organizationId,
        createdAt: now,
        updatedAt: now,
        granted: 300,
        purchased: 0,
        spent: 0,
        reserved: 0,
        periodEnd: end,
        tier: "pro",
        interval: "monthly",
      });
    const subscription = `synthetic-${organizationId}`;
    await ctx.db.insert("billing", {
      organizationId,
      customerId: subscription,
      subscriptionId: subscription,
      status: "active",
      periodEnd: end,
      verifiedAt: now,
      revision: 1,
    });
    await ctx.db.insert("billingPeriods", {
      organizationId,
      createdAt: now,
      updatedAt: now,
      key: subscription,
      start: now - 1000,
      end,
      credits: 300,
      subscription,
    });
  });
}

it("shares one canonical collection between two members and preserves an independent origin after revoke", async () => {
  const f = await cloudCatalogFixture();
  vi.stubEnv("WORKSPACE_SEARCH_CURSOR_SECRET", "e".repeat(64));
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === "PUT"
        ? new Response(null, { status: 200 })
        : new Response(f.bytes, { headers: { "content-type": "image/jpeg" } }),
    ),
  );
  const copy = await f.contribute();
  const contribution = (await f.t.run((ctx) =>
    ctx.db.get(copy.contributionId),
  ))!;
  const artifact = (await f.t.run((ctx) =>
    ctx.db.get(contribution.artifactId),
  ))!;
  if (!cloudArtifact(artifact)) throw new Error("Expected a cloud artifact");
  const assessment = {
    rubric: "evidence-review-v1" as const,
    fidelity: 4,
    completeness: 4,
    citationAccuracy: 4,
    uncertainty: 4,
    usefulness: 4,
    reason: "Synthetic exact-evidence review",
  };
  const review = await f.operator.query(api.cloudCatalog.reviewRecommendation, {
    artifactId: artifact._id,
    assessment,
  });
  await f.operator.mutation(api.cloudCatalog.selectRecommendation, {
    artifactId: artifact._id,
    expectedSelectionRevision: 0,
    assessment,
    reviewHash: review.reviewHash,
  });
  await pro(f, f.org);
  await f.t.run(async (ctx) => {
    const source = (await ctx.db.get(f.sourceId))!;
    expect(
      await associateContributedCloudVersion(
        ctx,
        source,
        (await ctx.db.get(f.org))!.privateOwnerId!,
        artifact._id,
      ),
    ).toBe(true);
    await syncDashboardCard(
      ctx,
      "sources",
      source._id,
      (await ctx.db.get(source._id))!,
    );
  });
  const subject = "user_03234567890123456789012345";
  const readerId = await f.t.mutation(internal.accounts.syncUser, {
    subject,
    email: "ranked-reader@example.test",
    name: "Second reader",
  });
  const reader = f.t.withIdentity({
    subject,
    auth_time: Math.floor(Date.now() / 1000),
  });
  const readerOrg = await reader.mutation(api.organizations.createPrivate, {});
  await pro(f, readerOrg);
  const readerSource = await reader.mutation(api.product.capture, {
    organizationId: readerOrg,
    key: "second-canonical-save",
    kind: "url",
    url: f.prepared.post.canonical,
    title: "Second reader title",
    rightsAttested: true,
  });
  const team = await f.owner.mutation(api.organizations.create, {
    name: "Shared indexed team",
  });
  await f.t.run((ctx) =>
    ctx.db.insert("memberships", {
      organizationId: team,
      userId: readerId,
      role: "member",
    }),
  );
  const share = async (
    owner: typeof f.owner,
    org: Id<"organizations">,
    sourceId: Id<"sources">,
  ) => {
    const source = (await f.t.run((ctx) => ctx.db.get(sourceId)))!;
    return owner.mutation(api.knowledgeGrants.save, {
      organizationId: org,
      recipientOrganizationId: team,
      expectedVersion: 0,
      sources: [
        { sourceId, generation: source.generation, revision: source.updatedAt },
      ],
      expiresAt: Date.now() + 86400000,
      acknowledged: true,
    });
  };
  await f.t.run(async (ctx) => {
    for (const [sourceId, label] of [
      [f.sourceId, "privateownertitle"],
      [readerSource, "privatereadertitle"],
    ] as const) {
      const source = (await ctx.db.get(sourceId))!;
      await ctx.db.patch(sourceId, {
        title: label,
        updatedAt: source.updatedAt + 1,
      });
      await syncDashboardCard(
        ctx,
        "sources",
        sourceId,
        (await ctx.db.get(sourceId))!,
      );
    }
  });
  const firstShare = await share(f.owner, f.org, f.sourceId),
    secondShare = await share(reader, readerOrg, readerSource);
  for (const member of [f.owner, reader])
    await member.mutation(api.assistantGrants.save, {
      organizationId: team,
      clientId: "client_01234567890123456789012345",
      sources: [],
      libraryScope: "all",
      scopes: ["knowledge:read"],
      expectedVersion: 0,
      expiresAt: null,
      acknowledged: true,
    });
  await f.owner.mutation(api.product.capture, {
    organizationId: f.org,
    key: "unshared-owner-post",
    kind: "text",
    title: "unsharedsecret",
    text: "Not shared",
    rightsAttested: true,
  });
  vi.stubEnv("WORKSPACE_SEARCH_ENABLED", "true");
  for (let index = 0; index < 10; index++) {
    if (
      (
        await f.t.mutation(internal.workspaceSearch.bootstrap, {
          organizationId: team,
        })
      ).done
    )
      break;
  }
  const otherAssistant = f.t.withIdentity({
    subject,
    issuer: "https://fixture.authkit.app",
    client_id: "client_01234567890123456789012345",
    scope: "knowledge:read",
    sid: "app_consent_03234567890123456789012345",
  });
  const search = (assistant: typeof f.assistant, query = "evidence") =>
    assistant.query(internal.workspaceSearch.search, {
      profileId: team,
      mode: "ranked_v1",
      query,
      target: "insights",
    });
  await f.owner.query(api.knowledgeGrants.fetchShared, {
    organizationId: team,
    grantId: firstShare.id,
    sourceId: f.sourceId,
  });
  await reader.query(api.knowledgeGrants.fetchShared, {
    organizationId: team,
    grantId: secondShare.id,
    sourceId: readerSource,
  });
  const ownerPage = await search(f.assistant),
    readerPage = await search(otherAssistant);
  expect(ownerPage.matches).toHaveLength(1);
  expect(readerPage.matches).toEqual(ownerPage.matches);
  expect(ownerPage.posts[0].reference.analysisVersionId).toBe(
    artifact.versionId,
  );
  expect(ownerPage.posts[0].url).toContain(`/app/${team}/shared?grant=`);
  const ref = ownerPage.posts[0].reference;
  const expanded = await f.assistant.query(internal.assistant.fetch, {
    profileId: team,
    id: ownerPage.posts[0].fetch_id,
    format: "structured_v1",
    sharedGrantId: ref.sharedGrantId as Id<"teamKnowledgeGrants">,
    sharedGrantVersion: ref.sharedGrantVersion,
  });
  if (!("analysis" in expanded))
    throw new Error("Expected structured analysis");
  expect(expanded.analysis?.insights[0].reference.analysisVersionId).toBe(
    artifact.versionId,
  );
  const count = await f.t.run(async (ctx) => ({
    docs: (
      await ctx.db
        .query("workspaceSearchDocuments")
        .withIndex("by_post", (q) => q.eq("organizationId", team))
        .take(130)
    ).length,
    origins: (
      await ctx.db
        .query("workspaceSearchOrigins")
        .withIndex("by_post", (q) => q.eq("organizationId", team))
        .take(20)
    ).length,
  }));
  expect(count).toEqual({ docs: 2, origins: 2 });
  expect((await search(otherAssistant, "unsharedsecret")).matches).toEqual([]);
  expect(
    (
      await f.assistant.query(internal.workspaceSearch.search, {
        profileId: team,
        mode: "ranked_v1",
        query: "privateownertitle",
        target: "posts",
      })
    ).matches,
  ).toEqual([]);
  expect(
    (
      await f.assistant.query(internal.workspaceSearch.search, {
        profileId: team,
        mode: "ranked_v1",
        query: "privatereadertitle",
        target: "posts",
      })
    ).matches,
  ).toEqual([]);

  // A shared recommendation advances subscribers without patching their source;
  // an explicitly shared version remains pinned to the earlier analysis.
  for (let page = 0; page < 20; page++) {
    if (
      (
        await f.t.mutation(internal.workspaceSearch.bootstrap, {
          organizationId: f.org,
        })
      ).done
    )
      break;
  }
  const assetsBefore = await f.t.run((ctx) =>
    ctx.db
      .query("assets")
      .withIndex("by_org", (q) => q.eq("organizationId", f.serviceOrg))
      .take(100),
  );
  const request = await f.owner.mutation(api.analysisVersions.request, {
    sourceId: f.sourceId,
    expectedSelectionRevision: 0,
    key: "better-ranked-version",
    configuration: f.config,
  });
  const claimed = await f.assistant.mutation(
    internal.analysisVersions.dispatch,
    {
      sourceId: f.sourceId,
      attemptId: request.attemptId,
      taskId: "better-ranked-version",
      operation: "claim",
    },
  );
  const lease = {
    sourceId: f.sourceId,
    attemptId: request.attemptId,
    taskId: "better-ranked-version",
    leaseToken: claimed.leaseToken,
  };
  const input = await f.assistant.query(internal.analysisVersions.input, lease);
  await f.assistant.mutation(internal.analysisVersions.acknowledgeFrame, {
    ...lease,
    frameId: "frame-1",
  });
  const completed = await f.assistant.mutation(
    internal.analysisVersions.dispatch,
    {
      ...lease,
      operation: "complete",
      output: {
        schemaVersion: "analysis-version-output-v1",
        sourceId: f.sourceId,
        attemptId: request.attemptId,
        evidenceHash: input.evidenceHash,
        postRevisionHash: input.postRevisionHash,
        summary: "Reviewed replacement",
        warnings: [],
        insights: f.output.insights.map((insight) => ({
          ...insight,
          title: "replacementuniqueterm",
        })),
      },
    },
  );
  const preview = await f.owner.query(api.cloudCatalog.preview, {
    sourceId: f.sourceId,
    versionId: completed.versionId!,
  });
  const secondCopy = await f.owner.action(api.cloudCatalogActions.contribute, {
    sourceId: f.sourceId,
    versionId: completed.versionId!,
    key: "better-ranked-contribution",
    consent: preview.consent,
  });
  const replacement = (await f.t.run(async (ctx) => {
    const contribution = (await ctx.db.get(secondCopy.contributionId))!;
    return ctx.db.get(contribution.artifactId);
  }))!;
  if (!cloudArtifact(replacement))
    throw new Error("Expected replacement cloud artifact");
  const comparison = await f.operator.query(
    api.cloudCatalog.reviewRecommendation,
    { artifactId: replacement._id, assessment },
  );
  const sourceBeforePromotion = await f.t.run((ctx) => ctx.db.get(f.sourceId));
  await f.operator.mutation(api.cloudCatalog.selectRecommendation, {
    artifactId: replacement._id,
    expectedSelectionRevision: 1,
    assessment,
    reviewHash: comparison.reviewHash,
  });
  expect(await f.t.run((ctx) => ctx.db.get(f.sourceId))).toEqual(
    sourceBeforePromotion,
  );
  for (let flush = 0; flush < 8; flush++) {
    await vi.advanceTimersByTimeAsync(0);
    await f.t.finishInProgressScheduledFunctions();
  }
  const upgraded = await f.assistant.query(internal.workspaceSearch.search, {
    profileId: f.org,
    mode: "ranked_v1",
    query: "replacementuniqueterm",
    target: "insights",
  });
  expect(upgraded.matches).toHaveLength(1);
  expect(upgraded.posts[0].reference.analysisVersionId).toBe(
    replacement.versionId,
  );
  expect(
    (await search(otherAssistant)).posts[0].reference.analysisVersionId,
  ).toBe(artifact.versionId);
  expect(
    (await search(otherAssistant, "replacementuniqueterm")).matches,
  ).toEqual([]);
  expect(
    await f.t.run((ctx) =>
      ctx.db
        .query("assets")
        .withIndex("by_org", (q) => q.eq("organizationId", f.serviceOrg))
        .take(100),
    ),
  ).toEqual(assetsBefore);

  await f.owner.mutation(api.knowledgeGrants.revoke, {
    organizationId: f.org,
    id: firstShare.id,
    expectedVersion: firstShare.version,
  });
  const surviving = await search(otherAssistant);
  expect(surviving.matches).toHaveLength(1);
  expect(surviving.posts[0].reference.sharedGrantId).toBe(secondShare.id);
  await f.t.run((ctx) =>
    removeSearchOrigin(ctx, team, `share:${firstShare.id}:${f.sourceId}`),
  );
  expect((await search(otherAssistant)).matches).toHaveLength(1);
  await reader.mutation(api.knowledgeGrants.revoke, {
    organizationId: readerOrg,
    id: secondShare.id,
    expectedVersion: secondShare.version,
  });
  expect((await search(f.assistant)).matches).toEqual([]);
});

it("finds bounded category/topic and display/creator metadata without another model", async () => {
  const f = await fixture(1);
  await f.t.run(async (ctx) => {
    const source = (await ctx.db.get(f.ids[0]))!;
    await ctx.db.patch(source._id, {
      linkPreview: {
        title: "Friendly display title",
        authorName: "Camille",
        state: "ready",
        updatedAt: Date.now(),
      },
      analysis: {
        insights: [
          {
            id: "categorized",
            title: "Implementation idea",
            claim: "Clear friction",
            categories: ["coding"],
            topics: ["onboarding"],
            evidence: [],
          },
        ],
      },
    });
  });
  await f.bootstrap();
  const post = await f.search({ query: "Camille", target: "posts" });
  expect(post.matches).toHaveLength(1);
  expect(
    (await f.search({ query: "coding", target: "insights" })).matches.some(
      (match) => match.insight_id === "categorized",
    ),
  ).toBe(true);
  expect(
    (await f.search({ query: "onboarding", target: "insights" })).matches[0]
      .insight_id,
  ).toBe("categorized");
});

it("keeps eight near-maximum legacy source documents below the conservative read allowance", async () => {
  const f = await fixture(9, 1, -1);
  await f.t.run(async (ctx) => {
    for (const sourceId of f.ids) {
      const source = (await ctx.db.get(sourceId))!;
      await ctx.db.patch(sourceId, {
        analysis: { ...source.analysis, padding: "x".repeat(950000) },
      });
    }
  });
  await f.bootstrap();
  const result = await f.search();
  expect(result.examined_sources).toBe(8);
  expect(result.matches).toHaveLength(8);
  expect(result.loaded_bytes).toBeGreaterThan(7_000_000);
  expect(result.loaded_bytes).toBeLessThan(8_000_000);
  expect(result.next_cursor).toBeTruthy();
  expect(new TextEncoder().encode(JSON.stringify(result)).length).toBeLessThan(
    64000,
  );
});
