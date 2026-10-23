import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { canonicalJson } from "../../packages/contracts/canonical-json.mjs";
import { processingReceipt } from "../../packages/media/provenance";
import {
  orderedMediaSchema,
  socialCitation,
  validateSocialAnalysis,
} from "../../packages/social/analysis";
import {
  requireSocialRights,
  socialHash,
  socialRightsSchema,
  validateSocialEvidence,
} from "../../packages/social/contracts";
import { neutralSocialContract } from "../../packages/social/prompts";
import { creatorConfiguration } from "./creatorPolicy";
import { hostedSourceAllowed } from "./hostedMediaAccess";
import { sourceRetained } from "./sourceAuthority";
import { publicModerationBlocked } from "./publicModeration";
import {
  orderedDiagnostics,
  emptyOrderedDiagnostics,
} from "../../packages/social/diagnostics";

type ServiceArtifact = Extract<Doc<"publicArtifacts">, { origin: "service" }>;
const batchSize = 5;
const maxBytes = 512 * 1024;
const same = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);

export async function serviceSourceAuthority(
  ctx: QueryCtx,
  source: Doc<"sources"> | null,
  now = Date.now(),
) {
  const config = creatorConfiguration(now);
  if (process.env.CREATOR_SERVICE_REUSE_ENABLED !== "true" || !config)
    throw Error("SERVICE_REUSE_DISABLED");
  const organizationId = ctx.db.normalizeId(
    "organizations",
    process.env.CREATOR_SERVICE_ORGANIZATION_ID ?? "",
  );
  if (
    !organizationId ||
    !source ||
    source.organizationId !== organizationId ||
    source.state === "deleted" ||
    !source.rightsAttested ||
    !sourceRetained(source) ||
    source.publicImportId
  )
    throw Error("SERVICE_SOURCE_UNAVAILABLE");
  const org = await ctx.db.get(organizationId),
    actor = org && (await ctx.db.get(org.createdBy));
  const member =
    org &&
    (await ctx.db
      .query("memberships")
      .withIndex("by_pair", (q) =>
        q.eq("organizationId", organizationId).eq("userId", org.createdBy),
      )
      .unique());
  if (
    !org ||
    org.status !== "active" ||
    actor?.status !== "active" ||
    member?.role !== "owner" ||
    source.managedAnalysisActor !== org.createdBy ||
    !(await hostedSourceAllowed(ctx, source))
  )
    throw Error("SERVICE_FUNDING_OWNER_UNAVAILABLE");
  if (await publicModerationBlocked(ctx, source, org.createdBy))
    throw Error("SERVICE_SOURCE_MODERATED");
  return { source, org, config };
}

// The caller supplies the server-reviewed policy, never an entitlement boolean.
// Discovery revisions and model output are deliberately absent from this key.
export async function serviceCompatibility(
  prepared: unknown,
  language: string,
  rights: unknown,
  now = Date.now(),
  diagnostics: unknown = emptyOrderedDiagnostics,
) {
  const raw = orderedMediaSchema.parse(prepared);
  const media = await validateSocialEvidence(raw.post, raw.evidence);
  const parsedRights = socialRightsSchema.parse(rights);
  const policy = requireSocialRights(
    parsedRights,
    {
      provider: parsedRights.provider,
      platform: media.post.platform,
      creatorId: media.post.creatorId,
      workload: "reuse",
      route: "managed_api",
    },
    now,
  );
  if (
    media.post.providerEvidenceId !== policy.evidenceId ||
    media.post.observedAt > now ||
    media.post.observedAt < policy.reviewedAt
  )
    throw Error("SERVICE_POLICY_BINDING_CHANGED");
  const contract = await neutralSocialContract(language);
  const checkedDiagnostics = orderedDiagnostics.parse(diagnostics);
  const evidenceHash = await socialHash(
    canonicalJson(
      checkedDiagnostics.warnings.length || checkedDiagnostics.omissions.length
        ? { evidence: media.evidence, ...checkedDiagnostics }
        : media.evidence,
    ),
  );
  const rightsHash = await socialHash(canonicalJson(policy));
  const fields = {
    ...contract,
    postRevisionHash: media.post.revisionHash,
    evidenceHash,
    rightsHash,
  };
  return {
    ...fields,
    compatibilityKey: await socialHash(
      canonicalJson({
        version: "service-social-v1",
        platform: media.post.platform,
        creatorId: media.post.creatorId,
        postId: media.post.postId,
        ...fields,
      }),
    ),
  };
}

