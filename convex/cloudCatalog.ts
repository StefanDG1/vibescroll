import { resultRetained } from "../packages/contracts/result-retention";
import { preferredCatalogCandidate } from "../packages/contracts/catalog-recommendation";
import {
  retireCloudArtifact,
  withdrawCatalogContribution,
} from "./lib/cloudCatalogRetention";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { query, internalQuery } from "./_generated/server";
import { internalMutation, mutation } from "./lib/projectedMutations";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import {
  historySource,
  retainedVersion,
  verifyRetainedAssets,
  freezeAnalysisBaseline,
} from "./lib/analysisHistory";
import { requireAutomaticCatalogIntent } from "./lib/catalogPolicy";
import { workCloudSourceEligible } from "./lib/workCloudSourceAccess";
import { workCloudMediaAllowed } from "./lib/personalAccess";
import { sourceRetained } from "./lib/sourceAuthority";
import { validateOrderedAnalysis } from "../packages/social/analysis";
import {
  catalogPermission,
  catalogConfiguration,
  currentCloudArtifact,
  cloudArtifact,
  recordCatalogAlias,
  cloudSourceFamily,
  associateContributedCloudVersion,
  catalogFamilyForProduction,
  attachCloudCache,
} from "./lib/cloudCatalog";
import {
  cloudCatalogConsent,
  cloudCatalogAuthority,
  projectNeutralCloudVersion,
  cloudCatalogAssessment,
} from "../packages/contracts/cloud-catalog";
import { canonicalJson } from "../packages/contracts/canonical-json.mjs";
import { socialHash } from "../packages/social/contracts";
import { ensure, containsSecret } from "../packages/policy";
import { audit, access, limit, recentAuthentication } from "./lib";
import { storageUsage, insertAsset } from "./lib/storageUsage";

const selected = {
  sourceId: v.id("sources"),
  versionId: v.id("analysisVersions"),
};
const copying = {
  contributionId: v.id("catalogContributions"),
  copyToken: v.string(),
};
const maximumCopyMs = 180000;

function publicPostMetadata(s: Awaited<ReturnType<typeof snapshot>>) {
  const privateValues = [
    s.source._id,
    s.source.organizationId,
    s.actor._id,
    s.source.personalAnalysis?.executor === "work_cloud"
      ? s.source.personalAnalysis.cloud.taskId
      : undefined,
  ];
  const clean = (value: string | undefined) =>
    value &&
    !containsSecret(value) &&
    !privateValues.some((id) => id && value.includes(id))
      ? value.slice(0, 160)
      : undefined;
  const title = clean(s.source.linkPreview?.title),
    authorName = clean(s.source.linkPreview?.authorName);
  return {
    ...(title ? { title } : {}),
    ...(authorName ? { authorName } : {}),
    ...(s.source.linkPreview?.durationSeconds
      ? { durationSeconds: s.source.linkPreview.durationSeconds }
      : {}),
    thumbnailFrameId: s.evidence.frames[0].frameId,
  };
}

async function automaticOwner(
  ctx: QueryCtx,
  sourceId: Id<"sources">,
  actorId: Id<"users">,
) {
  const source = await ctx.db.get(sourceId);
  const actor = await ctx.db.get(actorId);
  const organization = source ? await ctx.db.get(source.organizationId) : null;
  ensure(
    source &&
      source.state === "ready" &&
      source.rightsAttested &&
      sourceRetained(source.sourceRetentionUntil) &&
      actor?.status === "active" &&
      organization?.status === "active" &&
      workCloudMediaAllowed(actor.subject) &&
      (await workCloudSourceEligible(ctx, organization, actorId)),
    "SOURCE_UNAVAILABLE",
    "This automatic contribution is no longer authorized.",
  );
  await requireAutomaticCatalogIntent(ctx, source, actor);
  return { source, actor, organization, grant: null };
}

