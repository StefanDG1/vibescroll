import { v } from "convex/values";
import { query, internalQuery } from "./_generated/server";
import { mutation, internalMutation } from "./lib/projectedMutations";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { access } from "./lib";
import { assistantGrant } from "./lib/assistantPrincipal";
import { isAssistantIdentity } from "../packages/policy/assistant";
import { sourceWithinAssistantScope } from "./lib/assistantSourceScope";
import { ensure } from "../packages/policy";
import { reserve, digest } from "./product";
import { canonicalJson } from "../packages/contracts/canonical-json.mjs";
import {
  preparedCreditQuote,
  preparedTariff,
} from "../packages/contracts/prepared-service";
import { privateCloudMediaIdentity } from "../packages/social/contracts";
import { preparedServiceConfiguration } from "./lib/preparedServicePolicy";
import { requireProCatalogAccess } from "./lib/catalogEntitlement";
import { workCloudSourceEligible } from "./lib/workCloudSourceAccess";
import { sourceRetained } from "./lib/sourceAuthority";
import { savedCloudRoute, savedCloudGrantCurrent } from "./lib/workCloudSave";
import { preparedEvidenceIsCurrent } from "./lib/preparedEvidenceAccess";
import {
  freezeAnalysisBaseline,
  verifyRetainedAssets,
} from "./lib/analysisHistory";
import { recordAutomaticCatalogIntent } from "./lib/catalogPolicy";
import { reserveCatalogProducer } from "./lib/cloudCatalog";
import { cloudRetryRequest } from "../packages/contracts/cloud-retry";

const requested = {
  sourceId: v.id("sources"),
  executor: v.union(v.literal("gateway"), v.literal("work_cloud")),
  reanalyze: v.optional(v.boolean()),
};
type Request = {
  sourceId: Id<"sources">;
  executor: "gateway" | "work_cloud";
  reanalyze?: boolean;
};

async function owner(
  ctx: QueryCtx,
  sourceId: Id<"sources">,
  write = false,
  requireEntitlement = true,
  readScope: "knowledge:read" | "jobs:read" = "knowledge:read",
) {
  const source = await ctx.db.get(sourceId);
  ensure(
    source &&
      source.kind === "url" &&
      source.state !== "deleted" &&
      source.rightsAttested &&
      sourceRetained(source.sourceRetentionUntil),
    "SOURCE_UNAVAILABLE",
    "This saved video is unavailable.",
  );
  const identity = await ctx.auth.getUserIdentity();
  const assistant = isAssistantIdentity(identity)
    ? await assistantGrant(
        ctx,
        source.organizationId,
        write ? "analysis:request" : readScope,
      )
    : null;
  const a = assistant ?? (await access(ctx, source.organizationId));
  ensure(
    await workCloudSourceEligible(ctx, a.organization, a.actor._id),
    "PERSONAL_FUNDING_REQUIRED",
    "Analyze in your own personal workspace, then share retained results with a team.",
  );
  ensure(
    a.organization.privateOwnerId === a.actor._id ||
      (!a.organization.privateOwnerId &&
        preparedServiceConfiguration(a.actor.subject, true)
          ?.legacyOwnerFundingOrganizationId === a.organization._id),
    "PERSONAL_FUNDING_REQUIRED",
    "Use your personal account's credit pool; workspaces do not create extra allowances.",
  );
  if (assistant) {
    const grant = assistant.grant;
    ensure(
      grant &&
        (await sourceWithinAssistantScope(
          ctx,
          grant,
          a.organization,
          a.actor._id,
          source,
        )),
      "FORBIDDEN",
      "This post is outside the current library grant.",
    );
    if (write)
      ensure(
        grant.scopes.includes("analysis:execute") &&
          assistant.scopes.includes("analysis:execute"),
        "FORBIDDEN",
        "Execution permission is required for this reviewed analysis.",
      );
  }
  if (requireEntitlement)
    await requireProCatalogAccess(ctx, source.organizationId);
  return { source, actor: a.actor, organization: a.organization };
}