async function resolveSource(
  ctx: QueryCtx,
  sourceId: Id<"sources">,
  generation: number,
  result: unknown,
  language: string,
) {
  const now = Date.now();
  const { source, org, config } = await serviceSourceAuthority(
    ctx,
    await ctx.db.get(sourceId),
    now,
  );
  const organizationId = org._id;
  if (
    source.state !== "ready" ||
    source.generation !== generation ||
    source.personalAnalysis?.generation === generation ||
    !source.serviceIntent ||
    source.serviceIntent.generation !== generation ||
    source.serviceIntent.schemaVersion !== "service-social-v1"
  )
    throw Error("SERVICE_SOURCE_UNAVAILABLE");
  const validated = await validateSocialAnalysis(result, source.orderedMedia, {
    sourceId,
    generation,
  });
  if (
    !same(source.analysis, validated.analysis) ||
    source.canonical !== validated.prepared.post.canonical
  )
    throw Error("SERVICE_RESULT_CHANGED");
  const compatibility = await serviceCompatibility(
    validated.prepared,
    language,
    config.rights,
    now,
    source.orderedPreparation
      ? {
          warnings: source.orderedPreparation.warnings,
          omissions: source.orderedPreparation.omissions,
        }
      : emptyOrderedDiagnostics,
  );
  if (
    !same(source.serviceIntent, {
      schemaVersion: "service-social-v1",
      generation,
      ...compatibility,
    })
  )
    throw Error("SERVICE_INTENT_CHANGED");
  const receipt = processingReceipt.parse(source.processingReceipt);
  const reservationKey = `source:${sourceId}:${generation}`;
  const reservation = await ctx.db
    .query("reservations")
    .withIndex("by_key", (q) =>
      q.eq("organizationId", organizationId).eq("key", reservationKey),
    )
    .unique();
  if (
    receipt.generation !== generation ||
    receipt.startedAt !== source.processingStartedAt ||
    receipt.completedAt > now ||
    !reservation ||
    reservation.state !== "settled" ||
    reservation.settled !== receipt.chargedCredits ||
    reservation.max < receipt.chargedCredits ||
    reservation.createdAt > receipt.startedAt ||
    reservation.dispatchedAt === undefined ||
    reservation.dispatchedAt < receipt.startedAt ||
    reservation.dispatchedAt > receipt.completedAt ||
    reservation.updatedAt < receipt.completedAt
  )
    throw Error("SERVICE_MANAGED_RECEIPT_UNCONFIRMED");
  const retainUntil = Math.min(
    config.expiresAt,
    config.rights.expiresAt,
    validated.prepared.post.observedAt + config.rights.maxRetentionMs,
    source.sourceRetentionUntil ?? Infinity,
  );
  if (!Number.isSafeInteger(retainUntil) || retainUntil <= now)
    throw Error("SERVICE_RETENTION_EXPIRED");
  return {
    source,
    org,
    validated,
    compatibility,
    reservationKey,
    retainUntil,
    policy: config.rights,
  };
}

export async function serviceArtifactCurrent(
  ctx: QueryCtx,
  artifact: Doc<"publicArtifacts"> | null,
) {
  if (
    !artifact ||
    artifact.origin !== "service" ||
    artifact.state !== "eligible" ||
    !artifact.data ||
    artifact.retainUntil <= Date.now()
  )
    return null;
  try {
    if (new TextEncoder().encode(canonicalJson(artifact)).length > maxBytes)
      return null;
    const resolved = await resolveSource(
      ctx,
      artifact.sourceId,
      artifact.generation,
      artifact.data.analysis,
      artifact.language,
    );
    if (
      !same(artifact.data, resolved.validated) ||
      artifact.organizationId !== resolved.org._id ||
      artifact.fundingOwner !== resolved.org.createdBy ||
      artifact.sourceRevision !== resolved.source.updatedAt ||
      artifact.reservationKey !== resolved.reservationKey ||
      artifact.retainUntil > resolved.retainUntil ||
      artifact.policyEvidenceId !== resolved.policy.evidenceId ||
      artifact.deletionWithinMs !== resolved.policy.deletionWithinMs ||
      artifact.compatibilityKey !== resolved.compatibility.compatibilityKey ||
      artifact.rightsHash !== resolved.compatibility.rightsHash ||
      artifact.postRevisionHash !== resolved.compatibility.postRevisionHash ||
      artifact.evidenceHash !== resolved.compatibility.evidenceHash ||
      artifact.promptHash !== resolved.compatibility.promptHash ||
      artifact.settingsHash !== resolved.compatibility.settingsHash ||
      artifact.pipelineVersion !== resolved.compatibility.pipelineVersion ||
      artifact.schemaVersion !== "3.0.0" ||
      artifact.coverage !== "ordered_media" ||
      artifact.contentHash !==
        (await socialHash(canonicalJson(resolved.validated)))
    )
      return null;
    return { artifact, ...resolved.validated };
  } catch {
    return null;
  }
}

