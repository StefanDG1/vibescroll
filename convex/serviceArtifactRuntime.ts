import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation } from "./lib/projectedMutations";
import { internal } from "./_generated/api";
import { workflow } from "./workflows";
import { reserve } from "./product";
import {
  serviceCompatibility,
  lookupServiceArtifact,
  commitServiceArtifact,
  serviceSourceAuthority,
} from "./lib/serviceArtifacts";
import {
  orderedMediaSchema,
  socialAnalysisOutput,
} from "../packages/social/analysis";
import { validateSocialEvidence } from "../packages/social/contracts";
import { canonicalJson } from "../packages/contracts/canonical-json.mjs";
import { googleConfigured } from "../packages/providers/google-inference";
import { inferencePayload } from "../packages/policy/inference-broker";
import {
  neutralSocialPrompt,
  neutralSocialMaxOutput,
} from "../packages/social/prompts";
import { z } from "zod";
import { containsSecret } from "../packages/policy/secrets.mjs";
import {
  orderedDiagnostics,
  emptyOrderedDiagnostics,
} from "../packages/social/diagnostics";

const same = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);
async function preparedServiceSource(
  ctx: QueryCtx,
  source: Doc<"sources"> | null,
  language: string,
) {
  const now = Date.now();
  const authority = await serviceSourceAuthority(ctx, source, now);
  source = authority.source;
  const config = authority.config;
  if (
    source.currentRevisionId ||
    source.personalAnalysis?.generation === source.generation
  )
    throw Error("SERVICE_SOURCE_UNAVAILABLE");
  const raw = orderedMediaSchema.parse(source.orderedMedia);
  const serialized = canonicalJson(raw);
  if (
    new TextEncoder().encode(serialized).length > 512 * 1024 ||
    containsSecret(serialized)
  )
    throw Error("SERVICE_ARTIFACT_SIZE_OR_SECRET");
  const prepared = {
    schemaVersion: "ordered-media-v1" as const,
    ...(await validateSocialEvidence(raw.post, raw.evidence)),
  };
  if (source.canonical !== prepared.post.canonical)
    throw Error("SERVICE_SOURCE_IDENTITY_CHANGED");
  const compatibility = await serviceCompatibility(
    prepared,
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
  const retainUntil = Math.min(
    config.expiresAt,
    config.rights.expiresAt,
    prepared.post.observedAt + config.rights.maxRetentionMs,
    source.sourceRetentionUntil ?? Infinity,
  );
  if (retainUntil <= now) throw Error("SERVICE_RETENTION_EXPIRED");
  return { source, prepared, compatibility, retainUntil };
}

// Only neutral inspected source data enters the model. In particular this does
// not spread a source document, categories, user context or private overlays.
export function neutralServicePayload(
  sourceId: string,
  generation: number,
  language: string,
  prepared: unknown,
  diagnostics: unknown = emptyOrderedDiagnostics,
  maxMicros = 100000,
) {
  const text = canonicalJson({
    sourceId,
    processingRunId: `${sourceId}:${generation}`,
    language,
    prepared,
    diagnostics: orderedDiagnostics.parse(diagnostics),
  });
  const parts = [];
  // The broker caps each text part at 200k UTF-16 units; split without dropping
  // evidence or splitting a surrogate pair, and retain its aggregate body cap.
  for (let offset = 0; offset < text.length;) {
    let end = Math.min(offset + 200000, text.length);
    if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1])) end--;
    parts.push({ text: text.slice(offset, end) });
    offset = end;
  }
  return inferencePayload.parse({
    schema: z.toJSONSchema(socialAnalysisOutput),
    prompt: neutralSocialPrompt,
    parts,
    maxOutput: neutralSocialMaxOutput,
    maxMicros,
  });
}

