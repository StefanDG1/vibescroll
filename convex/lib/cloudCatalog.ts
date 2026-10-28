import { resultRetained } from "../../packages/contracts/result-retention";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx, MutationCtx } from "../_generated/server";
import { ensure } from "../../packages/policy";
import { canonicalJson } from "../../packages/contracts/canonical-json.mjs";
import {
  cloudCatalogAuthority,
  cloudCatalogConfiguration,
  cloudCatalogPermissionIdentity,
  currentCloudCatalogPermission,
  neutralCloudAnalysis,
  neutralCloudEvidence,
  type CloudCatalogPermission,
} from "../../packages/contracts/cloud-catalog";
import {
  privateCloudMediaIdentity,
  socialHash,
} from "../../packages/social/contracts";
import { requireProCatalogAccess } from "./catalogEntitlement";
import { PolicyError } from "../../packages/policy";
import { cloudCatalogFamilyKey } from "../../packages/contracts/cloud-catalog";
import { sourceRetained } from "./sourceAuthority";
import { internal } from "../_generated/api";
import { queryRead } from "./knowledgeReadContext";

export type CloudArtifact = Extract<
  Doc<"publicArtifacts">,
  { origin: "cloud" }
>;
export function cloudArtifact(
  value: Doc<"publicArtifacts"> | null,
): value is CloudArtifact {
  return !!value && "origin" in value && value.origin === "cloud";
}
export function cloudImport(
  value: Doc<"publicImports"> | null,
): value is Extract<Doc<"publicImports">, { origin: "cloud" }> {
  return !!value && "origin" in value && value.origin === "cloud";
}

export function catalogConfiguration(now = Date.now()) {
  if (
    process.env.CLOUD_CATALOG_ENABLED !== "true" ||
    process.env.CLOUD_CATALOG_VERIFIED !== "true" ||
    process.env.RESTORE_LOCK === "true"
  )
    return null;
  try {
    const config = cloudCatalogConfiguration.parse(
      JSON.parse(process.env.CLOUD_CATALOG_CONFIGURATION_JSON ?? "null"),
    );
    if (
      config.reviewedAt > now ||
      config.expiresAt <= now ||
      (config.defaultPolicy &&
        (config.defaultPolicy.reviewedAt > now ||
          config.defaultPolicy.expiresAt <= now))
    )
      return null;
    return config;
  } catch {
    return null;
  }
}
export const catalogAliasKey = (alias: string, language = "en") =>
  socialHash(
    canonicalJson({
      version: "cloud-catalog-alias-v1",
      alias: privateCloudMediaIdentity(alias).url,
      language,
    }),
  );
export async function recordCatalogAlias(
  ctx: MutationCtx,
  alias: string,
  family: Doc<"catalogFamilies">,
  retainUntil: number,
) {
  const normalized = privateCloudMediaIdentity(alias).url,
    key = await catalogAliasKey(normalized);
  const old = await ctx.db
    .query("catalogAliases")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  retainUntil =
    old?.familyId === family._id
      ? Math.max(old.retainUntil, retainUntil)
      : retainUntil;
  const value = {
    organizationId: family.organizationId,
    key,
    alias: normalized,
    familyId: family._id,
    permissionHash: family.permissionHash,
    updatedAt: Date.now(),
    retainUntil,
    ...(family.resultRetention
      ? { resultRetention: family.resultRetention }
      : {}),
  };
  const id = old
    ? (await ctx.db.patch(old._id, value), old._id)
    : await ctx.db.insert("catalogAliases", {
        ...value,
        createdAt: Date.now(),
      });
  await ctx.scheduler.runAfter(
    Math.max(0, retainUntil - Date.now()),
    internal.cloudCatalog.expireAlias,
    { id },
  );
}