async function snapshot(
  ctx: QueryCtx,
  args: { sourceId: Id<"sources">; versionId: Id<"analysisVersions"> },
  actorId?: Id<"users">,
) {
  const owner = actorId
    ? await automaticOwner(ctx, args.sourceId, actorId)
    : await historySource(ctx, args.sourceId, true);
  const retained = await retainedVersion(ctx, owner.source, args.versionId);
  if (actorId)
    ensure(
      retained.version.createdAt >= owner.source.catalogPolicy!.requestedAt,
      "POLICY_BLOCKED",
      "Existing private versions are not retroactive catalog consent.",
    );
  ensure(
    retained.version.owner === "private" &&
      retained.version.provenance === "authenticated_host_reported" &&
      (retained.version.attemptId || retained.version.sourceCompletion) &&
      retained.version.recipeHash &&
      retained.version.requestedModel &&
      retained.version.requestedEffort,
    "POLICY_BLOCKED",
    "Create a retained-evidence version before reviewing neutral contribution. Earlier private-only output is not contribution authority.",
  );
  await verifyRetainedAssets(ctx, owner.source, retained.evidence);
  let projectionOutput = retained.version.output;
  if (retained.version.sourceCompletion) {
    const receipt = retained.version.sourceCompletion;
    ensure(
      receipt.sourceGeneration === retained.evidence.extractionGeneration &&
        receipt.inputHash === retained.evidence.prepared.post.inputHash &&
        receipt.policyHash === retained.evidence.prepared.post.policyHash,
      "APPROVAL_STALE",
      "The initial completion and retained evidence differ.",
    );
    const checked = await validateOrderedAnalysis(
      projectionOutput,
      retained.evidence.prepared,
      {
        sourceId: owner.source._id,
        generation: receipt.sourceGeneration,
      },
    );
    // The existing output protocol uses an execution correlation string. This
    // real completion hash is not a fabricated analysisAttempts database ID.
    projectionOutput = {
      schemaVersion: "analysis-version-output-v1",
      sourceId: owner.source._id,
      attemptId: receipt.completionHash,
      evidenceHash: retained.evidence.evidenceHash,
      postRevisionHash: retained.evidence.revisionHash,
      summary: checked.analysis.summary,
      warnings: checked.analysis.warnings,
      insights: checked.analysis.insights,
    };
  }
  const neutral = await projectNeutralCloudVersion(
    retained.evidence.prepared,
    projectionOutput,
    "en",
    {
      sourceId: owner.source._id,
      attemptId:
        retained.version.attemptId ??
        retained.version.sourceCompletion!.completionHash,
    },
  );
  const reviewed = await catalogPermission(ctx, neutral.evidence.canonical);
  ensure(
    reviewed.organization._id !== owner.source.organizationId,
    "POLICY_BLOCKED",
    "Shared evidence must have an independent catalog owner.",
  );
  const maximumRetainUntil = Math.min(
    retained.evidence.resultRetention === "until_deleted"
      ? Infinity
      : retained.evidence.retainUntil,
    reviewed.permission.expiresAt,
    Date.now() + reviewed.permission.maximumRetentionMs,
  );
  return {
    ...owner,
    ...retained,
    neutralEvidence: neutral.evidence,
    analysis: neutral.analysis,
    outputHash: neutral.outputHash,
    ...reviewed,
    maximumRetainUntil,
  };
}
function consentFor(
  s: Awaited<ReturnType<typeof snapshot>>,
  retainUntil = s.maximumRetainUntil,
) {
  return cloudCatalogConsent.parse({
    version: "cloud-catalog-contribution-v1",
    analysisVersionId: s.version._id,
    evidenceHash: s.neutralEvidence.evidenceHash,
    outputHash: s.outputHash,
    permissionHash: s.permissionHash,
    shareTranscript: true,
    shareScreenshots: true,
    shareNeutralAnalysis: true,
    retainIndependentlyOfPersonalSave: true,
    ...(s.permission.resultRetention
      ? { resultRetention: s.permission.resultRetention }
      : {}),
    retainUntil,
  });
}
export const preview = query({
  args: selected,
  returns: v.any(),
  handler: async (ctx, args) => {
    const s = await snapshot(ctx, args);
    const contributions = await ctx.db
      .query("catalogContributions")
      .withIndex("by_source", (q) => q.eq("sourceId", s.source._id))
      .order("desc")
      .take(201);
    ensure(
      contributions.length <= 200,
      "LIMIT_EXCEEDED",
      "Review the saved post's contribution history.",
    );
    return {
      consent: consentFor(s),
      summary: s.analysis.summary,
      insightCount: s.analysis.insights.length,
      transcriptSegments: s.neutralEvidence.segments.length,
      frameCount: s.evidence.frames.length,
      provenance: "authenticated_host_reported",
      settingsProviderAttested: false,
      contributions: contributions
        .filter(
          (row) => row.actor === s.actor._id && row.versionId === s.version._id,
        )
        .slice(0, 20)
        .map((row) => ({ contributionId: row._id, state: row.state })),
    };
  },
});

