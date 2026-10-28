import { vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import { analysisVersionFixture } from "./analysis-version-fixture";

export async function cloudCatalogFixture() {
  const f = await analysisVersionFixture();
  const request = await f.request();
  const claim = await f.assistant.mutation(internal.analysisVersions.dispatch, {
    sourceId: f.sourceId,
    attemptId: request.attemptId,
    taskId: "catalog-fixture-analysis",
    operation: "claim",
  });
  const lease = {
    sourceId: f.sourceId,
    attemptId: request.attemptId,
    taskId: "catalog-fixture-analysis",
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
        summary: "Neutral fixture candidate",
        warnings: [],
        insights: f.output.insights,
      },
    },
  );
  const operatorSubject = "user_02234567890123456789012345";
  await f.t.mutation(internal.accounts.syncUser, {
    subject: operatorSubject,
    email: "operator@example.test",
    name: "Catalog operator",
  });
  const operator = f.t.withIdentity({
    subject: operatorSubject,
    auth_time: Math.floor(Date.now() / 1000),
  });
  const serviceOrg = await operator.mutation(api.organizations.create, {
    name: "Independent catalog service",
  });
  const now = Date.now();
  const configuration = {
    version: "cloud-catalog-config-v1",
    serviceOrganizationId: serviceOrg,
    maximumStorageBytes: 20_000_000,
    reviewedAt: now - 1000,
    expiresAt: now + 86400000,
    permissions: [
      {
        version: "cloud-catalog-permission-v1",
        id: "synthetic-reviewed-post",
        canonical: f.prepared.post.canonical,
        platform: "instagram",
        providerPermissionReference: "synthetic provider review",
        contentPermissionReference: "synthetic content license",
        privacyReviewReference: "synthetic privacy review",
        rightsBasis: "owner_created",
        route: "own_subscription",
        transcriptReuse: true,
        screenshotReuse: true,
        neutralAnalysisReuse: true,
        crossCustomerReuse: true,
        reviewedAt: now - 1000,
        expiresAt: now + 7 * 86400000,
        maximumRetentionMs: 7 * 86400000,
      },
    ],
  };
  vi.stubEnv("CLOUD_CATALOG_ENABLED", "true");
  vi.stubEnv("CLOUD_CATALOG_VERIFIED", "true");
  vi.stubEnv("CLOUD_CATALOG_CONFIGURATION_JSON", JSON.stringify(configuration));
  const versionId = completed.versionId!;
  const preview = await f.owner.query(api.cloudCatalog.preview, {
    sourceId: f.sourceId,
    versionId,
  });
  return {
    ...f,
    versionId,
    serviceOrg,
    operator,
    configuration,
    preview,
    contribute: (key = "catalog-copy-once") =>
      f.owner.action(api.cloudCatalogActions.contribute, {
        sourceId: f.sourceId,
        versionId,
        key,
        consent: preview.consent,
      }),
  };
}