export async function lookupServiceArtifact(
  ctx: QueryCtx,
  compatibilityKey: string,
) {
  if (!/^[a-f0-9]{64}$/.test(compatibilityKey)) return null;
  const candidates = await ctx.db
    .query("publicArtifacts")
    .withIndex("by_service_compatibility", (q) =>
      q
        .eq("origin", "service")
        .eq("compatibilityKey", compatibilityKey)
        .eq("state", "eligible"),
    )
    .order("desc")
    .take(batchSize);
  for (const artifact of candidates) {
    const current = await serviceArtifactCurrent(ctx, artifact);
    if (current) return current;
  }
  return null;
}

export function serviceArtifactDto(
  current: NonNullable<Awaited<ReturnType<typeof serviceArtifactCurrent>>>,
) {
  const { analysis, prepared, artifact } = current;
  return {
    title: `${prepared.post.platform === "instagram" ? "Instagram" : "TikTok"} post`,
    summary: analysis.summary,
    sourceUrl: prepared.post.canonical,
    warnings: analysis.warnings,
    acquisitionCoverage: prepared.post.coverage,
    expectedAssetCount: prepared.post.expectedAssetCount,
    inspectedAssetCount: prepared.post.assets.filter((asset) => asset.inspected)
      .length,
    coverage: "ordered_media" as const,
    language: artifact.language,
    pipelineVersion: artifact.pipelineVersion,
    schemaVersion: "3.0.0" as const,
    insights: analysis.insights.map((insight) => ({
      id: insight.id,
      kind: insight.kind,
      title: insight.title,
      claim: insight.claim,
      interpretation: insight.interpretation,
      uncertainty: insight.verificationNeeds,
      confidence: insight.confidence,
      citations: insight.evidence.map((ref) => ({
        ...socialCitation(ref, prepared.evidence),
        url: prepared.post.canonical,
        label:
          ref.kind === "image_observation"
            ? `Image ${prepared.evidence.find((item) => item.id === ref.id)!.assetIndex + 1}`
            : `Video ${ref.startMs! / 1000}–${ref.endMs! / 1000}s`,
      })),
    })),
  };
}

export async function commitServiceArtifact(
  ctx: MutationCtx,
  args: {
    sourceId: Id<"sources">;
    generation: number;
    compatibilityKey: string;
    result: unknown;
  },
) {
  const source = await ctx.db.get(args.sourceId);
  if (!source?.serviceIntent) throw Error("SERVICE_INTENT_CHANGED");
  const resolved = await resolveSource(
    ctx,
    args.sourceId,
    args.generation,
    args.result,
    source.serviceIntent.language,
  );
  if (args.compatibilityKey !== resolved.compatibility.compatibilityKey)
    throw Error("SERVICE_COMPATIBILITY_CHANGED");
  const previous = await lookupServiceArtifact(ctx, args.compatibilityKey);
  if (previous) return { artifactId: previous.artifact._id, reused: true };
  const now = Date.now();
  const row: Omit<ServiceArtifact, "_id" | "_creationTime"> = {
    organizationId: resolved.org._id,
    createdAt: now,
    updatedAt: now,
    origin: "service",
    sourceId: args.sourceId,
    generation: args.generation,
    sourceRevision: resolved.source.updatedAt,
    fundingOwner: resolved.org.createdBy,
    reservationKey: resolved.reservationKey,
    compatibilityKey: args.compatibilityKey,
    contentHash: await socialHash(canonicalJson(resolved.validated)),
    language: resolved.compatibility.language,
    pipelineVersion: resolved.compatibility.pipelineVersion,
    schemaVersion: "3.0.0",
    coverage: "ordered_media",
    promptHash: resolved.compatibility.promptHash,
    settingsHash: resolved.compatibility.settingsHash,
    postRevisionHash: resolved.compatibility.postRevisionHash,
    evidenceHash: resolved.compatibility.evidenceHash,
    policyEvidenceId: resolved.policy.evidenceId,
    rightsHash: resolved.compatibility.rightsHash,
    retainUntil: resolved.retainUntil,
    deletionWithinMs: resolved.policy.deletionWithinMs,
    state: "eligible",
    data: resolved.validated,
  };
  // Reserve a little room for Convex's immutable system fields as well.
  if (new TextEncoder().encode(canonicalJson(row)).length > maxBytes - 256)
    throw Error("SERVICE_ARTIFACT_TOO_LARGE");
  const artifactId = await ctx.db.insert("publicArtifacts", row);
  await ctx.scheduler.runAt(row.retainUntil, internal.serviceArtifacts.expire, {
    id: artifactId,
    retainUntil: row.retainUntil,
  });
  return { artifactId, reused: false };
}

