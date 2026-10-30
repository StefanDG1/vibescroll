import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import { cloudCatalogFixture } from "./cloud-catalog-fixture";
import { currentCloudArtifact } from "../convex/lib/cloudCatalog";

vi.mock("../packages/providers/storage", () => ({
  signedObject: (key: string) =>
    `https://storage.example.test/${encodeURIComponent(key)}`,
}));
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.clearAllTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

async function sharedFixture() {
  const f = await cloudCatalogFixture();
  const network = vi.fn(async (_url: string, init?: RequestInit) =>
    init?.method === "PUT"
      ? new Response(null, { status: 200 })
      : new Response(f.bytes, { headers: { "content-type": "image/jpeg" } }),
  );
  vi.stubGlobal("fetch", network);
  const copy = await f.contribute();
  const row = (await f.t.run((ctx) => ctx.db.get(copy.contributionId)))!;
  const shared = await f.t.run((ctx) =>
    currentCloudArtifact(ctx, row.artifactId),
  );
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
    artifactId: shared.artifact._id,
    assessment,
  });
  await f.operator.mutation(api.cloudCatalog.selectRecommendation, {
    artifactId: shared.artifact._id,
    expectedSelectionRevision: 0,
    assessment,
    reviewHash: review.reviewHash,
  });
  const subject = "user_03234567890123456789012345";
  await f.t.mutation(internal.accounts.syncUser, {
    subject,
    email: "second@example.test",
    name: "Second private reader",
  });
  const second = f.t.withIdentity({
    subject,
    auth_time: Math.floor(Date.now() / 1000),
  });
  const org = await second.mutation(api.organizations.createPrivate, {});
  const now = Date.now(),
    end = now + 86400000;
  const billingId = await f.t.run(async (ctx) => {
    const wallet = await ctx.db
      .query("wallets")
      .withIndex("by_org", (q) => q.eq("organizationId", org))
      .unique();
    if (wallet) await ctx.db.patch(wallet._id, { tier: "pro", periodEnd: end });
    else
      await ctx.db.insert("wallets", {
        organizationId: org,
        createdAt: now,
        updatedAt: now,
        granted: 0,
        spent: 0,
        reserved: 0,
        periodEnd: end,
        tier: "pro",
        interval: "monthly",
        purchased: 0,
      });
    const id = await ctx.db.insert("billing", {
      organizationId: org,
      customerId: "synthetic-b",
      subscriptionId: "synthetic-b-sub",
      status: "active",
      periodEnd: end,
      verifiedAt: now,
      revision: 1,
    });
    await ctx.db.insert("billingPeriods", {
      organizationId: org,
      createdAt: now,
      updatedAt: now,
      key: "synthetic-b",
      start: now - 1000,
      end,
      credits: 0,
      subscription: "synthetic-b-sub",
    });
    return id;
  });
  const scopes = [
    "analysis:request",
    "analysis:execute",
    "knowledge:read",
    "jobs:read",
    "events:subscribe",
  ];
  const clientId = "client_01234567890123456789012345";
  vi.stubEnv(
    "PERSONAL_ALPHA_SUBJECTS_JSON",
    JSON.stringify(["user_01234567890123456789012345", subject]),
  );
  await second.mutation(api.assistantGrants.save, {
    organizationId: org,
    clientId,
    sources: [],
    libraryScope: "all",
    scopes,
    expectedVersion: 0,
    expiresAt: null,
    acknowledged: true,
    cloudRequestPolicy: "explicit_per_source_v1",
  });
  vi.stubEnv(
    "PERSONAL_ALPHA_SUBJECTS_JSON",
    JSON.stringify(["user_01234567890123456789012345", subject]),
  );
  const assistant = f.t.withIdentity({
    subject,
    issuer: "https://fixture.authkit.app",
    client_id: clientId,
    scope: scopes.join(" "),
    sid: "app_consent_03234567890123456789012345",
  });
  network.mockClear();
  const sourceId = await second.mutation(api.product.capture, {
    organizationId: org,
    key: "second-reader-save",
    kind: "url",
    url: f.prepared.post.canonical,
    title: "Second reader metadata",
    rightsAttested: true,
  });
  return {
    ...f,
    second,
    secondAssistant: assistant,
    secondOrg: org,
    secondSourceId: sourceId,
    billingId,
    shared,
    network,
  };
}

