import { v } from "convex/values";
import type { ServiceInvalidationReason } from "../packages/social/catalog-authority";
import { internal } from "./_generated/api";
import { z } from "zod";
import { query } from "./_generated/server";
import { internalMutation, mutation } from "./lib/projectedMutations";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { access, limit, audit } from "./lib";
import { workspaceReadable } from "./lib/workspacePrivacy";
import { syncCategories } from "./categories";
import { syncKnowledge } from "./knowledge";
import {
  invalidatePublicEditions,
  invalidatePublicSource,
} from "./publicKnowledge";
import { ensure, containsSecret } from "../packages/policy";
import {
  githubSourceUrl,
  redditSourceUrl,
  safeSourcePath,
} from "../packages/sources/urls";
import {
  directSourceEnabled,
  redditSourceEligibility,
} from "./lib/sourcePolicy";
export {
  directSourceEnabled,
  redditSourceEligibility,
} from "./lib/sourcePolicy";
import {
  createEvidence,
  excerptHash,
  registryHash,
  validateEvidenceRegistry,
} from "../packages/sources/evidence";
import {
  providerRetryAt,
  reserveProviderRequest,
  sourceLimits,
} from "../packages/sources/limits";

const writable = ["owner", "admin", "member"];
const selectionSchema = z.strictObject({
  canonical: z.string().max(2048),
  repositoryId: z.number().int().positive(),
  repository: z.string().max(140),
  commit: z.string().regex(/^[a-f0-9]{40}$/),
  files: z
    .array(
      z.strictObject({
        path: z.string().refine(safeSourcePath),
        blobSha: z.string().regex(/^[a-f0-9]{40}$/),
        size: z.number().int().positive().max(sourceLimits.github.fileBytes),
      }),
    )
    .max(sourceLimits.github.listing),
  omissions: z.array(z.string().max(200)).max(100),
  revisionPreview: z
    .strictObject({
      previousCommit: z.string().regex(/^[a-f0-9]{40}$/),
      nextCommit: z.string().regex(/^[a-f0-9]{40}$/),
      changedFiles: z.array(z.string()).max(20),
      unchangedFiles: z.array(z.string()).max(20),
      unavailableFiles: z.array(z.string()).max(20),
      completeListing: z.boolean(),
    })
    .optional(),
});
function providerOf(source: Doc<"sources">) {
  ensure(
    source.sourceType === "github_repository" ||
      source.sourceType === "reddit_thread",
    "UNSUPPORTED_SOURCE",
    "Choose a direct GitHub or Reddit source.",
  );
  return source.sourceType === "github_repository"
    ? ("github" as const)
    : ("reddit" as const);
}
async function actorCurrent(ctx: QueryCtx, request: Doc<"sourceAcquisitions">) {
  const [actor, organization, member, source] = await Promise.all([
    ctx.db.get(request.actor),
    ctx.db.get(request.organizationId),
    ctx.db
      .query("memberships")
      .withIndex("by_pair", (q) =>
        q
          .eq("organizationId", request.organizationId)
          .eq("userId", request.actor),
      )
      .unique(),
    ctx.db.get(request.sourceId),
  ]);
  return actor?.status === "active" &&
    workspaceReadable(organization, request.actor) &&
    !!member &&
    writable.includes(member.role) &&
    !!source &&
    source.organizationId === request.organizationId &&
    source.state !== "deleted" &&
    source.rightsAttested &&
    (!source.sourceRetentionUntil ||
      source.sourceRetentionUntil > Date.now()) &&
    source.generation === request.generation &&
    source.updatedAt === request.sourceRevision
    ? source
    : null;
}
async function revisionCapacity(ctx: QueryCtx, sourceId: Id<"sources">) {
  const history = await ctx.db
    .query("sourceRevisions")
    .withIndex("by_source", (q) => q.eq("sourceId", sourceId))
    .take(26);
  ensure(
    history.length < 25,
    "QUOTA_EXCEEDED",
    "This source has reached its bounded revision history limit.",
  );
}
async function requiresRightsReview(ctx: QueryCtx, source: Doc<"sources">) {
  if (!source.rightsAttested) return true;
  if (source.sourceRetentionUntil && source.sourceRetentionUntil <= Date.now())
    return true;
  const revision = source.currentRevisionId
    ? await ctx.db.get(source.currentRevisionId)
    : null;
  return !!(
    revision?.sourceId === source._id &&
    revision.organizationId === source.organizationId &&
    revision.revision?.retention?.retainUntil <= Date.now()
  );
}
export async function scrubUnusableBase(
  ctx: Parameters<typeof invalidatePublicSource>[0],
  source: Doc<"sources">,
  now: number,
  reason: ServiceInvalidationReason = "unspecified",
) {
  // Authored filing, notes and knowledge corrections are separate records.
  // New rights never reauthorize retained provider bytes or their old analysis.
  await ctx.db.patch(source._id, {
    privateSourceAnalysis: undefined,
    privateSourceAnalysisRunId: undefined,
    currentRevisionId: undefined,
    orderedMedia: undefined,
    personalOrderedInput: undefined,
    orderedPreparation: undefined,
    serviceIntent: undefined,
    text: undefined,
    summary: undefined,
    analysis: undefined,
    mediaEvidence: undefined,
    mediaCoverage: undefined,
    originalText: undefined,
    originalMediaEvidence: undefined,
    speechProvenance: undefined,
    processingReceipt: undefined,
    localAnalysisReceipt: undefined,
    personalAnalysis: undefined,
    workCloudSaveIntent: undefined,
    personalMedia: undefined,
    typedAnalysisActor: undefined,
    processingStartedAt: undefined,
    searchable: "",
    title: "Source awaiting fresh retrieval",
    state: "saved",
    rightsAttested: false,
    retrievalState: "unavailable",
    generation: source.generation + 1,
    updatedAt: Math.max(now, source.updatedAt + 1),
  });
  await invalidatePublicSource(ctx, source._id, reason);
  await ctx.scheduler.runAfter(0, internal.privateSourceAnalysis.scrub, {
    organizationId: source.organizationId,
    sourceId: source._id,
    maxGeneration: source.generation,
    cursor: null,
  });
  for (const request of await ctx.db
    .query("sourceAcquisitions")
    .withIndex("by_source", (q) => q.eq("sourceId", source._id))
    .take(20))
    if (["saved", "fetching", "rate_limited"].includes(request.state))
      await ctx.db.patch(request._id, {
        state: "unavailable",
        error: "source_rights_review_required",
        lease: undefined,
        version: request.version + 1,
        updatedAt: now,
      });
  await syncCategories(ctx, (await ctx.db.get(source._id))!);
  await syncKnowledge(ctx, (await ctx.db.get(source._id))!, {
    preserveManualHistory: true,
    enqueue: false,
  });
  await ctx.scheduler.runAfter(0, internal.knowledge.redactDerived, {
    organizationId: source.organizationId,
    sourceId: source._id,
    section: "knowledgeJobs",
    cursor: null,
    maxGeneration: source.generation,
  });
}
async function currentLease(
  ctx: QueryCtx,
  id: Id<"sourceAcquisitions">,
  lease: string,
) {
  const row = await ctx.db.get(id);
  if (
    !row ||
    row.state !== "fetching" ||
    row.lease !== lease ||
    row.deadline <= Date.now() ||
    !directSourceEnabled(row.provider)
  )
    return null;
  const source = await actorCurrent(ctx, row);
  return source ? { row, source } : null;
}
export const prepare = mutation({
  args: {
    id: v.id("sources"),
    key: v.string(),
    rightsBasis: v.string(),
    rightsAttested: v.optional(v.literal(true)),
    expectedGeneration: v.optional(v.number()),
    expectedRevision: v.optional(v.number()),
  },
  handler: async (ctx, a) => {
    const captured = await ctx.db.get(a.id);
    ensure(
      captured && captured.state !== "deleted",
      "FORBIDDEN",
      "Source unavailable.",
    );
    let source = captured;
    const { actor } = await access(ctx, source.organizationId, writable);
    const provider = providerOf(source);
    await revisionCapacity(ctx, source._id);
    ensure(
      directSourceEnabled(provider),
      "SETUP_REQUIRED",
      "This source provider requires current verified setup and release approval.",
    );
    const recovery = await requiresRightsReview(ctx, source);
    ensure(
      (!recovery || a.rightsAttested === true) &&
        (!(
          recovery ||
          a.expectedGeneration !== undefined ||
          a.expectedRevision !== undefined
        ) ||
          (source.generation === a.expectedGeneration &&
            source.updatedAt === a.expectedRevision)),
      "STALE_APPROVAL",
      "Review this source and explicitly confirm fresh retrieval rights.",
    );
    ensure(
      source.url &&
        (recovery || !["processing", "queued"].includes(source.state)),
      "SOURCE_BUSY",
      "Wait for current source work to finish.",
    );
    if (provider === "github") githubSourceUrl(source.url);
    else redditSourceUrl(source.url);
    ensure(
      /^[A-Za-z0-9_-]{8,100}$/.test(a.key) &&
        a.rightsBasis.trim().length > 0 &&
        a.rightsBasis.length <= 500 &&
        !containsSecret(a.rightsBasis),
      "INVALID_INPUT",
      "Review the source rights and request key.",
    );
    const prior = await ctx.db
      .query("sourceAcquisitions")
      .withIndex("by_key", (q) =>
        q.eq("organizationId", source.organizationId).eq("key", a.key),
      )
      .unique();
    if (prior) {
      ensure(
        !recovery && prior.sourceId === source._id && prior.actor === actor._id,
        "FORBIDDEN",
        "Request key unavailable.",
      );
      return { id: prior._id, version: prior.version, state: prior.state };
    }
    await limit(ctx, `source-acquisition:${actor._id}`, 6);
    const history = await ctx.db
      .query("sourceAcquisitions")
      .withIndex("by_source", (q) => q.eq("sourceId", source._id))
      .order("desc")
      .take(21);
    ensure(
      history.length < 20,
      "QUOTA_EXCEEDED",
      "This source has reached its bounded retrieval history limit.",
    );
    ensure(
      recovery ||
        !history.some((r) => r.state === "fetching" && r.deadline > Date.now()),
      "SOURCE_BUSY",
      "A source retrieval already holds the lease.",
    );
    const now = Date.now();
    if (recovery) {
      await scrubUnusableBase(
        ctx,
        source,
        now,
        source.rightsAttested ? "personal_retention" : "rights",
      );
      await ctx.db.patch(source._id, {
        rightsAttested: true,
        sourceRetentionUntil: undefined,
        retrievalState: "saved",
        error: undefined,
      });
      source = (await ctx.db.get(source._id))!;
    }
    const id = await ctx.db.insert("sourceAcquisitions", {
      organizationId: source.organizationId,
      sourceId: source._id,
      actor: actor._id,
      provider,
      generation: source.generation,
      sourceRevision: source.updatedAt,
      key: a.key,
      state: "saved",
      version: 1,
      selectedPaths: [],
      rightsBasis: a.rightsBasis,
      deadline: now + sourceLimits.deadlineMs,
      requestCount: 0,
      byteCount: 0,
      createdAt: now,
      updatedAt: now,
    });
    await audit(
      ctx,
      source.organizationId,
      actor._id,
      "source_acquisition_prepare",
      id,
    );
    return { id, version: 1, state: "saved" as const };
  },
});
export const status = query({
  args: { id: v.id("sources") },
  handler: async (ctx, a) => {
    const source = await ctx.db.get(a.id);
    ensure(
      source && source.state !== "deleted",
      "FORBIDDEN",
      "Source unavailable.",
    );
    await access(ctx, source.organizationId);
    const enabled =
      source.sourceType === "github_repository"
        ? directSourceEnabled("github")
        : source.sourceType === "reddit_thread" &&
          directSourceEnabled("reddit");
    const rightsReview = await requiresRightsReview(ctx, source);
    if (rightsReview)
      return {
        enabled,
        sourceType: source.sourceType,
        retrievalState: "unavailable" as const,
        request: null,
        requiresRightsReview: true,
        sourceGeneration: source.generation,
        sourceRevision: source.updatedAt,
        reason: source.rightsAttested
          ? "source_retention_expired"
          : "fresh_source_rights_required",
      };
    const row = await ctx.db
      .query("sourceAcquisitions")
      .withIndex("by_source", (q) => q.eq("sourceId", source._id))
      .order("desc")
      .first();
    return {
      enabled,
      requiresRightsReview: false,
      sourceGeneration: source.generation,
      sourceRevision: source.updatedAt,
      sourceType: source.sourceType,
      retrievalState: source.retrievalState ?? "saved",
      request: row
        ? {
            id: row._id,
            version: row.version,
            state: row.state,
            error: row.error,
            retryAt: row.retryAt,
            selectedPaths: row.selectedPaths,
            selection: row.selection,
            deadline: row.deadline,
            requestCount: row.requestCount,
            byteCount: row.byteCount,
          }
        : null,
    };
  },
});
export const supplyText = mutation({
  args: {
    id: v.id("sources"),
    expectedGeneration: v.number(),
    expectedRevision: v.number(),
    text: v.string(),
    rightsAttested: v.literal(true),
  },
  handler: async (ctx, a) => {
    const source = await ctx.db.get(a.id);
    ensure(
      source && source.state !== "deleted",
      "FORBIDDEN",
      "Source unavailable.",
    );
    const { actor } = await access(ctx, source.organizationId, writable);
    const provider = providerOf(source);
    await revisionCapacity(ctx, source._id);
    ensure(
      source.url &&
        source.generation === a.expectedGeneration &&
        source.updatedAt === a.expectedRevision &&
        !["processing", "queued"].includes(source.state),
      "STALE_APPROVAL",
      "Source changed. Review it before supplying text.",
    );
    ensure(
      process.env.DISABLE_CAPTURE !== "true" &&
        a.text.trim().length > 0 &&
        a.text.length <= sourceLimits.textCharacters &&
        !containsSecret(a.text),
      "INVALID_INPUT",
      "Supply permitted text within the source limit and without credentials.",
    );
    await limit(ctx, `source-supplied:${actor._id}`, 6);
    const originalUrl =
      provider === "github"
        ? githubSourceUrl(source.url).url
        : redditSourceUrl(source.url).url;
    const now = Date.now(),
      generation = source.generation + 1;
    const evidence = [
      await createEvidence({
        kind: "supplied_text",
        originalUrl,
        canonicalUrl: originalUrl,
        startOffset: 0,
        endOffset: a.text.length,
        excerpt: a.text,
        observedAt: now,
        provenance: "user_supplied_unverified",
      }),
    ];
    const revision = {
      schemaVersion: "1.0.0" as const,
      sourceType: "supplied_text" as const,
      canonical: originalUrl,
      providerIdentity: `supplied:${await excerptHash(a.text)}`,
      contentHash: await registryHash(evidence),
      adapterVersion: "supplied-source-v1",
      observedAt: now,
      rightsBasis: "user_attested_supplied_text",
      coverage: {
        method: "user_supplied_unverified",
        retrieved: 1,
        omitted: 0,
        omissions: [
          "provider_fetch_not_verified",
          "original_context_not_verified",
        ],
      },
    };
    await validateEvidenceRegistry(revision, evidence);
    if (source.currentRevisionId) {
      const previous = await ctx.db.get(source.currentRevisionId);
      if (
        previous?.sourceId === source._id &&
        previous.organizationId === source.organizationId
      )
        await ctx.db.patch(previous._id, {
          state: "superseded",
          updatedAt: now,
        });
    }
    const revisionId = await ctx.db.insert("sourceRevisions", {
      organizationId: source.organizationId,
      sourceId: source._id,
      generation,
      contentHash: revision.contentHash,
      revision,
      evidence,
      text: a.text,
      state: "current",
      createdAt: now,
      updatedAt: now,
    });
    for (const request of await ctx.db
      .query("sourceAcquisitions")
      .withIndex("by_source", (q) => q.eq("sourceId", source._id))
      .take(21))
      if (["saved", "fetching", "rate_limited"].includes(request.state))
        await ctx.db.patch(request._id, {
          state: "unavailable",
          error: "supplied_text_replaced_retrieval",
          lease: undefined,
          version: request.version + 1,
          updatedAt: now,
        });
    await ctx.db.patch(source._id, {
      currentRevisionId: revisionId,
      text: a.text,
      sourceRetentionUntil: undefined,
      rightsAttested: true,
      searchable: [source.title, a.text, ...source.tags].join(" "),
      retrievalState: "partial",
      generation,
      state: "saved",
      summary: undefined,
      analysis: undefined,
      mediaEvidence: undefined,
      mediaCoverage: undefined,
      processingReceipt: undefined,
      localAnalysisReceipt: undefined,
      speechProvenance: undefined,
      processingStartedAt: undefined,
      error: undefined,
      updatedAt: Math.max(now, source.updatedAt + 1),
    });
    await syncCategories(ctx, (await ctx.db.get(source._id))!);
    await invalidatePublicEditions(ctx, source._id);
    await audit(
      ctx,
      source.organizationId,
      actor._id,
      "source_supplied_text",
      source._id,
    );
    return { revisionId, generation };
  },
});
export const select = mutation({
  args: {
    id: v.id("sourceAcquisitions"),
    version: v.number(),
    paths: v.array(v.string()),
  },
  handler: async (ctx, a) => {
    const row = await ctx.db.get(a.id);
    ensure(row, "FORBIDDEN", "Retrieval unavailable.");
    const { actor } = await access(ctx, row.organizationId, writable);
    ensure(
      actor._id === row.actor &&
        row.version === a.version &&
        row.state === "saved" &&
        row.provider === "github" &&
        directSourceEnabled("github") &&
        (await actorCurrent(ctx, row)),
      "STALE_APPROVAL",
      "Source or retrieval changed. Review it again.",
    );
    const selection = selectionSchema.parse(row.selection);
    ensure(
      a.paths.length > 0 &&
        a.paths.length <= sourceLimits.github.files &&
        new Set(a.paths).size === a.paths.length &&
        a.paths.every((path) => selection.files.some((f) => f.path === path)),
      "INVALID_INPUT",
      "Choose only listed regular text files.",
    );
    ensure(
      selection.files
        .filter((f) => a.paths.includes(f.path))
        .reduce((sum, f) => sum + f.size, 0) <= sourceLimits.github.totalBytes,
      "INVALID_INPUT",
      "Selected files exceed the retrieval byte limit.",
    );
    await ctx.db.patch(row._id, {
      selectedPaths: a.paths,
      pinnedCommit: selection.commit,
      repositoryId: selection.repositoryId,
      version: row.version + 1,
      updatedAt: Date.now(),
    });
    return { id: row._id, version: row.version + 1 };
  },
});
export const cancel = mutation({
  args: { id: v.id("sourceAcquisitions"), version: v.number() },
  handler: async (ctx, a) => {
    const row = await ctx.db.get(a.id);
    ensure(row, "FORBIDDEN", "Retrieval unavailable.");
    await access(ctx, row.organizationId, writable);
    ensure(
      row.version === a.version,
      "STALE_APPROVAL",
      "Retrieval changed. Reload before cancelling.",
    );
    ensure(
      !["ready", "partial"].includes(row.state),
      "STALE_APPROVAL",
      "Completed retrieval is retained with the source.",
    );
    await ctx.db.patch(row._id, {
      state: "unavailable",
      error: "cancelled",
      lease: undefined,
      version: row.version + 1,
      updatedAt: Date.now(),
    });
    const source = await actorCurrent(ctx, row);
    if (source)
      await ctx.db.patch(source._id, { retrievalState: "unavailable" });
    return { cancelled: true };
  },
});
export const claim = internalMutation({
  args: {
    id: v.id("sourceAcquisitions"),
    version: v.number(),
    phase: v.union(v.literal("inspect"), v.literal("acquire")),
  },
  handler: async (ctx, a) => {
    const row = await ctx.db.get(a.id);
    ensure(row, "FORBIDDEN", "Retrieval unavailable.");
    const { actor } = await access(ctx, row.organizationId, writable);
    const source = await actorCurrent(ctx, row);
    ensure(
      actor._id === row.actor &&
        source &&
        row.version === a.version &&
        directSourceEnabled(row.provider),
      "STALE_APPROVAL",
      "Source retrieval authority changed.",
    );
    ensure(
      row.state === "saved" ||
        (row.state === "fetching" && row.deadline <= Date.now()) ||
        (row.state === "rate_limited" &&
          (!row.retryAt || row.retryAt <= Date.now())),
      "SOURCE_BUSY",
      "Retrieval requires an explicit current retry or selection.",
    );
    ensure(
      a.phase === "acquire" || row.provider === "github",
      "INVALID_INPUT",
      "Only GitHub needs file inspection.",
    );
    ensure(
      a.phase !== "acquire" ||
        row.provider !== "github" ||
        (row.selectedPaths.length > 0 && row.pinnedCommit && row.repositoryId),
      "INVALID_INPUT",
      "Review the pinned file selection first.",
    );
    const siblings = await ctx.db
      .query("sourceAcquisitions")
      .withIndex("by_source", (q) => q.eq("sourceId", source._id))
      .take(21);
    ensure(
      !siblings.some(
        (r) =>
          r._id !== row._id &&
          r.state === "fetching" &&
          r.deadline > Date.now(),
      ),
      "SOURCE_BUSY",
      "Another retrieval holds this source lease.",
    );
    const lease = crypto.randomUUID(),
      deadline = Date.now() + sourceLimits.deadlineMs;
    await ctx.db.patch(row._id, {
      state: "fetching",
      lease,
      deadline,
      error: undefined,
      retryAt: undefined,
      version: row.version + 1,
      updatedAt: Date.now(),
    });
    await ctx.db.patch(source._id, { retrievalState: "fetching" });
    return {
      id: row._id,
      lease,
      version: row.version + 1,
      provider: row.provider,
      url: source.url!,
      rightsBasis: row.rightsBasis,
      selectedPaths: row.selectedPaths,
      pinnedCommit: row.pinnedCommit,
      repositoryId: row.repositoryId,
    };
  },
});
export const providerClaim = internalMutation({
  args: {
    id: v.id("sourceAcquisitions"),
    lease: v.string(),
    provider: v.union(v.literal("github"), v.literal("reddit")),
  },
  handler: async (ctx, a) => {
    const current = await currentLease(ctx, a.id, a.lease);
    if (!current || current.row.provider !== a.provider)
      return { allowed: false, retryAt: Date.now() + 60000 };
    const { row } = current;
    const cap = sourceLimits[a.provider];
    if (row.requestCount >= cap.requests || row.byteCount >= cap.totalBytes)
      return { allowed: false, retryAt: Date.now() + 3600000 };
    const now = Date.now(),
      limit = a.provider === "github" ? 40 : 10;
    let quota = await ctx.db
      .query("sourceProviderQuotas")
      .withIndex("by_provider", (q) => q.eq("provider", a.provider))
      .unique();
    if (!quota) {
      const id = await ctx.db.insert("sourceProviderQuotas", {
        provider: a.provider,
        windowStart: now,
        used: 0,
        limit,
        retryAt: 0,
        consecutive: 0,
      });
      quota = (await ctx.db.get(id))!;
    }
    const reset = now >= quota.windowStart + 3600000;
    const waiting = await ctx.db
      .query("sourceAcquisitions")
      .withIndex("by_provider_state", (q) =>
        q.eq("provider", a.provider).eq("state", "fetching"),
      )
      .take(20);
    const decision = reserveProviderRequest(
      {
        remaining: reset
          ? limit
          : Math.max(0, Math.min(limit, quota.limit) - quota.used),
        resetAt: reset ? now + 3600000 : quota.windowStart + 3600000,
        blockedUntil: quota.retryAt,
        lastScope: quota.lastOrganizationId,
        consecutive: quota.consecutive ?? 0,
      },
      row.organizationId,
      now,
      waiting.some(
        (r) => r.organizationId !== row.organizationId && r.deadline > now,
      ),
    );
    if (!decision.allowed)
      return { allowed: false, retryAt: decision.retryAt ?? now + 1000 };
    await ctx.db.patch(quota._id, {
      windowStart: reset ? now : quota.windowStart,
      used: limit - decision.state.remaining,
      limit,
      lastOrganizationId: row.organizationId,
      consecutive: decision.state.consecutive,
    });
    await ctx.db.patch(row._id, { requestCount: row.requestCount + 1 });
    return { allowed: true };
  },
});
export const providerObserved = internalMutation({
  args: {
    provider: v.union(v.literal("github"), v.literal("reddit")),
    headers: v.record(v.string(), v.string()),
  },
  handler: async (ctx, a) => {
    const quota = await ctx.db
      .query("sourceProviderQuotas")
      .withIndex("by_provider", (q) => q.eq("provider", a.provider))
      .unique();
    if (!quota) return;
    const retryAt = providerRetryAt(a.headers, Date.now());
    const raw = a.headers["x-ratelimit-remaining"];
    const remaining =
      raw && /^\d{1,6}$/.test(raw)
        ? Math.max(0, Number(raw) - (a.provider === "github" ? 20 : 0))
        : undefined;
    await ctx.db.patch(quota._id, {
      ...(retryAt && (a.headers["retry-after"] || raw === "0")
        ? { retryAt: Math.max(quota.retryAt, retryAt) }
        : {}),
      ...(remaining !== undefined
        ? { used: Math.max(quota.used, quota.limit - remaining) }
        : {}),
    });
  },
});
export const bytesObserved = internalMutation({
  args: {
    id: v.id("sourceAcquisitions"),
    lease: v.string(),
    bytes: v.number(),
  },
  handler: async (ctx, a) => {
    const row = await ctx.db.get(a.id);
    if (!row || row.lease !== a.lease) return;
    ensure(
      Number.isSafeInteger(a.bytes) && a.bytes > 0 && a.bytes <= 1048576,
      "INVALID_INPUT",
      "Invalid retrieval byte receipt.",
    );
    await ctx.db.patch(row._id, { byteCount: row.byteCount + a.bytes });
  },
});
const retentionRetryMs = 60000;
async function scheduleRetention(
  ctx: MutationCtx,
  revision: Doc<"sourceRevisions">,
  at: number,
) {
  // The marker and callback are committed atomically. Concurrent normalization
  // or duplicate callbacks cannot create a second future retry for this row.
  if ((revision.retentionScheduledAt ?? 0) > Date.now()) return false;
  await ctx.scheduler.runAt(at, internal.sourceAcquisition.expire, {
    revisionId: revision._id,
  });
  await ctx.db.patch(revision._id, { retentionScheduledAt: at });
  return true;
}
// Explicit operator repair for unreleased revisions whose old callback was
// consumed while locked. Supply each affected source ID; never scan all data.
export const normalizeRetention = internalMutation({
  args: { sourceId: v.id("sources") },
  handler: async (ctx, a) => {
    const revisions = await ctx.db
      .query("sourceRevisions")
      .withIndex("by_source", (q) => q.eq("sourceId", a.sourceId))
      .take(26);
    ensure(
      revisions.length <= 25,
      "LIMIT_REACHED",
      "Review this source's oversized revision history before retention repair.",
    );
    let scheduled = 0;
    for (const revision of revisions) {
      const deadline = revision.revision?.retention?.retainUntil;
      if (revision.state === "removed" || !Number.isSafeInteger(deadline))
        continue;
      if (
        await scheduleRetention(
          ctx,
          revision,
          Math.max(Date.now() + 1, deadline),
        )
      )
        scheduled++;
    }
    return { visited: revisions.length, scheduled };
  },
});
export const expire = internalMutation({
  args: { revisionId: v.id("sourceRevisions") },
  handler: async (ctx, a) => {
    const revision = await ctx.db.get(a.revisionId);
    if (!revision || revision.state === "removed") return { expired: false };
    const retainUntil = revision.revision?.retention?.retainUntil;
    if (!Number.isSafeInteger(retainUntil) || retainUntil > Date.now())
      return { expired: false };
    if (process.env.RESTORE_LOCK === "true") {
      await scheduleRetention(ctx, revision, Date.now() + retentionRetryMs);
      return { expired: false };
    }
    const source = await ctx.db.get(revision.sourceId);
    const now = Date.now();
    // Superseded provider material expires too, without mutating a later source.
    await ctx.db.patch(revision._id, {
      state: "removed",
      evidence: [],
      text: "",
      revision: { removedAt: now, reason: "provider_retention_expired" },
      retentionScheduledAt: undefined,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.privateSourceAnalysis.scrub, {
      organizationId: revision.organizationId,
      sourceId: revision.sourceId,
      maxGeneration: revision.generation,
      cursor: null,
    });
    await ctx.scheduler.runAfter(0, internal.knowledge.redactDerived, {
      organizationId: revision.organizationId,
      sourceId: revision.sourceId,
      section: "knowledgeJobs",
      cursor: null,
      maxGeneration: revision.generation,
    });
    if (
      !source ||
      source.organizationId !== revision.organizationId ||
      source.state === "deleted" ||
      source.currentRevisionId !== revision._id ||
      source.generation !== revision.generation
    )
      return { expired: true };
    await ctx.db.patch(source._id, {
      text: undefined,
      summary: undefined,
      analysis: undefined,
      mediaEvidence: undefined,
      mediaCoverage: undefined,
      originalText: undefined,
      originalMediaEvidence: undefined,
      speechProvenance: undefined,
      processingReceipt: undefined,
      localAnalysisReceipt: undefined,
      personalAnalysis: undefined,
      workCloudSaveIntent: undefined,
      personalMedia: undefined,
      processingStartedAt: undefined,
      searchable: "",
      title: "Expired source",
      privateSourceAnalysis: undefined,
      privateSourceAnalysisRunId: undefined,
      state: "failed",
      rightsAttested: false,
      retrievalState: "unavailable",
      generation: source.generation + 1,
      error:
        "Provider retention expired. Review a new retrieval or supply permitted text.",
      updatedAt: Math.max(now, source.updatedAt + 1),
    });
    await syncCategories(ctx, (await ctx.db.get(source._id))!);
    await syncKnowledge(ctx, (await ctx.db.get(source._id))!, {
      preserveManualHistory: true,
      enqueue: false,
    });
    // This expires the account's provider material, not an independently
    // licensed canonical artifact. Its frozen rights/retention still apply.
    await invalidatePublicSource(ctx, source._id, "personal_retention");
    return { expired: true };
  },
});
export const finish = internalMutation({
  args: {
    id: v.id("sourceAcquisitions"),
    lease: v.string(),
    phase: v.union(v.literal("inspect"), v.literal("acquire")),
    result: v.any(),
  },
  handler: async (ctx, a): Promise<{ accepted: boolean }> => {
    const current = await currentLease(ctx, a.id, a.lease);
    if (!current) return { accepted: false };
    const { row, source } = current;
    const now = Date.now();
    if (a.phase === "inspect" && a.result?.status === "selected") {
      const selection = selectionSchema.parse(a.result.selection);
      ensure(
        row.provider === "github" &&
          source.url &&
          githubSourceUrl(source.url).repository.toLowerCase() ===
            selection.repository.toLowerCase() &&
          githubSourceUrl(selection.canonical).repository ===
            selection.repository,
        "INVALID_EVIDENCE",
        "Repository selection identity changed.",
      );
      // Compare only previously selected files whose server-owned blob metadata
      // survives in bounded request history. Missing listings are not deletions.
      const history = await ctx.db
        .query("sourceAcquisitions")
        .withIndex("by_source", (q) => q.eq("sourceId", source._id))
        .order("desc")
        .take(20);
      const prior = history.find(
        (r) =>
          r._id !== row._id &&
          ["ready", "partial"].includes(r.state) &&
          r.pinnedCommit &&
          r.selection,
      );
      const previous = prior
        ? selectionSchema.safeParse(prior.selection)
        : null;
      if (prior && previous?.success) {
        const changedFiles: string[] = [],
          unchangedFiles: string[] = [],
          unavailableFiles: string[] = [];
        for (const path of prior.selectedPaths) {
          const before = previous.data.files.find((f) => f.path === path),
            after = selection.files.find((f) => f.path === path);
          if (!before || !after) unavailableFiles.push(path);
          else if (before.blobSha === after.blobSha) unchangedFiles.push(path);
          else changedFiles.push(path);
        }
        selection.revisionPreview = {
          previousCommit: previous.data.commit,
          nextCommit: selection.commit,
          changedFiles,
          unchangedFiles,
          unavailableFiles,
          completeListing: !selection.omissions.length,
        };
      }
      await ctx.db.patch(row._id, {
        state: "saved",
        selection,
        lease: undefined,
        version: row.version + 1,
        updatedAt: now,
      });
      await ctx.db.patch(source._id, { retrievalState: "saved" });
      return { accepted: true };
    }
    if (
      a.phase === "acquire" &&
      ["ready", "partial"].includes(a.result?.status)
    ) {
      await revisionCapacity(ctx, source._id);
      const { revision, evidence } = await validateEvidenceRegistry(
        a.result.revision,
        a.result.evidence,
      );
      ensure(
        revision.sourceType === source.sourceType &&
          source.url &&
          revision.canonical.toLowerCase() ===
            (row.provider === "github"
              ? githubSourceUrl(source.url).url
              : redditSourceUrl(source.url).url
            ).toLowerCase() &&
          typeof a.result.text === "string" &&
          a.result.text === evidence.map((e) => e.excerpt).join("\n") &&
          a.result.text.length <= sourceLimits.textCharacters,
        "INVALID_EVIDENCE",
        "Retrieved source provenance changed.",
      );
      if (row.provider === "github")
        ensure(
          evidence.every(
            (e) =>
              e.kind === "github_file" &&
              e.commitSha === row.pinnedCommit &&
              e.repositoryId === row.repositoryId &&
              row.selectedPaths.includes(e.path),
          ) && revision.rightsBasis === row.rightsBasis,
          "INVALID_EVIDENCE",
          "Retrieved files exceed the reviewed selection.",
        );
      else {
        const eligibility = redditSourceEligibility()!;
        ensure(
          revision.retention &&
            revision.retention.policyEvidenceId === eligibility.evidenceId &&
            revision.retention.retainUntil > now &&
            revision.retention.retainUntil <= eligibility.expiresAt &&
            revision.retention.retainUntil <=
              revision.observedAt + eligibility.retention.maxAgeMs &&
            revision.retention.deletionWithinMs ===
              eligibility.retention.deletionWithinMs,
          "INVALID_EVIDENCE",
          "Provider retention authority changed.",
        );
      }
      if (source.currentRevisionId) {
        const previous = await ctx.db.get(source.currentRevisionId);
        if (
          previous?.sourceId === source._id &&
          previous.organizationId === source.organizationId
        )
          await ctx.db.patch(previous._id, {
            state: "superseded",
            updatedAt: now,
          });
      }
      const generation = source.generation + 1;
      const revisionId = await ctx.db.insert("sourceRevisions", {
        organizationId: source.organizationId,
        sourceId: source._id,
        generation,
        contentHash: revision.contentHash,
        revision,
        evidence,
        text: a.result.text,
        state: "current",
        retentionScheduledAt: revision.retention?.retainUntil,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.patch(source._id, {
        currentRevisionId: revisionId,
        sourceRetentionUntil: revision.retention?.retainUntil,
        text: a.result.text,
        searchable: [source.title, a.result.text, ...source.tags].join(" "),
        retrievalState: a.result.status,
        generation,
        state: "saved",
        summary: undefined,
        analysis: undefined,
        mediaEvidence: undefined,
        mediaCoverage: undefined,
        processingReceipt: undefined,
        localAnalysisReceipt: undefined,
        speechProvenance: undefined,
        processingStartedAt: undefined,
        error: undefined,
        updatedAt: Math.max(now, source.updatedAt + 1),
      });
      await syncCategories(ctx, (await ctx.db.get(source._id))!);
      await invalidatePublicEditions(ctx, source._id);
      await ctx.db.patch(row._id, {
        state: a.result.status,
        lease: undefined,
        version: row.version + 1,
        updatedAt: now,
      });
      if (revision.retention)
        await ctx.scheduler.runAt(
          revision.retention.retainUntil,
          internal.sourceAcquisition.expire,
          { revisionId },
        );
      return { accepted: true };
    }
    const failed = z
      .strictObject({
        status: z.enum(["needs_supplied_text", "unavailable", "rate_limited"]),
        reason: z.string().regex(/^[a-z0-9_]{1,100}$/),
        retryAt: z.number().int().positive().optional(),
      })
      .parse(a.result);
    ensure(
      failed.retryAt === undefined ||
        (failed.retryAt > now && failed.retryAt <= now + 86400000),
      "INVALID_INPUT",
      "Invalid provider retry deadline.",
    );
    await ctx.db.patch(row._id, {
      state: failed.status,
      error: failed.reason,
      retryAt: failed.retryAt,
      lease: undefined,
      version: row.version + 1,
      updatedAt: now,
    });
    await ctx.db.patch(source._id, { retrievalState: failed.status });
    return { accepted: true };
  },
});