export async function requestServiceArtifactCore(
  ctx: MutationCtx,
  a: { id: Id<"sources">; expectedGeneration: number; language: string },
) {
  const source = await ctx.db.get(a.id);
  if (
    !Number.isSafeInteger(a.expectedGeneration) ||
    !source ||
    source.generation !== a.expectedGeneration
  )
    throw Error("SERVICE_GENERATION_CHANGED");
  const prepared = await preparedServiceSource(ctx, source, a.language);
  const cached = await lookupServiceArtifact(
    ctx,
    prepared.compatibility.compatibilityKey,
  );
  if (cached)
    return {
      artifactId: cached.artifact._id,
      generation: source.generation,
      cached: true,
      queued: false,
    };
  if (
    source.state === "ready" &&
    source.serviceIntent?.generation === source.generation &&
    same(source.serviceIntent, {
      schemaVersion: "service-social-v1",
      generation: source.generation,
      ...prepared.compatibility,
    })
  ) {
    const committed = await commitServiceArtifact(ctx, {
      sourceId: source._id,
      generation: source.generation,
      compatibilityKey: prepared.compatibility.compatibilityKey,
      result: source.analysis,
    });
    return {
      artifactId: committed.artifactId,
      generation: source.generation,
      cached: true,
      queued: false,
    };
  }
  if (["queued", "processing"].includes(source.state)) {
    if (
      !same(source.serviceIntent, {
        schemaVersion: "service-social-v1",
        generation: source.generation,
        ...prepared.compatibility,
      })
    )
      throw Error("SERVICE_INTENT_CHANGED");
    return { generation: source.generation, cached: false, queued: true };
  }
  if (source.state === "ready") throw Error("SERVICE_SOURCE_UNAVAILABLE");
  // Failed staged work requires the explicit bounded intake review. Carrying
  // its prior generation's counters into a fresh pure-inference reservation
  // would charge already-settled preparation again and weaken its asset fence.
  if (source.orderedPreparation)
    throw Error("ORDERED_PREPARATION_REVIEW_REQUIRED");
  if (
    process.env.MANAGED_INFERENCE_ROUTE !== "google_metered" ||
    !googleConfigured()
  )
    throw Error("SERVICE_MANAGED_ROUTE_UNAVAILABLE");
  const generation = source.generation + 1;
  neutralServicePayload(source._id, generation, a.language, prepared.prepared);
  // A stale worker's unresolved service hold must not be abandoned by moving to
  // a fresh generation, even when the new provider response might be cached.
  const previous = await ctx.db
    .query("reservations")
    .withIndex("by_key", (q) =>
      q
        .eq("organizationId", source.organizationId)
        .eq("key", `source:${source._id}:${source.generation}`),
    )
    .unique();
  if (previous?.state === "active")
    throw Error("SERVICE_USAGE_RECONCILIATION_REQUIRED");
  const canonical = await ctx.db
    .query("sources")
    .withIndex("by_canonical", (q) =>
      q
        .eq("organizationId", source.organizationId)
        .eq("canonical", source.canonical),
    )
    .unique();
  if (canonical?._id !== source._id)
    throw Error("SERVICE_SOURCE_IDENTITY_CHANGED");
  await reserve(
    ctx,
    source.organizationId,
    `source:${source._id}:${generation}`,
    10,
  );
  const now = Date.now();
  await ctx.db.patch(source._id, {
    generation,
    state: "queued",
    serviceIntent: {
      schemaVersion: "service-social-v1",
      generation,
      ...prepared.compatibility,
    },
    sourceRetentionUntil: prepared.retainUntil,
    analysis: undefined,
    summary: undefined,
    processingReceipt: undefined,
    processingStartedAt: now,
    error: undefined,
    personalAnalysis: undefined,
    workCloudSaveIntent: undefined,
    typedAnalysisActor: undefined,
    analysisPipelineVersion: undefined,
    updatedAt: now,
  });
  await workflow.start(
    ctx,
    internal.workflows.sourceAnalysis,
    { id: source._id, generation, media: false, route: "ordered_media" },
    {
      startAsync: true,
      onComplete: internal.workflows.completed,
      context: null,
    },
  );
  return { generation, cached: false, queued: true };
}
export const request = internalMutation({
  args: {
    id: v.id("sources"),
    expectedGeneration: v.number(),
    language: v.string(),
  },
  handler: requestServiceArtifactCore,
});

