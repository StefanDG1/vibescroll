import { v } from "convex/values";
import { internalMutation } from "./lib/projectedMutations";
import { internalQuery } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { reserve } from "./product";
import { workflow } from "./workflows";
import {
  serviceSourceAuthority,
  serviceCompatibility,
  invalidateServiceSource,
} from "./lib/serviceArtifacts";
import { creatorPolicyCanonical } from "./lib/creatorPolicy";
import {
  orderedIntakeAssets,
  orderedIntakeMetadata,
} from "../packages/social/ordered-intake";
import { orderedDiagnostics } from "../packages/social/diagnostics";
import { orderedMediaSchema } from "../packages/social/analysis";
import {
  requireSocialRights,
  socialHash,
  validateSocialEvidence,
} from "../packages/social/contracts";
import { canonicalJson } from "../packages/contracts/canonical-json.mjs";
import { googleConfigured } from "../packages/providers/google-inference";
import { requestServiceArtifactCore } from "./serviceArtifactRuntime";
import { neutralSocialContract } from "../packages/social/prompts";
import { containsSecret } from "../packages/policy/secrets.mjs";

const pipelineVersion = "ordered-preparation-v1";
const same = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);
function gates() {
  if (
    process.env.MEDIA_VERIFIED !== "true" ||
    process.env.ORDERED_MEDIA_VERIFIED !== "true" ||
    process.env.MANAGED_INFERENCE_ROUTE !== "google_metered" ||
    !googleConfigured()
  )
    throw Error("ORDERED_PREPARATION_UNAVAILABLE");
}
function bound(value: unknown) {
  const text = canonicalJson(value);
  if (
    new TextEncoder().encode(text).length > 512 * 1024 ||
    containsSecret(text)
  )
    throw Error("ORDERED_PREPARATION_SIZE_OR_SECRET");
}
async function assetRows(
  ctx: QueryCtx,
  source: Doc<"sources">,
  assets: ReturnType<typeof orderedIntakeAssets.parse>,
) {
  const now = Date.now();
  const result = [];
  for (const asset of assets) {
    const row = await ctx.db
      .query("assets")
      .withIndex("by_key", (q) => q.eq("key", asset.key))
      .unique();
    const retired = await ctx.db
      .query("objectDeletions")
      .withIndex("by_key", (q) => q.eq("key", asset.key))
      .unique();
    if (
      retired ||
      !row ||
      row.organizationId !== source.organizationId ||
      row.sourceId !== source._id ||
      row.sourceGeneration !== source.generation ||
      row.state !== "complete" ||
      row.size !== asset.bytes ||
      (row.expiresAt !== undefined && row.expiresAt <= now) ||
      !(
        asset.kind === "image"
          ? ["image/jpeg", "image/png", "image/webp"]
          : ["video/mp4", "video/webm"]
      ).includes(row.type)
    )
      throw Error("ORDERED_PRIVATE_ASSET_CHANGED");
    result.push(row);
  }
  return result;
}
async function binding(
  source: Doc<"sources">,
  stage: NonNullable<Doc<"sources">["orderedPreparation"]>,
  policyCanonical: string,
) {
  return socialHash(
    canonicalJson({
      sourceId: source._id,
      organizationId: source.organizationId,
      actor: source.managedAnalysisActor,
      generation: stage.generation,
      metadata: stage.metadata,
      assets: stage.assets,
      language: stage.language,
      pipelineVersion: stage.pipelineVersion,
      computeCreditsPerSecond: stage.computeCreditsPerSecond,
      deadline: stage.deadline,
      policyCanonical,
    }),
  );
}
async function current(
  ctx: QueryCtx,
  id: Doc<"sources">["_id"],
  generation: number,
) {
  gates();
  const authority = await serviceSourceAuthority(ctx, await ctx.db.get(id));
  const { source, config } = authority,
    stage = source.orderedPreparation;
  if (
    !stage ||
    source.generation !== generation ||
    stage.generation !== generation ||
    stage.pipelineVersion !== pipelineVersion ||
    stage.deadline <= Date.now() ||
    stage.schemaVersion !== "ordered-preparation-v1" ||
    !["queued", "processing"].includes(source.state) ||
    source.currentRevisionId ||
    source.publicImportId ||
    source.personalAnalysis?.generation === generation
  )
    throw Error("ORDERED_PREPARATION_CHANGED");
  const metadata = orderedIntakeMetadata.parse(stage.metadata),
    assets = orderedIntakeAssets.parse(stage.assets);
  if (
    metadata.canonical !== source.canonical ||
    metadata.providerEvidenceId !== config.rights.evidenceId ||
    metadata.observedAt < config.rights.reviewedAt ||
    metadata.observedAt > Date.now() ||
    stage.bindingHash !==
      (await binding(source, stage, creatorPolicyCanonical(config)))
  )
    throw Error("ORDERED_PREPARATION_BINDING_CHANGED");
  requireSocialRights(
    config.rights,
    {
      provider: config.provider,
      platform: metadata.platform,
      creatorId: metadata.creatorId,
      workload: "analysis",
      route: "managed_api",
    },
    Date.now(),
  );
  requireSocialRights(
    config.rights,
    {
      provider: config.provider,
      platform: metadata.platform,
      creatorId: metadata.creatorId,
      workload: "media",
      route: "managed_api",
    },
    Date.now(),
  );
  const reservation = await ctx.db
    .query("reservations")
    .withIndex("by_key", (q) =>
      q
        .eq("organizationId", source.organizationId)
        .eq("key", `source:${id}:${generation}`),
    )
    .unique();
  if (
    !reservation ||
    reservation.state !== "active" ||
    reservation.max !== 10 ||
    reservation.expiresAt <= Date.now()
  )
    throw Error("ORDERED_USAGE_RECONCILIATION_REQUIRED");
  await assetRows(ctx, source, assets);
  return { ...authority, stage, metadata, assets, reservation };
}
export const request = internalMutation({
  args: {
    id: v.id("sources"),
    expectedGeneration: v.number(),
    metadata: v.any(),
    assets: v.any(),
    language: v.string(),
    maxCredits: v.literal(10),
  },
  handler: async (ctx, a) => {
    gates();
    const metadata = orderedIntakeMetadata.parse(a.metadata),
      assets = orderedIntakeAssets.parse(a.assets);
    bound({ metadata, assets });
    await neutralSocialContract(a.language);
    const { source, config } = await serviceSourceAuthority(
      ctx,
      await ctx.db.get(a.id),
    );
    if (
      !Number.isSafeInteger(a.expectedGeneration) ||
      source.generation !== a.expectedGeneration ||
      !["saved", "failed", "ready"].includes(source.state) ||
      source.currentRevisionId ||
      source.publicImportId ||
      source.personalAnalysis?.generation === source.generation ||
      source.canonical !== metadata.canonical ||
      metadata.providerEvidenceId !== config.rights.evidenceId ||
      metadata.observedAt < config.rights.reviewedAt ||
      metadata.observedAt > Date.now()
    )
      throw Error("ORDERED_PREPARATION_SOURCE_CHANGED");
    requireSocialRights(
      config.rights,
      {
        provider: config.provider,
        platform: metadata.platform,
        creatorId: metadata.creatorId,
        workload: "analysis",
        route: "managed_api",
      },
      Date.now(),
    );
    requireSocialRights(
      config.rights,
      {
        provider: config.provider,
        platform: metadata.platform,
        creatorId: metadata.creatorId,
        workload: "media",
        route: "managed_api",
      },
      Date.now(),
    );
    requireSocialRights(
      config.rights,
      {
        provider: config.provider,
        platform: metadata.platform,
        creatorId: metadata.creatorId,
        workload: "reuse",
        route: "managed_api",
      },
      Date.now(),
    );
    const rate = Number(process.env.SANDBOX_CREDITS_PER_SECOND);
    if (!Number.isFinite(rate) || rate <= 0 || Math.ceil(300 * rate) >= 10)
      throw Error("ORDERED_COMPUTE_BUDGET_UNAVAILABLE");
    const rows = await assetRows(ctx, source, assets);
    if (source.state === "ready") {
      const prior = source.orderedPreparation;
      if (
        !prior ||
        prior.generation !== source.generation ||
        prior.language !== a.language ||
        !same(prior.metadata, metadata) ||
        !same(prior.assets, assets)
      )
        throw Error("ORDERED_PREPARATION_SOURCE_CHANGED");
      return requestServiceArtifactCore(ctx, {
        id: source._id,
        expectedGeneration: source.generation,
        language: a.language,
      });
    }
    const existing = await ctx.db
      .query("sources")
      .withIndex("by_canonical", (q) =>
        q
          .eq("organizationId", source.organizationId)
          .eq("canonical", source.canonical),
      )
      .unique();
    if (existing?._id !== source._id)
      throw Error("ORDERED_SOURCE_IDENTITY_CHANGED");
    const prior = await ctx.db
      .query("reservations")
      .withIndex("by_key", (q) =>
        q
          .eq("organizationId", source.organizationId)
          .eq("key", `source:${source._id}:${source.generation}`),
      )
      .unique();
    if (prior?.state === "active")
      throw Error("ORDERED_USAGE_RECONCILIATION_REQUIRED");
    const now = Date.now(),
      generation = source.generation + 1;
    const retainUntil = Math.min(
      config.expiresAt,
      config.rights.expiresAt,
      metadata.observedAt + config.rights.maxRetentionMs,
      source.sourceRetentionUntil ?? Infinity,
    );
    if (retainUntil <= now) throw Error("ORDERED_RETENTION_EXPIRED");
    const stage = {
      schemaVersion: pipelineVersion as "ordered-preparation-v1",
      generation,
      bindingHash: "",
      language: a.language,
      pipelineVersion,
      phase: "queued" as const,
      deadline: now + 540000,
      metadata,
      assets,
      computeCreditsPerSecond: rate,
      computeCredits: 0,
      inferenceMicros: 0,
      inputTokens: 0,
      outputTokens: 0,
      usageUnconfirmed: false,
      warnings: [] as string[],
      omissions: [] as {
        id: string;
        index: number;
        reason: "decode_unavailable";
      }[],
    };
    stage.bindingHash = await binding(
      source,
      stage,
      creatorPolicyCanonical(config),
    );
    await reserve(
      ctx,
      source.organizationId,
      `source:${source._id}:${generation}`,
      10,
    );
    for (const row of rows)
      await ctx.db.patch(row._id, { sourceGeneration: generation });
    await invalidateServiceSource(ctx, source._id, source.generation);
    await ctx.db.patch(source._id, {
      generation,
      state: "queued",
      processingStartedAt: now,
      processingReceipt: undefined,
      orderedPreparation: stage,
      orderedMedia: undefined,
      serviceIntent: undefined,
      analysis: undefined,
      summary: undefined,
      error: undefined,
      analysisPipelineVersion: undefined,
      typedAnalysisActor: undefined,
      creatorRights: {
        platform: metadata.platform,
        creatorId: metadata.creatorId,
        provider: config.provider,
        evidenceId: config.rights.evidenceId,
        policyCanonical: creatorPolicyCanonical(config),
        rightsHash: await socialHash(creatorPolicyCanonical(config)),
        expiresAt: Math.min(config.expiresAt, config.rights.expiresAt),
        deletionWithinMs: config.rights.deletionWithinMs,
      },
      sourceRetentionUntil: retainUntil,
      updatedAt: now,
    });
    await workflow.start(
      ctx,
      internal.workflows.sourceAnalysis,
      { id: source._id, generation, media: false, route: "ordered_prepare" },
      {
        startAsync: true,
        onComplete: internal.workflows.completed,
        context: null,
      },
    );
    return { generation, queued: true };
  },
});
export const begin = internalMutation({
  args: { id: v.id("sources"), generation: v.number() },
  handler: async (ctx, a) => {
    const source = await ctx.db.get(a.id);
    if (
      source?.orderedPreparation?.phase !== "queued" ||
      source.generation !== a.generation ||
      source.state !== "queued"
    )
      return { dispatched: false as const };
    const value = await current(ctx, a.id, a.generation);
    if (value.reservation.dispatchedAt !== undefined)
      throw Error("ORDERED_USAGE_RECONCILIATION_REQUIRED");
    await ctx.db.patch(value.reservation._id, {
      dispatchedAt: Date.now(),
      updatedAt: Date.now(),
    });
    await ctx.db.patch(a.id, {
      state: "processing",
      orderedPreparation: { ...value.stage, phase: "preparing" },
    });
    return {
      dispatched: true as const,
      stageJson: JSON.stringify(value.stage),
    };
  },
});
export const authorize = internalQuery({
  args: { id: v.id("sources"), generation: v.number() },
  handler: async (ctx, a) => {
    const value = await current(ctx, a.id, a.generation);
    if (
      value.stage.phase !== "preparing" ||
      value.reservation.dispatchedAt === undefined
    )
      throw Error("ORDERED_PREPARATION_CHANGED");
    return null;
  },
});
// Recording known usage grants no content or dispatch authority. It also works
// after a policy revocation, but never updates a replacement source generation.
export const recordProgress = internalMutation({
  args: {
    id: v.id("sources"),
    generation: v.number(),
    bindingHash: v.string(),
    computeCredits: v.number(),
    inferenceMicros: v.number(),
    inputTokens: v.number(),
    outputTokens: v.number(),
    usageUnconfirmed: v.boolean(),
  },
  handler: async (ctx, a) => {
    const source = await ctx.db.get(a.id),
      stage = source?.orderedPreparation;
    if (
      !source ||
      source.generation !== a.generation ||
      source.state !== "processing" ||
      stage?.phase !== "preparing" ||
      stage.bindingHash !== a.bindingHash
    )
      return;
    for (const [next, prior] of [
      [a.computeCredits, stage.computeCredits],
      [a.inferenceMicros, stage.inferenceMicros],
      [a.inputTokens, stage.inputTokens],
      [a.outputTokens, stage.outputTokens],
    ])
      if (!Number.isSafeInteger(next) || next < prior)
        throw Error("ORDERED_USAGE_INVALID");
    if (
      a.computeCredits > Math.ceil(300 * stage.computeCreditsPerSecond) ||
      a.computeCredits + Math.ceil(a.inferenceMicros / 10000) > 10
    )
      throw Error("ORDERED_USAGE_INVALID");
    await ctx.db.patch(a.id, {
      orderedPreparation: {
        ...stage,
        computeCredits: a.computeCredits,
        inferenceMicros: a.inferenceMicros,
        inputTokens: a.inputTokens,
        outputTokens: a.outputTokens,
        usageUnconfirmed: stage.usageUnconfirmed || a.usageUnconfirmed,
      },
    });
  },
});
export const finish = internalMutation({
  args: {
    id: v.id("sources"),
    generation: v.number(),
    bindingHash: v.string(),
    prepared: v.any(),
    warnings: v.any(),
    omissions: v.any(),
    computeCredits: v.number(),
    inferenceMicros: v.number(),
    inputTokens: v.number(),
    outputTokens: v.number(),
  },
  handler: async (ctx, a) => {
    const value = await current(ctx, a.id, a.generation);
    if (
      value.stage.phase !== "preparing" ||
      value.stage.bindingHash !== a.bindingHash ||
      value.reservation.dispatchedAt === undefined ||
      value.stage.usageUnconfirmed ||
      value.stage.computeCredits !== a.computeCredits ||
      value.stage.inferenceMicros !== a.inferenceMicros ||
      value.stage.inputTokens !== a.inputTokens ||
      value.stage.outputTokens !== a.outputTokens
    )
      throw Error("ORDERED_PREPARATION_CHANGED");
    const diagnostics = orderedDiagnostics.parse({
      warnings: a.warnings,
      omissions: a.omissions,
    });
    const raw = orderedMediaSchema.parse(a.prepared),
      media = await validateSocialEvidence(raw.post, raw.evidence);
    const prepared = { schemaVersion: "ordered-media-v1" as const, ...media };
    const {
      assets: _assets,
      captionHash: _captionHash,
      revisionHash: _revisionHash,
      coverage: _coverage,
      ...metadata
    } = media.post;
    if (
      !same(metadata, value.metadata) ||
      media.post.assets.length + diagnostics.omissions.length !==
        value.assets.length ||
      !value.assets.every(
        (input) =>
          media.post.assets.some(
            (asset) =>
              asset.id === input.id &&
              asset.index === input.index &&
              asset.kind === input.kind &&
              asset.contentHash === input.sha256 &&
              asset.bytes === input.bytes,
          ) ||
          diagnostics.omissions.some(
            (item) => item.id === input.id && item.index === input.index,
          ),
      ) ||
      media.post.assets.some(
        (asset) =>
          !asset.inspected ||
          (asset.kind === "video" &&
            asset.audioInspected === false &&
            media.evidence.some(
              (e) => e.assetId === asset.id && e.basis === "transcript",
            )),
      )
    )
      throw Error("ORDERED_PREPARED_INPUT_CHANGED");
    for (const n of [
      a.computeCredits,
      a.inferenceMicros,
      a.inputTokens,
      a.outputTokens,
    ])
      if (!Number.isSafeInteger(n) || n < 0)
        throw Error("ORDERED_USAGE_INVALID");
    if (
      a.computeCredits > Math.ceil(300 * value.stage.computeCreditsPerSecond) ||
      a.computeCredits + Math.ceil(a.inferenceMicros / 10000) >= 10
    )
      throw Error("ORDERED_FINAL_BUDGET_EXHAUSTED");
    bound({ prepared, ...diagnostics });
    const compatibility = await serviceCompatibility(
      prepared,
      value.stage.language,
      value.config.rights,
      Date.now(),
      diagnostics,
    );
    await ctx.db.patch(a.id, {
      state: "queued",
      orderedMedia: prepared,
      orderedPreparation: {
        ...value.stage,
        phase: "prepared",
        ...diagnostics,
        computeCredits: a.computeCredits,
        inferenceMicros: a.inferenceMicros,
        inputTokens: a.inputTokens,
        outputTokens: a.outputTokens,
      },
      serviceIntent: {
        schemaVersion: "service-social-v1",
        generation: a.generation,
        ...compatibility,
      },
    });
    return { prepared: true as const };
  },
});
