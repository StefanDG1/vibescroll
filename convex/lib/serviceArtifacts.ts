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
import {
  serviceCatalogAuthority,
  preservesServiceArtifact,
  type ServiceInvalidationReason,
} from "../../packages/social/catalog-authority";
import { excerptHash } from "../../packages/sources/evidence";
import { creatorConfiguration } from "./creatorPolicy";
import { hostedSourceAllowed } from "./hostedMediaAccess";
import { sourceRetained } from "./sourceAuthority";
import {
  publicModerationBlocked,
  legacyModerationPending,
} from "./publicModeration";
import { billingFor } from "../lib";
import { isPaid } from "../../packages/company-config";
import { ensure } from "../../packages/policy";
import { serviceCatalogProjection } from "../../packages/social/catalog-search";
import {
  orderedDiagnostics,
  emptyOrderedDiagnostics,
} from "../../packages/social/diagnostics";

type ServiceArtifact = Extract<Doc<"publicArtifacts">, { origin: "service" }>;
type ServiceImport = Extract<Doc<"publicImports">, { origin: "service" }>;
const batchSize = 5;
const maxBytes = 512 * 1024;
const same = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);

export async function requireProCatalogAccess(
  ctx: QueryCtx,
  organizationId: Id<"organizations">,
) {
  const now = Date.now();
  const billing = await billingFor(ctx, organizationId);
  const wallet = await ctx.db
    .query("wallets")
    .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
    .unique();
  const periods =
    billing?.subscriptionId && wallet
      ? await ctx.db
          .query("billingPeriods")
          .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
          .order("desc")
          .take(batchSize)
      : [];
  const period = periods.find(
    (row) =>
      row.subscription === billing?.subscriptionId &&
      row.end === wallet?.periodEnd &&
      row.start <= now &&
      row.end > now,
  );
  ensure(
    isPaid(billing, now) &&
      billing!.verifiedAt <= now &&
      billing!.providerDeletedAt === undefined &&
      wallet?.tier === "pro" &&
      Number.isFinite(wallet.periodEnd) &&
      wallet.periodEnd > now &&
      wallet.periodEnd <= billing!.periodEnd &&
      !!period,
    "FORBIDDEN",
    "Current verified Pro access is required for the insight catalog.",
  );
}

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
    process.env.CREATOR_SERVICE_REUSE_ENABLED !== "true" ||
    !creatorConfiguration()
  )
    return null;
  return (await frozenServiceArtifactState(ctx, artifact, true)).current;
}