export async function cacheCandidate(
  ctx: QueryCtx,
  organizationId: Id<"organizations">,
  url: string,
) {
  if (!catalogConfiguration()) return null;
  try {
    await requireProCatalogAccess(ctx, organizationId);
  } catch (error) {
    if (error instanceof PolicyError && error.code === "FORBIDDEN") return null;
    throw error;
  }
  let alias: string;
  try {
    const identity = privateCloudMediaIdentity(url);
    if (!["instagram", "tiktok"].includes(identity.platform)) return null;
    alias = identity.url;
  } catch {
    return null;
  }
  const aliasKey = await catalogAliasKey(alias);
  const mapped = await ctx.db
    .query("catalogAliases")
    .withIndex("by_key", (q) => q.eq("key", aliasKey))
    .unique();
  let family: Doc<"catalogFamilies"> | null = null;
  if (mapped && resultRetained(mapped))
    family = await ctx.db.get(mapped.familyId);
  if (!family) {
    let reviewed: Awaited<ReturnType<typeof catalogPermission>>;
    try {
      reviewed = await catalogPermission(ctx, alias);
    } catch (error) {
      if (
        error instanceof PolicyError &&
        ["POLICY_BLOCKED", "SOURCE_UNAVAILABLE"].includes(error.code)
      )
        return null;
      throw error;
    }
    const key = await cloudCatalogFamilyKey(
      reviewed.permission.canonical,
      "en",
      reviewed.permission.id,
    );
    family = await ctx.db
      .query("catalogFamilies")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
  }
  if (!family?.selectedArtifactId) return null;
  try {
    return await currentCloudArtifact(ctx, family.selectedArtifactId);
  } catch (error) {
    if (
      error instanceof PolicyError &&
      ["POLICY_BLOCKED", "SOURCE_UNAVAILABLE"].includes(error.code)
    )
      return null;
    throw error;
  }
}

export async function attachCloudCache(
  ctx: MutationCtx,
  source: Doc<"sources">,
  actor: Id<"users">,
) {
  if (
    source.kind !== "url" ||
    !source.url ||
    !source.rightsAttested ||
    !["saved", "needs_upload"].includes(source.state) ||
    source.generation !== 0 ||
    source.analysis ||
    source.orderedMedia ||
    source.personalAnalysis ||
    source.publicImportId ||
    source.currentRevisionId ||
    source.workCloudSaveIntent
  )
    return false;
  const cached = await cacheCandidate(ctx, source.organizationId, source.url);
  if (!cached) return joinPendingCatalog(ctx, source, actor);
  return attachResult(ctx, source, actor, cached, false);
}

async function attachResult(
  ctx: MutationCtx,
  source: Doc<"sources">,
  actor: Id<"users">,
  cached: Awaited<ReturnType<typeof currentCloudArtifact>>,
  contributor: boolean,
) {
  const now = Date.now();
  const layerId = await ctx.db.insert("publicImports", {
    organizationId: source.organizationId,
    origin: "cloud",
    actor,
    sourceId: source._id,
    artifactId: cached.artifact._id,
    familyId: cached.family._id,
    compatibilityKey: cached.family.key,
    notesVersionId: cached.version._id,
    notesHistory: [],
    inputCanonical: privateCloudMediaIdentity(source.url ?? source.canonical)
      .url,
    sourceGeneration: source.generation,
    privateNote: "",
    corrections: [],
    createdAt: now,
    updatedAt: now,
  });
  await ctx.db.patch(source._id, {
    state: "ready",
    catalogWait: undefined,
    publicImportId: layerId,
    coverage: "ordered_media",
    ...(cached.artifact.postMetadata
      ? {
          linkPreview: {
            ...source.linkPreview,
            ...(cached.artifact.postMetadata.title
              ? { title: cached.artifact.postMetadata.title }
              : {}),
            ...(cached.artifact.postMetadata.authorName
              ? { authorName: cached.artifact.postMetadata.authorName }
              : {}),
            ...(cached.artifact.postMetadata.durationSeconds
              ? {
                  durationSeconds: cached.artifact.postMetadata.durationSeconds,
                }
              : {}),
            state: "ready" as const,
            origin: "extractor" as const,
            updatedAt: now,
          },
        }
      : {}),
    ...(cached.artifact.resultRetention === "until_deleted" &&
    source.sourceRetentionUntil === undefined
      ? {
          resultRetention: "until_deleted" as const,
          sourceRetentionUntil: undefined,
        }
      : {
          sourceRetentionUntil: Math.min(
            source.sourceRetentionUntil ?? Infinity,
            cached.artifact.retainUntil,
          ),
        }),
    ...(!contributor
      ? { nextAnalysisVersionNumber: 2 }
      : (source.analysisSelectionRevision ?? 0) === 0
        ? {
            selectedAnalysisVersionId: undefined,
            selectedAnalysisSummary: undefined,
            selectedAnalysisInsightCount: undefined,
            selectedAnalysisMainPoints: undefined,
          }
        : {}),
    updatedAt: Math.max(now, source.updatedAt + 1),
  });
  return true;
}