export const begin = internalMutation({
  args: { id: v.id("sources"), generation: v.number() },
  handler: async (ctx, a) => {
    const source = await ctx.db.get(a.id);
    if (
      !source ||
      source.generation !== a.generation ||
      source.state !== "queued" ||
      !source.serviceIntent
    )
      return { dispatched: false as const };
    if (
      process.env.MANAGED_INFERENCE_ROUTE !== "google_metered" ||
      !googleConfigured()
    )
      throw Error("SERVICE_MANAGED_ROUTE_UNAVAILABLE");
    const prepared = await preparedServiceSource(
      ctx,
      source,
      source.serviceIntent.language,
    );
    if (
      source.orderedPreparation &&
      (source.orderedPreparation.generation !== a.generation ||
        source.orderedPreparation.phase !== "prepared" ||
        source.orderedPreparation.usageUnconfirmed ||
        source.orderedPreparation.deadline <= Date.now() + 175000)
    )
      throw Error("ORDERED_INFERENCE_DEADLINE");
    if (
      !same(source.serviceIntent, {
        schemaVersion: "service-social-v1",
        generation: a.generation,
        ...prepared.compatibility,
      })
    )
      throw Error("SERVICE_INTENT_CHANGED");
    const reservation = await ctx.db
      .query("reservations")
      .withIndex("by_key", (q) =>
        q
          .eq("organizationId", source.organizationId)
          .eq("key", `source:${source._id}:${a.generation}`),
      )
      .unique();
    if (
      !reservation ||
      reservation.state !== "active" ||
      reservation.max !== 10 ||
      (source.orderedPreparation?.phase === "prepared"
        ? reservation.dispatchedAt === undefined ||
          source.orderedPreparation.generation !== a.generation ||
          source.orderedPreparation.deadline <= Date.now() ||
          source.orderedPreparation.inferenceDispatchedAt !== undefined
        : reservation.dispatchedAt !== undefined) ||
      reservation.expiresAt <= Date.now()
    )
      throw Error("SERVICE_DISPATCH_UNCONFIRMED");
    const payload = neutralServicePayload(
      source._id,
      a.generation,
      source.serviceIntent.language,
      prepared.prepared,
      source.orderedPreparation
        ? {
            warnings: source.orderedPreparation.warnings,
            omissions: source.orderedPreparation.omissions,
          }
        : emptyOrderedDiagnostics,
      source.orderedPreparation
        ? (10 - source.orderedPreparation.computeCredits) * 10000 -
            source.orderedPreparation.inferenceMicros
        : 100000,
    );
    await ctx.db.patch(reservation._id, {
      dispatchedAt: reservation.dispatchedAt ?? Date.now(),
      updatedAt: Date.now(),
    });
    await ctx.db.patch(source._id, {
      state: "processing",
      ...(source.orderedPreparation
        ? {
            orderedPreparation: {
              ...source.orderedPreparation,
              phase: "inference" as const,
              inferenceDispatchedAt: Date.now(),
            },
          }
        : {}),
    });
    return {
      dispatched: true as const,
      payloadJson: JSON.stringify(payload),
      compatibilityKey: prepared.compatibility.compatibilityKey,
      processingStartedAt: source.processingStartedAt!,
      preparationUsage: {
        computeCredits: source.orderedPreparation?.computeCredits ?? 0,
        inferenceMicros: source.orderedPreparation?.inferenceMicros ?? 0,
        inputTokens: source.orderedPreparation?.inputTokens ?? 0,
        outputTokens: source.orderedPreparation?.outputTokens ?? 0,
        warnings: source.orderedPreparation?.warnings ?? [],
      },
    };
  },
});