async function quoteFor(
  ctx: QueryCtx,
  a: Awaited<ReturnType<typeof owner>>,
  request: Request,
) {
  const config = preparedServiceConfiguration(a.actor.subject);
  ensure(
    config,
    "SETUP_REQUIRED",
    "Server preparation is not available for this account yet.",
  );
  ensure(
    ["instagram", "tiktok"].includes(
      privateCloudMediaIdentity(a.source.url ?? a.source.canonical).platform,
    ),
    "UNSUPPORTED_SOURCE",
    "Server preparation currently supports individual Reels and TikToks.",
  );
  const ready =
    a.source.state === "ready" &&
    !!(
      a.source.selectedAnalysisVersionId ||
      a.source.analysis ||
      a.source.publicImportId
    );
  let evidence: Doc<"analysisEvidence"> | null = null;
  const runs = await ctx.db
    .query("mediaPreparations")
    .withIndex("by_org_source", (q) =>
      q
        .eq("organizationId", a.source.organizationId)
        .eq("sourceId", a.source._id),
    )
    .order("desc")
    .take(20);
  for (const run of runs) {
    if (
      !run.evidenceId ||
      !["ready", "evidence_ready", "failed"].includes(run.state)
    )
      continue;
    const candidate = await ctx.db.get(run.evidenceId);
    if (preparedEvidenceIsCurrent(a.source, candidate)) {
      await verifyRetainedAssets(ctx, a.source, candidate);
      evidence = candidate;
      break;
    }
  }
  const cacheHit = ready && !request.reanalyze;
  const durationMaximumMs = evidence
    ? evidence.prepared.evidence.durationMs
    : config.maximumDurationMs;
  const cost = cacheHit
    ? { preparation: 0, analysis: 0, maximum: 0 }
    : preparedCreditQuote(durationMaximumMs, request.executor, !!evidence);
  if (!cacheHit && request.executor === "gateway")
    ensure(
      config.maximumApiUsd >=
        0.02 + (evidence ? 0 : (durationMaximumMs / 1000) * 0.00002778),
      "SETUP_REQUIRED",
      "The configured API envelope must cover both transcription and analysis before dispatch.",
    );
  if (!cacheHit && (request.executor === "gateway" || !evidence))
    ensure(
      process.env.VERCEL_AI_GATEWAY_API_KEY,
      "SETUP_REQUIRED",
      "The service processing provider is not configured.",
    );
  let grant;
  if (!cacheHit && request.executor === "work_cloud") {
    const route = await savedCloudRoute(ctx, a.actor, a.organization);
    grant = route?.grantId ? await ctx.db.get(route.grantId) : null;
    ensure(
      route?.available &&
        grant &&
        (await savedCloudGrantCurrent(ctx, a.actor, a.organization, grant)),
      "SETUP_REQUIRED",
      "Resume or complete the existing VibeScroll Assistant setup.",
    );
  }
  const quote = {
    tariff: preparedTariff,
    configurationId: config.id,
    sourceId: a.source._id,
    generation: a.source.generation,
    selectionRevision: a.source.analysisSelectionRevision ?? 0,
    canonical: a.source.canonical,
    executor: request.executor,
    reanalyze: request.reanalyze ?? false,
    model:
      request.executor === "gateway"
        ? "meta/muse-spark-1.3-contributor"
        : (grant?.cloudSaveDefaults?.model ?? null),
    effort:
      request.executor === "gateway"
        ? "medium"
        : (grant?.cloudSaveDefaults?.effort ?? null),
    durationMaximumMs,
    reusedEvidenceId: evidence?._id ?? null,
    cacheHit,
    preparationCredits: cost.preparation,
    analysisCredits: cost.analysis,
    maximumCredits: cost.maximum,
    grantId: grant?._id ?? null,
    grantVersion: grant?.version ?? null,
    maximumApiUsd: config.maximumApiUsd,
  };
  return {
    quote,
    quoteHash: await digest(canonicalJson(quote)),
    config,
    evidence,
    grant,
  };
}
async function quoteHandler(ctx: QueryCtx, args: Request) {
  const a = await owner(ctx, args.sourceId);
  const q = await quoteFor(ctx, a, args);
  return {
    ...q.quote,
    quoteHash: q.quoteHash,
    creditsUnit: "existing_service_credit",
    note: "Preparation and analysis are quoted separately. Final started-minute analysis uses actual video duration; old balances and purchases keep their denomination.",
  };
}
export const quote = query({
  args: requested,
  returns: v.any(),
  handler: quoteHandler,
});
export const assistantQuote = internalQuery({
  args: requested,
  returns: v.any(),
  handler: quoteHandler,
});