export async function associateContributedCloudVersion(
  ctx: MutationCtx,
  source: Doc<"sources">,
  actor: Id<"users">,
  artifactId: Id<"publicArtifacts">,
) {
  if (
    source.state !== "ready" ||
    !source.rightsAttested ||
    !sourceRetained(source.sourceRetentionUntil) ||
    source.publicImportId
  )
    return false;
  try {
    await requireProCatalogAccess(ctx, source.organizationId);
  } catch (error) {
    if (error instanceof PolicyError && error.code === "FORBIDDEN")
      return false;
    throw error;
  }
  const cached = await currentCloudArtifact(ctx, artifactId);
  return attachResult(ctx, source, actor, cached, true);
}

export async function catalogFamilyForProduction(
  ctx: MutationCtx,
  permission: CloudCatalogPermission,
  permissionHash: string,
  serviceOrganizationId: Id<"organizations">,
  retainUntil: number,
) {
  const key = await cloudCatalogFamilyKey(
    permission.canonical,
    "en",
    permission.id,
  );
  let family = await ctx.db
    .query("catalogFamilies")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  if (!family) {
    const now = Date.now();
    const id = await ctx.db.insert("catalogFamilies", {
      organizationId: serviceOrganizationId,
      key,
      canonical: permission.canonical,
      language: "en",
      permissionId: permission.id,
      permissionHash,
      state: "active",
      selectionRevision: 0,
      nextVersionNumber: 1,
      members: [],
      createdAt: now,
      updatedAt: now,
      retainUntil,
      ...(permission.resultRetention
        ? { resultRetention: permission.resultRetention }
        : {}),
    });
    family = (await ctx.db.get(id))!;
  }
  ensure(
    family.state === "active" &&
      family.permissionHash === permissionHash &&
      family.organizationId === serviceOrganizationId,
    "POLICY_BLOCKED",
    "This catalog family was withdrawn or its authority changed.",
  );
  return family;
}

async function catalogReadAllowed(
  ctx: QueryCtx,
  organizationId: Id<"organizations">,
) {
  try {
    await requireProCatalogAccess(ctx, organizationId);
    return true;
  } catch (error) {
    if (error instanceof PolicyError && error.code === "FORBIDDEN")
      return false;
    throw error;
  }
}

async function joinPendingCatalog(
  ctx: MutationCtx,
  source: Doc<"sources">,
  actor: Id<"users">,
) {
  if (
    !catalogConfiguration()?.defaultPolicy ||
    !source.url ||
    !(await catalogReadAllowed(ctx, source.organizationId))
  )
    return false;
  const reviewed = await catalogPermission(ctx, source.url);
  const key = await cloudCatalogFamilyKey(
    reviewed.permission.canonical,
    "en",
    reviewed.permission.id,
  );
  const family = await ctx.db
    .query("catalogFamilies")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  if (
    !family?.producer ||
    family.state !== "active" ||
    family.producer.sourceId === source._id ||
    family.permissionHash !== reviewed.permissionHash
  )
    return false;
  if (await unclaimedProducerExpired(ctx, family.producer)) return false;
  return addCatalogWaiter(ctx, family, source, actor);
}

async function unclaimedProducerExpired(
  ctx: QueryCtx,
  producer: NonNullable<Doc<"catalogFamilies">["producer"]>,
) {
  const prior = await ctx.db.get(producer.sourceId);
  // A task that was claimed, failed or has an unknown outcome keeps its hold.
  // Only an exact intent that never created a job is safe to replace.
  return (
    !!prior &&
    !prior.personalAnalysis &&
    prior.workCloudSaveIntent?.id === producer.intentId &&
    prior.workCloudSaveIntent.analysisGeneration === undefined &&
    prior.workCloudSaveIntent.expiresAt <= Date.now()
  );
}

