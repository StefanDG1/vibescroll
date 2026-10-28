import { z } from "zod";
import { canonicalJson } from "./canonical-json.mjs";
import {
  analysisVersionOutput,
  reusableEvidenceIdentity,
  validateVersionOutput,
} from "./analysis-versions";
import { orderedMediaSchema } from "../social/analysis";
import {
  isCloudObservedMedia,
  privateCloudMediaIdentity,
  socialHash,
  validateOrderedEvidence,
} from "../social/contracts";
import { containsSecret } from "../policy/secrets.mjs";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const timestamp = z.number().int().positive();
const language = z.string().regex(/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,2}$/);
const canonical = z
  .string()
  .max(2048)
  .refine((url) => {
    try {
      return privateCloudMediaIdentity(url).url === url;
    } catch {
      return false;
    }
  });

// Reviewed operator evidence is separate from a user's exact contribution.
// No model output, connection grant or public URL can supply this permission.
export const cloudCatalogPermission = z.strictObject({
  version: z.literal("cloud-catalog-permission-v1"),
  id: z.string().regex(/^[A-Za-z0-9_-]{8,100}$/),
  canonical,
  platform: z.enum(["instagram", "tiktok"]),
  providerPermissionReference: z.string().min(1).max(2000),
  contentPermissionReference: z.string().min(1).max(2000),
  privacyReviewReference: z.string().min(1).max(2000),
  rightsBasis: z.enum(["owner_created", "licensed", "public_domain"]),
  route: z.literal("own_subscription"),
  transcriptReuse: z.literal(true),
  screenshotReuse: z.literal(true),
  neutralAnalysisReuse: z.literal(true),
  crossCustomerReuse: z.literal(true),
  reviewedAt: timestamp,
  expiresAt: timestamp,
  maximumRetentionMs: z.number().int().positive().max(31_536_000_000),
});
export type CloudCatalogPermission = z.infer<typeof cloudCatalogPermission>;
export const cloudCatalogConfiguration = z
  .strictObject({
    version: z.literal("cloud-catalog-config-v1"),
    serviceOrganizationId: z.string().min(1).max(100),
    maximumStorageBytes: z.number().int().positive().max(1_000_000_000),
    reviewedAt: timestamp,
    expiresAt: timestamp,
    permissions: z.array(cloudCatalogPermission).max(20),
  })
  .superRefine((value, ctx) => {
    if (
      new Set(value.permissions.map((p) => p.id)).size !==
        value.permissions.length ||
      new Set(value.permissions.map((p) => p.canonical)).size !==
        value.permissions.length
    )
      ctx.addIssue({
        code: "custom",
        message: "Catalog permission identities must be unique.",
      });
  });

export function currentCloudCatalogPermission(
  value: unknown,
  sourceUrl: string,
  now: number,
) {
  const permission = cloudCatalogPermission.parse(value);
  const identity = privateCloudMediaIdentity(sourceUrl);
  if (
    permission.canonical !== identity.url ||
    permission.platform !== identity.platform ||
    permission.reviewedAt > now ||
    permission.expiresAt <= now ||
    containsSecret(canonicalJson(permission))
  )
    throw Error("CLOUD_CATALOG_PERMISSION_UNAVAILABLE");
  return permission;
}