const startArgs = {
  ...requested,
  key: v.string(),
  quoteHash: v.string(),
  maximumCredits: v.number(),
};
async function startHandler(
  ctx: MutationCtx,
  args: Request & { key: string; quoteHash: string; maximumCredits: number },
) {
  const a = await owner(ctx, args.sourceId, true);
  ensure(
    /^[A-Za-z0-9_-]{8,64}$/.test(args.key),
    "INVALID_INPUT",
    "Use a stable operation key.",
  );
  const prior = await ctx.db
    .query("mediaPreparations")
    .withIndex("by_org_source_key", (q) =>
      q
        .eq("organizationId", a.source.organizationId)
        .eq("sourceId", args.sourceId)
        .eq("key", args.key),
    )
    .unique();
  if (prior) {
    ensure(
      prior.actor === a.actor._id &&
        prior.receipt?.admission?.quoteHash === args.quoteHash &&
        prior.receipt.admission.quote.maximumCredits === args.maximumCredits,
      "APPROVAL_STALE",
      "This operation key already identifies different work.",
    );
    return {
      sourceId: args.sourceId,
      runId: prior._id,
      state: prior.state,
      reused: true,
    };
  }
  const q = await quoteFor(ctx, a, args);
  ensure(
    q.quoteHash === args.quoteHash &&
      q.quote.maximumCredits === args.maximumCredits,
    "QUOTE_CHANGED",
    "Read the current quote before starting this analysis.",
  );
  if (q.quote.cacheHit)
    return {
      sourceId: args.sourceId,
      state: "ready",
      cacheHit: true,
      chargedCredits: 0,
      runId: null,
    };
  ensure(
    !a.source.pendingAnalysisAttemptId &&
      !["queued", "running", "recovering", "unknown"].includes(
        a.source.personalAnalysis?.state ?? "",
      ),
    "SOURCE_BUSY",
    "The existing task must finish or be reconciled first.",
  );
  const runs = await ctx.db
    .query("mediaPreparations")
    .withIndex("by_org_source", (q) =>
      q
        .eq("organizationId", a.source.organizationId)
        .eq("sourceId", args.sourceId),
    )
    .order("desc")
    .take(21);
  ensure(
    runs.length <= 20 &&
      !runs.some((r) => !["ready", "failed"].includes(r.state)),
    "SOURCE_BUSY",
    "Existing preparation is active or uncertain.",
  );
  const daily = await ctx.db
    .query("mediaPreparations")
    .withIndex("by_actor_policy", (x) =>
      x.eq("actor", a.actor._id).eq("policyId", q.config.id),
    )
    .order("desc")
    .take(Math.max(101, q.config.maximumTotalJobs + 1));
  ensure(
    daily.length < q.config.maximumTotalJobs &&
      daily.filter((r) => r.createdAt > Date.now() - 86400000).length <
        q.config.maximumDailyJobs &&
      daily.filter((r) => r.createdAt > Date.now() - 3600000).length <
        q.config.maximumHourlyJobs,
    "QUOTA_EXCEEDED",
    "The server processing rate limit is reached.",
  );
  if (
    a.source.state === "ready" &&
    a.source.analysis &&
    !a.source.selectedAnalysisVersionId &&
    !a.source.publicImportId
  )
    await freezeAnalysisBaseline(ctx, a.source);
  const now = Date.now(),
    reservationKey = `prepared:${a.source._id}:${args.key}`;
  const catalog = await recordAutomaticCatalogIntent(ctx, a.source, a.actor);
  if (catalog && !args.reanalyze) {
    const producer = await reserveCatalogProducer(
      ctx,
      a.source,
      a.actor,
      catalog,
      args.quoteHash,
      now + 900000,
      now + 86400000,
    );
    if (producer.waiting)
      return {
        sourceId: a.source._id,
        runId: null,
        state: "waiting_for_shared_analysis",
        maximumCredits: 0,
        chargedCredits: 0,
      };
  }
  await reserve(
    ctx,
    a.source.organizationId,
    reservationKey,
    q.quote.maximumCredits,
  );
  const runId = await ctx.db.insert("mediaPreparations", {
    organizationId: a.source.organizationId,
    sourceId: a.source._id,
    actor: a.actor._id,
    key: args.key,
    policyId: q.config.id,
    generation: a.source.generation,
    canonical: privateCloudMediaIdentity(a.source.canonical).url,
    executor: args.executor,
    state: q.evidence ? "evidence_ready" : "queued",
    createdAt: now,
    updatedAt: now,
    deadline: now + 900000,
    maximumApiUsd: q.config.maximumApiUsd,
    ...(q.grant ? { grantId: q.grant._id, grantVersion: q.grant.version } : {}),
    ...(q.evidence ? { evidenceId: q.evidence._id } : {}),
    receipt: {
      admission: {
        version: "prepared-service-admission-v1",
        configurationId: q.config.id,
        quote: q.quote,
        quoteHash: q.quoteHash,
        reservationKey,
        at: now,
      },
      ...(q.evidence
        ? {
            reusedPreparation: {
              evidenceId: q.evidence._id,
              preparationHash: q.evidence.extractionPreparationHash,
              at: now,
            },
          }
        : {}),
    },
    stages: [
      { stage: "queued", at: now },
      ...(q.evidence ? [{ stage: "evidence_ready", at: now }] : []),
    ],
  });
  await ctx.db.patch(a.source._id, {
    personalMedia: {
      ...a.source.personalMedia,
      version: "service-preparation-progress-v1",
      runId,
      stage: q.evidence ? "evidence_ready" : "queued",
      executor: args.executor,
      updatedAt: now,
    },
  });
  await ctx.scheduler.runAfter(
    0,
    q.evidence
      ? args.executor === "gateway"
        ? internal.preparedMedia.runRetainedGateway
        : internal.preparedAnalysis.queueSubscription
      : internal.preparedMedia.run,
    { runId },
  );
  await ctx.scheduler.runAfter(900000, internal.preparedAnalysis.expire, {
    runId,
  });
  return {
    sourceId: a.source._id,
    runId,
    state: q.evidence ? "evidence_ready" : "queued",
    maximumCredits: q.quote.maximumCredits,
    preparationCredits: q.quote.preparationCredits,
    analysisCredits: q.quote.analysisCredits,
    reusedEvidence: !!q.evidence,
  };
}
export const start = mutation({
  args: startArgs,
  returns: v.any(),
  handler: startHandler,
});
export const assistantStart = internalMutation({
  args: startArgs,
  returns: v.any(),
  handler: startHandler,
});