async function addCatalogWaiter(
  ctx: MutationCtx,
  family: Doc<"catalogFamilies">,
  source: Doc<"sources">,
  actor: Id<"users">,
) {
  const existing = family.waiters?.find(
    (w) =>
      w.sourceId === source._id &&
      w.generation === source.generation &&
      w.actor === actor,
  );
  const waiter = existing ?? {
    sourceId: source._id,
    organizationId: source.organizationId,
    actor,
    generation: source.generation,
    expiresAt: Math.min(
      Date.now() + 86400000,
      family.resultRetention === "until_deleted"
        ? Infinity
        : family.retainUntil,
    ),
  };
  ensure(
    waiter.expiresAt > Date.now(),
    "SOURCE_UNAVAILABLE",
    "This shared request expired.",
  );
  if (!existing) {
    ensure(
      (family.waiters?.length ?? 0) < 200,
      "SOURCE_BUSY",
      "This shared producer has reached its waiting limit.",
    );
    await ctx.db.patch(family._id, {
      waiters: [...(family.waiters ?? []), waiter],
      updatedAt: Date.now(),
    });
  }
  await ctx.db.patch(source._id, {
    catalogWait: {
      familyId: family._id,
      actor,
      generation: source.generation,
      expiresAt: waiter.expiresAt,
    },
  });
  if (!existing)
    await ctx.scheduler.runAfter(
      Math.max(0, waiter.expiresAt - Date.now()),
      internal.cloudCatalog.expireWaiter,
      {
        familyId: family._id,
        sourceId: source._id,
        actorId: actor,
        generation: source.generation,
        expiresAt: waiter.expiresAt,
      },
    );
  return true;
}

export async function reserveCatalogProducer(
  ctx: MutationCtx,
  source: Doc<"sources">,
  actor: Doc<"users">,
  reviewed: {
    permission: CloudCatalogPermission;
    permissionHash: string;
    organization: Doc<"organizations">;
  },
  intentId: string,
  expiresAt: number,
  retainUntil: number,
) {
  const family = await catalogFamilyForProduction(
    ctx,
    reviewed.permission,
    reviewed.permissionHash,
    reviewed.organization._id,
    retainUntil,
  );
  if (family.selectedArtifactId)
    return { waiting: false, familyId: family._id };
  let producer = family.producer;
  if (producer && producer.sourceId !== source._id) {
    if (await unclaimedProducerExpired(ctx, producer)) producer = undefined;
    else if (await catalogReadAllowed(ctx, source.organizationId)) {
      await addCatalogWaiter(ctx, family, source, actor._id);
      return { waiting: true, familyId: family._id };
    } else return { waiting: false, familyId: family._id };
  }
  if (!producer)
    await ctx.db.patch(family._id, {
      producer: {
        sourceId: source._id,
        organizationId: source.organizationId,
        actor: actor._id,
        generation: source.generation,
        intentId,
        expiresAt,
      },
      updatedAt: Date.now(),
    });
  await recordCatalogAlias(
    ctx,
    source.url ?? source.canonical,
    family,
    retainUntil,
  );
  return { waiting: false, familyId: family._id };
}
export async function catalogPermission(
  ctx: QueryCtx,
  canonical: string,
  now = Date.now(),
) {
  const config = catalogConfiguration(now);
  ensure(
    config,
    "POLICY_BLOCKED",
    "Shared Cloud knowledge is awaiting release review.",
  );
  const exact = privateCloudMediaIdentity(canonical).url;
  let value = config.permissions.find((p) => p.canonical === exact);
  if (!value && config.defaultPolicy) {
    const identity = privateCloudMediaIdentity(exact);
    const policy = config.defaultPolicy;
    if (
      (identity.platform === "instagram" || identity.platform === "tiktok") &&
      policy.platforms.includes(identity.platform)
    ) {
      value = {
        version: "cloud-catalog-permission-v2",
        id: `default_${(
          await socialHash(
            canonicalJson({
              policyId: policy.id,
              canonical: exact,
              rightsBasis: policy.rightsBasis,
              providerPermissionReference: policy.providerPermissionReference,
              contentPermissionReference: policy.contentPermissionReference,
              privacyReviewReference: policy.privacyReviewReference,
              maximumRetentionMs: policy.maximumRetentionMs,
              resultRetention: policy.resultRetention ?? null,
            }),
          )
        ).slice(0, 48)}`,
        canonical: exact,
        platform: identity.platform,
        rightsBasis: "user_attested",
        providerPermissionReference: policy.providerPermissionReference,
        contentPermissionReference: policy.contentPermissionReference,
        privacyReviewReference: policy.privacyReviewReference,
        route: "own_subscription",
        transcriptReuse: true,
        screenshotReuse: true,
        neutralAnalysisReuse: true,
        crossCustomerReuse: true,
        reviewedAt: policy.reviewedAt,
        expiresAt: policy.expiresAt,
        maximumRetentionMs: policy.maximumRetentionMs,
        ...(policy.resultRetention
          ? { resultRetention: policy.resultRetention }
          : {}),
      };
    }
  }
  ensure(
    value,
    "POLICY_BLOCKED",
    "This post has no reviewed shared-use permission.",
  );
  const permission = currentCloudCatalogPermission(value, exact, now);
  const organizationId = ctx.db.normalizeId(
    "organizations",
    config.serviceOrganizationId,
  );
  const organization = organizationId ? await ctx.db.get(organizationId) : null;
  ensure(
    organization?.status === "active",
    "POLICY_BLOCKED",
    "The independent catalog owner is unavailable.",
  );
  return {
    permission,
    permissionHash: await socialHash(
      canonicalJson(cloudCatalogPermissionIdentity(permission)),
    ),
    organization,
  };
}