async function scrub(ctx: MutationCtx, row: ServiceArtifact) {
  await ctx.db.patch(row._id, {
    state: "blocked",
    data: undefined,
    updatedAt: Date.now(),
  });
}
export async function expireServiceArtifact(
  ctx: MutationCtx,
  args: { id: Id<"publicArtifacts">; retainUntil: number },
) {
  if (process.env.RESTORE_LOCK === "true") return { paused: true };
  const row = await ctx.db.get(args.id);
  if (
    !row ||
    row.origin !== "service" ||
    row.state !== "eligible" ||
    row.retainUntil !== args.retainUntil
  )
    return { scrubbed: false };
  if (row.retainUntil > Date.now()) return { scrubbed: false };
  await scrub(ctx, row);
  return { scrubbed: true };
}
// Indexed due rows survive restore-lock callbacks and are retried by the existing
// privacy sweep. Neither this helper nor the callback mutates a source generation.
export async function sweepExpiredServiceArtifacts(ctx: MutationCtx) {
  if (process.env.RESTORE_LOCK === "true") return { scrubbed: 0, paused: true };
  const rows = await ctx.db
    .query("publicArtifacts")
    .withIndex("by_service_expiry", (q) =>
      q
        .eq("origin", "service")
        .eq("state", "eligible")
        .lte("retainUntil", Date.now()),
    )
    .take(batchSize);
  for (const row of rows) if (row.origin === "service") await scrub(ctx, row);
  return { scrubbed: rows.length };
}
export async function invalidateServicePolicy(
  ctx: MutationCtx,
  rightsHash: string,
) {
  if (!/^[a-f0-9]{64}$/.test(rightsHash))
    throw Error("INVALID_SERVICE_POLICY_HASH");
  if (process.env.RESTORE_LOCK === "true") return { scrubbed: 0, paused: true };
  const rows = await ctx.db
    .query("publicArtifacts")
    .withIndex("by_service_policy", (q) =>
      q
        .eq("origin", "service")
        .eq("rightsHash", rightsHash)
        .eq("state", "eligible"),
    )
    .take(batchSize);
  for (const row of rows) if (row.origin === "service") await scrub(ctx, row);
  return { scrubbed: rows.length, morePossible: rows.length === batchSize };
}

export async function invalidateServiceSource(
  ctx: MutationCtx,
  sourceId: Id<"sources">,
  maxGeneration: number,
) {
  if (!Number.isSafeInteger(maxGeneration) || maxGeneration < 0)
    throw Error("INVALID_SERVICE_GENERATION");
  if (process.env.RESTORE_LOCK === "true") return { scrubbed: 0, paused: true };
  const rows = await ctx.db
    .query("publicArtifacts")
    .withIndex("by_service_source", (q) =>
      q
        .eq("origin", "service")
        .eq("sourceId", sourceId)
        .eq("state", "eligible")
        .lte("generation", maxGeneration),
    )
    .take(batchSize);
  for (const row of rows) if (row.origin === "service") await scrub(ctx, row);
  if (rows.length === batchSize)
    await ctx.scheduler.runAfter(
      0,
      internal.serviceArtifacts.invalidateSource,
      { sourceId, maxGeneration },
    );
  return { scrubbed: rows.length };
}