// Existing MCP clients can use their already-discovered credit request shape.
// This admits first analysis and explicit retries of settled failures.
// New versions and model choices use the exact quote/start contract above.
export async function requestPreparedFromAssistant(
  ctx: MutationCtx,
  args: {
    sourceId: Id<"sources">;
    generation?: number;
    maxCredits?: number;
    executor?: "gateway" | "work_cloud";
    retry?: { generation: number; revision: number; key: string };
  },
) {
  const a = await owner(ctx, args.sourceId, true);
  const executor = args.executor ?? "gateway";
  const retry = args.retry ? cloudRetryRequest.parse(args.retry) : undefined;
  const key = retry
    ? `mcp-retry-${await digest(canonicalJson({ sourceId: args.sourceId, executor, retry }))}`.slice(
        0,
        64,
      )
    : `mcp-credit-${a.source._id}-${a.source.generation}`;
  if (args.maxCredits !== undefined || executor === "work_cloud") {
    const prior = await ctx.db
      .query("mediaPreparations")
      .withIndex("by_org_source_key", (q) =>
        q
          .eq("organizationId", a.source.organizationId)
          .eq("sourceId", a.source._id)
          .eq("key", key),
      )
      .unique();
    if (prior) {
      ensure(
        (retry?.generation ?? args.generation) === prior.generation &&
          prior.executor === executor &&
          (executor === "work_cloud" ||
            args.maxCredits === prior.receipt?.admission?.quote.maximumCredits),
        "QUOTE_CHANGED",
        "Use the current source and accepted credit cap.",
      );
      return startHandler(ctx, {
        sourceId: args.sourceId,
        executor,
        key,
        quoteHash: prior.receipt.admission.quoteHash,
        maximumCredits: prior.receipt.admission.quote.maximumCredits,
      });
    }
  }
  if (retry) {
    const latest = await ctx.db
      .query("mediaPreparations")
      .withIndex("by_org_source", (q) =>
        q
          .eq("organizationId", a.source.organizationId)
          .eq("sourceId", args.sourceId),
      )
      .order("desc")
      .first();
    ensure(
      retry.generation === a.source.generation &&
        retry.revision === a.source.updatedAt &&
        latest?.generation === retry.generation &&
        latest.state === "failed" &&
        latest.receipt?.billing?.state === "settled",
      "SOURCE_BUSY",
      "Retry requires the current post revision and a confirmed settled failure. Active or uncertain work must be reconciled first.",
    );
  }
  const q = await quoteFor(ctx, a, {
    sourceId: args.sourceId,
    executor,
  });
  if (q.quote.cacheHit)
    return {
      sourceId: args.sourceId,
      runId: null,
      state: "ready",
      cacheHit: true,
      chargedCredits: 0,
    };
  if (args.maxCredits === undefined && executor === "gateway")
    return {
      state: "quote_required",
      quote: { ...q.quote, quoteHash: q.quoteHash },
      next_action: {
        tool: "request_analysis",
        args: {
          sourceId: args.sourceId,
          mode: "credits",
          generation: a.source.generation,
          maxCredits: q.quote.maximumCredits,
          ...(retry ? { retry } : {}),
        },
      },
      note: "Review and accept the maximum service credits, then repeat this exact credit request. Preparation and Muse analysis are included; no native job starts.",
    };
  ensure(
    executor === "work_cloud"
      ? !!retry && q.quote.maximumCredits <= 1
      : args.generation === a.source.generation &&
          args.maxCredits === q.quote.maximumCredits,
    "QUOTE_CHANGED",
    "Read the current credit quote before starting this fixed-baseline analysis.",
  );
  return startHandler(ctx, {
    sourceId: args.sourceId,
    executor,
    key,
    quoteHash: q.quoteHash,
    maximumCredits: q.quote.maximumCredits,
  });
}