async function currentCloudArtifactHeaderUncached(
  ctx: QueryCtx,
  id: Id<"publicArtifacts">,
) {
  const artifact = await ctx.db.get(id);
  ensure(
    cloudArtifact(artifact) &&
      artifact.state === "eligible" &&
      resultRetained(artifact),
    "SOURCE_UNAVAILABLE",
    "This shared analysis is unavailable.",
  );
  const family = await ctx.db.get(artifact.familyId);
  ensure(
    family &&
      family.state === "active" &&
      family.members.some(
        (m) =>
          m.artifactId === artifact._id &&
          m.versionId === artifact.versionId &&
          m.evidenceId === artifact.evidenceId,
      ),
    "SOURCE_UNAVAILABLE",
    "This shared analysis is no longer in its catalog family.",
  );
  const reviewed = await catalogPermission(ctx, family.canonical);
  const authority = cloudCatalogAuthority.parse(artifact.authority);
  ensure(
    family.organizationId === reviewed.organization._id &&
      artifact.organizationId === reviewed.organization._id &&
      family.permissionHash === reviewed.permissionHash &&
      authority.permissionHash === reviewed.permissionHash &&
      authority.permissionId === reviewed.permission.id &&
      authority.canonical === family.canonical &&
      authority.outputHash === artifact.contentHash &&
      authority.retainUntil === artifact.retainUntil &&
      authority.resultRetention === artifact.resultRetention &&
      authority.contributedAt <= Date.now(),
    "SOURCE_UNAVAILABLE",
    "This shared authority changed.",
  );
  return { artifact, family, authority };
}
export function currentCloudArtifactHeader(
  ctx: QueryCtx,
  id: Id<"publicArtifacts">,
) {
  return queryRead(ctx, `cloud-artifact-header:${id}`, () =>
    currentCloudArtifactHeaderUncached(ctx, id),
  );
}

