import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import { analysisVersionFixture } from "./analysis-version-fixture";
import { recordAutomaticCatalogIntent } from "../convex/lib/catalogPolicy";
import {
  catalogPermission,
  currentCloudArtifact,
  reserveCatalogProducer,
} from "../convex/lib/cloudCatalog";
import { requireProCatalogAccess } from "../convex/lib/catalogEntitlement";
import { socialHash } from "../packages/social/contracts";
import { canonicalJson } from "../packages/contracts/canonical-json.mjs";
import { persistCloudResult } from "../convex/lib/persistCloudResult";
import {
  freezeAnalysisBaseline,
  retainedVersion,
  verifyRetainedAssets,
} from "../convex/lib/analysisHistory";

vi.mock("../packages/providers/storage", () => ({
  signedObject: (key: string) =>
    `https://storage.example.test/${encodeURIComponent(key)}`,
}));
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function setup() {
  const f = await analysisVersionFixture();
  const now = Date.now();
  const operatorSubject = "user_09234567890123456789012345";
  await f.t.mutation(internal.accounts.syncUser, {
    subject: operatorSubject,
    email: "operator@example.test",
    name: "Synthetic operator",
    verified: true,
  });
  const operator = f.t.withIdentity({ subject: operatorSubject });
  const serviceOrg = await operator.mutation(api.organizations.create, {
    name: "Synthetic independent catalog",
  });
  const configuration = {
    version: "cloud-catalog-config-v2",
    serviceOrganizationId: serviceOrg,
    maximumStorageBytes: 20_000_000,
    reviewedAt: now - 5000,
    expiresAt: now + 8 * 86400000,
    permissions: [],
    defaultPolicy: {
      version: "automatic-neutral-catalog-v1",
      id: "synthetic-standing-policy",
      disclosureVersion: "synthetic-catalog-notice",
      rightsBasis: "user_attested",
      platforms: ["instagram", "tiktok"],
      providerPermissionReference: "synthetic permitted public-source route",
      contentPermissionReference:
        "synthetic user declaration, not a verified licence",
      privacyReviewReference: "synthetic neutral-only disclosure",
      reviewedAt: now - 5000,
      expiresAt: now + 8 * 86400000,
      maximumRetentionMs: 7 * 86400000,
    },
  };
  vi.stubEnv("CLOUD_CATALOG_ENABLED", "true");
  vi.stubEnv("CLOUD_CATALOG_VERIFIED", "true");
  vi.stubEnv("CLOUD_CATALOG_CONFIGURATION_JSON", JSON.stringify(configuration));
  const original = (await f.t.run((ctx) => ctx.db.get(f.sourceId)))!;
  const actorId = original.personalAnalysis!.actor;
  const subject = (await f.t.run((ctx) => ctx.db.get(actorId)))!.subject;
  await f.t.mutation(internal.accounts.syncUser, {
    subject,
    email: "owner@example.test",
    name: "Version owner",
    verified: true,
  });
  const network = vi.fn(async (_url: string, init?: RequestInit) =>
    init?.method === "PUT"
      ? new Response(null, { status: 200 })
      : new Response(f.bytes, { headers: { "content-type": "image/jpeg" } }),
  );
  vi.stubGlobal("fetch", network);
  const captureNewCompletion = async () => {
    const completionHash = await socialHash(
      canonicalJson({
        output: f.output,
        syntheticAcknowledgedCompletion: true,
      }),
    );
    await f.t.run(async (ctx) => {
      const source = (await ctx.db.get(f.sourceId))!,
        actor = (await ctx.db.get(actorId))!;
      await recordAutomaticCatalogIntent(ctx, source, actor);
      const job = source.personalAnalysis!;
      if (job.executor !== "work_cloud")
        throw Error("Synthetic Cloud fixture required");
      await ctx.db.patch(source._id, {
        personalAnalysis: {
          ...job,
          approvedAt: now,
          cloud: { ...job.cloud, completionHash },
        },
        linkPreview: {
          state: "ready",
          origin: "extractor",
          title: "Native public title",
          authorName: "Public creator",
          updatedAt: now,
        },
      });
    });
  };
  const alpha = (subjects: string[]) =>
    vi.stubEnv(
      "CLOUD_CATALOG_ALPHA_ACCESS_JSON",
      JSON.stringify({
        version: "catalog-operator-alpha-access-v1",
        subjects,
        reviewedAt: now - 1000,
        expiresAt: now + 86400000,
        reviewReference: "synthetic finite operator test grant",
      }),
    );
  return {
    ...f,
    now,
    serviceOrg,
    actorId,
    subject,
    configuration,
    network,
    captureNewCompletion,
    alpha,
  };
}