async function prepareContribution(
  ctx: MutationCtx,
  args: {
    sourceId: Id<"sources">;
    versionId: Id<"analysisVersions">;
    key: string;
    consent?: unknown;
  },
  automaticActor?: Id<"users">,
) {
  const s = await snapshot(ctx, args, automaticActor),
    now = Date.now();
  ensure(
    /^[A-Za-z0-9_-]{8,64}$/.test(args.key),
    "INVALID_INPUT",
    "Use a stable contribution operation key.",
  );
  const prior = await ctx.db
    .query("catalogContributions")
    .withIndex("by_org_source_key", (q) =>
      q
        .eq("organizationId", s.source.organizationId)
        .eq("sourceId", s.source._id)
        .eq("key", args.key),
    )
    .unique();
  if (prior) {
    const stored = cloudCatalogConsent.parse(prior.consent);
    const expected = automaticActor
      ? consentFor(s, stored.retainUntil)
      : cloudCatalogConsent.parse(args.consent);
    ensure(
      prior.actor === s.actor._id &&
        prior.versionId === args.versionId &&
        prior.permissionHash === s.permissionHash &&
        prior.evidenceHash === s.neutralEvidence.evidenceHash &&
        prior.outputHash === s.outputHash &&
        prior.consentHash === (await socialHash(canonicalJson(stored))) &&
        canonicalJson(stored) === canonicalJson(expected) &&
        canonicalJson(stored) ===
          canonicalJson(consentFor(s, stored.retainUntil)) &&
        (!automaticActor ||
          prior.automaticPolicyHash === s.source.catalogPolicy!.policyHash),
      "APPROVAL_STALE",
      "The operation key identifies another contribution.",
    );
    if (prior.state === "published")
      await currentCloudArtifact(ctx, prior.artifactId);
    return { existing: true, contributionId: prior._id, state: prior.state };
  }
  const consent = automaticActor
    ? consentFor(s)
    : cloudCatalogConsent.parse(args.consent);
  ensure(
    consent.retainUntil > now &&
      consent.retainUntil <= s.maximumRetainUntil &&
      canonicalJson(consent) ===
        canonicalJson(consentFor(s, consent.retainUntil)),
    "APPROVAL_STALE",
    "Review the exact contribution and retention again.",
  );
  await limit(ctx, `catalog-contribution:${s.actor._id}`, 3);
  const family = await catalogFamilyForProduction(
    ctx,
    s.permission,
    s.permissionHash,
    s.organization._id,
    consent.retainUntil,
  );
  ensure(
    family.state === "active" &&
      family.permissionHash === s.permissionHash &&
      family.organizationId === s.organization._id &&
      family.members.length < 200,
    "POLICY_BLOCKED",
    "This reviewed catalog family is unavailable or reached its version limit.",
  );
  await recordCatalogAlias(
    ctx,
    s.evidence.canonical,
    family,
    consent.retainUntil,
  );
  if (s.neutralEvidence.canonical !== s.evidence.canonical)
    await recordCatalogAlias(
      ctx,
      s.neutralEvidence.canonical,
      family,
      consent.retainUntil,
    );
  const variantKey = await socialHash(
    canonicalJson({
      version: "cloud-neutral-variant-v1",
      evidenceHash: s.neutralEvidence.evidenceHash,
      recipeHash: s.version.recipeHash,
      model: s.version.requestedModel,
      effort: s.version.requestedEffort,
      language: "en",
    }),
  );
  const compatibilityKey = await socialHash(
    canonicalJson({
      variantKey,
      outputHash: s.outputHash,
      permissionHash: s.permissionHash,
    }),
  );
  const equivalent = await ctx.db
    .query("publicArtifacts")
    .withIndex("by_compatibility", (q) =>
      q.eq("compatibilityKey", compatibilityKey),
    )
    .unique();
  const copyToken = crypto.randomUUID(),
    copyTokenHash = await socialHash(copyToken),
    consentHash = await socialHash(canonicalJson(consent));
  if (equivalent) {
    ensure(
      cloudArtifact(equivalent) && equivalent.state === "eligible",
      "SOURCE_BUSY",
      "An equivalent contribution is unresolved or unavailable.",
    );
    await currentCloudArtifact(ctx, equivalent._id);
    const id = await ctx.db.insert("catalogContributions", {
      organizationId: s.source.organizationId,
      actor: s.actor._id,
      sourceId: s.source._id,
      versionId: s.version._id,
      sourceEvidenceId: s.evidence._id,
      artifactId: equivalent._id,
      key: args.key,
      copyTokenHash,
      consent,
      consentHash,
      ...(automaticActor
        ? { automaticPolicyHash: s.source.catalogPolicy!.policyHash }
        : {}),
      evidenceHash: s.neutralEvidence.evidenceHash,
      outputHash: s.outputHash,
      permissionHash: s.permissionHash,
      state: "published",
      createdAt: now,
      updatedAt: now,
      expiresAt: now + maximumCopyMs,
      retainUntil: consent.retainUntil,
      ...(consent.resultRetention
        ? { resultRetention: consent.resultRetention }
        : {}),
    });
    return { existing: true, contributionId: id, state: "published" };
  }
  let reused: Awaited<ReturnType<typeof currentCloudArtifact>> | null = null;
  for (const member of family.members) {
    const artifact = await ctx.db.get(member.artifactId);
    if (
      !cloudArtifact(artifact) ||
      artifact.state !== "eligible" ||
      artifact.resultRetention !== consent.resultRetention ||
      (consent.resultRetention !== "until_deleted" &&
        artifact.retainUntil !== consent.retainUntil)
    )
      continue;
    const authority = cloudCatalogAuthority.safeParse(artifact.authority);
    if (
      authority.success &&
      authority.data.evidenceHash === s.neutralEvidence.evidenceHash
    ) {
      reused = await currentCloudArtifact(ctx, artifact._id);
      break;
    }
  }
  const prefix =
    reused?.artifact.storagePrefix ??
    `catalog/${s.organization._id}/${crypto.randomUUID()}/`;
  const frames = s.evidence.frames.map(({ assetId: _asset, ...f }) => ({
    ...f,
    key: `${prefix}${f.sha256}.jpg`,
  }));
  if (!reused) {
    const config = catalogConfiguration()!;
    const meter = await ctx.db
      .query("storageUsage")
      .withIndex("by_org", (q) => q.eq("organizationId", s.organization._id))
      .unique();
    if (!meter) {
      const prior = await ctx.db
        .query("assets")
        .withIndex("by_org", (q) => q.eq("organizationId", s.organization._id))
        .take(1);
      ensure(
        prior.length === 0,
        "POLICY_BLOCKED",
        "Initialize the existing catalog storage meter before contribution.",
      );
      await ctx.db.insert("storageUsage", {
        organizationId: s.organization._id,
        bytes: 0,
      });
    }
    const usage = await storageUsage(ctx, s.organization._id);
    const bytes = frames.reduce((total, frame) => total + frame.size, 0);
    ensure(
      new Set(frames.map((frame) => frame.key)).size === frames.length &&
        usage.bytes + bytes <= config.maximumStorageBytes,
      "STORAGE_LIMIT",
      "The reviewed catalog storage allowance is unavailable.",
    );
    for (const frame of frames)
      await insertAsset(ctx, {
        organizationId: s.organization._id,
        key: frame.key,
        size: frame.size,
        type: "image/jpeg",
        state: "uploading",
        kind: "cloud_catalog_frame",
        expiresAt: consent.retainUntil,
        createdAt: now,
        updatedAt: now,
      });
  }
  const evidenceId =
    reused?.evidence._id ??
    (await ctx.db.insert("analysisEvidence", {
      owner: "service",
      organizationId: s.organization._id,
      createdAt: now,
      state: "blocked",
      canonical: s.permission.canonical,
      evidenceHash: s.neutralEvidence.evidenceHash,
      revisionHash: s.neutralEvidence.sourceRevisionHash,
      retainUntil: consent.retainUntil,
      ...(consent.resultRetention
        ? { resultRetention: consent.resultRetention }
        : {}),
      prepared: s.neutralEvidence,
      frames,
      extractionGeneration: s.evidence.extractionGeneration,
      extractionPreparationHash: await socialHash(
        canonicalJson(s.neutralEvidence),
      ),
    }));
  const versionId = await ctx.db.insert("analysisVersions", {
    owner: "service",
    organizationId: s.organization._id,
    createdAt: now,
    evidenceId,
    number: family.nextVersionNumber,
    state: reused ? "ready" : "blocked",
    output: s.analysis,
    outputHash: s.outputHash,
    retainUntil: consent.retainUntil,
    ...(consent.resultRetention
      ? { resultRetention: consent.resultRetention }
      : {}),
    recipeHash: s.version.recipeHash,
    variantKey,
    summary: s.analysis.summary,
    insightCount: s.analysis.insights.length,
    requestedModel: s.version.requestedModel,
    requestedEffort: s.version.requestedEffort,
    ...(s.version.reportedModel
      ? { reportedModel: s.version.reportedModel }
      : {}),
    ...(s.version.reportedEffort
      ? { reportedEffort: s.version.reportedEffort }
      : {}),
    provenance: "authenticated_host_reported",
    evaluation: "review_required",
  });
  const authority = cloudCatalogAuthority.parse({
    version: "cloud-neutral-catalog-authority-v1",
    funding: "own_subscription",
    maxApiUsd: 0,
    provenance: "authenticated_host_reported",
    canonical: s.permission.canonical,
    evidenceHash: s.neutralEvidence.evidenceHash,
    outputHash: s.outputHash,
    recipeHash: s.version.recipeHash,
    permissionId: s.permission.id,
    permissionHash: s.permissionHash,
    consentHash,
    contributedAt: now,
    retainUntil: consent.retainUntil,
    ...(consent.resultRetention
      ? { resultRetention: consent.resultRetention }
      : {}),
    requestedModel: s.version.requestedModel,
    requestedEffort: s.version.requestedEffort,
    reportedModel: s.version.reportedModel ?? null,
    reportedEffort: s.version.reportedEffort ?? null,
    settingsProviderAttested: false,
  });
  const artifactId = await ctx.db.insert("publicArtifacts", {
    organizationId: s.organization._id,
    origin: "cloud",
    postMetadata: publicPostMetadata(s),
    summary: s.analysis.summary,
    insightCount: s.analysis.insights.length,
    mainPoints: s.analysis.insights.slice(0, 3).map((i) => i.title),
    familyId: family._id,
    versionId,
    evidenceId,
    compatibilityKey,
    variantKey,
    contentHash: s.outputHash,
    language: "en",
    pipelineVersion: "work-cloud-retained-analysis-v1",
    schemaVersion: "neutral-cloud-analysis-v1",
    coverage: "sampled_transcript_frames",
    authority,
    storagePrefix: prefix,
    retainUntil: consent.retainUntil,
    ...(consent.resultRetention
      ? { resultRetention: consent.resultRetention }
      : {}),
    state: reused ? "eligible" : "staging",
    ...(!reused ? { copyTokenHash, copyExpiresAt: now + maximumCopyMs } : {}),
    createdAt: now,
    updatedAt: now,
  });
  await ctx.db.patch(family._id, {
    members: [
      ...family.members,
      { artifactId, versionId, evidenceId, number: family.nextVersionNumber },
    ],
    nextVersionNumber: family.nextVersionNumber + 1,
    retainUntil: Math.max(family.retainUntil, consent.retainUntil),
    ...(consent.resultRetention
      ? { resultRetention: consent.resultRetention }
      : {}),
    updatedAt: now,
  });
  const contributionId = await ctx.db.insert("catalogContributions", {
    organizationId: s.source.organizationId,
    actor: s.actor._id,
    sourceId: s.source._id,
    versionId: s.version._id,
    sourceEvidenceId: s.evidence._id,
    artifactId,
    key: args.key,
    copyTokenHash,
    consent,
    consentHash,
    ...(automaticActor
      ? { automaticPolicyHash: s.source.catalogPolicy!.policyHash }
      : {}),
    evidenceHash: s.neutralEvidence.evidenceHash,
    outputHash: s.outputHash,
    permissionHash: s.permissionHash,
    state: reused ? "published" : "copying",
    createdAt: now,
    updatedAt: now,
    expiresAt: now + maximumCopyMs,
    retainUntil: consent.retainUntil,
    ...(consent.resultRetention
      ? { resultRetention: consent.resultRetention }
      : {}),
  });
  await ctx.scheduler.runAfter(
    Math.max(0, consent.retainUntil - now),
    internal.cloudCatalog.expireArtifact,
    { artifactId },
  );
  if (!reused)
    await ctx.scheduler.runAfter(
      maximumCopyMs,
      internal.cloudCatalog.expireCopy,
      { artifactId, copyTokenHash, contributionId },
    );
  await audit(
    ctx,
    s.source.organizationId,
    s.actor._id,
    "catalog.contribution_requested",
    `${s.source._id}:${s.version._id}:${contributionId}`,
  );
  return {
    existing: !!reused,
    contributionId,
    state: reused ? "published" : "copying",
    ...(!reused ? { copyToken } : {}),
  };
}