async function currentCloudArtifactUncached(
  ctx: QueryCtx,
  id: Id<"publicArtifacts">,
) {
  const { artifact, family, authority } = await currentCloudArtifactHeader(
    ctx,
    id,
  );
  const [version, evidence] = await Promise.all([
    ctx.db.get(artifact.versionId),
    ctx.db.get(artifact.evidenceId),
  ]);
  ensure(
    version &&
      evidence &&
      version.owner === "service" &&
      evidence.owner === "service" &&
      version.organizationId === artifact.organizationId &&
      evidence.organizationId === artifact.organizationId &&
      version.sourceId === undefined &&
      evidence.sourceId === undefined &&
      version.state === "ready" &&
      evidence.state === "retained" &&
      version.evidenceId === evidence._id &&
      version.retainUntil === artifact.retainUntil &&
      (evidence.retainUntil === artifact.retainUntil ||
        (evidence.resultRetention === "until_deleted" &&
          artifact.resultRetention === "until_deleted")) &&
      version.resultRetention === artifact.resultRetention &&
      evidence.resultRetention === artifact.resultRetention &&
      evidence.evidenceHash === authority.evidenceHash &&
      version.recipeHash === authority.recipeHash &&
      version.requestedModel === authority.requestedModel &&
      version.requestedEffort === authority.requestedEffort,
    "SOURCE_UNAVAILABLE",
    "This shared evidence expired or was removed.",
  );
  const prepared = neutralCloudEvidence.parse(evidence.prepared),
    output = neutralCloudAnalysis.parse(version.output);
  ensure(
    prepared.evidenceHash === authority.evidenceHash &&
      output.evidenceHash === authority.evidenceHash &&
      prepared.canonical === family.canonical &&
      output.sourceRevisionHash === prepared.sourceRevisionHash &&
      (await socialHash(canonicalJson(output))) === authority.outputHash &&
      version.outputHash === authority.outputHash &&
      artifact.language === prepared.language &&
      evidence.revisionHash === prepared.sourceRevisionHash &&
      prepared.frames.length === evidence.frames.length &&
      new Set(evidence.frames.map((f) => f.frameId)).size ===
        evidence.frames.length &&
      new Set(evidence.frames.map((f) => f.key)).size ===
        evidence.frames.length,
    "INVALID_EVIDENCE",
    "Shared evidence bindings changed.",
  );
  ensure(
    artifact.storagePrefix.startsWith(`catalog/${artifact.organizationId}/`) &&
      /^catalog\/[a-zA-Z0-9_:-]+\/[a-f0-9-]{36}\/$/.test(
        artifact.storagePrefix,
      ),
    "INVALID_EVIDENCE",
    "Shared storage ownership changed.",
  );
  for (const frame of evidence.frames) {
    const manifest = prepared.frames.find((f) => f.id === frame.frameId);
    const stored = await ctx.db
      .query("assets")
      .withIndex("by_key", (q) => q.eq("key", frame.key))
      .unique();
    ensure(
      frame.assetId === undefined &&
        stored?.kind === "cloud_catalog_frame" &&
        stored.state === "complete" &&
        stored.sourceId === undefined &&
        stored.organizationId === artifact.organizationId &&
        stored.size === frame.size &&
        (stored.expiresAt === artifact.retainUntil ||
          (artifact.resultRetention === "until_deleted" &&
            stored.expiresAt === undefined)) &&
        frame.key.startsWith(artifact.storagePrefix) &&
        manifest &&
        frame.sha256 === manifest.sha256 &&
        frame.size === manifest.bytes &&
        frame.timestampMs === manifest.timestampMs &&
        frame.width === manifest.width &&
        frame.height === manifest.height &&
        !(await ctx.db
          .query("objectDeletions")
          .withIndex("by_key", (q) => q.eq("key", frame.key))
          .unique()),
      "SOURCE_UNAVAILABLE",
      "A shared screenshot was retired.",
    );
  }
  return { artifact, family, version, evidence, prepared, output, authority };
}
export function currentCloudArtifact(ctx: QueryCtx, id: Id<"publicArtifacts">) {
  return queryRead(ctx, `cloud-artifact:${id}`, () =>
    currentCloudArtifactUncached(ctx, id),
  );
}