it("uses a reference-only shared post in exact-version context and a durable chat proposal, with no owner leakage, new job or entitlement bypass", async () => {
  const f = await sharedFixture();
  const scopes = [
    "analysis:request",
    "analysis:execute",
    "knowledge:read",
    "jobs:read",
    "events:subscribe",
    "context:read",
    "suggestions:draft",
  ];
  const clientId = "client_01234567890123456789012345";
  vi.stubEnv(
    "MCP_CLIENTS",
    JSON.stringify([{ id: clientId, name: "Synthetic shared reader", scopes }]),
  );
  const projectId = await f.t.run((ctx) =>
    ctx.db.insert("repositories", {
      organizationId: f.secondOrg,
      installationId: 77,
      providerId: 88,
      fullName: "second/owned",
      branch: "main",
      sha: "b".repeat(40),
      enabled: true,
      confirmed: true,
      profile: "A TypeScript software product",
      profileVersion: 1,
      manifest: [],
      status: "connected",
      context: "PRIVATE SECOND REPOSITORY CODE",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  );
  await f.second.mutation(api.assistantGrants.save, {
    organizationId: f.secondOrg,
    clientId,
    sources: [],
    libraryScope: "all",
    scopes,
    expectedVersion: 1,
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
    subject: "user_03234567890123456789012345",
    issuer: "https://fixture.authkit.app",
    client_id: clientId,
    scope: scopes.join(" "),
    sid: "app_consent_03234567890123456789012345",
  });
  const args = { sourceId: f.secondSourceId, projectId };
  const before = await f.t.run((ctx) => ctx.db.get(f.secondSourceId));
  f.network.mockClear();
  const context = await assistant.query(
    internal.assistant.projectApplicationContext,
    args,
  );
  expect(context.source).toMatchObject({
    id: f.secondSourceId,
    analysisVersionId: f.shared.version._id,
    generation: 0,
  });
  expect(context.source.insights[0].reference.sourceId).toBe(f.secondSourceId);
  expect(JSON.stringify(context)).not.toContain(f.sourceId);
  expect(JSON.stringify(context)).not.toContain(f.org);
  expect(JSON.stringify(context)).not.toContain(
    "PRIVATE SECOND REPOSITORY CODE",
  );
  expect(f.network).not.toHaveBeenCalled();
  const after = await f.t.run((ctx) => ctx.db.get(f.secondSourceId));
  expect(after).toEqual(before);
  expect(after?.analysis).toBeUndefined();
  expect(after?.personalAnalysis).toBeUndefined();
  const webContext = await f.second.query(api.projectPlanning.context, {
    ...args,
    analysisVersionId: context.source.analysisVersionId,
    insightIds: context.source.insights.map((i) => i.id),
  });
  const webProposal = await f.second.mutation(api.projectPlanning.save, {
    ...args,
    analysisVersionId: context.source.analysisVersionId,
    insightIds: context.source.insights.map((i) => i.id),
    contextHash: webContext.contextHash,
    expectedVersion: 0,
    key: "shared-web-proposal",
    body: {
      title: "Review this shared insight",
      disposition: "needs_context",
      currentProblem: "Assess the current project need",
      proposedChange: null,
      benefitHypothesis: null,
      risks: [],
      nonGoals: [],
      acceptanceCriteria: [],
      verificationNeeds: ["Inspect code"],
    },
  });
  expect(webProposal).toMatchObject({
    origin: "web_planning",
    analysisVersionId: f.shared.version._id,
    creditsSpent: 0,
  });
  expect(JSON.stringify(webProposal)).not.toContain(f.sourceId);
  const proposal = await assistant.mutation(internal.assistantProposals.save, {
    ...args,
    analysisVersionId: context.source.analysisVersionId,
    insightIds: context.source.insights.map((i) => i.id),
    contextHash: context.contextHash,
    expectedVersion: 0,
    key: "shared-chat-proposal",
    body: {
      title: "Check the shared idea against this project",
      disposition: "needs_context",
      currentProblem:
        "Verify whether the project has the source's proposed behavior.",
      proposedChange: "Inspect the selected revision before choosing a change.",
      benefitHypothesis: null,
      risks: ["Repository code has not been inspected."],
      nonGoals: [],
      acceptanceCriteria: [
        "Compare the source evidence with the implementation.",
      ],
      verificationNeeds: ["Inspect the selected code."],
    },
  });
  expect(proposal).toMatchObject({
    creditsSpent: 0,
    analysisStarted: false,
    version: 1,
  });
  expect(JSON.stringify(proposal)).not.toContain(f.sourceId);
  expect(JSON.stringify(proposal)).not.toContain(f.org);
  const reopened = await assistant.query(internal.assistantProposals.read, {
    proposalId: proposal.proposalId,
  });
  expect(reopened.analysisVersionId).toBe(f.shared.version._id);
  expect(
    await f.second.query(api.product.proposal, { id: proposal.proposalId }),
  ).not.toBeNull();
  expect(f.network).not.toHaveBeenCalled();
  await f.t.run((ctx) => ctx.db.patch(f.billingId, { status: "canceled" }));
  await expect(
    f.second.query(api.product.proposal, { id: webProposal.proposalId }),
  ).rejects.toThrow();
  await expect(
    assistant.query(internal.assistant.projectApplicationContext, args),
  ).rejects.toThrow();
  await expect(
    assistant.query(internal.assistantProposals.read, {
      proposalId: proposal.proposalId,
    }),
  ).rejects.toThrow();
});

it("ordinary Save reuses independent neutral evidence with no job, inference, media acquisition or byte copy", async () => {
  const f = await sharedFixture();
  const saved = (await f.t.run((ctx) => ctx.db.get(f.secondSourceId)))!;
  expect(saved.state).toBe("ready");
  expect(saved.generation).toBe(0);
  expect(saved.analysis).toBeUndefined();
  expect(saved.personalAnalysis).toBeUndefined();
  expect(saved.orderedMedia).toBeUndefined();
  expect(saved.publicImportId).toBeDefined();
  expect(f.network).not.toHaveBeenCalled();
  const warm = await f.second.mutation(api.workCloudSaves.capture, {
    organizationId: f.secondOrg,
    key: "same-post-warm-save",
    url: f.prepared.post.canonical,
    title: "Cached metadata",
    rightsAttested: true,
    grantId: f.grant.id,
    grantVersion: f.grant.version,
  });
  expect(warm.status).toBe("reused_shared_analysis");
  expect(warm.intentId).toBeNull();
  const detail = await f.second.query(api.product.detail, { id: saved._id });
  expect(detail.analysis.summary).toBe(f.shared.output.summary);
  expect(JSON.stringify(detail)).not.toContain("catalog/");
  const history = await f.second.query(api.analysisVersions.history, {
    sourceId: saved._id,
    paginationOpts: { numItems: 20, cursor: null },
  });
  expect(history.page).toHaveLength(1);
  expect(history.selectedVersionId).toBe(f.shared.version._id);
  expect(history.page[0].origin).toBe("service");
  const fetched = await f.secondAssistant.query(internal.assistant.fetch, {
    profileId: f.secondOrg,
    id: `${saved._id}@${f.shared.version._id}`,
  });
  expect(fetched.text).toContain(f.shared.output.insights[0].title);
  expect(JSON.stringify(fetched)).not.toContain("catalog/");
  const frame = await f.second.mutation(api.analysisVersions.sharedFrame, {
    sourceId: saved._id,
    versionId: f.shared.version._id,
    frameId: "frame-1",
  });
  expect(frame.sha256).toBe(f.shared.evidence.frames[0].sha256);
  await expect(
    f.secondAssistant.mutation(api.analysisVersions.sharedFrame, {
      sourceId: saved._id,
      versionId: f.shared.version._id,
      frameId: "frame-1",
    }),
  ).rejects.toThrow(/FORBIDDEN/);
  await f.owner.mutation(api.product.deleteSource, { id: f.sourceId });
  expect(
    (await f.second.query(api.product.detail, { id: saved._id })).analysis
      .summary,
  ).toBe(f.shared.output.summary);
  const receipts = await f.owner.query(api.cloudCatalog.own, {
    organizationId: f.org,
    paginationOpts: { numItems: 20, cursor: null },
  });
  expect(receipts.page[0].canonical).toBe(f.shared.family.canonical);
  await f.owner.mutation(api.cloudCatalog.withdrawContribution, {
    contributionId: receipts.page[0].id,
  });
  await expect(
    f.second.query(api.product.detail, { id: saved._id }),
  ).rejects.toThrow();
});

it.each([
  "billing",
  "permission",
  "retention",
  "source_identity",
  "source_rights",
  "source_generation",
])("blocks both app and MCP shared reads after %s changes", async (failure) => {
  const f = await sharedFixture();
  if (failure === "permission") vi.stubEnv("CLOUD_CATALOG_VERIFIED", "false");
  await f.t.run(async (ctx) => {
    if (failure === "billing")
      await ctx.db.patch(f.billingId, { status: "canceled" });
    if (failure === "retention")
      await ctx.db.patch(f.secondSourceId, {
        sourceRetentionUntil: Date.now() - 1,
      });
    if (failure === "source_identity")
      await ctx.db.patch(f.secondSourceId, {
        url: "https://www.instagram.com/reel/Other123456/",
      });
    if (failure === "source_rights")
      await ctx.db.patch(f.secondSourceId, { rightsAttested: false });
    if (failure === "source_generation")
      await ctx.db.patch(f.secondSourceId, { generation: 1 });
  });
  await expect(
    f.second.query(api.product.detail, { id: f.secondSourceId }),
  ).rejects.toThrow();
  await expect(
    f.second.query(api.analysisVersions.history, {
      sourceId: f.secondSourceId,
      paginationOpts: { numItems: 20, cursor: null },
    }),
  ).rejects.toThrow();
  await expect(
    f.secondAssistant.query(internal.assistant.fetch, {
      profileId: f.secondOrg,
      id: `${f.secondSourceId}@${f.shared.version._id}`,
    }),
  ).rejects.toThrow();
});

it("keeps notes pinned through a new global recommendation, personal pin and rollback", async () => {
  const f = await sharedFixture();
  const detail = await f.second.query(api.product.detail, {
    id: f.secondSourceId,
  });
  await f.second.mutation(api.cloudCatalog.saveNotes, {
    sourceId: f.secondSourceId,
    versionId: f.shared.version._id,
    expectedUpdatedAt: detail.sharedCloud!.notesUpdatedAt,
    privateNote: "My private note belongs to the first shared version",
    corrections: [],
  });
  await f.second.mutation(api.analysisVersions.select, {
    sourceId: f.secondSourceId,
    versionId: f.shared.version._id,
    expectedSelectionRevision: 0,
  });
  const request = await f.request("another-published-candidate");
  const claim = await f.assistant.mutation(internal.analysisVersions.dispatch, {
    sourceId: f.sourceId,
    attemptId: request.attemptId,
    taskId: "new-published-candidate",
    operation: "claim",
  });
  const lease = {
    sourceId: f.sourceId,
    attemptId: request.attemptId,
    taskId: "new-published-candidate",
    leaseToken: claim.leaseToken,
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
        summary: "The next reviewed shared candidate",
        warnings: [],
        insights: f.output.insights,
      },
    },
  );
  const preview = await f.owner.query(api.cloudCatalog.preview, {
    sourceId: f.sourceId,
    versionId: completed.versionId!,
  });
  const copy = await f.owner.action(api.cloudCatalogActions.contribute, {
    sourceId: f.sourceId,
    versionId: completed.versionId!,
    key: "next-catalog-contribution",
    consent: preview.consent,
  });
  const row = (await f.t.run((ctx) => ctx.db.get(copy.contributionId)))!;
  const assessment = {
    rubric: "evidence-review-v1" as const,
    fidelity: 4,
    completeness: 4,
    citationAccuracy: 4,
    uncertainty: 4,
    usefulness: 4,
    reason: "Synthetic review of candidate and incumbent evidence",
  };
  const review = await f.operator.query(api.cloudCatalog.reviewRecommendation, {
    artifactId: row.artifactId,
    assessment,
  });
  await f.operator.mutation(api.cloudCatalog.selectRecommendation, {
    artifactId: row.artifactId,
    expectedSelectionRevision: 1,
    assessment,
    reviewHash: review.reviewHash,
  });
  expect(
    (await f.second.query(api.product.detail, { id: f.secondSourceId }))
      .analysis.summary,
  ).toBe(f.shared.output.summary);
  await f.second.mutation(api.analysisVersions.followRecommendation, {
    sourceId: f.secondSourceId,
    expectedSelectionRevision: 1,
  });
  const next = await f.second.query(api.product.detail, {
    id: f.secondSourceId,
  });
  expect(next.analysis.summary).toBe("The next reviewed shared candidate");
  expect(next.sharedCloud!.privateNote).toBe("");
  await f.second.mutation(api.analysisVersions.select, {
    sourceId: f.secondSourceId,
    versionId: f.shared.version._id,
    expectedSelectionRevision: 2,
  });
  expect(
    (await f.second.query(api.product.detail, { id: f.secondSourceId }))
      .sharedCloud!.privateNote,
  ).toContain("first shared version");
  expect(f.network).not.toHaveBeenCalled();
});