export const prepare = internalMutation({
  args: { ...selected, key: v.string(), consent: v.any() },
  returns: v.any(),
  handler: (ctx, args) => prepareContribution(ctx, args),
});

export const prepareAutomatic = internalMutation({
  args: {
    sourceId: v.id("sources"),
    actorId: v.id("users"),
    generation: v.number(),
    versionId: v.optional(v.id("analysisVersions")),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const source = await ctx.db.get(args.sourceId);
    if (
      !catalogConfiguration()?.defaultPolicy ||
      !source?.catalogPolicy ||
      source.generation !== args.generation ||
      source.catalogPolicy.actor !== args.actorId ||
      source.state !== "ready"
    )
      return null;
    const owner = await automaticOwner(ctx, source._id, args.actorId);
    let versionId = args.versionId;
    if (!versionId) {
      const job = source.personalAnalysis;
      ensure(
        job?.executor === "work_cloud" &&
          job.state === "completed" &&
          job.actor === args.actorId &&
          job.approvedAt >= source.catalogPolicy.requestedAt,
        "APPROVAL_STALE",
        "Use the new authenticated completion bound to this request.",
      );
      versionId = (await freezeAnalysisBaseline(ctx, source, true))._id;
    }
    const prepared = await prepareContribution(
      ctx,
      { sourceId: source._id, versionId, key: `auto_${versionId}` },
      owner.actor._id,
    );
    if (prepared.state !== "published")
      await ctx.db.patch(source._id, {
        catalogStatus: { state: "pending", versionId, updatedAt: Date.now() },
      });
    return { ...prepared, versionId };
  },
});