/** Metadata projection only. Never load the transcript, output or screenshot bundle. */
export async function cloudSourceMetadata(
  ctx: QueryCtx,
  source: Doc<"sources">,
) {
  const layer = source.publicImportId
    ? await ctx.db.get(source.publicImportId)
    : null;
  if (!cloudImport(layer)) return null;
  try {
    const { family } = await cloudSourceFamily(ctx, source);
    const artifactId = source.selectedAnalysisVersionId
      ? family.members.find(
          (m) => m.versionId === source.selectedAnalysisVersionId,
        )?.artifactId
      : family.selectedArtifactId;
    if (artifactId) {
      const { artifact } = await currentCloudArtifactHeader(ctx, artifactId);
      return {
        available: true,
        summary: artifact.summary,
        insightCount: artifact.insightCount,
        mainPoints: artifact.mainPoints,
        postMetadata: artifact.postMetadata,
        thumbnailReference: artifact.postMetadata
          ? `catalog~${source._id}~${artifact.versionId}~${artifact.postMetadata.thumbnailFrameId}`
          : null,
      };
    }
    // A personal candidate still needs current access to its independent base.
    const version = source.selectedAnalysisVersionId
      ? await ctx.db.get(source.selectedAnalysisVersionId)
      : null;
    ensure(
      version?.owner === "private" &&
        version.sourceId === source._id &&
        version.organizationId === source.organizationId &&
        version.state === "ready" &&
        resultRetained(version),
      "SOURCE_UNAVAILABLE",
      "This candidate is unavailable.",
    );
    let member;
    for (const candidate of family.members) {
      if (candidate.evidenceId !== version.evidenceId) continue;
      const artifact = await ctx.db.get(candidate.artifactId);
      if (
        cloudArtifact(artifact) &&
        artifact.state === "eligible" &&
        resultRetained(artifact)
      ) {
        member = candidate;
        break;
      }
    }
    ensure(member, "SOURCE_UNAVAILABLE", "This candidate's base was removed.");
    await currentCloudArtifactHeader(ctx, member.artifactId);
    return {
      available: true,
      summary: source.selectedAnalysisSummary ?? "",
      insightCount: source.selectedAnalysisInsightCount ?? 0,
      mainPoints: source.selectedAnalysisMainPoints ?? [],
    };
  } catch (error) {
    if (!(error instanceof PolicyError)) throw error;
    return { available: false, summary: "", insightCount: 0, mainPoints: [] };
  }
}

export async function cloudSourceFamily(ctx: QueryCtx, source: Doc<"sources">) {
  ensure(
    source.state === "ready" &&
      source.rightsAttested &&
      sourceRetained(source.sourceRetentionUntil),
    "SOURCE_UNAVAILABLE",
    "This saved shared post is unavailable.",
  );
  await requireProCatalogAccess(ctx, source.organizationId);
  const layer = source.publicImportId
    ? await ctx.db.get(source.publicImportId)
    : null;
  ensure(
    cloudImport(layer) &&
      layer.sourceId === source._id &&
      layer.sourceGeneration === source.generation &&
      layer.organizationId === source.organizationId,
    "FORBIDDEN",
    "This saved post has no shared catalog association.",
  );
  const family = await ctx.db.get(layer.familyId);
  ensure(
    family &&
      family.state === "active" &&
      privateCloudMediaIdentity(source.canonical).url ===
        layer.inputCanonical &&
      privateCloudMediaIdentity(source.url ?? source.canonical).url ===
        layer.inputCanonical,
    "SOURCE_UNAVAILABLE",
    "The saved post identity changed.",
  );
  const reviewed = await catalogPermission(ctx, family.canonical);
  ensure(
    family.permissionHash === reviewed.permissionHash &&
      family.organizationId === reviewed.organization._id,
    "SOURCE_UNAVAILABLE",
    "The catalog permission changed.",
  );
  return { family, layer };
}
export async function cloudSourceVersion(
  ctx: QueryCtx,
  source: Doc<"sources">,
  versionId?: Id<"analysisVersions">,
) {
  const { family, layer } = await cloudSourceFamily(ctx, source);
  const artifactId = versionId
    ? family.members.find((m) => m.versionId === versionId)?.artifactId
    : family.selectedArtifactId;
  ensure(
    artifactId,
    "SOURCE_UNAVAILABLE",
    "No approved shared analysis is selected.",
  );
  const result = await currentCloudArtifact(ctx, artifactId);
  return { ...result, layer };
}
export async function cloudSourceEvidence(
  ctx: QueryCtx,
  source: Doc<"sources">,
  evidenceId: Id<"analysisEvidence">,
) {
  const { family, layer } = await cloudSourceFamily(ctx, source);
  for (const member of family.members) {
    if (member.evidenceId !== evidenceId) continue;
    const artifact = await ctx.db.get(member.artifactId);
    if (
      !cloudArtifact(artifact) ||
      artifact.state !== "eligible" ||
      !resultRetained(artifact)
    )
      continue;
    return { ...(await currentCloudArtifact(ctx, artifact._id)), layer };
  }
  ensure(
    false,
    "SOURCE_UNAVAILABLE",
    "This shared evidence is no longer available to the saved post.",
  );
}