it("canonical withdrawal stops app, MCP, frames and new cache hits immediately", async () => {
  const f = await sharedFixture();
  await f.operator.mutation(api.cloudCatalog.invalidateFamily, {
    familyId: f.shared.family._id,
    reason: "Synthetic canonical permission withdrawal",
  });
  await expect(
    f.second.query(api.product.detail, { id: f.secondSourceId }),
  ).rejects.toThrow();
  await expect(
    f.secondAssistant.query(internal.assistant.fetch, {
      profileId: f.secondOrg,
      id: `${f.secondSourceId}@${f.shared.version._id}`,
    }),
  ).rejects.toThrow();
  await expect(
    f.second.mutation(api.analysisVersions.sharedFrame, {
      sourceId: f.secondSourceId,
      versionId: f.shared.version._id,
      frameId: "frame-1",
    }),
  ).rejects.toThrow();
  const metadata = await f.second.query(api.product.library, {
    organizationId: f.secondOrg,
  });
  expect(metadata.items[0].summary).toBe("");
  expect(metadata.items[0].insightCount).toBe(0);
  expect(metadata.items[0].sharedAvailable).toBe(false);
});

it("checks the current server clock at the shared image boundary without changing source or storage state", async () => {
  const f = await sharedFixture();
  const sourceBefore = await f.t.run((ctx) => ctx.db.get(f.secondSourceId));
  await f.second.mutation(api.analysisVersions.sharedFrame, {
    sourceId: f.secondSourceId,
    versionId: f.shared.version._id,
    frameId: "frame-1",
  });
  expect(await f.t.run((ctx) => ctx.db.get(f.secondSourceId))).toEqual(
    sourceBefore,
  );
  const billing = (await f.t.run((ctx) => ctx.db.get(f.billingId)))!;
  // No expiry callback or billing write runs. A query result from before the
  // deadline cannot be used for the final uncached authorization check.
  vi.setSystemTime(billing.periodEnd + 1);
  await expect(
    f.second.mutation(api.analysisVersions.sharedFrame, {
      sourceId: f.secondSourceId,
      versionId: f.shared.version._id,
      frameId: "frame-1",
    }),
  ).rejects.toThrow(/FORBIDDEN/);
});