it("publishes a new authenticated first completion without a per-post dialog or a second model run", async () => {
  const s = await setup();
  expect(
    await s.t.mutation(internal.cloudCatalog.prepareAutomatic, {
      sourceId: s.sourceId,
      actorId: s.actorId,
      generation: 1,
    }),
  ).toBeNull();
  await s.captureNewCompletion();
  const result = await s.t.action(
    internal.cloudCatalogActions.publishCompleted,
    { sourceId: s.sourceId, actorId: s.actorId, generation: 1 },
  );
  expect(result.state).toBe("published");
  if (!("contributionId" in result))
    throw Error("Expected a published contribution");
  const contribution = (await s.t.run((ctx) =>
    ctx.db.get(result.contributionId),
  ))!;
  const shared = await s.t.run((ctx) =>
    currentCloudArtifact(ctx, contribution.artifactId),
  );
  expect(shared.family.selectedArtifactId).toBe(shared.artifact._id);
  expect(shared.family.selectionBasis).toBe("first_eligible");
  expect(shared.artifact.authority.settingsProviderAttested).toBe(false);
  expect(shared.artifact.postMetadata?.title).toBe("Native public title");
  expect(contribution.automaticPolicyHash).toMatch(/^[a-f0-9]{64}$/);
  const source = (await s.t.run((ctx) => ctx.db.get(s.sourceId)))!;
  const baseline = (await s.t.run((ctx) =>
    ctx.db.get(source.selectedAnalysisVersionId!),
  ))!;
  expect(baseline.sourceCompletion?.completionHash).toMatch(/^[a-f0-9]{64}$/);
  expect(baseline.provenance).toBe("authenticated_host_reported");
  expect(source.catalogStatus?.state).toBe("published");
  expect(source.analysis).toEqual(s.output);
  expect(source.generation).toBe(1);
  expect(s.network).toHaveBeenCalledTimes(2);
  const again = await s.t.action(
    internal.cloudCatalogActions.publishCompleted,
    { sourceId: s.sourceId, actorId: s.actorId, generation: 1 },
  );
  if (!("contributionId" in again))
    throw Error("Expected the existing contribution");
  expect(again.contributionId).toBe(result.contributionId);
  expect(s.network).toHaveBeenCalledTimes(2);
});

it("serves a separate-account cache association with an explicit alpha entitlement and no fake payment", async () => {
  const s = await setup();
  await s.captureNewCompletion();
  const result = await s.t.action(
    internal.cloudCatalogActions.publishCompleted,
    { sourceId: s.sourceId, actorId: s.actorId, generation: 1 },
  );
  expect(result.state).toBe("published");
  const subject = "user_08234567890123456789012345";
  await s.t.mutation(internal.accounts.syncUser, {
    subject,
    email: "second@example.test",
    name: "Synthetic independent reader",
    verified: true,
  });
  const second = s.t.withIdentity({ subject });
  const organizationId = await second.mutation(
    api.organizations.createPrivate,
    {},
  );
  await expect(
    s.t.run((ctx) => requireProCatalogAccess(ctx, organizationId)),
  ).rejects.toThrow(/FORBIDDEN/);
  s.alpha([subject]);
  const calls = s.network.mock.calls.length;
  const id = await second.mutation(api.product.capture, {
    organizationId,
    key: "automatic-shared-cache",
    kind: "url",
    title: "Imported video link",
    url: s.prepared.post.canonical,
    rightsAttested: true,
  });
  const source = (await s.t.run((ctx) => ctx.db.get(id)))!;
  expect(source.state).toBe("ready");
  expect(source.generation).toBe(0);
  expect(source.personalAnalysis).toBeUndefined();
  expect(source.publicImportId).toBeTruthy();
  expect(source.linkPreview?.title).toBe("Native public title");
  const detail = await second.query(api.product.detail, { organizationId, id });
  expect(detail.analysis.summary).toBe(s.output.summary);
  const recent = await second.query(api.posts.recent, { organizationId });
  expect(
    recent.items[0].thumbnailAssetIds.some((id) => id.startsWith("catalog~")),
  ).toBe(true);
  expect(s.network).toHaveBeenCalledTimes(calls);
  expect(
    await s.t.run((ctx) =>
      ctx.db
        .query("billing")
        .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
        .unique(),
    ),
  ).toBeNull();
});