export const finishAutomatic = internalMutation({
  args: { contributionId: v.id("catalogContributions") },
  returns: v.null(),
  handler: async (ctx, { contributionId }) => {
    const row = await ctx.db.get(contributionId);
    if (!row?.automaticPolicyHash || row.state !== "published") return null;
    const current = await currentCloudArtifact(ctx, row.artifactId);
    const policy = catalogConfiguration()?.defaultPolicy;
    if (
      !policy ||
      row.automaticPolicyHash !== (await socialHash(canonicalJson(policy)))
    )
      return null;
    const incumbent =
      current.family.selectedArtifactId &&
      current.family.selectionBasis !== "reviewed"
        ? await currentCloudArtifact(ctx, current.family.selectedArtifactId)
        : null;
    const preferred =
      incumbent &&
      preferredCatalogCandidate(
        current.authority,
        incumbent.authority,
        policy.modelPreference,
      );
    if (!current.family.selectedArtifactId || preferred) {
      await ctx.db.patch(current.family._id, {
        selectedArtifactId: current.artifact._id,
        selectionBasis: preferred ? "owner_model_priority" : "first_eligible",
        selectionRevision: current.family.selectionRevision + 1,
        reviewReason: preferred
          ? "Operator model/effort preference; actual settings and quality are not independently verified."
          : "First eligible automatic version; model quality is not independently benchmarked.",
        updatedAt: Date.now(),
      });
    }
    if (current.family.producer?.sourceId === row.sourceId)
      await ctx.db.patch(current.family._id, { producer: undefined });
    if (current.family.waiters?.length)
      await ctx.scheduler.runAfter(0, internal.cloudCatalog.fulfillWaiters, {
        familyId: current.family._id,
      });
    const source = await ctx.db.get(row.sourceId);
    const actor = await ctx.db.get(row.actor);
    if (
      source &&
      actor?.status === "active" &&
      source.catalogPolicy?.policyHash === row.automaticPolicyHash &&
      (!source.catalogStatus?.versionId ||
        source.catalogStatus.versionId === row.versionId)
    ) {
      await associateContributedCloudVersion(
        ctx,
        source,
        actor._id,
        current.artifact._id,
      );
      await ctx.db.patch(source._id, {
        catalogStatus: {
          state: "published",
          updatedAt: Date.now(),
          versionId: row.versionId,
          artifactId: current.artifact._id,
        },
      });
    }
    return null;
  },
});