it("reanalyzes shared evidence into a private candidate without mutating the catalog or copying screenshots", async () => {
  const f = await sharedFixture();
  const request = await f.secondAssistant.mutation(
    api.analysisVersions.request,
    {
      sourceId: f.secondSourceId,
      expectedSelectionRevision: 0,
      key: "second-private-candidate",
      configuration: f.config,
    },
  );
  const claim = await f.secondAssistant.mutation(
    internal.analysisVersions.dispatch,
    {
      sourceId: f.secondSourceId,
      attemptId: request.attemptId,
      taskId: "second-private-analysis",
      operation: "claim",
    },
  );
  const lease = {
    sourceId: f.secondSourceId,
    attemptId: request.attemptId,
    taskId: "second-private-analysis",
    leaseToken: claim.leaseToken,
  };
  const input = await f.secondAssistant.query(
    internal.analysisVersions.input,
    lease,
  );
  expect(input.evidenceId).toBe(f.shared.evidence._id);
  expect(input.transcript).toHaveLength(1);
  expect(input.observations[0].kind).toBe("video_observation");
  await f.secondAssistant.mutation(internal.analysisVersions.acknowledgeFrame, {
    ...lease,
    frameId: "frame-1",
  });
  const completed = await f.secondAssistant.mutation(
    internal.analysisVersions.dispatch,
    {
      ...lease,
      operation: "complete",
      output: {
        schemaVersion: "analysis-version-output-v1",
        sourceId: f.secondSourceId,
        attemptId: request.attemptId,
        evidenceHash: input.evidenceHash,
        postRevisionHash: input.postRevisionHash,
        summary: "A private second-reader candidate",
        warnings: [],
        insights: f.output.insights,
      },
    },
  );
  expect(completed.versionId).toBeDefined();
  expect(f.network).not.toHaveBeenCalled();
  await f.second.mutation(api.analysisVersions.select, {
    sourceId: f.secondSourceId,
    versionId: completed.versionId!,
    expectedSelectionRevision: 0,
  });
  expect(
    (await f.second.query(api.product.detail, { id: f.secondSourceId }))
      .analysis.summary,
  ).toBe("A private second-reader candidate");
  await f.second.mutation(api.analysisVersions.followRecommendation, {
    sourceId: f.secondSourceId,
    expectedSelectionRevision: 1,
  });
  expect(
    (await f.second.query(api.product.detail, { id: f.secondSourceId }))
      .analysis.summary,
  ).toBe(f.shared.output.summary);
  expect(
    (await f.t.run((ctx) => currentCloudArtifact(ctx, f.shared.artifact._id)))
      .family.selectionRevision,
  ).toBe(1);
});
