import { unclaimedCloudHandoff } from "./workCloudAnalysis";
import { cloudRetryEligible } from "../packages/contracts/cloud-retry";
import { selectedAnalysis } from "./lib/analysisHistory";
import {
  attachCloudCache,
  cloudSourceMetadata,
  catalogConfiguration,
} from "./lib/cloudCatalog";
import { notifyVideoLinkSaved } from "./lib/assistantEvents";
import { savedCloudRoute } from "./lib/workCloudSave";
import { privateCloudMediaIdentity } from "../packages/social/contracts";
import { workCloudSourceEligible } from "./lib/workCloudSourceAccess";
import { currentOrderedSource } from "./lib/workCloudMediaSource";
import {
  workCloudTextAllowed,
  workCloudMediaAllowed,
} from "./lib/personalAccess";
import { presentAnalysis } from "../packages/insights/presentation";
import { classifySourceUrl } from "../packages/sources/classify";
import { validateEvidenceRegistry } from "../packages/sources/evidence";
import { sourcePolicyCurrent } from "./lib/sourcePolicy";
import { retainedSourceRevision, sourceRetained } from "./lib/sourceAuthority";
import {
  validateTypedProposal,
  type SourceProposal,
} from "../packages/proposals/evidence";
import { sharedTypedCitations } from "./lib/sourceCitations";
import { invalidatePublicSource } from "./publicKnowledge";
import { filing } from "./librarySpaces";
import { repositoryContent } from "./lib/repositoryContent";
import { repositoryManifest } from "./lib/repositoryManifest";
import { knowledgeReadContext } from "./lib/knowledgeReadContext";
import { validateInspectedContext } from "../packages/repositories/retrieval";
import { inspectionManifestValidator } from "../packages/repositories/context";
import { inspectedContextValidator } from "../packages/repositories/context";
import { query, internalQuery } from "./_generated/server";
import { mutation, internalMutation } from "./lib/projectedMutations";
import { v } from "convex/values";
import { workflow } from "./workflows";
import { validateRepositoryEvidence } from "../packages/repositories/context";
import { selectionCurrent } from "../packages/repositories/selection";
import { access, fail, limit, audit, writeAccess } from "./lib";
import { productLimits } from "./limitsV1";
import { internal } from "./_generated/api";
import { googleConfigured } from "../packages/providers/google-inference";
import { ensure, containsSecret, validatePaths } from "../packages/policy";
import {
  insightOutput,
  sourceInsightOutput,
  proposalOutput,
  planInput,
} from "../packages/contracts";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id, Doc } from "./_generated/dataModel";
import { queueDeletion } from "./assets";
import { mediaStagePayload } from "../packages/media/stages";
import {
  processingReceipt,
  speechProvenance,
} from "../packages/media/provenance";
import { personalAllowed } from "./lib/personalAccess";
import {
  hostedMediaAllowed,
  hostedSourceAllowed,
} from "./lib/hostedMediaAccess";
import { syncCategories } from "./categories";
import { syncKnowledge, referencesCurrent, actorCurrent } from "./knowledge";
import { improvementCurrent } from "./lib/improvementContext";
import {
  acquisitionManifest,
  acquisitionPolicy,
} from "../packages/media/acquisition";
const org = { organizationId: v.id("organizations") };
export async function wallet(ctx: MutationCtx, id: Id<"organizations">) {
  let w = await ctx.db
    .query("wallets")
    .withIndex("by_org", (q) => q.eq("organizationId", id))
    .unique();
  if (!w) {
    const now = Date.now();
    const organization = await ctx.db.get(id);
    ensure(organization, "FORBIDDEN", "Workspace unavailable.");
    const owner = await ctx.db.get(organization.createdBy);
    ensure(
      owner?.status === "active",
      "FORBIDDEN",
      "Verified owner unavailable.",
    );
    const identityHash = await digest(
      `verified-trial:${owner.email.trim().toLowerCase()}`,
    );
    const claim = await ctx.db
      .query("trialClaims")
      .withIndex("by_identity", (q) => q.eq("identityHash", identityHash))
      .unique();
    const granted = claim ? 0 : 30;
    if (!claim)
      await ctx.db.insert("trialClaims", {
        identityHash,
        organizationId: id,
        createdAt: now,
      });
    const key = await ctx.db.insert("wallets", {
      organizationId: id,
      createdAt: now,
      updatedAt: now,
      granted,
      purchased: 0,
      spent: 0,
      reserved: 0,
      periodEnd: now + 30 * 86400000,
      tier: "trial",
      interval: "trial",
    });
    w = (await ctx.db.get(key))!;
  }
  return w;
}
export async function reserve(
  ctx: MutationCtx,
  id: Id<"organizations">,
  key: string,
  max: number,
) {
  ensure(
    Number.isSafeInteger(max) && max >= 0 && max <= 10000,
    "INVALID_BUDGET",
    "Invalid quote.",
  );
  const old = await ctx.db
    .query("reservations")
    .withIndex("by_key", (q) => q.eq("organizationId", id).eq("key", key))
    .unique();
  if (old) {
    ensure(
      old.state === "active",
      "APPROVAL_STALE",
      "This reservation is no longer active.",
    );
    return old._id;
  }
  const w = await wallet(ctx, id);
  const billing = await ctx.db
    .query("billing")
    .withIndex("by_org", (q) => q.eq("organizationId", id))
    .unique();
  ensure(
    !billing ||
      !["past_due", "unpaid", "incomplete", "paused"].includes(billing.status),
    "PAYMENT_REQUIRED",
    "New funded work is paused until the unresolved payment failure is resolved. Your library remains available.",
  );
  let pools = await ctx.db
    .query("creditPools")
    .withIndex("by_org", (q) => q.eq("organizationId", id))
    .collect();
  if (!pools.length && w.tier === "trial") {
    const poolId = await ctx.db.insert("creditPools", {
      organizationId: id,
      key: `trial:${id}`,
      kind: "included",
      granted: w.granted,
      spent: 0,
      reserved: 0,
      expiresAt: w.periodEnd,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    pools = [(await ctx.db.get(poolId))!];
  }
  const valid = pools
    .filter((p) => p.expiresAt === undefined || p.expiresAt > Date.now())
    .sort((a, b) => (a.expiresAt ?? Infinity) - (b.expiresAt ?? Infinity));
  ensure(
    valid.reduce(
      (n, p) =>
        n + Math.max(0, p.granted - (p.revoked ?? 0) - p.spent - p.reserved),
      0,
    ) >= max,
    "INSUFFICIENT_CREDITS",
    "There are not enough unexpired available credits.",
  );
  let remaining = max;
  const allocations: { poolId: Id<"creditPools">; credits: number }[] = [];
  for (const pool of valid) {
    const take = Math.min(
      remaining,
      pool.granted - (pool.revoked ?? 0) - pool.spent - pool.reserved,
    );
    if (take > 0) {
      allocations.push({ poolId: pool._id, credits: take });
      await ctx.db.patch(pool._id, {
        reserved: pool.reserved + take,
        updatedAt: Date.now(),
      });
      remaining -= take;
    }
    if (!remaining) break;
  }
  const organization = await ctx.db.get(id);
  const owner = organization ? await ctx.db.get(organization.createdBy) : null;
  const operatorReviewFunded =
    max > 0 &&
    owner?.status === "active" &&
    personalAllowed(owner.subject) &&
    allocations.every(
      (allocation) =>
        valid.find((pool) => pool._id === allocation.poolId)?.kind ===
        "operator_quality_review",
    );
  const month = new Date().toISOString().slice(0, 7);
  const operatorKeys = [
    `all:${month}`,
    ...(w.tier === "trial" && !operatorReviewFunded ? [`trial:${month}`] : []),
  ];
  for (const budgetKey of operatorKeys) {
    let budget = await ctx.db
      .query("operatorBudgets")
      .withIndex("by_key", (q) => q.eq("key", budgetKey))
      .unique();
    if (!budget) {
      const budgetId = await ctx.db.insert("operatorBudgets", {
        key: budgetKey,
        ceiling: budgetKey.startsWith("trial:") ? 200 : 1000,
        reserved: 0,
        spent: 0,
        updatedAt: Date.now(),
      });
      budget = (await ctx.db.get(budgetId))!;
    }
    ensure(
      budget.spent + budget.reserved + max <= budget.ceiling,
      "OPERATOR_BUDGET_REACHED",
      "Processing is paused at the operator's monthly cost ceiling.",
    );
    await ctx.db.patch(budget._id, {
      reserved: budget.reserved + max,
      updatedAt: Date.now(),
    });
  }
  await ctx.db.patch(w._id, {
    reserved: w.reserved + max,
    updatedAt: Date.now(),
  });
  return ctx.db.insert("reservations", {
    organizationId: id,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    key,
    max,
    settled: 0,
    state: "active",
    expiresAt: Date.now() + 86400000,
    allocations,
    operatorKeys,
  });
}
export async function settle(
  ctx: MutationCtx,
  id: Id<"organizations">,
  key: string,
  credits: number,
) {
  const x = await ctx.db
    .query("reservations")
    .withIndex("by_key", (q) => q.eq("organizationId", id).eq("key", key))
    .unique();
  if (!x || x.state !== "active") return;
  ensure(
    Number.isSafeInteger(credits) && credits >= 0 && credits <= x.max,
    "BUDGET_EXCEEDED",
    "Settlement exceeds the reservation.",
  );
  let remaining = credits;
  for (const allocation of x.allocations ?? []) {
    const pool = await ctx.db.get(allocation.poolId);
    ensure(
      pool && pool.organizationId === id && pool.reserved >= allocation.credits,
      "LEDGER_INVALID",
      "Credit-pool ownership or reservation mismatch.",
    );
    const debit = Math.min(remaining, allocation.credits);
    await ctx.db.patch(pool._id, {
      reserved: pool.reserved - allocation.credits,
      spent: pool.spent + debit,
      updatedAt: Date.now(),
    });
    remaining -= debit;
  }
  ensure(
    remaining === 0,
    "LEDGER_INVALID",
    "Settlement is not backed by allocated credits.",
  );
  const w = await wallet(ctx, id);
  for (const budgetKey of x.operatorKeys ?? []) {
    const budget = await ctx.db
      .query("operatorBudgets")
      .withIndex("by_key", (q) => q.eq("key", budgetKey))
      .unique();
    ensure(
      budget && budget.reserved >= x.max,
      "LEDGER_INVALID",
      "Operator reservation is invalid.",
    );
    await ctx.db.patch(budget._id, {
      reserved: budget.reserved - x.max,
      spent: budget.spent + credits,
      updatedAt: Date.now(),
    });
  }
  await ctx.db.patch(w._id, {
    reserved: w.reserved - x.max,
    spent: w.spent + credits,
    updatedAt: Date.now(),
  });
  await ctx.db.patch(x._id, {
    state: "settled",
    settled: credits,
    updatedAt: Date.now(),
  });
  await ctx.db.insert("costEntries", {
    organizationId: id,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    key,
    credits,
    provider: "credit_settlement",
    units: credits,
    unitType: "service_credits",
    costCeilingEur: credits * 0.01,
    costStatus: credits === 0 ? "verified_zero" : "ceiling_only",
    ...(credits === 0 ? { eur: 0 } : {}),
  });
}
export const libraryContext = query({
  args: org,
  handler: async (ctx, { organizationId }) => {
    ctx = knowledgeReadContext(ctx);
    const { organization, membership } = await access(ctx, organizationId);
    const [repositories, proposals, notifications] = await Promise.all([
      ctx.db
        .query("repositories")
        .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
        .collect(),
      ctx.db
        .query("proposals")
        .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
        .order("desc")
        .take(100),
      ctx.db
        .query("notifications")
        .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
        .order("desc")
        .take(30),
    ]);
    const current = [];
    for (const p of proposals)
      if (
        !p.references ||
        (await referencesCurrent(ctx, organizationId, p.references))
      )
        current.push({ _id: p._id, review: p.review });
    return {
      workspaceName: organization.name,
      privateLibrary: Boolean(organization.privateOwnerId),
      role: membership.role,
      repositories: repositories.map(
        ({ _id, fullName, enabled, confirmed }) => ({
          _id,
          fullName,
          enabled,
          confirmed,
        }),
      ),
      proposals: current,
      notifications: notifications.map(({ _id, read }) => ({ _id, read })),
    };
  },
});
export const library = query({
  args: {
    ...org,
    search: v.optional(v.string()),
    state: v.optional(v.string()),
    category: v.optional(v.string()),
    sort: v.optional(v.string()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    ctx = knowledgeReadContext(ctx);
    await access(ctx, a.organizationId);
    ensure(
      !a.search || a.search.length <= 200,
      "INVALID_INPUT",
      "Search is too long.",
    );
    const sourceState = [
      "saved",
      "needs_upload",
      "queued",
      "processing",
      "ready",
      "failed",
    ].includes(a.state ?? "")
      ? a.state
      : undefined;
    const disposition = [
      "no_fit",
      "already_implemented",
      "unsupported_claim",
      "needs_context",
    ].includes(a.state ?? "")
      ? a.state
      : undefined;
    const notAnalyzed = a.state === "not_analyzed";
    const inProgress = a.state === "in_progress";
    ensure(
      !a.state || sourceState || disposition || notAnalyzed || inProgress,
      "INVALID_INPUT",
      "Invalid source filter.",
    );
    const sort = a.sort ?? "newest";
    ensure(
      ["newest", "oldest", "title", "updated", "saved", "published"].includes(
        sort,
      ),
      "INVALID_INPUT",
      "Invalid sort order.",
    );
    ensure(
      !a.category || a.category.length <= 64,
      "INVALID_INPUT",
      "Invalid category.",
    );
    const direction = sort === "title" || sort === "oldest" ? "asc" : "desc";
    let result;
    if (a.search?.trim() && a.category) {
      const links = await ctx.db
        .query("sourceCategories")
        .withSearchIndex("category_search", (q) =>
          q
            .search("searchable", a.search!.trim())
            .eq("organizationId", a.organizationId)
            .eq("categoryKey", a.category!),
        )
        .paginate({ numItems: 30, cursor: a.cursor ?? null });
      const sources = await Promise.all(
        links.page.map((link) => ctx.db.get(link.sourceId)),
      );
      result = {
        ...links,
        page: sources.filter(
          (s) =>
            s && s.organizationId === a.organizationId && s.state !== "deleted",
        ),
      };
    } else if (a.search?.trim()) {
      result = await ctx.db
        .query("sources")
        .withSearchIndex("source_search", (q) =>
          q
            .search("searchable", a.search!.trim())
            .eq("organizationId", a.organizationId),
        )
        .filter((q) =>
          sourceState
            ? q.eq(q.field("state"), sourceState)
            : notAnalyzed
              ? q.and(
                  q.neq(q.field("state"), "ready"),
                  q.neq(q.field("state"), "deleted"),
                )
              : inProgress
                ? q.or(
                    q.eq(q.field("state"), "queued"),
                    q.eq(q.field("state"), "processing"),
                  )
                : q.neq(q.field("state"), "deleted"),
        )
        .paginate({ numItems: 30, cursor: a.cursor ?? null });
    } else if (a.category) {
      const index =
        sort === "published"
          ? "by_category_published"
          : sort === "title"
            ? "by_category_title"
            : sort === "updated"
              ? "by_category_updated"
              : sort === "saved"
                ? "by_category_saved"
                : "by_category_created";
      const links = await ctx.db
        .query("sourceCategories")
        .withIndex(index, (q) =>
          q
            .eq("organizationId", a.organizationId)
            .eq("categoryKey", a.category!),
        )
        .order(direction)
        .paginate({ numItems: 30, cursor: a.cursor ?? null });
      const sources = await Promise.all(
        links.page.map((link) => ctx.db.get(link.sourceId)),
      );
      result = {
        ...links,
        page: sources.filter(
          (s) =>
            s && s.organizationId === a.organizationId && s.state !== "deleted",
        ),
      };
    } else {
      const index =
        sort === "published"
          ? "by_org_published"
          : sort === "title"
            ? "by_org_title"
            : sort === "updated"
              ? "by_org_updated"
              : sort === "saved"
                ? "by_org_saved"
                : "by_org_created";
      result = await ctx.db
        .query("sources")
        .withIndex(index, (q) => q.eq("organizationId", a.organizationId))
        .order(direction)
        .filter((q) =>
          sourceState
            ? q.eq(q.field("state"), sourceState)
            : notAnalyzed
              ? q.and(
                  q.neq(q.field("state"), "ready"),
                  q.neq(q.field("state"), "deleted"),
                )
              : inProgress
                ? q.or(
                    q.eq(q.field("state"), "queued"),
                    q.eq(q.field("state"), "processing"),
                  )
                : q.neq(q.field("state"), "deleted"),
        )
        .paginate({ numItems: 30, cursor: a.cursor ?? null });
    }
    const page = [];
    for (const source of result.page) {
      if (!source || (sourceState && source.state !== sourceState)) continue;
      if (
        source.sourceRetentionUntil &&
        source.sourceRetentionUntil <= Date.now()
      )
        continue;
      if (notAnalyzed && source.state === "ready") continue;
      if (inProgress && !["queued", "processing"].includes(source.state))
        continue;
      if (
        !disposition ||
        (
          await ctx.db
            .query("proposals")
            .withIndex("by_source", (q) => q.eq("sourceId", source._id))
            .collect()
        ).some((proposal) => proposal.detail.disposition === disposition)
      )
        page.push(source);
    }
    return {
      items: await Promise.all(
        page.map(
          async ({
            text: _text,
            analysis,
            objectKey: _objectKey,
            searchable: _searchable,
            selectedAnalysisSummary: _selectedSummary,
            selectedAnalysisInsightCount: _selectedCount,
            selectedAnalysisMainPoints: _selectedPoints,
            ...source
          }) => {
            const shared = await cloudSourceMetadata(ctx, {
              ...source,
              selectedAnalysisSummary: _selectedSummary,
              selectedAnalysisInsightCount: _selectedCount,
              selectedAnalysisMainPoints: _selectedPoints,
            });
            return {
              ...source,
              ...(shared ? { sharedAvailable: shared.available } : {}),
              summary: shared
                ? shared.summary
                : (_selectedSummary ?? source.summary),
              insightCount:
                (shared ? shared.insightCount : _selectedCount) ??
                analysis?.insights?.length ??
                0,
              mainPoints:
                (shared ? shared.mainPoints : _selectedPoints) ??
                analysis?.insights?.slice(0, 3).map((i: any) => i.title) ??
                [],
            };
          },
        ),
      ),
      next: result.isDone ? null : result.continueCursor,
      total: result.isDone && !a.cursor ? page.length : null,
    };
  },
});
export const backfillSearch = internalMutation({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, a) => {
    const result = await ctx.db
      .query("sources")
      .paginate({ numItems: 20, cursor: a.cursor ?? null });
    for (const source of result.page)
      await ctx.db.patch(source._id, {
        searchable:
          source.state === "deleted"
            ? ""
            : [source.title, source.summary, source.text, ...source.tags]
                .filter(Boolean)
                .join(" "),
      });
    if (!result.isDone)
      await ctx.scheduler.runAfter(0, internal.product.backfillSearch, {
        cursor: result.continueCursor,
      });
  },
});
export const detail = query({
  args: {
    id: v.id("sources"),
    organizationId: v.optional(v.id("organizations")),
  },
  handler: async (ctx, { id, organizationId }) => {
    ctx = knowledgeReadContext(ctx);
    const s = await ctx.db.get(id);
    if (
      !s ||
      s.state === "deleted" ||
      (organizationId !== undefined && organizationId !== s.organizationId)
    )
      fail("Source unavailable.");
    const reader = await access(ctx, s.organizationId);
    ensure(
      !s.sourceRetentionUntil || s.sourceRetentionUntil > Date.now(),
      "SOURCE_UNAVAILABLE",
      "The retained source evidence expired. Recover it with permitted supplied text.",
    );
    let typedRegistry;
    if (s.currentRevisionId) {
      const revision = await ctx.db.get(s.currentRevisionId);
      ensure(
        revision &&
          revision.state === "current" &&
          revision.organizationId === s.organizationId &&
          revision.sourceId === s._id &&
          revision.generation === s.generation,
        "INVALID_EVIDENCE",
        "Source evidence changed.",
      );
      typedRegistry = await validateEvidenceRegistry(
        revision.revision,
        revision.evidence,
      );
      ensure(
        typedRegistry.revision.contentHash === revision.contentHash,
        "INVALID_EVIDENCE",
        "Source content hash changed.",
      );
      ensure(
        sourcePolicyCurrent(typedRegistry.revision),
        "SOURCE_UNAVAILABLE",
        "The retained source permission expired or changed.",
      );
    }
    if (s.personalAnalysis?.executor === "work_cloud")
      ensure(
        s.rightsAttested,
        "SOURCE_UNAVAILABLE",
        "Source permission changed.",
      );
    if (s.orderedMedia && s.state === "ready") await currentOrderedSource(s);
    const selected = await selectedAnalysis(ctx, s);
    const analysisHash = s.analysis
      ? await digest(JSON.stringify(s.analysis))
      : undefined;
    const currentReview = analysisHash
      ? await ctx.db
          .query("feedback")
          .withIndex("by_target_actor", (q) =>
            q
              .eq("organizationId", s.organizationId)
              .eq("target", s._id)
              .eq("actor", reader.actor._id)
              .eq("sourceGeneration", s.generation)
              .eq("analysisHash", analysisHash),
          )
          .order("desc")
          .first()
      : null;
    const proposals = await ctx.db
      .query("proposals")
      .withIndex("by_source", (q) => q.eq("sourceId", id))
      .collect();
    const repositories = await ctx.db
      .query("repositories")
      .withIndex("by_org", (q) => q.eq("organizationId", s.organizationId))
      .collect();
    const cloudSourceEligible =
      reader.membership.role === "owner" &&
      (workCloudTextAllowed(reader.actor.subject) ||
        workCloudMediaAllowed(reader.actor.subject)) &&
      (await workCloudSourceEligible(
        ctx,
        reader.organization,
        reader.actor._id,
      ));
    let automaticVideoSupported = false;
    try {
      automaticVideoSupported =
        s.kind === "url" &&
        ["instagram", "tiktok"].includes(
          privateCloudMediaIdentity(s.url ?? s.canonical).platform,
        );
    } catch {
      /* Other source routes keep their own setup. */
    }
    const automaticRoute =
      cloudSourceEligible && automaticVideoSupported
        ? await savedCloudRoute(ctx, reader.actor, reader.organization)
        : null;
    const automaticGrant = automaticRoute?.grantId
      ? await ctx.db.get(automaticRoute.grantId)
      : null;
    return {
      ...s,
      workCloudLinkSetup: automaticRoute
        ? {
            configured: automaticRoute.configured,
            monitorReady: automaticRoute.available,
            chatLinksEnabled:
              automaticGrant?.cloudSaveDefaults?.version ===
              "link-save-cloud-v2",
          }
        : null,
      workCloudRetryEligible: cloudSourceEligible && cloudRetryEligible(s),
      catalogContributionAvailable:
        !!catalogConfiguration() &&
        selected?.metadata.origin === "private" &&
        selected.metadata.provenance === "authenticated_host_reported",
      ...(selected && "shared" in selected && selected.shared
        ? {
            sharedCloud: {
              version: "shared-cloud-detail-v1",
              canonical: selected.shared.prepared.canonical,
              evidenceHash: selected.shared.prepared.evidenceHash,
              sourceRevisionHash: selected.shared.prepared.sourceRevisionHash,
              transcript: selected.shared.prepared.segments,
              observations: selected.shared.prepared.observations,
              retainUntil: selected.shared.evidence.retainUntil,
              ...(selected.shared.evidence.resultRetention
                ? { resultRetention: selected.shared.evidence.resultRetention }
                : {}),
              selectionMode: s.selectedAnalysisVersionId
                ? "pinned"
                : "recommended",
              recommendationRevision: selected.shared.family.selectionRevision,
              notesVersionId: selected.metadata.id,
              notesUpdatedAt: selected.shared.layer.updatedAt,
              privateNote:
                selected.shared.layer.actor === reader.actor._id
                  ? (selected.shared.layer.notesHistory.find(
                      (note) => note.versionId === selected.metadata.id,
                    )?.privateNote ?? "")
                  : "",
              corrections:
                selected.shared.layer.actor === reader.actor._id
                  ? (selected.shared.layer.notesHistory.find(
                      (note) => note.versionId === selected.metadata.id,
                    )?.corrections ?? [])
                  : [],
              canEditNotes: selected.shared.layer.actor === reader.actor._id,
              frames: selected.shared.evidence.frames.map((f) => ({
                id: f.frameId,
                timestampMs: f.timestampMs,
                reference: `catalog~${s._id}~${selected.metadata.id}~${f.frameId}`,
              })),
            },
          }
        : {}),
      ...(selected
        ? {
            ...("preparedService" in selected && selected.preparedService
              ? { preparedService: selected.preparedService }
              : {}),
            analysis: selected.output,
            summary: selected.output.summary,
            analysisVersion: selected.metadata,
            analysisHash: undefined,
            analysisReview: undefined,
          }
        : {}),
      workCloudHandoff:
        reader.membership.role === "owner"
          ? ((await unclaimedCloudHandoff(
              ctx,
              s,
              reader.actor,
              reader.organization,
            )) ?? null)
          : null,
      sourceRevision: typedRegistry?.revision,
      evidenceRegistry: typedRegistry?.evidence,
      spaces: reader.organization.privateOwnerId
        ? await filing(ctx, id)
        : undefined,
      privateLibrary: Boolean(reader.organization.privateOwnerId),
      workCloudPrivateLibraryRequired:
        !cloudSourceEligible &&
        !reader.organization.privateOwnerId &&
        reader.membership.role === "owner" &&
        workCloudMediaAllowed(reader.actor.subject),
      workCloudTextEnabled:
        cloudSourceEligible && workCloudTextAllowed(reader.actor.subject),
      workCloudMediaEnabled:
        cloudSourceEligible && workCloudMediaAllowed(reader.actor.subject),
      analysisHash:
        selected && selected.metadata.provenance !== "legacy_recorded"
          ? undefined
          : analysisHash,
      analysisReview: currentReview?.qualityVerdict
        ? {
            verdict: currentReview.qualityVerdict,
            note: currentReview.note,
            reviewedAt: currentReview.createdAt,
            generation: currentReview.sourceGeneration,
          }
        : undefined,
      objectKey: undefined,
      selectionPendingKey: undefined,
      selectionActor: undefined,
      repositorySelection: selectionCurrent(
        s.repositorySelection,
        s,
        repositories,
      )
        ? s.repositorySelection
        : undefined,
      proposals: (
        await Promise.all(
          proposals.map(async (p) =>
            p.organizationId === s.organizationId &&
            (!p.references ||
              (await referencesCurrent(ctx, s.organizationId, p.references)))
              ? p
              : null,
          ),
        )
      ).filter((p) => p !== null),
    };
  },
});
export const overview = query({
  args: { ...org, includeCounts: v.optional(v.boolean()) },
  handler: async (ctx, a) => {
    await access(ctx, a.organizationId);
    const [sources, proposals, runs, feedback, notifications, w] =
      await Promise.all([
        a.includeCounts === false
          ? Promise.resolve([])
          : ctx.db
              .query("sources")
              .withIndex("by_org", (q) =>
                q.eq("organizationId", a.organizationId),
              )
              .take(1000),
        a.includeCounts === false
          ? Promise.resolve([])
          : ctx.db
              .query("proposals")
              .withIndex("by_org", (q) =>
                q.eq("organizationId", a.organizationId),
              )
              .take(1000),
        ctx.db
          .query("runs")
          .withIndex("by_org", (q) => q.eq("organizationId", a.organizationId))
          .take(1000),
        ctx.db
          .query("feedback")
          .withIndex("by_org", (q) => q.eq("organizationId", a.organizationId))
          .take(1000),
        ctx.db
          .query("notifications")
          .withIndex("by_org", (q) => q.eq("organizationId", a.organizationId))
          .order("desc")
          .take(30),
        ctx.db
          .query("wallets")
          .withIndex("by_org", (q) => q.eq("organizationId", a.organizationId))
          .unique(),
      ]);
    return {
      ...(a.includeCounts === false
        ? {}
        : {
            processed: sources.filter((s) => s.state === "ready").length,
            accepted: proposals.filter((p) => p.review === "accepted").length,
            pending: proposals.filter((p) => p.review === "unreviewed").length,
          }),
      merged: new Set(runs.filter((r) => r.mergedAt).map((r) => r.prUrl)).size,
      measured: feedback.filter((f) => f.benefit !== "not_measured").length,
      runs,
      notifications,
      wallet: w,
    };
  },
});
export const capture = mutation({
  args: {
    ...org,
    key: v.string(),
    kind: v.string(),
    url: v.optional(v.string()),
    title: v.string(),
    text: v.optional(v.string()),
    objectKey: v.optional(v.string()),
    rightsAttested: v.boolean(),
  },
  handler: (ctx, a) => captureOne(ctx, a),
});
export async function captureOne(
  ctx: MutationCtx,
  a: {
    organizationId: Id<"organizations">;
    key: string;
    kind: string;
    url?: string;
    title: string;
    text?: string;
    objectKey?: string;
    rightsAttested: boolean;
  },
  bulk = false,
) {
  const actor = await access(ctx, a.organizationId, [
    "owner",
    "admin",
    "member",
  ]);
  return captureAuthorized(ctx, a, actor, bulk);
}
// Trusted callers must obtain current server authorization before invoking this
// shared capture implementation. No actor or capability is accepted from a client.
export async function captureAuthorized(
  ctx: MutationCtx,
  a: Parameters<typeof captureOne>[1],
  actor: Awaited<ReturnType<typeof access>>,
  bulk = false,
  suppressPreview = false,
) {
  ensure(
    actor.organization._id === a.organizationId,
    "FORBIDDEN",
    "Capture scope mismatch.",
  );
  ensure(
    process.env.DISABLE_CAPTURE !== "true",
    "POLICY_BLOCKED",
    "Capture is paused.",
  );
  if (!bulk)
    await productLimits.limit(ctx, "capture", {
      key: actor.actor._id,
      throws: true,
    });
  ensure(
    a.rightsAttested,
    "RIGHTS_REQUIRED",
    "Confirm that you may submit this content.",
  );
  ensure(
    ["url", "text", "upload"].includes(a.kind) &&
      a.title.length > 0 &&
      a.title.length <= 160 &&
      a.key.length >= 8 &&
      a.key.length <= 100,
    "INVALID_INPUT",
    "Invalid capture input.",
  );
  const old = await ctx.db
    .query("sources")
    .withIndex("by_key", (q) =>
      q.eq("organizationId", a.organizationId).eq("key", a.key),
    )
    .unique();
  if (old && old.state !== "deleted") {
    if (a.kind === "url" && (await attachCloudCache(ctx, old, actor.actor._id)))
      return old._id;
    if (!bulk && a.kind === "url")
      await notifyVideoLinkSaved(ctx, old, actor.actor._id);
    return old._id;
  }
  const classified = a.kind === "url" ? classifySourceUrl(a.url ?? "") : null;
  let canonical =
    a.kind === "url"
      ? classified!.canonical
      : a.kind === "text"
        ? `text:${await digest(a.text ?? "")}`
        : `object:${a.objectKey}`;
  ensure(
    !a.text || (a.text.length <= 60000 && !containsSecret(a.text)),
    "POLICY_BLOCKED",
    "Supplied text is too large or contains a credential.",
  );
  ensure(
    a.kind !== "text" || !!a.text,
    "INVALID_INPUT",
    "Supply a transcript.",
  );
  ensure(
    a.kind !== "upload" ||
      (!!a.objectKey && a.objectKey.startsWith(`${a.organizationId}/`)),
    "FORBIDDEN",
    "Upload unavailable.",
  );
  if (a.kind === "upload") {
    const asset = await ctx.db
      .query("assets")
      .withIndex("by_key", (q) => q.eq("key", a.objectKey!))
      .unique();
    ensure(
      asset &&
        asset.organizationId === a.organizationId &&
        asset.state === "complete" &&
        asset.expiresAt !== undefined &&
        asset.expiresAt > Date.now(),
      "UPLOAD_INVALID",
      "Complete a verified upload first.",
    );
  }
  const dup = await ctx.db
    .query("sources")
    .withIndex("by_canonical", (q) =>
      q.eq("organizationId", a.organizationId).eq("canonical", canonical),
    )
    .unique();
  if (dup && dup.state !== "deleted") {
    if (a.kind === "url" && (await attachCloudCache(ctx, dup, actor.actor._id)))
      return dup._id;
    if (!bulk && a.kind === "url")
      await notifyVideoLinkSaved(ctx, dup, actor.actor._id);
    return dup._id;
  }
  const w = await wallet(ctx, a.organizationId);
  let counts = await ctx.db
    .query("sourceCounts")
    .withIndex("by_org", (q) => q.eq("organizationId", a.organizationId))
    .unique();
  if (!counts) {
    // Initial migration for the pre-release workspace. Future captures use one counter row.
    const rows = await ctx.db
      .query("sources")
      .withIndex("by_org", (q) => q.eq("organizationId", a.organizationId))
      .take(10001);
    const countId = await ctx.db.insert("sourceCounts", {
      organizationId: a.organizationId,
      active: rows.filter((s) => s.state !== "deleted").length,
      lifetime: rows.length,
    });
    counts = (await ctx.db.get(countId))!;
  }
  const personalLibrary =
    personalAllowed(actor.actor.subject) &&
    actor.organization.createdBy === actor.actor._id;
  ensure(
    (personalLibrary || w.tier !== "trial" || w.granted > 0) &&
      (w.tier === "trial" && !personalLibrary
        ? counts.lifetime
        : counts.active) <
        (personalLibrary
          ? 1000
          : w.tier === "trial"
            ? 3
            : w.tier === "pro"
              ? 10000
              : 1000),
    "QUOTA_EXCEEDED",
    "Source allowance reached.",
  );
  const now = Date.now();
  const id = await ctx.db.insert("sources", {
    ...a,
    canonical,
    sourceType:
      classified?.sourceType ?? (a.kind === "text" ? "supplied_text" : "media"),
    ...(classified && classified.sourceType !== "media"
      ? { retrievalState: "saved" as const }
      : {}),
    searchable: [a.title, a.text].filter(Boolean).join(" "),
    state:
      a.kind === "url" && classified?.sourceType === "media"
        ? "needs_upload"
        : "saved",
    coverage: a.kind === "text" ? "caption_only" : "metadata_only",
    tags: [],
    generation: 0,
    createdAt: now,
    updatedAt: now,
    ...(a.kind === "url" &&
    classified?.sourceType === "media" &&
    !suppressPreview &&
    process.env.LINK_PREVIEWS_ENABLED === "true"
      ? { linkPreview: { state: "queued" as const, updatedAt: now } }
      : {}),
  });
  await ctx.db.patch(counts._id, {
    active: counts.active + 1,
    lifetime: counts.lifetime + 1,
  });
  if (a.kind === "upload") {
    const asset = await ctx.db
      .query("assets")
      .withIndex("by_key", (q) => q.eq("key", a.objectKey!))
      .unique();
    if (asset) await ctx.db.patch(asset._id, { sourceId: id, updatedAt: now });
  }
  await audit(ctx, a.organizationId, actor.actor._id, "source.captured", id);
  const reusedCatalog =
    a.kind === "url" &&
    (await attachCloudCache(ctx, (await ctx.db.get(id))!, actor.actor._id));
  if (!bulk && a.kind === "url" && !reusedCatalog)
    await notifyVideoLinkSaved(ctx, (await ctx.db.get(id))!, actor.actor._id);
  if (
    a.kind === "url" &&
    !reusedCatalog &&
    classified?.sourceType === "media" &&
    !suppressPreview &&
    process.env.LINK_PREVIEWS_ENABLED === "true"
  )
    await workflow.start(
      ctx,
      internal.workflows.linkPreview,
      { id },
      {
        startAsync: true,
        onComplete: internal.workflows.completed,
        context: null,
      },
    );
  return id;
}
export async function queueLinkPreview(ctx: MutationCtx, id: Id<"sources">) {
  if (process.env.LINK_PREVIEWS_ENABLED !== "true") return false;
  const source = await ctx.db.get(id);
  if (
    !source ||
    source.state === "deleted" ||
    source.kind !== "url" ||
    (source.sourceType !== undefined && source.sourceType !== "media") ||
    !source.url ||
    !source.rightsAttested ||
    ["queued", "loading", "ready"].includes(source.linkPreview?.state || "") ||
    (source.linkPreview && source.linkPreview.updatedAt > Date.now() - 86400000)
  )
    return false;
  await ctx.db.patch(id, {
    linkPreview: { state: "queued", updatedAt: Date.now() },
  });
  await workflow.start(
    ctx,
    internal.workflows.linkPreview,
    { id },
    {
      startAsync: true,
      onComplete: internal.workflows.completed,
      context: null,
    },
  );
  return true;
}
export const queueOwnerPreviews = internalMutation({
  args: { ...org, ids: v.array(v.id("sources")) },
  handler: async (ctx, a) => {
    const organization = await ctx.db.get(a.organizationId);
    const owner = organization
      ? await ctx.db.get(organization.createdBy)
      : null;
    ensure(
      organization?.status === "active" &&
        owner?.status === "active" &&
        personalAllowed(owner.subject) &&
        a.ids.length <= 50 &&
        new Set(a.ids).size === a.ids.length,
      "FORBIDDEN",
      "Bounded owner preview backfill required.",
    );
    let queued = 0;
    for (const id of a.ids) {
      const source = await ctx.db.get(id);
      ensure(
        source?.organizationId === a.organizationId,
        "FORBIDDEN",
        "Preview source scope changed.",
      );
      if (await queueLinkPreview(ctx, id)) queued++;
    }
    return { queued };
  },
});

export async function digest(text: string) {
  const b = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(b), (x) =>
    x.toString(16).padStart(2, "0"),
  ).join("");
}
export async function startSource(
  ctx: MutationCtx,
  a: { id: Id<"sources">; maxCredits: number },
  authorizedActor?: Doc<"users">,
) {
  const s = await ctx.db.get(a.id);
  if (!s || s.state === "deleted") fail("Source unavailable.");
  const { actor } = authorizedActor
    ? { actor: authorizedActor }
    : await writeAccess(ctx, s.organizationId, ["owner", "admin", "member"]);
  ensure(
    !s.publicImportId,
    "POLICY_BLOCKED",
    "Open the current saved public artifact. Saving it does not start inference.",
  );
  const typedRevision = s.currentRevisionId
    ? await ctx.db.get(s.currentRevisionId)
    : null;
  if (typedRevision) {
    ensure(
      typedRevision.sourceId === s._id &&
        typedRevision.organizationId === s.organizationId &&
        typedRevision.state === "current" &&
        typedRevision.generation === s.generation,
      "APPROVAL_STALE",
      "Review the current acquired source revision.",
    );
    const registry = await validateEvidenceRegistry(
      typedRevision.revision,
      typedRevision.evidence,
    );
    ensure(
      registry.revision.contentHash === typedRevision.contentHash &&
        sourceRetained(s.sourceRetentionUntil),
      "INVALID_EVIDENCE",
      "The current retained content changed.",
    );
    ensure(
      !registry.revision.retention ||
        registry.revision.retention.retainUntil > Date.now(),
      "SOURCE_UNAVAILABLE",
      "The retained source evidence expired.",
    );
    ensure(
      sourcePolicyCurrent(registry.revision),
      "POLICY_BLOCKED",
      "Both direct source adapters await current provider acceptance.",
    );
  }
  ensure(
    typedRevision ||
      !["github_repository", "reddit_thread"].includes(s.sourceType ?? ""),
    "SOURCE_UNAVAILABLE",
    "Prepare permitted cited text before reviewing an analysis quote.",
  );
  if (s.assistantIntake) {
    const intakes = await ctx.db
      .query("assistantIntakes")
      .withIndex("by_source", (q) => q.eq("sourceId", s._id))
      .take(51);
    ensure(
      intakes.length <= 50,
      "SOURCE_BUSY",
      "Review this source's existing assistant work.",
    );
    for (const intake of intakes)
      if (intake.queueState === "local" && intake.runId) {
        const run = await ctx.db.get(intake.runId);
        ensure(
          !run || run.state !== "active" || run.expiresAt <= Date.now(),
          "SOURCE_BUSY",
          "Local work already started. No credit fallback was used.",
        );
      }
  }
  ensure(
    a.maxCredits === 10,
    "QUOTE_CHANGED",
    "Review the current 10-credit maximum.",
  );
  ensure(
    process.env.DISABLE_INFERENCE !== "true",
    "POLICY_BLOCKED",
    "Analysis is paused.",
  );
  if (s.state === "ready" || s.state === "processing" || s.state === "queued")
    return;
  if (s.kind === "url" && !typedRevision) {
    ensure(
      process.env.ACQUISITION_VERIFIED === "true" &&
        process.env.MEDIA_VERIFIED === "true" &&
        s.url &&
        s.rightsAttested,
      "MEDIA_UNAVAILABLE",
      "Public-link processing is not configured.",
    );
    acquisitionPolicy(s.url);
  }
  if (s.kind !== "text" && !typedRevision)
    ensure(
      ["cloudflare_free", "google_metered"].includes(
        process.env.MANAGED_INFERENCE_ROUTE ?? "",
      ) &&
        (process.env.MANAGED_INFERENCE_ROUTE !== "google_metered" ||
          googleConfigured()) &&
        hostedMediaAllowed(actor.subject),
      "SETUP_REQUIRED",
      "Select the configured cloud media route explicitly; no personal-plan fallback is used.",
    );
  await reserve(
    ctx,
    s.organizationId,
    `source:${s._id}:${s.generation + 1}`,
    10,
  );
  await ctx.db.patch(s._id, {
    state: "queued",
    orderedMedia: undefined,
    generation: s.generation + 1,
    managedAnalysisActor:
      s.kind !== "text" && !typedRevision ? actor._id : undefined,
    typedAnalysisActor: typedRevision ? actor._id : undefined,
    processingStartedAt: Date.now(),
    processingReceipt: undefined,
    error: undefined,
  });
  if (typedRevision)
    await ctx.db.patch(typedRevision._id, { generation: s.generation + 1 });
  await workflow.start(
    ctx,
    internal.workflows.sourceAnalysis,
    {
      id: s._id,
      generation: s.generation + 1,
      media: s.kind !== "text" && !typedRevision,
      route: typedRevision
        ? ("source_text" as const)
        : s.kind === "text"
          ? ("text" as const)
          : ("media" as const),
    },
    {
      startAsync: true,
      onComplete: internal.workflows.completed,
      context: null,
    },
  );
}
export const processSource = mutation({
  args: { id: v.id("sources"), maxCredits: v.number() },
  handler: (ctx, a) => startSource(ctx, a),
});
export const processBatch = mutation({
  args: { ids: v.array(v.id("sources")), maxCredits: v.number() },
  handler: async (ctx, a) => {
    ensure(
      a.ids.length > 0 &&
        a.ids.length <= 5 &&
        new Set(a.ids).size === a.ids.length,
      "INVALID_INPUT",
      "Choose one to five distinct sources.",
    );
    // One transaction reserves the complete batch or rolls it back. Each source
    // is authorized before ready/queued deduplication can disclose its state.
    for (const id of a.ids)
      await startSource(ctx, { id, maxCredits: a.maxCredits });
    return { reviewed: a.ids.length };
  },
});
export const recordAcquisition = internalMutation({
  args: { id: v.id("sources"), generation: v.number(), manifest: v.any() },
  handler: async (ctx, a) => {
    const source = await ctx.db.get(a.id);
    if (
      !source ||
      source.kind !== "url" ||
      source.state === "deleted" ||
      source.generation !== a.generation
    )
      return false;
    if (
      source.managedAnalysisActor &&
      !(await hostedSourceAllowed(ctx, source))
    )
      return false;
    const { schemaVersion: _schemaVersion, ...metadata } =
      acquisitionManifest.parse(a.manifest);
    await ctx.db.patch(a.id, {
      acquisition: {
        ...metadata,
        basis: "permitted_public_fetch",
        acquiredAt: Date.now(),
      },
      ...(metadata.title ? { title: metadata.title } : {}),
      ...(metadata.publishedAt ? { publishedAt: metadata.publishedAt } : {}),
      updatedAt: Date.now(),
    });
    await syncCategories(ctx, (await ctx.db.get(a.id))!);
    return true;
  },
});
export const workerSource = internalQuery({
  args: { id: v.id("sources") },
  handler: (ctx, a) => ctx.db.get(a.id),
});
export const workerSourceRevision = internalQuery({
  args: { id: v.id("sources"), generation: v.number() },
  handler: async (ctx, a) => {
    const source = await ctx.db.get(a.id);
    if (!source?.currentRevisionId) return null;
    ensure(
      source.state !== "deleted" &&
        source.rightsAttested &&
        source.generation === a.generation &&
        source.typedAnalysisActor &&
        (await actorCurrent(
          ctx,
          source.organizationId,
          source.typedAnalysisActor,
        )),
      "FORBIDDEN",
      "Source processing authority changed.",
    );
    const row = await ctx.db.get(source.currentRevisionId);
    ensure(
      row &&
        row.sourceId === source._id &&
        row.organizationId === source.organizationId &&
        row.state === "current" &&
        row.generation === a.generation,
      "INVALID_EVIDENCE",
      "Source evidence revision changed.",
    );
    const registry = await validateEvidenceRegistry(
      row!.revision,
      row!.evidence,
    );
    ensure(
      registry.revision.contentHash === row!.contentHash &&
        sourceRetained(source.sourceRetentionUntil),
      "INVALID_EVIDENCE",
      "The retained source content changed.",
    );
    ensure(
      !registry.revision.retention ||
        registry.revision.retention.retainUntil > Date.now(),
      "SOURCE_UNAVAILABLE",
      "Source evidence retention expired.",
    );
    ensure(
      sourcePolicyCurrent(registry.revision),
      "POLICY_BLOCKED",
      "Current direct-source eligibility is required.",
    );
    return { id: row!._id, ...registry };
  },
});
export const authorizeHostedMedia = internalQuery({
  args: { id: v.id("sources"), generation: v.number() },
  handler: async (ctx, a) => {
    const source = await ctx.db.get(a.id);
    return (
      !!source &&
      source.generation === a.generation &&
      (await hostedSourceAllowed(ctx, source))
    );
  },
});
export const commitAnalysis = internalMutation({
  args: {
    id: v.id("sources"),
    generation: v.number(),
    output: v.optional(v.any()),
    error: v.optional(v.string()),
    credits: v.number(),
    retainReservation: v.optional(v.boolean()),
    reusedMediaGeneration: v.optional(v.number()),
    receipt: v.optional(v.any()),
  },
  handler: async (ctx, a) => {
    const s = await ctx.db.get(a.id);
    if (s && (s.state === "deleted" || s.generation !== a.generation)) {
      // A late worker may settle its confirmed usage, but never restore content.
      // Unknown provider usage continues to require reconciliation.
      if (!a.retainReservation)
        await settle(
          ctx,
          s.organizationId,
          `source:${s._id}:${a.generation}`,
          a.credits,
        );
      return;
    }
    if (
      !s ||
      s.state === "deleted" ||
      s.state === "ready" ||
      s.generation !== a.generation
    )
      return;
    let analysis: any;
    const receipt = a.receipt ? processingReceipt.parse(a.receipt) : undefined;
    ensure(
      !receipt ||
        (!!a.output &&
          !a.retainReservation &&
          receipt.generation === a.generation &&
          receipt.startedAt === s.processingStartedAt &&
          receipt.chargedCredits === a.credits),
      "COST_RECONCILIATION_REQUIRED",
      "Processing receipt is not bound to this settled result.",
    );
    if (a.output) {
      ensure(
        !s.managedAnalysisActor || (await hostedSourceAllowed(ctx, s)),
        "FORBIDDEN",
        "Media authorization changed before output commit.",
      );
      const typedRevision = s.currentRevisionId
        ? await ctx.db.get(s.currentRevisionId)
        : null;
      ensure(
        typedRevision ||
          (!s.currentRevisionId &&
            !["github_repository", "reddit_thread"].includes(
              s.sourceType ?? "",
            ) &&
            s.analysis?.schemaVersion !== "2.0.0"),
        "INVALID_EVIDENCE",
        "A typed source cannot fall back to legacy media evidence.",
      );
      analysis = presentAnalysis(
        (typedRevision ? sourceInsightOutput : insightOutput).parse(
          a.output,
        ) as any,
      );
      ensure(
        analysis.sourceId === s._id &&
          analysis.processingRunId === `${s._id}:${a.generation}`,
        "INVALID_EVIDENCE",
        "Wrong source reference.",
      );
      ensure(
        typedRevision
          ? analysis.coverage === "source_text"
          : s.kind === "text"
            ? analysis.coverage === "caption_only"
            : ["upload", "url"].includes(s.kind) &&
              analysis.coverage === s.mediaCoverage,
        "INVALID_EVIDENCE",
        "Analysis coverage does not match verified processing.",
      );
      const permitted = new Set(
        (s.mediaEvidence ?? []).map((e) =>
          JSON.stringify([e.kind, e.id, e.startMs, e.endMs]),
        ),
      );
      if (typedRevision) {
        ensure(
          s.rightsAttested && sourceRetained(s.sourceRetentionUntil),
          "RIGHTS_REQUIRED",
          "Source rights or retention changed before completion.",
        );
        ensure(
          s.typedAnalysisActor &&
            (await actorCurrent(ctx, s.organizationId, s.typedAnalysisActor)),
          "FORBIDDEN",
          "Processing authority changed before completion.",
        );
        ensure(
          typedRevision.state === "current" &&
            typedRevision.organizationId === s.organizationId &&
            typedRevision.sourceId === s._id &&
            typedRevision.generation === s.generation &&
            analysis.sourceRevisionId === typedRevision._id &&
            analysis.sourceContentHash === typedRevision.contentHash,
          "INVALID_EVIDENCE",
          "The immutable source evidence changed.",
        );
        const registry = await validateEvidenceRegistry(
          typedRevision.revision,
          typedRevision.evidence,
        );
        ensure(
          registry.revision.contentHash === typedRevision.contentHash &&
            sourceRetained(s.sourceRetentionUntil),
          "INVALID_EVIDENCE",
          "The retained source content changed.",
        );
        ensure(
          !registry.revision.retention ||
            registry.revision.retention.retainUntil > Date.now(),
          "SOURCE_UNAVAILABLE",
          "Source evidence retention expired.",
        );
        ensure(
          sourcePolicyCurrent(registry.revision),
          "POLICY_BLOCKED",
          "Direct source permission changed before completion.",
        );
        for (const item of analysis.insights) {
          ensure(
            item.evidence.length > 0,
            "INVALID_EVIDENCE",
            "Each source claim needs a current citation.",
          );
          for (const evidence of item.evidence)
            ensure(
              registry.evidence.some(
                (record) =>
                  record.id === evidence.id && record.kind === evidence.kind,
              ) &&
                evidence.startMs === null &&
                evidence.endMs === null,
              "INVALID_EVIDENCE",
              "Unknown source evidence reference.",
            );
        }
      }
      for (const i of analysis.insights)
        for (const e of i.evidence)
          ensure(
            typedRevision
              ? true
              : s.kind === "text"
                ? e.id === "supplied_text" &&
                  e.kind === "user_note" &&
                  e.startMs === null &&
                  e.endMs === null
                : permitted.has(
                    JSON.stringify([e.kind, e.id, e.startMs, e.endMs]),
                  ),
            "INVALID_EVIDENCE",
            "Unverified evidence reference.",
          );
    }
    if (analysis && a.reusedMediaGeneration !== undefined) {
      const stage = await ctx.db
        .query("mediaStages")
        .withIndex("by_source", (q) => q.eq("sourceId", s._id))
        .unique();
      ensure(
        stage &&
          stage.organizationId === s.organizationId &&
          stage.objectKey === s.objectKey &&
          stage.generation === a.reusedMediaGeneration &&
          stage.generation < a.generation,
        "CACHE_STALE",
        "Media stage changed before settlement.",
      );
      const payload = mediaStagePayload.parse(stage.payload);
      // Cached metered extraction does not establish the old final request's
      // usage. Preserve that uncertain old hold until operator reconciliation.
      if (payload.inferenceMicros === undefined)
        await settle(
          ctx,
          s.organizationId,
          `source:${s._id}:${stage.generation}`,
          payload.computeCredits,
        );
    }
    if (!a.retainReservation)
      await settle(
        ctx,
        s.organizationId,
        `source:${s._id}:${a.generation}`,
        a.credits,
      );
    await ctx.db.patch(s._id, {
      state: analysis ? "ready" : "failed",
      analysis,
      analysisPipelineVersion: analysis
        ? s.currentRevisionId
          ? "cited-source-v2"
          : "legacy-media-text-v1"
        : undefined,
      summary: analysis?.summary,
      searchable: [s.title, analysis?.summary, s.text, ...s.tags]
        .filter(Boolean)
        .join(" "),
      coverage: analysis?.coverage ?? s.coverage,
      error: a.error,
      processingReceipt: receipt,
      updatedAt: Date.now(),
    });
    if (s.assistantIntake) {
      const current = (await ctx.db.get(s._id))!;
      const intakes = await ctx.db
        .query("assistantIntakes")
        .withIndex("by_source", (q) => q.eq("sourceId", s._id))
        .take(11);
      for (const intake of intakes)
        if (
          intake.queueState === "credits" &&
          intake.analysisGeneration === a.generation
        ) {
          const continueProjects = !!analysis && !!intake.projectRequest;
          await ctx.db.patch(intake._id, {
            queueState: continueProjects
              ? "waiting"
              : analysis
                ? "completed"
                : "failed",
            generation: current.generation,
            revision: current.updatedAt,
            updatedAt: Date.now(),
          });
          if (continueProjects && intake.deviceId) {
            const device = await ctx.db.get(intake.deviceId);
            if (device?.state === "paired")
              await ctx.db.patch(device._id, { assistantPending: true });
          }
        }
    }
    if (analysis)
      await syncCategories(ctx, (await ctx.db.get(s._id))!, analysis);
    await syncKnowledge(ctx, (await ctx.db.get(s._id))!, {
      enqueue: !s.assistantIntake,
    });
    await ctx.db.insert("notifications", {
      organizationId: s.organizationId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      key: `source:${s._id}:${a.generation}`,
      message: analysis
        ? "A source summary is ready."
        : "A source needs attention.",
      read: false,
    });
    await ctx.scheduler.runAfter(0, internal.email.notify, {
      organizationId: s.organizationId,
      key: `source:${s._id}:${a.generation}`,
    });
  },
});
export const editSource = mutation({
  args: {
    id: v.id("sources"),
    summary: v.string(),
    tags: v.array(v.string()),
    correctedText: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    const s = await ctx.db.get(a.id);
    if (!s || s.state === "deleted") fail("Source unavailable.");
    const actor = await writeAccess(ctx, s.organizationId);
    ensure(
      a.summary.length <= 1500 &&
        !containsSecret(a.summary) &&
        a.tags.length <= 20 &&
        a.tags.every((t) => t.length <= 40 && !containsSecret(t)) &&
        (a.correctedText === undefined ||
          (a.correctedText.trim().length > 0 &&
            a.correctedText.length <= 60000 &&
            !containsSecret(a.correctedText))),
      "INVALID_INPUT",
      "Too much text.",
    );
    const corrected =
      a.correctedText !== undefined && a.correctedText !== s.text;
    ensure(
      !s.publicImportId,
      "POLICY_BLOCKED",
      "Edit your private saved-public layer separately.",
    );
    ensure(
      !corrected ||
        (!s.currentRevisionId &&
          !["github_repository", "reddit_thread"].includes(s.sourceType ?? "")),
      "POLICY_BLOCKED",
      "Use the explicit supplied-text replacement to retain typed provenance.",
    );
    if (corrected) {
      for (const stage of await ctx.db
        .query("mediaStages")
        .withIndex("by_source", (q) => q.eq("sourceId", s._id))
        .collect())
        await ctx.db.delete(stage._id);
      ensure(
        !["queued", "processing"].includes(s.state),
        "SOURCE_BUSY",
        "Wait for analysis to stop before correcting its input.",
      );
      const proposals = await ctx.db
        .query("proposals")
        .withIndex("by_source", (q) => q.eq("sourceId", s._id))
        .collect();
      const ids = new Set(proposals.map((p) => p._id));
      for (const run of await ctx.db
        .query("runs")
        .withIndex("by_org", (q) => q.eq("organizationId", s.organizationId))
        .collect()) {
        if (ids.has(run.proposalId) && !run.prNumber)
          await ctx.db.patch(run._id, {
            state: "canceled",
            generation: run.generation + 1,
            patch: undefined,
            changes: undefined,
            updatedAt: Date.now(),
          });
      }
      for (const proposal of proposals)
        await ctx.db.patch(proposal._id, {
          review: "superseded",
          planHash: undefined,
          updatedAt: Date.now(),
        });
    }
    await ctx.db.patch(s._id, {
      summary: a.summary,
      searchable: [s.title, a.summary, a.correctedText ?? s.text, ...a.tags]
        .filter(Boolean)
        .join(" "),
      tags: a.tags,
      ...(corrected
        ? {
            text: a.correctedText,
            originalText: s.originalText ?? s.text,
            originalMediaEvidence: s.originalMediaEvidence ?? s.mediaEvidence,
            correctionAuthor: actor.actor._id,
            kind: "text",
            state: "saved",
            coverage: "caption_only",
            analysis: undefined,
            mediaCoverage: undefined,
            mediaEvidence: undefined,
            generation: s.generation + 1,
            error: undefined,
          }
        : {}),
      updatedAt: Math.max(Date.now(), s.updatedAt + 1),
    });
    await syncKnowledge(ctx, (await ctx.db.get(s._id))!);
  },
});
export const attachSource = mutation({
  args: {
    id: v.id("sources"),
    text: v.optional(v.string()),
    objectKey: v.optional(v.string()),
    rightsAttested: v.boolean(),
  },
  handler: async (ctx, a) => {
    const s = await ctx.db.get(a.id);
    ensure(s && s.state !== "deleted", "FORBIDDEN", "Source unavailable.");
    const { actor } = await writeAccess(ctx, s.organizationId);
    ensure(
      !s.publicImportId &&
        !s.currentRevisionId &&
        !["github_repository", "reddit_thread"].includes(s.sourceType ?? ""),
      "POLICY_BLOCKED",
      "Use the explicit supplied-text replacement for a typed source.",
    );
    await limit(ctx, `source-attach:${actor._id}`, 10);
    ensure(
      a.rightsAttested && !!a.text !== !!a.objectKey,
      "RIGHTS_REQUIRED",
      "Provide one permitted transcript or verified upload and attest source rights.",
    );
    ensure(
      !["queued", "processing"].includes(s.state),
      "SOURCE_BUSY",
      "Wait for current processing to stop before replacing source input.",
    );
    if (a.text)
      ensure(
        a.text.length <= 120000 && !containsSecret(a.text),
        "INVALID_INPUT",
        "Transcript exceeds its bound or contains credentials.",
      );
    if (a.objectKey) {
      const asset = await ctx.db
        .query("assets")
        .withIndex("by_key", (q) => q.eq("key", a.objectKey!))
        .unique();
      ensure(
        asset &&
          asset.organizationId === s.organizationId &&
          asset.state === "complete" &&
          asset.expiresAt !== undefined &&
          asset.expiresAt > Date.now() &&
          (!asset.sourceId || asset.sourceId === s._id),
        "UPLOAD_INVALID",
        "Upload unavailable.",
      );
      await ctx.db.patch(asset._id, { sourceId: s._id, updatedAt: Date.now() });
    }
    const proposals = await ctx.db
      .query("proposals")
      .withIndex("by_source", (q) => q.eq("sourceId", s._id))
      .collect();
    const proposalIds = new Set(proposals.map((p) => p._id));
    for (const run of await ctx.db
      .query("runs")
      .withIndex("by_org", (q) => q.eq("organizationId", s.organizationId))
      .collect())
      if (proposalIds.has(run.proposalId) && !run.prNumber)
        await ctx.db.patch(run._id, {
          state: "canceled",
          generation: run.generation + 1,
          patch: undefined,
          changes: undefined,
          updatedAt: Date.now(),
        });
    for (const p of proposals) await ctx.db.delete(p._id);
    for (const stage of await ctx.db
      .query("mediaStages")
      .withIndex("by_source", (q) => q.eq("sourceId", s._id))
      .collect())
      await ctx.db.delete(stage._id);
    for (const asset of await ctx.db
      .query("assets")
      .withIndex("by_org", (q) => q.eq("organizationId", s.organizationId))
      .collect())
      if (
        asset.sourceId === s._id &&
        asset.key !== a.objectKey &&
        asset.kind === "evidence"
      )
        await queueDeletion(ctx, asset.key);
    if (s.objectKey && s.objectKey !== a.objectKey)
      await queueDeletion(ctx, s.objectKey);
    await ctx.db.patch(s._id, {
      kind: a.text ? "text" : "upload",
      text: a.text,
      objectKey: a.objectKey,
      state: "saved",
      coverage: a.text ? "caption_only" : "metadata_only",
      summary: undefined,
      analysis: undefined,
      searchable: [s.title, a.text, ...s.tags].filter(Boolean).join(" "),
      personalAnalysis: undefined,
      workCloudSaveIntent: undefined,
      personalMedia: undefined,
      orderedMedia: undefined,
      acquisition: undefined,
      processingReceipt: undefined,
      processingStartedAt: undefined,
      speechProvenance: undefined,
      mediaEvidence: undefined,
      originalMediaEvidence: undefined,
      mediaCoverage: undefined,
      error: undefined,
      generation: s.generation + 1,
      updatedAt: Date.now(),
    });
  },
});
export const deleteSource = mutation({
  args: { id: v.id("sources") },
  handler: async (ctx, { id }) => {
    const s = await ctx.db.get(id);
    if (!s) return;
    await writeAccess(ctx, s.organizationId);
    await redactSource(ctx, id);
  },
});
export async function redactSource(ctx: MutationCtx, id: Id<"sources">) {
  await invalidatePublicSource(ctx, id);
  const trialSource = await ctx.db.get(id);
  if (trialSource)
    await ctx.scheduler.runAfter(0, internal.subscriptionTrials.redact, {
      organizationId: trialSource.organizationId,
      sourceId: id,
      cursor: null,
    });
  if (trialSource)
    await ctx.scheduler.runAfter(0, internal.localLibrary.redactSource, {
      sourceId: id,
      cursor: null,
    });
  const s = await ctx.db.get(id);
  if (!s) return;
  for (const row of await ctx.db
    .query("sourceSpaces")
    .withIndex("by_source", (q) => q.eq("sourceId", id))
    .take(3))
    await ctx.db.delete(row._id);
  if (s.state !== "deleted") {
    const counts = await ctx.db
      .query("sourceCounts")
      .withIndex("by_org", (q) => q.eq("organizationId", s.organizationId))
      .unique();
    if (counts)
      await ctx.db.patch(counts._id, {
        active: Math.max(0, counts.active - 1),
      });
  }
  if (
    !(await ctx.db
      .query("tombstones")
      .withIndex("by_target", (q) => q.eq("target", id))
      .first())
  )
    await ctx.db.insert("tombstones", {
      organizationId: s.organizationId,
      target: id,
      at: Date.now(),
    });
  const proposals = await ctx.db
    .query("proposals")
    .withIndex("by_source", (q) => q.eq("sourceId", id))
    .collect();
  for (const p of proposals) await ctx.db.delete(p._id);
  for (const review of await ctx.db
    .query("feedback")
    .withIndex("by_target_actor", (q) =>
      q.eq("organizationId", s.organizationId).eq("target", id),
    )
    .collect())
    await ctx.db.delete(review._id);
  for (const stage of await ctx.db
    .query("mediaStages")
    .withIndex("by_source", (q) => q.eq("sourceId", id))
    .collect())
    await ctx.db.delete(stage._id);
  for (const proposal of proposals)
    for (const run of await ctx.db
      .query("runs")
      .withIndex("by_proposal", (q) => q.eq("proposalId", proposal._id))
      .collect())
      if (run.organizationId === s.organizationId)
        await ctx.db.patch(run._id, {
          generation: run.generation + 1,
          state: run.prNumber ? "completed" : "canceled",
          patch: undefined,
          changes: undefined,
          report: undefined,
          events: [],
          updatedAt: Date.now(),
        });
  await ctx.db.patch(id, {
    state: "deleted",
    canonical: `deleted:${id}`,
    key: `deleted:${id}`,
    title: "Deleted source",
    searchable: "",
    summary: undefined,
    text: undefined,
    analysis: undefined,
    mediaEvidence: undefined,
    mediaCoverage: undefined,
    originalText: undefined,
    processingReceipt: undefined,
    localAnalysisReceipt: undefined,
    processingStartedAt: undefined,
    speechProvenance: undefined,
    originalMediaEvidence: undefined,
    correctionAuthor: undefined,
    personalAnalysis: undefined,
    workCloudSaveIntent: undefined,
    personalMedia: undefined,
    orderedMedia: undefined,
    acquisition: undefined,
    currentRevisionId: undefined,
    retrievalState: undefined,
    analysisPipelineVersion: undefined,
    publicImportId: undefined,
    selectedAnalysisVersionId: undefined,
    analysisSelectionRevision: undefined,
    pendingAnalysisAttemptId: undefined,
    pendingAnalysisAttemptState: undefined,
    nextAnalysisVersionNumber: undefined,
    selectedAnalysisSummary: undefined,
    selectedAnalysisInsightCount: undefined,
    selectedAnalysisMainPoints: undefined,
    typedAnalysisActor: undefined,
    sourceRetentionUntil: undefined,
    repositorySelection: undefined,
    linkPreview: undefined,
    originalSavedAt: undefined,
    url: undefined,
    tags: [],
    generation: s.generation + 1,
    updatedAt: Date.now(),
  });
  await syncCategories(ctx, (await ctx.db.get(id))!);
  await syncKnowledge(ctx, (await ctx.db.get(id))!);
  await ctx.scheduler.runAfter(0, internal.assistant.redactIntakes, {
    sourceId: id,
  });
  await ctx.scheduler.runAfter(0, internal.knowledge.redactDerived, {
    organizationId: s.organizationId,
    sourceId: id,
    section: "knowledgeJobs",
    cursor: null,
  });
  await ctx.db.patch(id, { categoryOverride: undefined });
  await ctx.scheduler.runAfter(0, internal.analysisVersions.eraseSource, {
    sourceId: id,
    organizationId: s.organizationId,
    stage: "versions",
  });
  for (const asset of await ctx.db
    .query("assets")
    .withIndex("by_org_source", (q) =>
      q.eq("organizationId", s.organizationId).eq("sourceId", id),
    )
    .collect())
    await queueDeletion(ctx, asset.key);
  if (s.objectKey) await queueDeletion(ctx, s.objectKey);
}
export const repositories = query({
  args: org,
  handler: async (ctx, a) => {
    await access(ctx, a.organizationId);
    const rows = await ctx.db
      .query("repositories")
      .withIndex("by_org", (q) => q.eq("organizationId", a.organizationId))
      .collect();
    return rows.map((r) => ({
      _id: r._id,
      organizationId: r.organizationId,
      installationId: r.installationId,
      providerId: r.providerId,
      fullName: r.fullName,
      branch: r.branch,
      sha: r.sha,
      enabled: r.enabled,
      confirmed: r.confirmed,
      profile: r.profile,
      profileVersion: r.profileVersion,
      selectionVersion: r.selectionVersion ?? 0,
      snapshotPaths: r.snapshotPaths ?? [],
      preparationError: r.preparationError,
      snapshotCoverage: r.snapshotSummary
        ? {
            selectedPaths: r.snapshotSummary.selectedPaths ?? [],
            includedFiles: r.snapshotSummary.eligibleFileCount,
            omittedFiles: r.snapshotSummary.omittedEligibleFileCount ?? 0,
            baseSha: r.snapshotSummary.baseSha,
            indexedFiles: r.snapshotSummary.indexedFileCount,
            inspectedFiles: r.snapshotSummary.inspectedPaths?.length ?? 0,
            wholeRepository:
              r.snapshotSummary.discoveryVersion === "whole-repository-v1",
            wordDocuments: r.snapshotSummary.businessDocumentPaths?.length ?? 0,
            evidence: (r.contextEvidence ?? r.contextExcerpts ?? []).map(
              (e) => ({
                path: e.path,
                startLine: e.startLine,
                endLine: e.endLine,
                wordDocument: e.path.endsWith(".docx"),
              }),
            ),
          }
        : undefined,
      profileDraft: r.profileDraft,
      profileDraftSha: r.profileDraftSha,
      profileDraftVersion: r.profileDraftVersion,
      profileDraftKey: r.profileDraftKey ? "pending" : undefined,
      status: r.status,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  },
});
export const saveProfile = mutation({
  args: {
    id: v.id("repositories"),
    profile: v.string(),
    confirmed: v.boolean(),
    enabled: v.boolean(),
  },
  handler: async (ctx, a) => {
    const repo = await ctx.db.get(a.id);
    if (!repo) fail("Repository unavailable.");
    await writeAccess(ctx, repo.organizationId, ["owner", "admin"]);
    ensure(
      a.profile.length <= 8000 && !containsSecret(a.profile),
      "INVALID_INPUT",
      "Profile is too long or includes credentials.",
    );
    await ctx.db.patch(a.id, {
      profile: a.profile,
      confirmed: a.confirmed,
      enabled: a.enabled,
      profileVersion: repo.profileVersion + 1,
      updatedAt: Date.now(),
    });
    const proposals = await ctx.db
      .query("proposals")
      .withIndex("by_org", (q) => q.eq("organizationId", repo.organizationId))
      .take(1000);
    for (const p of proposals)
      if (p.repositoryId === repo._id)
        await ctx.db.patch(p._id, {
          review: "needs_context",
          planHash: undefined,
        });
    await ctx.scheduler.runAfter(0, internal.repositorySelection.invalidate, {
      repositoryId: repo._id,
      cursor: null,
    });
  },
});
export const proposals = query({
  args: org,
  handler: async (ctx, a) => {
    await access(ctx, a.organizationId);
    const rows = await ctx.db
      .query("proposals")
      .withIndex("by_org", (q) => q.eq("organizationId", a.organizationId))
      .order("desc")
      .take(100);
    const permitted = [];
    for (const p of rows) {
      if (
        p.references &&
        !(await referencesCurrent(ctx, p.organizationId, p.references))
      )
        continue;
      permitted.push(p);
    }
    return permitted;
  },
});
export const proposal = query({
  args: { id: v.id("proposals") },
  handler: async (ctx, a) => {
    const p = await ctx.db.get(a.id);
    if (!p) fail("Proposal unavailable.");
    await access(ctx, p.organizationId);
    ensure(
      !p.references ||
        (await referencesCurrent(ctx, p.organizationId, p.references)),
      "FORBIDDEN",
      "Proposal evidence unavailable.",
    );
    const repo = await ctx.db.get(p.repositoryId);
    if (!repo || repo.organizationId !== p.organizationId)
      fail("Proposal unavailable.");
    return { ...p, repo };
  },
});
export const decide = mutation({
  args: {
    id: v.id("proposals"),
    version: v.number(),
    decision: v.string(),
    note: v.string(),
    disposition: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    const p = await ctx.db.get(a.id);
    if (!p) fail("Proposal unavailable.");
    const u = await writeAccess(ctx, p.organizationId);
    ensure(
      p.version === a.version,
      "APPROVAL_STALE",
      "Review the current proposal version.",
    );
    ensure(
      ["accepted", "rejected", "deferred"].includes(a.decision),
      "INVALID_INPUT",
      "Choose a decision.",
    );
    const disposition = a.disposition ?? p.disposition;
    ensure(
      [
        "relevant",
        "no_fit",
        "already_implemented",
        "unsupported_claim",
        "needs_context",
        "defer",
      ].includes(disposition),
      "INVALID_INPUT",
      "Choose a supported assessment.",
    );
    const changed = disposition !== p.disposition;
    ensure(
      !changed ||
        (a.note.trim().length >= 20 &&
          a.note.length <= 2000 &&
          !containsSecret(a.note)),
      "EVIDENCE_REQUIRED",
      "Explain the evidence for changing this assessment.",
    );
    ensure(
      a.decision !== "accepted" || disposition === "relevant",
      "CONTEXT_REQUIRED",
      "A no-fit or uncertain assessment needs an explicit, explained reviewer correction before accepting a coding proposal.",
    );
    await ctx.db.patch(p._id, {
      review: a.decision,
      disposition,
      ...(changed
        ? {
            reviewerCorrection: {
              from: p.detail.disposition,
              to: disposition,
              reason: a.note.trim(),
              actor: u.actor._id,
              at: Date.now(),
            },
            version: p.version + 1,
            planHash: undefined,
          }
        : {}),
      updatedAt: Date.now(),
    });
    await ctx.db.insert("feedback", {
      organizationId: p.organizationId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      actor: u.actor._id,
      target: p._id,
      action: a.decision,
      note: a.note.slice(0, 2000),
      benefit: "not_measured",
    });
  },
});
export async function editPlanCore(
  ctx: MutationCtx,
  a: { id: Id<"proposals">; version: number; plan: unknown },
) {
  const p = await ctx.db.get(a.id);
  if (!p) fail("Proposal unavailable.");
  ensure(
    await improvementCurrent(ctx, p),
    "APPROVAL_STALE",
    "Improvement evidence changed before plan review.",
  );
  ensure(
    p.version === a.version && p.review === "accepted",
    "APPROVAL_STALE",
    "Accept and review the current proposal.",
  );
  const plan = planInput.parse(a.plan);
  // Planning can describe protected work, but cannot admit forbidden paths or grant execution.
  validatePaths(
    plan.files.map((file) => file.path),
    plan.files.map((file) => file.path),
    true,
  );
  const repo = await repositoryManifest(ctx, await ctx.db.get(p.repositoryId));
  if (!repo || repo.organizationId !== p.organizationId)
    fail("Repository unavailable.");
  for (const f of plan.files)
    ensure(
      f.isNew || repo.manifest.includes(f.path),
      "INVALID_EVIDENCE",
      "Existing file is absent from the snapshot.",
    );
  await ctx.db.patch(p._id, {
    plan,
    planHash: await digest(JSON.stringify(plan)),
    version: p.version + 1,
    updatedAt: Date.now(),
  });
  for (const run of await ctx.db
    .query("runs")
    .withIndex("by_proposal", (q) => q.eq("proposalId", p._id))
    .collect())
    if (!["completed", "failed", "canceled", "publishing"].includes(run.state))
      await ctx.db.patch(run._id, {
        state: "canceled",
        generation: run.generation + 1,
        events: [
          ...run.events,
          "Plan edited; prior unpublished execution approval invalidated. Outstanding usage still requires reconciliation.",
        ],
        updatedAt: Date.now(),
      });
}
export const editPlan = mutation({
  args: { id: v.id("proposals"), version: v.number(), plan: v.any() },
  handler: async (ctx, a) => {
    const p = await ctx.db.get(a.id);
    ensure(p, "FORBIDDEN", "Proposal unavailable.");
    await writeAccess(ctx, p.organizationId);
    return editPlanCore(ctx, a);
  },
});
export async function currentMatchingProposal(
  ctx: QueryCtx,
  job: Doc<"matchingJobs">,
  source: Doc<"sources">,
  repo: Doc<"repositories">,
  actorId?: Id<"users">,
) {
  if (
    !job.proposalId ||
    !job.actor ||
    (actorId && job.actor !== actorId) ||
    job.organizationId !== source.organizationId ||
    job.sourceId !== source._id ||
    job.repositoryId !== repo._id ||
    repo.organizationId !== source.organizationId ||
    !repo.enabled ||
    !repo.confirmed ||
    job.sourceGeneration !== source.generation ||
    job.sourceRevision !== source.updatedAt ||
    source.state !== "ready" ||
    !source.rightsAttested ||
    !sourceRetained(source.sourceRetentionUntil) ||
    !(await actorCurrent(ctx, source.organizationId, job.actor))
  )
    return null;
  const proposal = await ctx.db.get(job.proposalId);
  if (
    !proposal ||
    proposal.organizationId !== source.organizationId ||
    proposal.sourceId !== source._id ||
    proposal.repositoryId !== repo._id ||
    proposal.baseSha !== repo.sha ||
    proposal.profileVersion !== repo.profileVersion ||
    proposal.review === "superseded"
  )
    return null;
  try {
    const typedRequired =
      !!source.currentRevisionId ||
      ["github_repository", "reddit_thread"].includes(
        source.sourceType ?? "",
      ) ||
      source.analysis?.schemaVersion === "2.0.0";
    const insights = (source.analysis?.insights ?? []).filter(
      (i: any) => !job.insightIds || job.insightIds.includes(i.id),
    );
    let detail: Pick<
      SourceProposal,
      "repositoryId" | "baseSha" | "profileVersion" | "insightIds"
    >;
    if (typedRequired) {
      if (
        !(await sharedTypedCitations(ctx, source)) ||
        !source.currentRevisionId
      )
        return null;
      const row = await ctx.db.get(source.currentRevisionId);
      const registry = row && (await retainedSourceRevision(ctx, row));
      if (
        !row ||
        !registry ||
        job.sourceRevisionId !== row._id ||
        job.sourceContentHash !== row.contentHash ||
        !proposal.references?.length ||
        !(await referencesCurrent(
          ctx,
          source.organizationId,
          proposal.references,
        ))
      )
        return null;
      detail = await validateTypedProposal(proposal.detail, {
        sourceId: source._id,
        sourceRevisionId: row._id,
        sourceContentHash: row.contentHash,
        ...registry,
        insights,
      });
      if (
        proposal.references.length !== detail.insightIds.length ||
        new Set(proposal.references.map((ref) => ref.insightId)).size !==
          detail.insightIds.length ||
        proposal.references.some(
          (ref) =>
            ref.sourceId !== source._id ||
            ref.generation !== source.generation ||
            ref.revision !== source.updatedAt ||
            !detail.insightIds.includes(ref.insightId),
        )
      )
        return null;
    } else detail = proposalOutput.parse(proposal.detail) as typeof detail;
    if (
      detail.repositoryId !== repo._id ||
      detail.baseSha !== repo.sha ||
      detail.profileVersion !== repo.profileVersion ||
      !detail.insightIds.every((id: string) =>
        insights.some((i: any) => i.id === id),
      )
    )
      return null;
    return proposal;
  } catch {
    return null;
  }
}
export const addProposal = internalMutation({
  args: {
    sourceId: v.id("sources"),
    repositoryId: v.id("repositories"),
    detail: v.any(),
    matchKey: v.optional(v.string()),
    sourceGeneration: v.optional(v.number()),
    inspectedContext: v.optional(inspectedContextValidator),
    inspectionManifest: v.optional(inspectionManifestValidator),
  },
  handler: async (ctx, a) => {
    const s = await ctx.db.get(a.sourceId),
      r = await repositoryContent(ctx, await ctx.db.get(a.repositoryId));
    const matchingJob = a.matchKey
      ? await ctx.db
          .query("matchingJobs")
          .withIndex("by_key", (q) => q.eq("key", a.matchKey!))
          .unique()
      : null;
    if (
      !s ||
      s.state === "deleted" ||
      !r ||
      s.organizationId !== r.organizationId ||
      !r.enabled
    )
      return;
    ensure(
      a.sourceGeneration === undefined || s.generation === a.sourceGeneration,
      "APPROVAL_STALE",
      "Source context changed during matching.",
    );
    const insights = (s.analysis?.insights ?? []).filter(
      (i: any) =>
        !matchingJob?.insightIds || matchingJob.insightIds.includes(i.id),
    );
    const typedRequired =
      !!s.currentRevisionId ||
      ["github_repository", "reddit_thread"].includes(s.sourceType ?? "") ||
      s.analysis?.schemaVersion === "2.0.0";
    if (typedRequired)
      ensure(
        await sharedTypedCitations(ctx, s),
        "INVALID_EVIDENCE",
        "Typed proposal context changed before completion.",
      );
    if (matchingJob) {
      ensure(
        matchingJob.organizationId === s.organizationId &&
          matchingJob.sourceId === s._id &&
          matchingJob.repositoryId === r._id &&
          matchingJob.actor &&
          (await actorCurrent(ctx, s.organizationId, matchingJob.actor)) &&
          matchingJob.sourceGeneration === s.generation &&
          matchingJob.sourceRevision === s.updatedAt &&
          s.state === "ready" &&
          s.rightsAttested &&
          sourceRetained(s.sourceRetentionUntil) &&
          r.confirmed,
        "APPROVAL_STALE",
        "Matching authority or source context changed.",
      );
      if (matchingJob.proposalId) {
        const cached = await currentMatchingProposal(ctx, matchingJob, s, r);
        ensure(
          cached,
          "APPROVAL_STALE",
          "The completed proposal is no longer current.",
        );
        return cached._id;
      }
      ensure(
        matchingJob.state === "pending",
        "APPROVAL_STALE",
        "The matching attempt is no longer active.",
      );
    }
    let d: any;
    if (s.currentRevisionId) {
      const row = await ctx.db.get(s.currentRevisionId);
      const registry = row ? await retainedSourceRevision(ctx, row) : null;
      ensure(
        s.state === "ready" &&
          registry &&
          sourcePolicyCurrent(registry.revision) &&
          matchingJob?.actor &&
          (await actorCurrent(ctx, s.organizationId, matchingJob.actor)) &&
          matchingJob.sourceGeneration === s.generation &&
          matchingJob.sourceRevision === s.updatedAt &&
          matchingJob.sourceRevisionId === row!._id &&
          matchingJob.sourceContentHash === row!.contentHash,
        "APPROVAL_STALE",
        "Source or matching authority changed.",
      );
      d = await validateTypedProposal(a.detail, {
        sourceId: s._id,
        sourceRevisionId: row!._id,
        sourceContentHash: row!.contentHash,
        ...registry,
        insights,
      });
    } else d = proposalOutput.parse(a.detail);
    ensure(
      d.baseSha === r.sha &&
        d.repositoryId === r._id &&
        d.profileVersion === r.profileVersion,
      "BASE_CHANGED",
      "Matching context changed.",
    );
    if (a.inspectedContext)
      validateInspectedContext(
        a.inspectedContext,
        a.inspectionManifest ?? r.manifestEntries ?? [],
      );
    validateRepositoryEvidence(
      d.repositoryEvidence,
      a.inspectedContext ?? r.contextExcerpts ?? [],
    );
    const insightIds = new Set(insights.map((i: any) => i.id));
    const evidenceKey = (e: any) =>
      JSON.stringify([e.kind, e.id, e.startMs, e.endMs]);
    const evidence = new Set(
      insights.flatMap((i: any) => i.evidence.map(evidenceKey)),
    );
    ensure(
      d.insightIds.every((id: string) => insightIds.has(id)),
      "INVALID_EVIDENCE",
      "Invented insight reference.",
    );
    ensure(
      d.sourceEvidence.every((e: any) => evidence.has(evidenceKey(e))),
      "INVALID_EVIDENCE",
      "Invented source evidence.",
    );
    const now = Date.now();
    const proposalId = await ctx.db.insert("proposals", {
      organizationId: s.organizationId,
      createdAt: now,
      updatedAt: now,
      sourceId: s._id,
      ...(s.currentRevisionId
        ? {
            references: d.insightIds.map((insightId: string) => ({
              sourceId: s._id,
              generation: s.generation,
              revision: s.updatedAt,
              insightId,
            })),
          }
        : {}),
      repositoryId: r._id,
      baseSha: r.sha,
      profileVersion: r.profileVersion,
      disposition: d.disposition,
      title: d.title,
      detail: d,
      review: "unreviewed",
      version: 1,
    });
    if (matchingJob)
      await ctx.db.patch(matchingJob._id, {
        proposalId,
        state: "completed",
        updatedAt: Date.now(),
      });
    return proposalId;
  },
});
export const reviewAnalysis = mutation({
  args: {
    id: v.id("sources"),
    generation: v.number(),
    analysisHash: v.string(),
    verdict: v.union(
      v.literal("accurate"),
      v.literal("missing_details"),
      v.literal("incorrect"),
      v.literal("unsure"),
    ),
    note: v.string(),
  },
  handler: async (ctx, a) => {
    const source = await ctx.db.get(a.id);
    if (!source || source.state === "deleted") fail("Source unavailable.");
    const { actor } = await writeAccess(ctx, source.organizationId);
    ensure(
      source.state === "ready" &&
        source.analysis &&
        source.generation === a.generation &&
        (await digest(JSON.stringify(source.analysis))) === a.analysisHash,
      "APPROVAL_STALE",
      "The analysis changed. Reload it before reviewing.",
    );
    ensure(
      a.note.length <= 2000 && !containsSecret(a.note),
      "INVALID_INPUT",
      "Keep review notes under 2,000 characters and omit credentials.",
    );
    const note = a.note.trim();
    const previous = await ctx.db
      .query("feedback")
      .withIndex("by_target_actor", (q) =>
        q
          .eq("organizationId", source.organizationId)
          .eq("target", source._id)
          .eq("actor", actor._id)
          .eq("sourceGeneration", a.generation)
          .eq("analysisHash", a.analysisHash),
      )
      .order("desc")
      .first();
    if (previous?.qualityVerdict === a.verdict && previous.note === note)
      return {
        verdict: a.verdict,
        note,
        generation: a.generation,
        reviewedAt: previous.createdAt,
      };
    await limit(ctx, `analysis-review:${actor._id}`, 20);
    const now = Date.now();
    await ctx.db.insert("feedback", {
      organizationId: source.organizationId,
      actor: actor._id,
      target: source._id,
      action: "analysis_quality_review",
      qualityVerdict: a.verdict,
      note,
      sourceGeneration: a.generation,
      analysisHash: a.analysisHash,
      benefit: "not_measured",
      createdAt: now,
      updatedAt: now,
    });
    await audit(
      ctx,
      source.organizationId,
      actor._id,
      "analysis.reviewed",
      source._id,
    );
    return {
      verdict: a.verdict,
      note,
      generation: a.generation,
      reviewedAt: now,
    };
  },
});
export const feedback = mutation({
  args: {
    ...org,
    target: v.string(),
    action: v.string(),
    note: v.string(),
    benefit: v.string(),
  },
  handler: async (ctx, a) => {
    const u = await writeAccess(ctx, a.organizationId);
    ensure(
      ["not_measured", "positive", "negative", "inconclusive"].includes(
        a.benefit,
      ),
      "INVALID_INPUT",
      "Choose an observed outcome.",
    );
    if (a.benefit !== "not_measured")
      ensure(
        a.note.trim().length > 0,
        "EVIDENCE_REQUIRED",
        "Describe the measurement and evidence.",
      );
    return ctx.db.insert("feedback", {
      ...a,
      note: a.note.slice(0, 4000),
      actor: u.actor._id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});
export const usage = query({
  args: org,
  handler: async (ctx, a) => {
    await access(ctx, a.organizationId);
    return {
      pools: await ctx.db
        .query("creditPools")
        .withIndex("by_org", (q) => q.eq("organizationId", a.organizationId))
        .collect(),
      wallet: await ctx.db
        .query("wallets")
        .withIndex("by_org", (q) => q.eq("organizationId", a.organizationId))
        .unique(),
      reservations: await ctx.db
        .query("reservations")
        .withIndex("by_org", (q) => q.eq("organizationId", a.organizationId))
        .order("desc")
        .take(100),
      entries: await ctx.db
        .query("costEntries")
        .withIndex("by_org", (q) => q.eq("organizationId", a.organizationId))
        .order("desc")
        .take(100),
    };
  },
});

export const stageMedia = internalMutation({
  args: {
    id: v.id("sources"),
    generation: v.number(),
    transcript: v.string(),
    coverage: v.string(),
    speech: v.optional(v.any()),
    cache: v.optional(
      v.object({ pipelineVersion: v.string(), payload: v.any() }),
    ),
    evidence: v.array(
      v.object({
        kind: v.string(),
        id: v.string(),
        startMs: v.union(v.number(), v.null()),
        endMs: v.union(v.number(), v.null()),
      }),
    ),
  },
  handler: async (ctx, a) => {
    const source = await ctx.db.get(a.id);
    if (
      !source ||
      source.state === "deleted" ||
      source.generation !== a.generation
    )
      return false;
    if (
      source.managedAnalysisActor &&
      !(await hostedSourceAllowed(ctx, source))
    )
      return false;
    ensure(
      a.transcript.length <= 60000 &&
        !containsSecret(a.transcript) &&
        ["full_sampled", "audio_only", "visual_only"].includes(a.coverage) &&
        a.evidence.length <= 224,
      "INVALID_EVIDENCE",
      "Invalid media evidence.",
    );
    for (const e of a.evidence) {
      ensure(
        e.kind === "caption"
          ? source.kind === "url" &&
              source.acquisition?.status === "acquired" &&
              !!source.acquisition.description &&
              e.id === "post_caption" &&
              e.startMs === null &&
              e.endMs === null
          : ["frame", "transcript"].includes(e.kind) &&
              Number.isSafeInteger(e.startMs) &&
              Number.isSafeInteger(e.endMs) &&
              e.startMs! >= 0 &&
              e.endMs! >= e.startMs! &&
              e.endMs! <= 600000,
        "INVALID_EVIDENCE",
        "Invalid evidence timing.",
      );
      if (e.kind === "frame") {
        const id = ctx.db.normalizeId("assets", e.id),
          asset = id ? await ctx.db.get(id) : null;
        ensure(
          asset?.sourceId === source._id &&
            asset.organizationId === source.organizationId &&
            asset.state === "complete" &&
            asset.kind === "evidence",
          "INVALID_EVIDENCE",
          "Frame evidence is unavailable.",
        );
      }
    }
    await ctx.db.patch(source._id, {
      text: a.transcript,
      speechProvenance: a.speech ? speechProvenance.parse(a.speech) : undefined,
      mediaCoverage: a.coverage,
      mediaEvidence: a.evidence,
      updatedAt: Date.now(),
    });
    if (a.cache) {
      const payload = mediaStagePayload.parse(a.cache.payload);
      ensure(
        payload.transcript.map((s) => s.text).join(" ") === a.transcript &&
          payload.evidence.length === a.evidence.length &&
          payload.evidence.every((e, index) => {
            const expected = a.evidence[index];
            return (
              e.kind === expected.kind &&
              e.id === expected.id &&
              e.startMs === expected.startMs &&
              e.endMs === expected.endMs
            );
          }) &&
          payload.transcript.every((segment) =>
            payload.evidence.some(
              (e) =>
                e.kind === "transcript" &&
                e.id === segment.id &&
                e.startMs === segment.startMs &&
                e.endMs === segment.endMs,
            ),
          ) &&
          payload.observations.every((frame) =>
            payload.evidence.some(
              (e) =>
                e.kind === "frame" &&
                e.id === frame.id &&
                e.startMs === frame.timestampMs &&
                e.endMs === frame.timestampMs,
            ),
          ) &&
          !containsSecret(JSON.stringify(payload)),
        "INVALID_EVIDENCE",
        "Media stage does not match its verified evidence.",
      );
      const objectKey = source.objectKey;
      ensure(objectKey, "INVALID_EVIDENCE", "Missing source object identity.");
      const asset = await ctx.db
        .query("assets")
        .withIndex("by_key", (q) => q.eq("key", objectKey))
        .unique();
      ensure(
        asset?.etag &&
          asset.sourceId === source._id &&
          asset.organizationId === source.organizationId,
        "INVALID_EVIDENCE",
        "Source fingerprint unavailable.",
      );
      const old = await ctx.db
        .query("mediaStages")
        .withIndex("by_source", (q) => q.eq("sourceId", source._id))
        .unique();
      const data = {
        organizationId: source.organizationId,
        sourceId: source._id,
        objectKey,
        etag: asset.etag,
        generation: a.generation,
        pipelineVersion: a.cache.pipelineVersion,
        artifactHash: await digest(JSON.stringify(payload)),
        payload,
        updatedAt: Date.now(),
      };
      if (old) await ctx.db.patch(old._id, data);
      else
        await ctx.db.insert("mediaStages", { ...data, createdAt: Date.now() });
    }
    return true;
  },
});
export const cachedMediaStage = internalQuery({
  args: { id: v.id("sources"), pipelineVersion: v.string() },
  handler: async (ctx, a) => {
    const source = await ctx.db.get(a.id);
    if (
      !source ||
      source.state === "deleted" ||
      source.kind !== "upload" ||
      !source.objectKey
    )
      return null;
    const stage = await ctx.db
      .query("mediaStages")
      .withIndex("by_source", (q) => q.eq("sourceId", a.id))
      .unique();
    if (
      !stage ||
      stage.organizationId !== source.organizationId ||
      stage.objectKey !== source.objectKey ||
      stage.pipelineVersion !== a.pipelineVersion ||
      stage.generation > source.generation ||
      stage.updatedAt < Date.now() - 7 * 86400000
    )
      return null;
    if (
      stage.artifactHash !==
      (await digest(JSON.stringify(mediaStagePayload.parse(stage.payload))))
    )
      return null;
    const asset = await ctx.db
      .query("assets")
      .withIndex("by_key", (q) => q.eq("key", stage.objectKey))
      .unique();
    if (asset?.etag !== stage.etag) return null;
    for (const e of stage.payload.evidence)
      if (e.kind === "frame") {
        const id = ctx.db.normalizeId("assets", e.id),
          frame = id ? await ctx.db.get(id) : null;
        if (frame?.sourceId !== source._id || frame.state !== "complete")
          return null;
      }
    return stage;
  },
});