const observation = z.strictObject({
  id: z.string().min(1).max(100),
  assetId: z.string().min(1).max(100),
  assetIndex: z.number().int().nonnegative(),
  text: z.string().max(6000),
  textHash: hash,
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().positive(),
  basis: z.enum(["transcript", "visible"]),
  uncertainty: z.string().max(2000),
});
const frame = z.strictObject({
  id: z.string().min(1).max(100),
  timestampMs: z.number().int().nonnegative(),
  sha256: hash,
  bytes: z.number().int().positive().max(150000),
  width: z.number().int().positive().max(4096),
  height: z.number().int().positive().max(4096),
});
export const neutralCloudEvidence = z.strictObject({
  version: z.literal("neutral-cloud-evidence-v1"),
  canonical,
  platform: z.enum(["instagram", "tiktok"]),
  evidenceHash: hash,
  sourceRevisionHash: hash,
  observedAt: timestamp,
  language,
  durationMs: z.number().int().positive(),
  segments: z
    .array(
      z.strictObject({
        id: z.string().min(1).max(100),
        startMs: z.number().int().nonnegative(),
        endMs: z.number().int().positive(),
        text: z.string().max(6000),
        textHash: hash,
      }),
    )
    .max(240),
  observations: z.array(observation).max(248),
  frames: z.array(frame).min(1).max(8),
});
export const neutralCloudAnalysis = z.strictObject({
  version: z.literal("neutral-cloud-analysis-v1"),
  evidenceHash: hash,
  sourceRevisionHash: hash,
  summary: analysisVersionOutput.shape.summary,
  warnings: analysisVersionOutput.shape.warnings,
  insights: analysisVersionOutput.shape.insights,
});

/** Citation records for this neutral protocol, without private acquisition headers. */
export function neutralCloudObservations(value: unknown) {
  const evidence = neutralCloudEvidence.parse(value);
  return evidence.observations.map((observation) => ({
    ...observation,
    kind: "video_observation" as const,
    postRevisionHash: evidence.sourceRevisionHash,
  }));
}
export const cloudCatalogConsent = z.strictObject({
  version: z.literal("cloud-catalog-contribution-v1"),
  analysisVersionId: z.string().min(1).max(100),
  evidenceHash: hash,
  outputHash: hash,
  permissionHash: hash,
  shareTranscript: z.literal(true),
  shareScreenshots: z.literal(true),
  shareNeutralAnalysis: z.literal(true),
  retainIndependentlyOfPersonalSave: z.literal(true),
  retainUntil: timestamp,
});
export const cloudCatalogAssessment = z.strictObject({
  rubric: z.literal("evidence-review-v1"),
  fidelity: z.number().int().min(1).max(5),
  completeness: z.number().int().min(1).max(5),
  citationAccuracy: z.number().int().min(1).max(5),
  uncertainty: z.number().int().min(1).max(5),
  usefulness: z.number().int().min(1).max(5),
  reason: z
    .string()
    .trim()
    .min(10)
    .max(2000)
    .refine((text) => !containsSecret(text)),
});
export const cloudCatalogAuthority = z
  .strictObject({
    version: z.literal("cloud-neutral-catalog-authority-v1"),
    funding: z.literal("own_subscription"),
    maxApiUsd: z.literal(0),
    provenance: z.literal("authenticated_host_reported"),
    canonical,
    evidenceHash: hash,
    outputHash: hash,
    recipeHash: hash,
    permissionId: cloudCatalogPermission.shape.id,
    permissionHash: hash,
    consentHash: hash,
    contributedAt: timestamp,
    retainUntil: timestamp,
    requestedModel: z.string().regex(/^[A-Za-z0-9_.:-]{1,100}$/),
    requestedEffort: z.enum(["low", "medium", "high", "xhigh"]),
    reportedModel: z.string().min(1).max(100).nullable(),
    reportedEffort: z.string().min(1).max(100).nullable(),
    settingsProviderAttested: z.literal(false),
  })
  .superRefine((value, ctx) => {
    if (
      value.retainUntil <= value.contributedAt ||
      containsSecret(canonicalJson(value))
    )
      ctx.addIssue({
        code: "custom",
        message: "Catalog authority timing or sensitive metadata is invalid.",
      });
  });