export const automaticOutcome = internalMutation({
  args: {
    sourceId: v.id("sources"),
    actorId: v.id("users"),
    generation: v.number(),
    state: v.union(v.literal("unknown"), v.literal("failed")),
    versionId: v.optional(v.id("analysisVersions")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const source = await ctx.db.get(args.sourceId);
    if (
      source?.catalogPolicy?.actor === args.actorId &&
      source.generation === args.generation &&
      source.state !== "deleted" &&
      source.catalogStatus?.state !== "published" &&
      source.catalogStatus?.versionId === args.versionId
    )
      await ctx.db.patch(source._id, {
        catalogStatus: {
          state: args.state,
          updatedAt: Date.now(),
          ...(args.versionId ? { versionId: args.versionId } : {}),
        },
      });
    return null;
  },
});

export const expireWaiter = internalMutation({
  args: {
    familyId: v.id("catalogFamilies"),
    sourceId: v.id("sources"),
    actorId: v.id("users"),
    generation: v.number(),
    expiresAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (args.expiresAt > Date.now()) return null;
    const family = await ctx.db.get(args.familyId),
      source = await ctx.db.get(args.sourceId);
    if (
      source?.catalogWait?.familyId === args.familyId &&
      source.catalogWait.actor === args.actorId &&
      source.catalogWait.generation === args.generation &&
      source.catalogWait.expiresAt === args.expiresAt
    )
      await ctx.db.patch(source._id, { catalogWait: undefined });
    if (family?.waiters?.length)
      await ctx.db.patch(family._id, {
        waiters: family.waiters.filter(
          (w) =>
            !(
              w.sourceId === args.sourceId &&
              w.actor === args.actorId &&
              w.generation === args.generation &&
              w.expiresAt === args.expiresAt
            ),
        ),
        updatedAt: Date.now(),
      });
    return null;
  },
});

export const fulfillWaiters = internalMutation({
  args: { familyId: v.id("catalogFamilies") },
  returns: v.null(),
  handler: async (ctx, { familyId }) => {
    const family = await ctx.db.get(familyId);
    if (
      !catalogConfiguration()?.defaultPolicy ||
      !family?.selectedArtifactId ||
      family.state !== "active" ||
      !family.waiters?.length
    )
      return null;
    await currentCloudArtifact(ctx, family.selectedArtifactId);
    const batch = family.waiters.slice(0, 20);
    for (const waiter of batch) {
      const source = await ctx.db.get(waiter.sourceId),
        actor = await ctx.db.get(waiter.actor);
      const organization = await ctx.db.get(waiter.organizationId);
      const membership = await ctx.db
        .query("memberships")
        .withIndex("by_pair", (q) =>
          q
            .eq("organizationId", waiter.organizationId)
            .eq("userId", waiter.actor),
        )
        .unique();
      if (
        !source ||
        source.organizationId !== waiter.organizationId ||
        source.generation !== waiter.generation ||
        source.catalogWait?.familyId !== familyId ||
        source.catalogWait.actor !== waiter.actor ||
        actor?.status !== "active" ||
        organization?.status !== "active" ||
        !membership ||
        !["owner", "admin", "member"].includes(membership.role)
      )
        continue;
      if (waiter.expiresAt > Date.now())
        await attachCloudCache(ctx, source, actor._id);
      const current = await ctx.db.get(source._id);
      if (current?.catalogWait?.familyId === familyId)
        await ctx.db.patch(source._id, { catalogWait: undefined });
    }
    await ctx.db.patch(familyId, {
      waiters: family.waiters.slice(batch.length),
      updatedAt: Date.now(),
    });
    if (family.waiters.length > batch.length)
      await ctx.scheduler.runAfter(0, internal.cloudCatalog.fulfillWaiters, {
        familyId,
      });
    return null;
  },
});

async function copyContext(
  ctx: QueryCtx,
  args: { contributionId: Id<"catalogContributions">; copyToken: string },
) {
  const row = await ctx.db.get(args.contributionId);
  ensure(
    row &&
      row.state === "copying" &&
      row.expiresAt > Date.now() &&
      row.copyTokenHash === (await socialHash(args.copyToken)),
    "APPROVAL_STALE",
    "This copy operation is no longer current.",
  );
  const s = await snapshot(
    ctx,
    {
      sourceId: row.sourceId,
      versionId: row.versionId,
    },
    row.automaticPolicyHash ? row.actor : undefined,
  );
  ensure(
    row.actor === s.actor._id &&
      (!row.automaticPolicyHash ||
        row.automaticPolicyHash === s.source.catalogPolicy?.policyHash) &&
      row.organizationId === s.source.organizationId &&
      row.sourceEvidenceId === s.evidence._id &&
      row.evidenceHash === s.neutralEvidence.evidenceHash &&
      row.outputHash === s.outputHash &&
      row.permissionHash === s.permissionHash,
    "APPROVAL_STALE",
    "Contribution authority changed.",
  );
  const artifact = await ctx.db.get(row.artifactId),
    evidence = cloudArtifact(artifact)
      ? await ctx.db.get(artifact.evidenceId)
      : null;
  const family = cloudArtifact(artifact)
    ? await ctx.db.get(artifact.familyId)
    : null;
  ensure(
    cloudArtifact(artifact) &&
      family?.state === "active" &&
      family.permissionHash === s.permissionHash &&
      artifact.state === "staging" &&
      artifact.copyTokenHash === row.copyTokenHash &&
      artifact.copyExpiresAt! > Date.now() &&
      evidence?.owner === "service" &&
      evidence.state === "blocked" &&
      evidence.frames.length === s.evidence.frames.length,
    "APPROVAL_STALE",
    "Staged evidence changed.",
  );
  const meter = await ctx.db
    .query("storageUsage")
    .withIndex("by_org", (q) => q.eq("organizationId", artifact.organizationId))
    .unique();
  ensure(
    meter && meter.bytes <= catalogConfiguration()!.maximumStorageBytes,
    "STORAGE_LIMIT",
    "The catalog storage allowance changed before copying.",
  );
  for (const frame of evidence.frames) {
    const asset = await ctx.db
      .query("assets")
      .withIndex("by_key", (q) => q.eq("key", frame.key))
      .unique();
    ensure(
      asset?.organizationId === artifact.organizationId &&
        asset.kind === "cloud_catalog_frame" &&
        asset.state === "uploading" &&
        asset.size === frame.size &&
        asset.expiresAt === artifact.retainUntil &&
        !(await ctx.db
          .query("objectDeletions")
          .withIndex("by_key", (q) => q.eq("key", frame.key))
          .unique()),
      "APPROVAL_STALE",
      "The catalog storage reservation was retired.",
    );
  }
  return {
    row,
    artifact,
    evidence,
    frames: s.evidence.frames.map((original) => {
      const target = evidence.frames.find(
        (f) => f.frameId === original.frameId,
      );
      ensure(
        target &&
          target.sha256 === original.sha256 &&
          target.size === original.size,
        "INVALID_EVIDENCE",
        "The copy manifest changed.",
      );
      return { ...original, targetKey: target.key };
    }),
  };
}
export const copyInput = internalQuery({
  args: copying,
  returns: v.any(),
  handler: copyContext,
});
export const commitCopy = internalMutation({
  args: copying,
  returns: v.object({ published: v.literal(true) }),
  handler: async (ctx, args) => {
    const c = await copyContext(ctx, args);
    for (const frame of c.evidence.frames) {
      const asset = (await ctx.db
        .query("assets")
        .withIndex("by_key", (q) => q.eq("key", frame.key))
        .unique())!;
      await ctx.db.patch(asset._id, {
        state: "complete",
        ...(c.artifact.resultRetention === "until_deleted"
          ? { expiresAt: undefined }
          : {}),
        updatedAt: Date.now(),
      });
    }
    await ctx.db.patch(c.evidence._id, { state: "retained" });
    await ctx.db.patch(c.artifact.versionId, { state: "ready" });
    await ctx.db.patch(c.artifact._id, {
      state: "eligible",
      copyTokenHash: undefined,
      copyExpiresAt: undefined,
      updatedAt: Date.now(),
    });
    await ctx.db.patch(c.row._id, {
      state: "published",
      updatedAt: Date.now(),
    });
    return { published: true as const };
  },
});
export const expireCopy = internalMutation({
  args: {
    artifactId: v.id("publicArtifacts"),
    copyTokenHash: v.string(),
    contributionId: v.id("catalogContributions"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const a = await ctx.db.get(args.artifactId);
    if (
      !cloudArtifact(a) ||
      a.state !== "staging" ||
      a.copyTokenHash !== args.copyTokenHash ||
      a.copyExpiresAt! > Date.now()
    )
      return null;
    await retireCloudArtifact(ctx, a._id);
    const contribution = await ctx.db.get(args.contributionId);
    if (
      contribution?.state === "copying" &&
      contribution.copyTokenHash === args.copyTokenHash
    )
      await ctx.db.patch(contribution._id, {
        state: "unknown",
        updatedAt: Date.now(),
      });
    return null;
  },
});
export const failCopy = internalMutation({
  args: copying,
  returns: v.object({
    state: v.union(
      v.literal("published"),
      v.literal("unknown"),
      v.literal("withdrawn"),
    ),
  }),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.contributionId);
    ensure(
      row && row.copyTokenHash === (await socialHash(args.copyToken)),
      "APPROVAL_STALE",
      "This copy receipt is unavailable.",
    );
    if (row.state === "published") return { state: "published" as const };
    if (row.state === "withdrawn") return { state: "withdrawn" as const };
    const artifact = await ctx.db.get(row.artifactId);
    if (
      cloudArtifact(artifact) &&
      artifact.state === "staging" &&
      artifact.copyTokenHash === row.copyTokenHash
    )
      await retireCloudArtifact(ctx, artifact._id);
    await ctx.db.patch(row._id, { state: "unknown", updatedAt: Date.now() });
    return { state: "unknown" as const };
  },
});
export const expireArtifact = internalMutation({
  args: { artifactId: v.id("publicArtifacts") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const a = await ctx.db.get(args.artifactId);
    if (cloudArtifact(a) && !resultRetained(a))
      await retireCloudArtifact(ctx, a._id);
    return null;
  },
});
export const expireAlias = internalMutation({
  args: { id: v.id("catalogAliases") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    if (row && !resultRetained(row)) await ctx.db.delete(row._id);
    return null;
  },
});