export async function queueAutomaticPreparedSource(
  ctx: MutationCtx,
  source: Doc<"sources">,
  actor: Doc<"users">,
) {
  const config = preparedServiceConfiguration(actor.subject);
  if (!config?.automaticOwnSubscriptionPreparation) return null;
  const key = `prepared-save-${source._id}-${source.generation}`;
  const prior = await ctx.db
    .query("mediaPreparations")
    .withIndex("by_org_source_key", (x) =>
      x
        .eq("organizationId", source.organizationId)
        .eq("sourceId", source._id)
        .eq("key", key),
    )
    .unique();
  if (prior)
    return {
      sourceId: source._id,
      runId: prior._id,
      state: prior.state,
      reused: true,
    };
  const a = await owner(ctx, source._id, true),
    q = await quoteFor(ctx, a, {
      sourceId: source._id,
      executor: "work_cloud",
    });
  ensure(
    q.quote.maximumCredits <= 1,
    "QUOTE_CHANGED",
    "Automatic own-subscription preparation is capped at one service credit.",
  );
  return startHandler(ctx, {
    sourceId: source._id,
    executor: "work_cloud",
    key,
    quoteHash: q.quoteHash,
    maximumCredits: q.quote.maximumCredits,
  });
}

async function statusHandler(
  ctx: QueryCtx,
  { sourceId }: { sourceId: Id<"sources"> },
) {
  const a = await owner(ctx, sourceId, false, false, "jobs:read");
  const run = await ctx.db
    .query("mediaPreparations")
    .withIndex("by_org_source", (x) =>
      x.eq("organizationId", a.source.organizationId).eq("sourceId", sourceId),
    )
    .order("desc")
    .first();
  return {
    sourceId,
    state:
      run?.state ??
      (a.source.catalogWait && a.source.catalogWait.expiresAt > Date.now()
        ? "waiting_for_shared_analysis"
        : a.source.state),
    runId: run?._id ?? null,
    versionId: run?.versionId ?? a.source.selectedAnalysisVersionId ?? null,
    stages: run?.stages.slice(-20) ?? [],
    executor: run?.executor ?? null,
    maximumCredits: run?.receipt?.admission?.quote.maximumCredits ?? 0,
    chargedCredits: run?.receipt?.billing?.chargedCredits ?? null,
    billingState:
      run?.receipt?.billing?.state ??
      (run?.receipt?.admission ? "reserved" : "not_applicable"),
    failure: run?.receipt?.failure?.code ?? null,
    catalogStatus: a.source.catalogStatus?.state ?? null,
    url: `https://scroll.companynerve.com/app/${a.source.organizationId}/posts/${sourceId}`,
  };
}
export const status = query({
  args: { sourceId: v.id("sources") },
  returns: v.any(),
  handler: statusHandler,
});
export const assistantStatus = internalQuery({
  args: { sourceId: v.id("sources") },
  returns: v.any(),
  handler: statusHandler,
});