/** A pure preview projection, never publication or a reuse permission. */
export async function projectNeutralCloudVersion(
  preparedValue: unknown,
  outputValue: unknown,
  languageValue: string,
  binding: { sourceId: string; attemptId: string },
) {
  if (
    preparedValue &&
    typeof preparedValue === "object" &&
    "version" in preparedValue &&
    preparedValue.version === "neutral-cloud-evidence-v1"
  ) {
    const evidence = neutralCloudEvidence.parse(preparedValue);
    if (evidence.language !== languageValue)
      throw Error("CLOUD_CATALOG_LANGUAGE_CHANGED");
    const output = validateVersionOutput(outputValue, {
      ...binding,
      evidenceHash: evidence.evidenceHash,
      postRevisionHash: evidence.sourceRevisionHash,
      evidence: neutralCloudObservations(evidence),
    });
    const analysis = neutralCloudAnalysis.parse({
      version: "neutral-cloud-analysis-v1",
      evidenceHash: evidence.evidenceHash,
      sourceRevisionHash: evidence.sourceRevisionHash,
      summary: output.summary,
      warnings: output.warnings,
      insights: output.insights,
    });
    if (containsSecret(canonicalJson({ evidence, analysis })))
      throw Error("CLOUD_CATALOG_PRIVATE_CONTENT");
    return {
      evidence,
      analysis,
      outputHash: await socialHash(canonicalJson(analysis)),
    };
  }
  const prepared = orderedMediaSchema.parse(preparedValue);
  const validated = await validateOrderedEvidence(
    prepared.post,
    prepared.evidence,
  );
  const post = validated.post;
  if (
    !isCloudObservedMedia(post) ||
    !["instagram", "tiktok"].includes(post.platform)
  )
    throw Error("CLOUD_CATALOG_EVIDENCE_PROTOCOL");
  const evidenceHash = await socialHash(
    reusableEvidenceIdentity({ post, evidence: validated.evidence }),
  );
  const output = validateVersionOutput(outputValue, {
    ...binding,
    evidenceHash,
    postRevisionHash: post.revisionHash,
    evidence: validated.evidence.map((entry) => ({
      ...entry,
      startMs: entry.kind === "video_observation" ? entry.startMs : null,
      endMs: entry.kind === "video_observation" ? entry.endMs : null,
    })),
  });
  const sharedCanonical = post.resolvedCanonical ?? post.canonical;
  const sharedEvidenceHash = await socialHash(
    reusableEvidenceIdentity({
      post: { ...post, canonical: sharedCanonical },
      evidence: validated.evidence,
    }),
  );
  const sharedRevisionHash = await socialHash(
    canonicalJson({
      version: "neutral-cloud-revision-v1",
      canonical: sharedCanonical,
      assets: post.assets,
      captionHash: post.captionHash,
      segments: post.segments,
      frames: post.frames,
    }),
  );
  const evidence = neutralCloudEvidence.parse({
    version: "neutral-cloud-evidence-v1",
    canonical: sharedCanonical,
    platform: post.platform,
    evidenceHash: sharedEvidenceHash,
    sourceRevisionHash: sharedRevisionHash,
    observedAt: post.observedAt,
    language: languageValue,
    durationMs: post.assets.reduce(
      (n, asset) =>
        asset.kind === "video" ? Math.max(n, asset.durationMs) : n,
      0,
    ),
    segments: post.segments,
    observations: validated.evidence.map(
      ({ kind: _kind, postRevisionHash: _revision, ...entry }) => entry,
    ),
    frames: post.frames,
  });
  const analysis = neutralCloudAnalysis.parse({
    version: "neutral-cloud-analysis-v1",
    evidenceHash: sharedEvidenceHash,
    sourceRevisionHash: sharedRevisionHash,
    summary: output.summary,
    warnings: output.warnings,
    insights: output.insights,
  });
  if (containsSecret(canonicalJson({ evidence, analysis })))
    throw Error("CLOUD_CATALOG_PRIVATE_CONTENT");
  return {
    evidence,
    analysis,
    outputHash: await socialHash(canonicalJson(analysis)),
  };
}

export async function cloudCatalogFamilyKey(
  canonicalValue: string,
  languageValue: string,
  permissionId: string,
) {
  return socialHash(
    canonicalJson({
      version: "cloud-neutral-family-v1",
      canonical: canonical.parse(canonicalValue),
      language: language.parse(languageValue),
      permissionId: cloudCatalogPermission.shape.id.parse(permissionId),
    }),
  );
}