it("derives stable per-post authority from an honest standing policy and rejects retrospective or mismatched requests", async () => {
  const s = await setup();
  const a = await s.t.run((ctx) =>
    catalogPermission(ctx, s.prepared.post.canonical),
  );
  expect(a.permission.rightsBasis).toBe("user_attested");
  expect(a.permission.id).toMatch(/^default_/);
  expect(
    (await s.t.run((ctx) => catalogPermission(ctx, s.prepared.post.canonical)))
      .permissionHash,
  ).toBe(a.permissionHash);
  await s.captureNewCompletion();
  await s.t.run((ctx) =>
    ctx.db.patch(s.sourceId, {
      catalogPolicy: {
        version: "automatic-neutral-catalog-v1",
        policyHash: "0".repeat(64),
        disclosureVersion: "synthetic-catalog-notice",
        actor: s.actorId,
        requestedAt: s.now,
      },
    }),
  );
  await expect(
    s.t.mutation(internal.cloudCatalog.prepareAutomatic, {
      sourceId: s.sourceId,
      actorId: s.actorId,
      generation: 1,
    }),
  ).rejects.toThrow(/POLICY_BLOCKED/);
  expect(s.network).not.toHaveBeenCalled();
});

it("records an uncertain shared copy without losing private results or automatically repeating storage I/O", async () => {
  const s = await setup();
  await s.captureNewCompletion();
  const before = (await s.t.run((ctx) => ctx.db.get(s.sourceId)))!;
  s.network.mockResolvedValue(new Response(null, { status: 503 }));
  const result = await s.t.action(
    internal.cloudCatalogActions.publishCompleted,
    { sourceId: s.sourceId, actorId: s.actorId, generation: 1 },
  );
  expect(result.state).toBe("unknown");
  const after = (await s.t.run((ctx) => ctx.db.get(s.sourceId)))!;
  expect(after.state).toBe("ready");
  expect(after.analysis).toEqual(before.analysis);
  expect(after.personalAnalysis).toEqual(before.personalAnalysis);
  expect(after.catalogStatus?.state).toBe("unknown");
  const calls = s.network.mock.calls.length;
  const retry = await s.t.action(
    internal.cloudCatalogActions.publishCompleted,
    { sourceId: s.sourceId, actorId: s.actorId, generation: 1 },
  );
  expect(retry.state).toBe("unknown");
  expect(s.network).toHaveBeenCalledTimes(calls);
});

it("coalesces another account's save behind one producer and attaches the completed result without another job", async () => {
  const s = await setup();
  await s.captureNewCompletion();
  const reserved = await s.t.run(async (ctx) => {
    const source = (await ctx.db.get(s.sourceId))!,
      actor = (await ctx.db.get(s.actorId))!;
    return reserveCatalogProducer(
      ctx,
      source,
      actor,
      await catalogPermission(ctx, source.canonical),
      "synthetic-producer",
      s.now + 86400000,
      s.now + 7 * 86400000,
    );
  });
  const subject = "user_07234567890123456789012345";
  await s.t.mutation(internal.accounts.syncUser, {
    subject,
    email: "waiting@example.test",
    name: "Synthetic waiting reader",
    verified: true,
  });
  s.alpha([subject]);
  const second = s.t.withIdentity({ subject });
  const organizationId = await second.mutation(
    api.organizations.createPrivate,
    {},
  );
  const id = await second.mutation(api.product.capture, {
    organizationId,
    key: "wait-for-one-producer",
    kind: "url",
    title: "Imported video link",
    url: s.prepared.post.canonical,
    rightsAttested: true,
  });
  const pending = (await s.t.run((ctx) => ctx.db.get(id)))!;
  expect(pending.catalogWait?.familyId).toBe(reserved.familyId);
  expect(pending.generation).toBe(0);
  expect(pending.personalAnalysis).toBeUndefined();
  expect(pending.workCloudSaveIntent).toBeUndefined();
  expect(s.network).not.toHaveBeenCalled();
  const published = await s.t.action(
    internal.cloudCatalogActions.publishCompleted,
    { sourceId: s.sourceId, actorId: s.actorId, generation: 1 },
  );
  expect(published.state).toBe("published");
  await s.t.mutation(internal.cloudCatalog.fulfillWaiters, {
    familyId: reserved.familyId,
  });
  const ready = (await s.t.run((ctx) => ctx.db.get(id)))!;
  expect(ready.state).toBe("ready");
  expect(ready.catalogWait).toBeUndefined();
  expect(ready.personalAnalysis).toBeUndefined();
  expect(ready.publicImportId).toBeTruthy();
  const family = (await s.t.run((ctx) => ctx.db.get(reserved.familyId)))!;
  expect(family.producer).toBeUndefined();
  expect(family.waiters).toEqual([]);
  expect(s.network).toHaveBeenCalledTimes(2);
});

