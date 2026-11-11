import { afterEach, expect, it, vi } from "vitest";
import {
  cloudCatalogAuthority,
  cloudCatalogConsent,
  currentCloudCatalogPermission,
  projectNeutralCloudVersion,
  neutralCloudAnalysis,
  neutralCloudEvidence,
  cloudCatalogFamilyKey,
} from "../packages/contracts/cloud-catalog";
import { reusableEvidenceIdentity } from "../packages/contracts/analysis-versions";
import { socialHash } from "../packages/social/contracts";
import { analysisVersionFixture } from "./analysis-version-fixture";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
async function example() {
  const f = await analysisVersionFixture();
  const output = {
    schemaVersion: "analysis-version-output-v1",
    sourceId: f.sourceId,
    attemptId: "private-attempt-id",
    evidenceHash: await socialHash(reusableEvidenceIdentity(f.prepared)),
    postRevisionHash: f.prepared.post.revisionHash,
    summary: f.output.summary,
    warnings: [],
    insights: f.output.insights,
  };
  return {
    ...f,
    versionOutput: output,
    binding: { sourceId: f.sourceId, attemptId: output.attemptId },
  };
}
const permission = (now: number) => ({
  version: "cloud-catalog-permission-v1",
  id: "reviewed-post-one",
  canonical: "https://www.instagram.com/p/Abcdef12345/",
  platform: "instagram",
  providerPermissionReference: "synthetic provider review",
  contentPermissionReference: "synthetic owner license",
  privacyReviewReference: "synthetic privacy review",
  rightsBasis: "owner_created",
  route: "own_subscription",
  transcriptReuse: true,
  screenshotReuse: true,
  neutralAnalysisReuse: true,
  crossCustomerReuse: true,
  reviewedAt: now - 1000,
  expiresAt: now + 100000,
  maximumRetentionMs: 604800000,
});

