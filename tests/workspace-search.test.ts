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
      review?: boolean;
      query?: string;
      target?: "posts" | "insights" | "both";
    } = {},
  ) =>
    f.assistant.action(internal.workspaceSearchActions.search, {
      profileId: f.org,

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

it("keeps a named tool first while returning a distinct passage for the next task", async () => {
  const f = await fixture(3);
  await f.t.run(async (ctx) => {
    await ctx.db.patch(f.ids[0], {
      title: "Design reference",
      text: "Componentry is a library for agent chat interfaces.",
    });
    await ctx.db.patch(f.ids[1], {
      title: "Caption timing",
      text: "Review caption timing on clips by measuring reading speed.",
    });
    await ctx.db.patch(f.ids[2], {
      title: "Agent chat",
      text: "Agent chat can show a progress indicator.",
    });
  });
  await f.bootstrap();
  const result = await f.search({
    query:
      'Find the tool named "Componentry", plus a way to measure caption timing.',
  });
  expect(result.posts[0].reference.sourceId).toBe(f.ids[0]);
  expect(result.facets?.map((facet) => facet.post_id)).toEqual(
    result.posts.slice(0, 2).map(({ id }) => id),
  );
  expect(
    (await f.search({ query: 'Find the tool named "Missing tool".' })).status,
  ).toBe("exact-name-missing");
});

it("returns saved creator posts only through their observed author field", async () => {
  const f = await fixture(3);
  await f.t.run(async (ctx) => {
    await ctx.db.patch(f.ids[0], {
      linkPreview: {
        authorName: "Example creator",
        state: "ready",
        updatedAt: Date.now(),
      },
    });
    await ctx.db.patch(f.ids[1], {
      text: "A reference to Example creator by someone else.",
    });
  });
  await f.bootstrap();
  const result = await f.assistant.action(
    internal.workspaceSearchActions.search,
    {
      profileId: f.org,
      query: "",
      review: true,
      filters: { creator: "Example Creator" },
    },
  );
  expect(result.posts.map(({ reference }) => reference.sourceId)).toEqual([
    f.ids[0],
  ]);
});

it("retrieves a semantic-only hit and keeps lexical search usable when embeddings fail", async () => {
  const f = await fixture(2);
  await f.bootstrap();
  const embedding = [1, ...Array<number>(383).fill(0)];
  await f.t.run(async (ctx) => {
    const origin = await ctx.db
      .query("workspaceSearchOrigins")
      .withIndex("by_path", (q) =>
        q.eq("organizationId", f.org).eq("pathKey", `direct:${f.ids[0]}`),
      )
      .unique();
    const document = await ctx.db
      .query("workspaceSearchDocuments")
      .withIndex("by_item", (q) =>
        q
          .eq("organizationId", f.org)
          .eq("canonicalKey", origin!.canonicalKey)
          .eq("analysisKey", origin!.analysisKey)
          .eq("itemKey", "post"),
      )
      .unique();
    const row = await ctx.db
      .query("workspaceSearchVectors")
      .withIndex("by_document", (q) => q.eq("documentId", document!._id))
      .unique();
    await ctx.db.patch(row!._id, {
      embedding,
      pending: false,
      searchableWorkspace: f.org,
    });
  });
  vi.stubEnv("WORKSPACE_SEARCH_EMBEDDING_SECRET", "b".repeat(64));
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ vectors: [embedding] })),
  );
  const result = await f.search({ query: "fjord bioluminescence" });
  expect(result.semantic).toBe(true);
  expect(result.posts[0].reference.sourceId).toBe(f.ids[0]);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(null, { status: 503 })),
  );
  const fallback = await f.search();
  expect(fallback.semantic).toBe(false);
  expect(fallback.posts[0].reference.sourceId).toBe(f.ids[0]);
});

it("finds an older matching post with compact indexed discovery rather than scanning five recent full analyses", async () => {
  const f = await fixture();
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

it("does not rewrite identical projections or invalidate a continuation on a no-op refresh", async () => {
  const f = await fixture(10, 10, -1);
  await f.bootstrap();
  const first = await f.search({ review: true });
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
    (await f.search({ review: true, cursor: first.next_cursor! })).matches
      .length,
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
  const immediate = await f.assistant.action(
    internal.workspaceSearchActions.search,
    {
      profileId: team,

      query: "needle",
    },
  );
  expect(immediate.index_ready).toBe(true);
  expect(immediate.coverage).toContain(
    "Recent saves and shares may still be indexing",
  );
  await vi.advanceTimersByTimeAsync(0);
  await f.t.finishInProgressScheduledFunctions();
  const ready = await f.assistant.action(
    internal.workspaceSearchActions.search,
    {
      profileId: team,

      query: "needle",
    },
  );
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
  expect(page.scanned_candidates).toBe(9);
  expect(page.matches).toEqual([]);
  expect(page).toMatchObject({
    exhausted: false,
    truncated: true,
    has_more: false,
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
    assistant.action(internal.workspaceSearchActions.search, {
      profileId: team,

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
  expect(count.origins).toBe(2);
  expect(count.docs).toBeGreaterThanOrEqual(2);
  expect((await search(otherAssistant, "unsharedsecret")).matches).toEqual([]);
  expect(
    (
      await f.assistant.action(internal.workspaceSearchActions.search, {
        profileId: team,

        query: "privateownertitle",
        target: "posts",
      })
    ).matches,
  ).toEqual([]);
  expect(
    (
      await f.assistant.action(internal.workspaceSearchActions.search, {
        profileId: team,

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
  const federated = await f.assistant.action(
    internal.workspaceSearchActions.search,
    {
      workspaceIds: [f.org, team],

      query: "evidence",
      target: "insights",
    },
  );
  expect(federated.matches).toHaveLength(1);
  expect(federated.posts[0].access_paths).toHaveLength(2);
  expect(
    new Set(federated.posts[0].access_paths!.map((path) => path.profile_id)),
  ).toEqual(new Set([f.org, team]));
  const dated = await f.assistant.action(
    internal.workspaceSearchActions.search,
    {
      workspaceIds: [f.org, team],

      query: "evidence",
      target: "insights",
      filters: { addedAfter: 0 },
    },
  );
  expect(dated.matches).toHaveLength(1);
  expect(dated.posts[0].access_paths).toHaveLength(1);
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
  const upgraded = await f.assistant.action(
    internal.workspaceSearchActions.search,
    {
      profileId: f.org,

      query: "replacementuniqueterm",
      target: "insights",
    },
  );
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