export const withdrawContribution = mutation({
  args: { contributionId: v.id("catalogContributions") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.contributionId);
    ensure(row, "SOURCE_UNAVAILABLE", "This contribution is unavailable.");
    const owner = await access(ctx, row.organizationId, ["owner"]);
    ensure(
      row.actor === owner.actor._id,
      "FORBIDDEN",
      "Withdraw only your own contribution.",
    );
    await withdrawCatalogContribution(ctx, row);
    await audit(
      ctx,
      row.organizationId,
      owner.actor._id,
      "catalog.contribution_withdrawn",
      row._id,
    );
    return null;
  },
});

export const own = query({
  args: {
    organizationId: v.id("organizations"),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const { actor } = await access(ctx, args.organizationId);
    ensure(
      args.paginationOpts.numItems >= 1 && args.paginationOpts.numItems <= 20,
      "INVALID_INPUT",
      "Read at most twenty contribution receipts.",
    );
    const result = await ctx.db
      .query("catalogContributions")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .order("desc")
      .paginate(args.paginationOpts);
    const page = [];
    for (const row of result.page) {
      if (row.actor !== actor._id) continue;
      const artifact = await ctx.db.get(row.artifactId),
        family = cloudArtifact(artifact)
          ? await ctx.db.get(artifact.familyId)
          : null;
      page.push({
        id: row._id,
        canonical: family?.canonical ?? null,
        state: row.state,
        createdAt: row.createdAt,
        retainUntil: row.retainUntil,
      });
    }
    return {
      page,
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});

export const saveNotes = mutation({
  args: {
    ...selected,
    expectedUpdatedAt: v.number(),
    privateNote: v.string(),
    corrections: v.array(v.object({ insightId: v.string(), text: v.string() })),
  },
  returns: v.object({ updatedAt: v.number() }),
  handler: async (ctx, args) => {
    const { source, actor } = await historySource(ctx, args.sourceId, true);
    const { layer } = await cloudSourceFamily(ctx, source);
    const { version } = await retainedVersion(ctx, source, args.versionId);
    ensure(
      layer.actor === actor._id && layer.updatedAt === args.expectedUpdatedAt,
      "APPROVAL_STALE",
      "Refresh your personal notes before editing.",
    );
    ensure(
      args.privateNote.length <= 6000 &&
        args.corrections.length <= 20 &&
        args.corrections.every(
          (c) =>
            c.text.length <= 2000 &&
            version.output.insights.some(
              (i: { id: string }) => i.id === c.insightId,
            ),
        ) &&
        !containsSecret(
          canonicalJson({
            note: args.privateNote,
            corrections: args.corrections,
          }),
        ),
      "INVALID_INPUT",
      "Use bounded notes and insight IDs from this exact analysis version.",
    );
    const notesHistory = layer.notesHistory.filter(
      (entry) => entry.versionId !== version._id,
    );
    ensure(
      notesHistory.length < 200,
      "LIMIT_EXCEEDED",
      "This saved post reached its note history limit.",
    );
    const updatedAt = Math.max(Date.now(), layer.updatedAt + 1);
    notesHistory.push({
      versionId: version._id,
      privateNote: args.privateNote,
      corrections: args.corrections,
      updatedAt,
    });
    await ctx.db.patch(layer._id, {
      notesVersionId: version._id,
      privateNote: args.privateNote,
      corrections: args.corrections,
      notesHistory,
      updatedAt,
    });
    return { updatedAt };
  },
});

export const invalidateFamily = mutation({
  args: { familyId: v.id("catalogFamilies"), reason: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const family = await ctx.db.get(args.familyId);
    ensure(family, "SOURCE_UNAVAILABLE", "This catalog family is unavailable.");
    const owner = await access(ctx, family.organizationId, ["owner"]);
    const reason = cloudCatalogAssessment.shape.reason.parse(args.reason);
    await ctx.db.patch(family._id, {
      state: "blocked",
      selectedArtifactId: undefined,
      selectionRevision: family.selectionRevision + 1,
      reviewReason: reason,
      updatedAt: Date.now(),
    });
    // Reads and late copy commits stop in this transaction; byte cleanup is bounded.
    await ctx.scheduler.runAfter(0, internal.cloudCatalog.retireFamily, {
      familyId: family._id,
      offset: 0,
    });
    await audit(
      ctx,
      family.organizationId,
      owner.actor._id,
      "catalog.canonical_withdrawn",
      family._id,
    );
    return null;
  },
});
export const retireFamily = internalMutation({
  args: { familyId: v.id("catalogFamilies"), offset: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const family = await ctx.db.get(args.familyId);
    if (!family || family.state !== "blocked") return null;
    ensure(
      Number.isSafeInteger(args.offset) && args.offset >= 0,
      "INVALID_INPUT",
      "Invalid retirement cursor.",
    );
    for (const member of family.members.slice(args.offset, args.offset + 5))
      await retireCloudArtifact(ctx, member.artifactId);
    if (args.offset + 5 < family.members.length)
      await ctx.scheduler.runAfter(0, internal.cloudCatalog.retireFamily, {
        familyId: family._id,
        offset: args.offset + 5,
      });
    return null;
  },
});

const assessment = v.object({
  rubric: v.literal("evidence-review-v1"),
  fidelity: v.number(),
  completeness: v.number(),
  citationAccuracy: v.number(),
  uncertainty: v.number(),
  usefulness: v.number(),
  reason: v.string(),
});
async function recommendationReview(
  ctx: QueryCtx,
  artifactId: Id<"publicArtifacts">,
  value: unknown,
) {
  const a = await currentCloudArtifact(ctx, artifactId);
  const owner = await access(ctx, a.artifact.organizationId, ["owner"]);
  const review = cloudCatalogAssessment.parse(value);
  const incumbent = a.family.selectedArtifactId
    ? await currentCloudArtifact(ctx, a.family.selectedArtifactId)
    : null;
  const binding = {
    rubric: review.rubric,
    familyId: a.family._id,
    revision: a.family.selectionRevision,
    candidate: {
      id: a.artifact._id,
      outputHash: a.artifact.contentHash,
      evidenceHash: a.evidence.evidenceHash,
      recipeHash: a.version.recipeHash,
    },
    incumbent: incumbent
      ? {
          id: incumbent.artifact._id,
          outputHash: incumbent.artifact.contentHash,
          evidenceHash: incumbent.evidence.evidenceHash,
        }
      : null,
    permissionHash: a.family.permissionHash,
    assessment: review,
  };
  return {
    a,
    owner,
    review,
    reviewHash: await socialHash(canonicalJson(binding)),
    incumbent,
  };
}
export const reviewRecommendation = query({
  args: { artifactId: v.id("publicArtifacts"), assessment },
  returns: v.any(),
  handler: async (ctx, args) => {
    const r = await recommendationReview(ctx, args.artifactId, args.assessment);
    return {
      reviewHash: r.reviewHash,
      selectionRevision: r.a.family.selectionRevision,
      candidate: {
        versionId: r.a.version._id,
        output: r.a.output,
        evidence: r.a.prepared,
        requestedModel: r.a.version.requestedModel,
        requestedEffort: r.a.version.requestedEffort,
      },
      incumbent: r.incumbent
        ? {
            versionId: r.incumbent.version._id,
            output: r.incumbent.output,
            evidence: r.incumbent.prepared,
          }
        : null,
      qualityVerdict: "operator_review_required",
      settingsProviderAttested: false,
    };
  },
});
export const selectRecommendation = mutation({
  args: {
    artifactId: v.id("publicArtifacts"),
    expectedSelectionRevision: v.number(),
    assessment,
    reviewHash: v.string(),
  },
  returns: v.object({ selectionRevision: v.number() }),
  handler: async (ctx, args) => {
    ensure(
      catalogConfiguration(),
      "POLICY_BLOCKED",
      "Catalog publication is unavailable.",
    );
    await recentAuthentication(ctx, "promote_catalog_recommendation");
    const { a, owner, review, reviewHash } = await recommendationReview(
      ctx,
      args.artifactId,
      args.assessment,
    );
    ensure(
      a.family.selectionRevision === args.expectedSelectionRevision &&
        args.reviewHash === reviewHash,
      "APPROVAL_STALE",
      "Review the current comparison and recommendation.",
    );
    ensure(
      review.fidelity >= 4 &&
        review.citationAccuracy >= 4 &&
        review.uncertainty >= 4 &&
        review.completeness >= 3 &&
        review.usefulness >= 3 &&
        a.output.insights.length > 0 &&
        a.output.insights.every(
          (insight) => insight.confidence !== "unsupported",
        ),
      "POLICY_BLOCKED",
      "A shared recommendation needs an evidence review that passes the published rubric. Unsupported claims cannot be promoted.",
    );
    const selectionRevision = a.family.selectionRevision + 1;
    await ctx.db.patch(a.family._id, {
      selectedArtifactId: a.artifact._id,
      selectionBasis: "reviewed",
      selectionRevision,
      reviewHash: args.reviewHash,
      reviewReason: canonicalJson(review),
      updatedAt: Date.now(),
    });
    await audit(
      ctx,
      a.artifact.organizationId,
      owner.actor._id,
      "catalog.recommendation_selected",
      `${a.family._id}:${a.artifact._id}:${selectionRevision}`,
    );
    return { selectionRevision };
  },
});