it("projects only neutral evidence and output, without producer source, task, attempt or lease identities", async () => {
  const f = await example();
  const projected = await projectNeutralCloudVersion(
    f.prepared,
    f.versionOutput,
    "en",
    f.binding,
  );
  const serialized = JSON.stringify(projected);
  expect(serialized).not.toContain(f.sourceId);
  expect(serialized).not.toContain(f.versionOutput.attemptId);
  expect(serialized).not.toContain(f.prepared.post.taskId);
  expect(serialized).not.toContain(f.prepared.post.inputHash);
  expect(projected.analysis.insights).toEqual(f.output.insights);
  expect(projected.evidence.frames).toEqual(f.prepared.post.frames);
  expect(
    neutralCloudAnalysis.safeParse({
      ...projected.analysis,
      sourceId: f.sourceId,
    }).success,
  ).toBe(false);
  expect(
    neutralCloudEvidence.safeParse({ ...projected.evidence, taskId: "private" })
      .success,
  ).toBe(false);
});
it("rejects a legacy private output, wrong producer binding, altered speech or an invented citation", async () => {
  const f = await example();
  await expect(
    projectNeutralCloudVersion(f.prepared, f.output, "en", f.binding),
  ).rejects.toThrow();
  await expect(
    projectNeutralCloudVersion(f.prepared, f.versionOutput, "en", {
      ...f.binding,
      sourceId: "other-source",
    }),
  ).rejects.toThrow(/BINDING/);
  const changed = structuredClone(f.prepared);
  changed.post.segments[0].text = "Unbound replacement speech";
  await expect(
    projectNeutralCloudVersion(changed, f.versionOutput, "en", f.binding),
  ).rejects.toThrow();
  const output = structuredClone(f.versionOutput);
  output.insights[0].evidence[0].id = "not-observed";
  await expect(
    projectNeutralCloudVersion(f.prepared, output, "en", f.binding),
  ).rejects.toThrow(/CITATION/);
});
it("requires current reviewed provider and content reuse permission for this exact canonical post", () => {
  const now = Date.now(),
    p = permission(now);
  expect(
    currentCloudCatalogPermission(
      p,
      "https://www.instagram.com/reel/Abcdef12345/",
      now,
    ).id,
  ).toBe(p.id);
  for (const field of [
    "crossCustomerReuse",
    "transcriptReuse",
    "screenshotReuse",
    "neutralAnalysisReuse",
  ] as const)
    expect(() =>
      currentCloudCatalogPermission({ ...p, [field]: false }, p.canonical, now),
    ).toThrow();
  expect(() =>
    currentCloudCatalogPermission(
      { ...p, reviewedAt: now + 1 },
      p.canonical,
      now,
    ),
  ).toThrow(/UNAVAILABLE/);
  expect(() =>
    currentCloudCatalogPermission({ ...p, expiresAt: now }, p.canonical, now),
  ).toThrow(/UNAVAILABLE/);
  expect(() =>
    currentCloudCatalogPermission(
      p,
      "https://www.instagram.com/reel/Different123/",
      now,
    ),
  ).toThrow(/UNAVAILABLE/);
  expect(() =>
    currentCloudCatalogPermission(
      { ...p, providerPermissionReference: "" },
      p.canonical,
      now,
    ),
  ).toThrow();
});
it("does not let exact contribution consent turn into blanket connection or future-version authority", () => {
  const value = {
    version: "cloud-catalog-contribution-v1",
    analysisVersionId: "version-one",
    evidenceHash: "a".repeat(64),
    outputHash: "b".repeat(64),
    permissionHash: "c".repeat(64),
    shareTranscript: true,
    shareScreenshots: true,
    shareNeutralAnalysis: true,
    retainIndependentlyOfPersonalSave: true,
    retainUntil: Date.now() + 1000,
  };
  expect(cloudCatalogConsent.safeParse(value).success).toBe(true);
  expect(
    cloudCatalogConsent.safeParse({ ...value, allFuturePosts: true }).success,
  ).toBe(false);
  expect(
    cloudCatalogConsent.safeParse({
      ...value,
      retainIndependentlyOfPersonalSave: false,
    }).success,
  ).toBe(false);
});
it("keeps subscription authority distinct from managed receipts and provider model attestation", () => {
  const now = Date.now();
  const a = {
    version: "cloud-neutral-catalog-authority-v1",
    funding: "own_subscription",
    maxApiUsd: 0,
    provenance: "authenticated_host_reported",
    canonical: permission(now).canonical,
    evidenceHash: "a".repeat(64),
    outputHash: "b".repeat(64),
    recipeHash: "c".repeat(64),
    permissionId: "reviewed-post-one",
    permissionHash: "d".repeat(64),
    consentHash: "e".repeat(64),
    contributedAt: now,
    retainUntil: now + 1000,
    requestedModel: "synthetic-model",
    requestedEffort: "high",
    reportedModel: null,
    reportedEffort: null,
    settingsProviderAttested: false,
  };
  expect(cloudCatalogAuthority.safeParse(a).success).toBe(true);
  for (const extra of [
    { funding: "managed_api" },
    { settingsProviderAttested: true },
    { maxApiUsd: 1 },
    { managedProviderReceipt: "invented" },
  ])
    expect(cloudCatalogAuthority.safeParse({ ...a, ...extra }).success).toBe(
      false,
    );
});
it("keys a family by exact canonical, language and reviewed permission, independently of producer and model identity", async () => {
  const canonical = permission(Date.now()).canonical;
  const original = await cloudCatalogFamilyKey(
    canonical,
    "en",
    "reviewed-post-one",
  );
  expect(
    await cloudCatalogFamilyKey(canonical, "en", "reviewed-post-one"),
  ).toBe(original);
  expect(
    await cloudCatalogFamilyKey(canonical, "nl", "reviewed-post-one"),
  ).not.toBe(original);
  expect(
    await cloudCatalogFamilyKey(canonical, "en", "another-permission"),
  ).not.toBe(original);
});