it("keeps acknowledged results and shared JPEGs beyond the processing window while explicit withdrawal still erases them", async () => {
  const s = await setup();
  vi.stubEnv(
    "CLOUD_CATALOG_CONFIGURATION_JSON",
    JSON.stringify({
      ...s.configuration,
      defaultPolicy: {
        ...s.configuration.defaultPolicy,
        resultRetention: "until_deleted",
      },
    }),
  );
  await s.captureNewCompletion();
  const baseline = await s.t.run(async (ctx) => {
    await persistCloudResult(ctx, (await ctx.db.get(s.sourceId))!);
    return freezeAnalysisBaseline(ctx, (await ctx.db.get(s.sourceId))!, true);
  });
  const result = await s.t.action(
    internal.cloudCatalogActions.publishCompleted,
    { sourceId: s.sourceId, actorId: s.actorId, generation: 1 },
  );
  if (!("contributionId" in result))
    throw Error("Expected a published contribution");
  const contribution = (await s.t.run((ctx) =>
    ctx.db.get(result.contributionId),
  ))!;
  const originalSource = (await s.t.run((ctx) => ctx.db.get(s.sourceId)))!;
  vi.setSystemTime(s.now + 7.5 * 86400000);
  await s.t.mutation(internal.workCloudAnalysis.expire, {
    sourceId: s.sourceId,
    organizationId: originalSource.organizationId,
    generation: 1,
    retainUntil: s.now + 7 * 86400000,
  });
  await s.t.mutation(internal.analysisVersions.expireEvidence, {
    evidenceId: baseline.evidenceId,
  });
  await s.t.mutation(internal.cloudCatalog.expireArtifact, {
    artifactId: contribution.artifactId,
  });
  const shared = await s.t.run((ctx) =>
    currentCloudArtifact(ctx, contribution.artifactId),
  );
  expect(shared.artifact.resultRetention).toBe("until_deleted");
  const preserved = (await s.t.run((ctx) => ctx.db.get(s.sourceId)))!;
  expect(preserved.analysis).toEqual(s.output);
  expect(preserved.sourceRetentionUntil).toBeUndefined();
  const retained = await s.t.run((ctx) =>
    retainedVersion(ctx, preserved, baseline._id),
  );
  await s.t.run((ctx) =>
    verifyRetainedAssets(ctx, preserved, retained.evidence),
  );
  for (const frame of retained.evidence.frames)
    if (frame.assetId) {
      await s.t.mutation(internal.assets.expireAsset, { id: frame.assetId });
      expect((await s.t.run((ctx) => ctx.db.get(frame.assetId!)))!.state).toBe(
        "complete",
      );
    }
  expect(preserved.personalAnalysis).toEqual(originalSource.personalAnalysis);
  const nextReview = s.now + 9 * 86400000;
  vi.setSystemTime(nextReview);
  vi.stubEnv(
    "CLOUD_CATALOG_CONFIGURATION_JSON",
    JSON.stringify({
      ...s.configuration,
      reviewedAt: nextReview,
      expiresAt: nextReview + 86400000,
      defaultPolicy: {
        ...s.configuration.defaultPolicy,
        resultRetention: "until_deleted",
        reviewedAt: nextReview,
        expiresAt: nextReview + 86400000,
      },
    }),
  );
  expect(
    (await s.t.run((ctx) => currentCloudArtifact(ctx, contribution.artifactId)))
      .artifact._id,
  ).toBe(shared.artifact._id);
  await expect(
    s.request("durable-reanalysis-after-original-window"),
  ).rejects.toThrow(/SETUP_REQUIRED/);
  await s.assistant.mutation(internal.assistantEvents.install, {
    eventName: "work_cloud_waiting",
    profileId: s.org,
    grantVersion: s.grant.version,
    externalId: "sub_" + "a".repeat(64),
    ciphertext: "synthetic-renewed-authority",
    keyVersion: "1",
    expiresAt: Date.now() + 600000,
    callbackVerifiedAt: Date.now(),
  });
  const retry = await s.request("durable-reanalysis-after-original-window");
  const attempt = (await s.t.run((ctx) => ctx.db.get(retry.attemptId)))!;
  expect(attempt.expiresAt).toBeGreaterThan(nextReview);
  expect(attempt.expiresAt).toBeLessThanOrEqual(nextReview + 86400000);
  expect(attempt.leaseUntil).toBe(0);
  await s.t.run(async (ctx) => {
    const { retireCloudArtifact } =
      await import("../convex/lib/cloudCatalogRetention");
    await retireCloudArtifact(ctx, contribution.artifactId);
  });
  await expect(
    s.t.run((ctx) => currentCloudArtifact(ctx, contribution.artifactId)),
  ).rejects.toThrow(/SOURCE_UNAVAILABLE/);
  expect(
    (await s.t.run((ctx) => ctx.db.get(shared.evidence._id)))!.frames,
  ).toEqual([]);
});
