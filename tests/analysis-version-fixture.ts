import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { vi } from "vitest";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { canonicalJson } from "../packages/contracts/canonical-json.mjs";
import {
  orderedRevisionHash,
  socialHash,
  privateCloudMediaIdentity,
} from "../packages/social/contracts";
import { syntheticJpeg } from "./cloud-frame-fixture";
import { createHash } from "node:crypto";

const modules = import.meta.glob("../convex/**/*.ts");
export async function analysisVersionFixture() {
  const subject = "user_01234567890123456789012345",
    clientId = "client_01234567890123456789012345";
  const scopes = [
    "analysis:request",
    "analysis:execute",
    "knowledge:read",
    "jobs:read",
  ];
  for (const key of [
    "MCP_ENABLED",
    "WORK_CLOUD_MEDIA_ENABLED",
    "WORK_CLOUD_MEDIA_VERIFIED",
  ])
    vi.stubEnv(key, "true");
  vi.stubEnv("PERSONAL_ALPHA_SUBJECTS_JSON", JSON.stringify([subject]));
  vi.stubEnv(
    "MCP_CLIENTS",
    JSON.stringify([{ id: clientId, name: "Synthetic version tests", scopes }]),
  );
  vi.stubEnv("MCP_AUTH_ISSUER", "https://fixture.authkit.app");
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  await t.mutation(internal.accounts.syncUser, {
    subject,
    email: "owner@example.test",
    name: "Version owner",
  });
  const owner = t.withIdentity({
    subject,
    auth_time: Math.floor(Date.now() / 1000),
  });
  const assistant = t.withIdentity({
    subject,
    issuer: "https://fixture.authkit.app",
    client_id: clientId,
    scope: scopes.join(" "),
    sid: "app_consent_01234567890123456789012345",
  });
  const org = await owner.mutation(api.organizations.createPrivate, {});
  const canonical = privateCloudMediaIdentity(
    "https://www.instagram.com/reel/Abcdef12345/",
  ).url;
  const sourceId = await owner.mutation(api.product.capture, {
    organizationId: org,
    key: "version-original-post",
    kind: "url",
    url: canonical,
    title: "Original retained post",
    rightsAttested: true,
  });
  const grant = await owner.mutation(api.assistantGrants.save, {
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
  const now = Date.now(),
    retainUntil = now + 7 * 86400000;
  const bytes = Uint8Array.from(atob(syntheticJpeg), (c) => c.charCodeAt(0));
  const sha = createHash("sha256").update(bytes).digest("hex");
  const text = "Check the evidence before acting.";
  const post = {
    schemaVersion: "work-cloud-observed-media-v1" as const,
    provenance: "authenticated_host_reported" as const,
    canonical,
    platform: "instagram" as const,
    publishedAt: null,
    dateReliability: "unknown" as const,
    observedAt: now - 1000,
    caption: "",
    captionHash: await socialHash(""),
    assets: [
      {
        id: "observed-video",
        index: 0,
        kind: "video" as const,
        contentHash: "a".repeat(64),
        bytes: 100000,
        width: 2,
        height: 2,
        mime: "video/mp4" as const,
        durationMs: 10000,
        inspected: true,
        audioInspected: true,
      },
    ],
    expectedAssetCount: null,
    coverage: "partial" as const,
    revisionHash: "0".repeat(64),
    inputHash: "a".repeat(64),
    policyHash: "b".repeat(64),
    toolchainHash: "c".repeat(64),
    taskId: "original-extraction-task",
    retainUntil,
    rawMediaDeleteBy: now - 1000 + 86400000,
    providerRetention: "unknown" as const,
    frames: [
      {
        id: "frame-1",
        timestampMs: 0,
        sha256: sha,
        bytes: bytes.length,
        width: 2,
        height: 2,
      },
    ],
    audio: {
      sha256: "d".repeat(64),
      bytes: 100000,
      outcome: "transcribed" as const,
    },
    segments: [
      {
        id: "speech-1",
        startMs: 0,
        endMs: 1000,
        text,
        textHash: await socialHash(text),
      },
    ],
  };
  post.revisionHash = await orderedRevisionHash(post);
  const evidence = [
    {
      kind: "video_observation" as const,
      id: "speech-1",
      postRevisionHash: post.revisionHash,
      assetId: "observed-video",
      assetIndex: 0,
      text,
      textHash: await socialHash(text),
      startMs: 0,
      endMs: 1000,
      basis: "transcript" as const,
      uncertainty: "",
    },
  ];
  const prepared = {
    schemaVersion: "ordered-media-v1" as const,
    post,
    evidence,
  };
  const preparationHash = await socialHash(canonicalJson(prepared));
  const insight = {
    id: "point_1",
    kind: "lesson" as const,
    title: "Check evidence",
    claim: text,
    interpretation: "Verify the claim.",
    categories: ["coding" as const],
    confidence: "supported" as const,
    verificationNeeds: [],
    evidence: [
      {
        kind: "video_observation" as const,
        id: "speech-1",
        startMs: 0,
        endMs: 1000,
      },
    ],
  };
  const output = {
    schemaVersion: "3.0.0",
    sourceId,
    processingRunId: `${sourceId}:1`,
    postRevisionHash: post.revisionHash,
    coverage: "ordered_media",
    summary: "Original cited analysis",
    warnings: [],
    insights: [insight],
  };
  const assetId = await t.run(async (ctx) => {
    const source = (await ctx.db.get(sourceId))!;
    const assetId = await ctx.db.insert("assets", {
      organizationId: org,
      sourceId,
      sourceGeneration: 1,
      key: `${org}/original-frame`,
      size: bytes.length,
      type: "image/jpeg",
      state: "complete",
      kind: "work_cloud_frame",
      expiresAt: retainUntil,
      createdAt: now,
      updatedAt: now,
    });
    const actor = await ctx.db
      .query("users")
      .withIndex("by_subject", (q) => q.eq("subject", subject))
      .unique();
    await ctx.db.patch(sourceId, {
      generation: 1,
      state: "ready",
      analysis: output,
      summary: output.summary,
      orderedMedia: prepared,
      sourceRetentionUntil: retainUntil,
      personalAnalysis: {
        executor: "work_cloud",
        actor: actor!._id,
        generation: 1,
        model: "synthetic-model",
        effort: "high",
        state: "completed",
        approvedAt: now - 3000,
        expiresAt: now + 900000,
        leaseUntil: 0,
        deadline: now + 900000,
        cloud: {
          schemaVersion: "work-cloud-media-v3",
          grantId: grant.id,
          grantVersion: grant.version,
          clientId,
          selectedGeneration: 0,
          selectedRevision: source.updatedAt,
          inputHash: post.inputHash,
          policyHash: post.policyHash,
          funding: "own_subscription",
          maxApiUsd: 0,
          taskId: post.taskId,
          claimedAt: now - 2000,
          media: {
            canonicalUrl: canonical,
            toolchainHash: post.toolchainHash,
            retainUntil,
            preparationHash,
          },
        },
      },
      personalMedia: {
        cloudFrames: {
          generation: 1,
          preparationHash,
          frames: [
            {
              frameId: "frame-1",
              assetId,
              sha256: sha,
              size: bytes.length,
              timestampMs: 0,
            },
          ],
        },
      },
    });
    return assetId;
  });
  const config = {
    model: "synthetic-new-model",
    effort: "high" as const,
    useOwnPlan: true as const,
    maxApiUsd: 0 as const,
  };
  return {
    t,
    owner,
    assistant,
    sourceId,
    org,
    assetId,
    bytes,
    prepared,
    output,
    grant,
    config,
    request: (key = "new-analysis-key") =>
      owner.mutation(api.analysisVersions.request, {
        sourceId,
        expectedSelectionRevision: 0,
        key,
        configuration: config,
      }),
  };
}