// Frozen catalog authority is independent of its contributor's live account,
// source, reservation and personal retention. Only the trusted producer mints it.
async function frozenServiceArtifactState(
  ctx: QueryCtx,
  artifact: Doc<"publicArtifacts"> | null,
  requireCurrentConfiguration: boolean,
) {
  const unavailable = (scrub = true) => ({ current: null, scrub });
  if (process.env.RESTORE_LOCK === "true") return unavailable(false);
  const now = Date.now();
  if (
    !artifact ||
    artifact.origin !== "service" ||
    artifact.state !== "eligible" ||
    !artifact.data ||
    artifact.retainUntil <= now ||
    artifact.organizationId !== undefined
  )
    return unavailable();
  try {
    if (new TextEncoder().encode(canonicalJson(artifact)).length > maxBytes)
      return unavailable();
    const authority = serviceCatalogAuthority.safeParse(artifact.authority);
    if (
      !authority.success ||
      artifact.authorityHash !==
        (await socialHash(canonicalJson(authority.data)))
    )
      return unavailable();
    const { rights, contract, diagnostics, moderation } = authority.data;
    const validated = await validateSocialAnalysis(
      artifact.data.analysis,
      artifact.data.prepared,
      { sourceId: artifact.sourceId, generation: artifact.generation },
    );
    const { post } = validated.prepared;
    const request = {
      provider: rights.provider,
      platform: post.platform,
      creatorId: post.creatorId,
      workload: "reuse" as const,
      route: contract.route,
    };
    requireSocialRights(rights, request, now);
    const evidenceHash = await socialHash(
      canonicalJson(
        diagnostics.warnings.length || diagnostics.omissions.length
          ? { evidence: validated.prepared.evidence, ...diagnostics }
          : validated.prepared.evidence,
      ),
    );
    const rightsHash = await socialHash(canonicalJson(rights));
    const fields = {
      ...contract,
      postRevisionHash: post.revisionHash,
      evidenceHash,
      rightsHash,
    };
    if (
      !same(artifact.data, validated) ||
      !Number.isSafeInteger(artifact.createdAt) ||
      artifact.createdAt > now ||
      !Number.isSafeInteger(artifact.sourceRevision) ||
      !Number.isSafeInteger(artifact.retainUntil) ||
      post.observedAt > artifact.createdAt ||
      post.observedAt < rights.reviewedAt ||
      post.providerEvidenceId !== rights.evidenceId ||
      artifact.retainUntil >
        Math.min(
          authority.data.policyExpiresAt,
          rights.expiresAt,
          post.observedAt + rights.maxRetentionMs,
        ) ||
      artifact.policyEvidenceId !== rights.evidenceId ||
      artifact.deletionWithinMs !== rights.deletionWithinMs ||
      artifact.compatibilityKey !==
        (await socialHash(
          canonicalJson({
            version: "service-social-v1",
            platform: post.platform,
            creatorId: post.creatorId,
            postId: post.postId,
            ...fields,
          }),
        )) ||
      artifact.rightsHash !== rightsHash ||
      artifact.postRevisionHash !== fields.postRevisionHash ||
      artifact.evidenceHash !== evidenceHash ||
      artifact.promptHash !== contract.promptHash ||
      artifact.settingsHash !== contract.settingsHash ||
      artifact.pipelineVersion !== contract.pipelineVersion ||
      artifact.language !== contract.language ||
      artifact.schemaVersion !== "3.0.0" ||
      artifact.coverage !== "ordered_media" ||
      artifact.contentHash !== (await socialHash(canonicalJson(validated))) ||
      moderation.canonicalHash !== (await excerptHash(post.canonical))
    )
      return unavailable();
    // Catalog admissions require current reviewed configuration. Operational
    // pauses do not revoke previously saved grants; a reviewed withdrawal does.
    if (requireCurrentConfiguration) {
      const config = creatorConfiguration(now);
      if (
        !config ||
        (await socialHash(canonicalJson(config.rights))) !== rightsHash
      )
        return unavailable(false);
    }
    let currentRights;
    try {
      currentRights = socialRightsSchema.safeParse(
        JSON.parse(process.env.CREATOR_PROVIDER_CONFIGURATION ?? "null")
          ?.rights,
      );
    } catch {
      /* A temporary configuration failure cannot destroy a saved grant. */
    }
    if (
      currentRights?.success &&
      currentRights.data.provider === rights.provider &&
      currentRights.data.reviewedAt >= rights.reviewedAt &&
      currentRights.data.reviewedAt <= now
    ) {
      try {
        requireSocialRights(currentRights.data, request, now);
      } catch {
        return unavailable();
      }
      if (post.observedAt + currentRights.data.maxRetentionMs <= now)
        return unavailable();
    }
    if (await legacyModerationPending(ctx)) return unavailable(false);
    const tombstone = await ctx.db
      .query("tombstones")
      .withIndex("by_target", (q) => q.eq("target", artifact.sourceId))
      .first();
    if (
      tombstone &&
      tombstone.organizationId !== artifact.authority.moderation.organizationId
    )
      return unavailable(false);
    if (tombstone && tombstone.catalogDisposition !== "personal-association-v1")
      return unavailable();
    if (
      await publicModerationBlocked(
        ctx,
        {
          _id: artifact.sourceId,
          organizationId: artifact.authority.moderation.organizationId,
          canonical: post.canonical,
        },
        artifact.authority.moderation.publisher,
      )
    )
      return unavailable();
    return { current: { artifact, ...validated }, scrub: false };
  } catch {
    // Validation or infrastructure uncertainty denies reads without authorizing
    // destructive cleanup. Explicit hash/policy/state failures above scrub.
    return unavailable(false);
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

export async function serviceArtifactSnapshot(
  current: NonNullable<Awaited<ReturnType<typeof serviceArtifactCurrent>>>,
): Promise<NonNullable<ServiceImport["snapshot"]>> {
  const { artifact } = current;
  const dto = serviceArtifactDto(current);
  const rights = serviceCatalogAuthority.parse(artifact.authority).rights;
  if ((await socialHash(canonicalJson(rights))) !== artifact.rightsHash)
    throw Error("SERVICE_POLICY_BINDING_CHANGED");
  const snapshot = {
    version: "service-import-v2" as const,
    authorityHash: artifact.authorityHash,
    dto,
    dtoHash: await socialHash(canonicalJson(dto)),
    contentHash: artifact.contentHash,
    compatibilityKey: artifact.compatibilityKey,
    evidenceHash: artifact.evidenceHash,
    rightsHash: artifact.rightsHash,
    rights,
    policyEvidenceId: artifact.policyEvidenceId,
    sourceId: artifact.sourceId,
    generation: artifact.generation,
    sourceRevision: artifact.sourceRevision,
    savedAt: Date.now(),
    retainUntil: artifact.retainUntil,
  };
  if (new TextEncoder().encode(canonicalJson(snapshot)).length > maxBytes)
    throw Error("SERVICE_COPY_TOO_LARGE");
  return snapshot;
}

// This returns the saved DTO, never a replacement from the source's live result.
// Billing cancellation does not revoke a saved copy; rights and safety still do.
async function retainedServiceArtifactState(
  ctx: QueryCtx,
  layer: ServiceImport,
) {
  const unavailable = (scrub = true) => ({ copy: null, scrub });
  if (process.env.RESTORE_LOCK === "true") return unavailable(false);
  const snapshot = layer.snapshot;
  const now = Date.now();
  if (
    !snapshot ||
    snapshot.version !== "service-import-v2" ||
    !Number.isSafeInteger(snapshot.savedAt) ||
    snapshot.savedAt > now ||
    !Number.isSafeInteger(snapshot.retainUntil) ||
    snapshot.retainUntil <= now
  )
    return unavailable();
  try {
    const rights = socialRightsSchema.safeParse(snapshot.rights);
    if (
      !rights.success ||
      (await socialHash(canonicalJson(rights.data))) !== snapshot.rightsHash
    )
      return unavailable();
    if (new TextEncoder().encode(canonicalJson(snapshot)).length > maxBytes)
      return unavailable();
    const state = await frozenServiceArtifactState(
      ctx,
      await ctx.db.get(layer.artifactId),
      false,
    );
    if (!state.current) return unavailable(state.scrub);
    const { artifact } = state.current;
    const privateSource = await ctx.db.get(layer.sourceId);
    if (
      !privateSource ||
      privateSource.state === "deleted" ||
      privateSource.organizationId !== layer.organizationId ||
      privateSource.publicImportId !== layer._id ||
      !sourceRetained(privateSource.sourceRetentionUntil, now) ||
      snapshot.authorityHash !== artifact.authorityHash ||
      snapshot.sourceId !== artifact.sourceId ||
      snapshot.generation !== artifact.generation ||
      snapshot.sourceRevision !== artifact.sourceRevision ||
      snapshot.compatibilityKey !== layer.compatibilityKey ||
      snapshot.compatibilityKey !== artifact.compatibilityKey ||
      snapshot.contentHash !== artifact.contentHash ||
      snapshot.evidenceHash !== artifact.evidenceHash ||
      snapshot.rightsHash !== artifact.rightsHash ||
      snapshot.policyEvidenceId !== artifact.policyEvidenceId ||
      snapshot.retainUntil > artifact.retainUntil ||
      snapshot.savedAt < artifact.createdAt ||
      snapshot.dtoHash !== (await socialHash(canonicalJson(snapshot.dto))) ||
      !same(snapshot.dto, serviceArtifactDto(state.current))
    )
      return unavailable();
    return {
      copy: snapshot.dto as ReturnType<typeof serviceArtifactDto>,
      scrub: false,
    };
  } catch {
    // Database/crypto failures are transient and must never authorize deletion.
    return unavailable(false);
  }
}

export async function retainedServiceArtifactCopy(
  ctx: QueryCtx,
  layer: ServiceImport,
): Promise<ReturnType<typeof serviceArtifactDto> | null> {
  return (await retainedServiceArtifactState(ctx, layer)).copy;
}

const clearedCatalogProjection = {
  catalogSearchVersion: undefined,
  catalogSearchHash: undefined,
  catalogSearchText: undefined,
};
async function boundedCatalogProjection(
  artifact: Omit<ServiceArtifact, "_id" | "_creationTime">,
  analysis: Parameters<typeof serviceCatalogProjection>[0],
) {
  const projection = await serviceCatalogProjection(
    analysis,
    artifact.contentHash,
  );
  const candidate = { ...artifact, ...projection };
  return new TextEncoder().encode(canonicalJson(candidate)).length <=
    maxBytes - 256
    ? projection
    : clearedCatalogProjection;
}
export async function serviceArtifactCatalogProjectionCurrent(
  current: NonNullable<Awaited<ReturnType<typeof serviceArtifactCurrent>>>,
) {
  const projection = await serviceCatalogProjection(
    current.analysis,
    current.artifact.contentHash,
  );
  return (
    current.artifact.catalogSearchVersion === projection.catalogSearchVersion &&
    current.artifact.catalogSearchHash === projection.catalogSearchHash &&
    current.artifact.catalogSearchText === projection.catalogSearchText
  );
}
export async function projectServiceArtifactCatalog(
  ctx: MutationCtx,
  current: NonNullable<Awaited<ReturnType<typeof serviceArtifactCurrent>>>,
) {
  const { _id, _creationTime, ...artifact } = current.artifact;
  const projection = await boundedCatalogProjection(artifact, current.analysis);
  await ctx.db.patch(_id, projection);
  return projection.catalogSearchVersion !== undefined;
}

export async function reindexServiceArtifactCatalog(
  ctx: MutationCtx,
  cursor: string | null,
) {
  if (process.env.RESTORE_LOCK === "true")
    return {
      availability: "unavailable" as const,
      paused: true,
      continueCursor: cursor,
      isDone: false,
      indexed: 0,
      cleared: 0,
    };
  if (
    process.env.CREATOR_SERVICE_REUSE_ENABLED !== "true" ||
    !creatorConfiguration()
  )
    return {
      availability: "unavailable" as const,
      paused: false,
      continueCursor: cursor,
      isDone: false,
      indexed: 0,
      cleared: 0,
    };
  const rows = await ctx.db
    .query("publicArtifacts")
    .withIndex("by_service_expiry", (q) => q.eq("origin", "service"))
    .paginate({ cursor, numItems: batchSize });
  let indexed = 0,
    cleared = 0;
  for (const row of rows.page) {
    if (row.origin !== "service") continue;
    const current = await serviceArtifactCurrent(ctx, row);
    if (current && (await projectServiceArtifactCatalog(ctx, current)))
      indexed++;
    else {
      await ctx.db.patch(row._id, clearedCatalogProjection);
      cleared++;
    }
  }
  return {
    availability: "ready" as const,
    paused: false,
    continueCursor: rows.isDone ? null : rows.continueCursor,
    isDone: rows.isDone,
    indexed,
    cleared,
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
  if (previous) {
    await projectServiceArtifactCatalog(ctx, previous);
    return { artifactId: previous.artifact._id, reused: true };
  }
  const now = Date.now();
  const authority: ServiceArtifact["authority"] = {
    version: "global-service-authority-v1",
    contract: await neutralSocialContract(resolved.compatibility.language),
    rights: resolved.policy,
    policyExpiresAt: resolved.retainUntil,
    diagnostics: resolved.source.orderedPreparation
      ? orderedDiagnostics.parse({
          warnings: resolved.source.orderedPreparation.warnings,
          omissions: resolved.source.orderedPreparation.omissions,
        })
      : emptyOrderedDiagnostics,
    moderation: {
      organizationId: resolved.org._id,
      publisher: resolved.org.createdBy,
      canonicalHash: await excerptHash(
        resolved.validated.prepared.post.canonical,
      ),
    },
  };
  serviceCatalogAuthority.parse(authority);
  const row: Omit<ServiceArtifact, "_id" | "_creationTime"> = {
    createdAt: now,
    updatedAt: now,
    origin: "service",
    authority,
    authorityHash: await socialHash(canonicalJson(authority)),
    sourceId: args.sourceId,
    generation: args.generation,
    sourceRevision: resolved.source.updatedAt,
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
  const projection = await boundedCatalogProjection(
    row,
    resolved.validated.analysis,
  );
  const artifactId = await ctx.db.insert("publicArtifacts", {
    ...row,
    ...projection,
  });
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
    catalogSearchVersion: undefined,
    catalogSearchHash: undefined,
    catalogSearchText: undefined,
    updatedAt: Date.now(),
  });
  await ctx.scheduler.runAfter(0, internal.serviceArtifacts.scrubCopies, {
    artifactId: row._id,
    cursor: null,
  });
}

export async function scrubServiceArtifactCopies(
  ctx: MutationCtx,
  args: { artifactId: Id<"publicArtifacts">; cursor: string | null },
) {
  if (process.env.RESTORE_LOCK === "true") return { paused: true };
  const rows = await ctx.db
    .query("publicImports")
    .withIndex("by_artifact", (q) => q.eq("artifactId", args.artifactId))
    .paginate({ cursor: args.cursor, numItems: batchSize });
  let scrubbed = 0;
  for (const layer of rows.page) {
    if (
      layer.origin === "service" &&
      layer.snapshot &&
      (await retainedServiceArtifactState(ctx, layer)).scrub
    ) {
      await ctx.db.patch(layer._id, { snapshot: undefined });
      scrubbed++;
    }
  }
  if (!rows.isDone)
    await ctx.scheduler.runAfter(0, internal.serviceArtifacts.scrubCopies, {
      artifactId: args.artifactId,
      cursor: rows.continueCursor,
    });
  return { scrubbed };
}

// Restarted by the existing privacy sweep, including after restore interrupted
// a continuation. The index excludes legacy references and already scrubbed rows.
export async function sweepRetainedServiceArtifactCopies(
  ctx: MutationCtx,
  cursor: string | null = null,
) {
  if (process.env.RESTORE_LOCK === "true") return { scrubbed: 0, paused: true };
  const rows = await ctx.db
    .query("publicImports")
    .withIndex("by_service_snapshot_expiry", (q) =>
      q.eq("origin", "service").gt("snapshot.retainUntil", 0),
    )
    .paginate({ cursor, numItems: batchSize });
  let scrubbed = 0;
  for (const layer of rows.page) {
    if (
      layer.origin === "service" &&
      layer.snapshot &&
      (await retainedServiceArtifactState(ctx, layer)).scrub
    ) {
      await ctx.db.patch(layer._id, { snapshot: undefined });
      scrubbed++;
    }
  }
  if (!rows.isDone)
    await ctx.scheduler.runAfter(0, internal.serviceArtifacts.sweepCopies, {
      cursor: rows.continueCursor,
    });
  return { scrubbed };
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
  await ctx.scheduler.runAfter(0, internal.serviceArtifacts.sweepCopies, {
    cursor: null,
  });
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
  reason: ServiceInvalidationReason = "unspecified",
  expectedOriginOrganizationId?: Id<"organizations">,
  cursor: string | null = null,
) {
  if (!Number.isSafeInteger(maxGeneration) || maxGeneration < 0)
    throw Error("INVALID_SERVICE_GENERATION");
  if (preservesServiceArtifact(reason)) return { scrubbed: 0 };
  const tombstone = await ctx.db
    .query("tombstones")
    .withIndex("by_target", (q) => q.eq("target", sourceId))
    .first();
  if (
    tombstone?.catalogDisposition &&
    (!expectedOriginOrganizationId ||
      tombstone.organizationId === expectedOriginOrganizationId)
  )
    await ctx.db.patch(tombstone._id, { catalogDisposition: undefined });
  if (process.env.RESTORE_LOCK === "true") return { scrubbed: 0, paused: true };
  const candidates = ctx.db
    .query("publicArtifacts")
    .withIndex("by_service_source", (q) =>
      q
        .eq("origin", "service")
        .eq("sourceId", sourceId)
        .eq("state", "eligible")
        .lte("generation", maxGeneration),
    );
  // A scoped resume must advance past mismatched provenance instead of
  // repeatedly taking the same unmodified first page.
  const page = expectedOriginOrganizationId
    ? await candidates.paginate({ cursor, numItems: batchSize })
    : null;
  const rows = page?.page ?? (await candidates.take(batchSize));
  let scrubbed = 0;
  for (const row of rows)
    if (
      row.origin === "service" &&
      (!expectedOriginOrganizationId ||
        row.authority.moderation.organizationId ===
          expectedOriginOrganizationId)
    ) {
      await scrub(ctx, row);
      scrubbed++;
    }
  if (page ? !page.isDone : rows.length === batchSize)
    await ctx.scheduler.runAfter(
      0,
      internal.serviceArtifacts.invalidateSource,
      {
        sourceId,
        maxGeneration,
        reason,
        ...(expectedOriginOrganizationId
          ? {
              expectedOriginOrganizationId,
              cursor: page!.continueCursor,
            }
          : {}),
      },
    );
  return { scrubbed };
}
