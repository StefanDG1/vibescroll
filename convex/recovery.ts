import { clearRepositoryContent } from "./lib/repositoryContent";
import { clearRepositoryManifest } from "./lib/repositoryManifest";
import { internalQuery } from "./_generated/server";
import { internalMutation } from "./lib/projectedMutations";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { ensure } from "../packages/policy";
import { redactSource } from "./product";
import { rememberDeletion, subjectHash } from "./lib/deletionMarkers";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { knowledgeReadContext } from "./lib/knowledgeReadContext";
import { sourceAuthority, sourceRetained } from "./lib/sourceAuthority";
import { recoveryQuarantineSections } from "../packages/recovery/quarantine";
import { preserveLegacyEditionModeration } from "./lib/publicModeration";

export async function retainedFrame(ctx: QueryCtx, key: string, asOf: number) {
  ensure(
    Number.isSafeInteger(asOf) && asOf > 0 && asOf <= Date.now(),
    "INVALID_INPUT",
    "Invalid evidence backup checkpoint.",
  );
  const asset = await ctx.db
    .query("assets")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  if (
    !asset ||
    asset.kind !== "evidence" ||
    asset.type !== "image/jpeg" ||
    asset.state !== "complete" ||
    !asset.sourceId ||
    asset._creationTime > asOf ||
    (asset.expiresAt !== undefined && asset.expiresAt <= Date.now())
  )
    return null;
  const source = await sourceAuthority(ctx, asset.sourceId),
    organization = await ctx.db.get(asset.organizationId);
  if (
    !source ||
    source.organizationId !== asset.organizationId ||
    source.state === "deleted" ||
    !sourceRetained(source) ||
    organization?.status !== "active"
  )
    return null;
  const [retired, tombstone, deletedWorkspace] = await Promise.all([
    ctx.db
      .query("objectDeletions")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique(),
    ctx.db
      .query("tombstones")
      .withIndex("by_target", (q) => q.eq("target", source._id))
      .first(),
    ctx.db
      .query("deletionMarkers")
      .withIndex("by_target", (q) =>
        q.eq("kind", "workspace").eq("target", asset.organizationId),
      )
      .unique(),
  ]);
  if (retired || tombstone || deletedWorkspace) return null;
  return {
    organizationId: asset.organizationId,
    sourceId: source._id,
    generation: source.generation,
    key: asset.key,
    type: asset.type,
    size: asset.size,
    restoreUntil: Math.min(asOf + 7 * 86400000, asset.expiresAt ?? Infinity),
    ...(asset.expiresAt === undefined ? {} : { expiresAt: asset.expiresAt }),
  };
}

// Internal, read-only operator inventory. Temporary audio/uploads are deliberately
// excluded; backing them up would undermine their short processing retention.
export const evidenceCheckpoint = internalQuery({
  args: {},
  handler: () => ({ asOf: Date.now() }),
});
export const evidencePage = internalQuery({
  args: {
    cursor: v.union(v.string(), v.null()),
    asOf: v.number(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, a) => {
    ctx = knowledgeReadContext(ctx);
    ensure(
      Number.isSafeInteger(a.asOf) && a.asOf > 0 && a.asOf <= Date.now(),
      "INVALID_INPUT",
      "Invalid evidence backup checkpoint.",
    );
    ensure(
      a.limit === undefined ||
        (Number.isSafeInteger(a.limit) && a.limit >= 1 && a.limit <= 25),
      "INVALID_INPUT",
      "Evidence inventory pages must contain one to 25 records.",
    );
    const rows = await ctx.db
      .query("assets")
      .paginate({ cursor: a.cursor, numItems: a.limit ?? 25 });
    const candidates = await Promise.all(
      rows.page.map((row) => retainedFrame(ctx, row.key, a.asOf)),
    );
    return {
      entries: candidates.filter((frame) => frame !== null),
      isDone: rows.isDone,
      cursor: rows.continueCursor,
    };
  },
});
export const evidenceCurrent = internalQuery({
  args: { key: v.string(), asOf: v.number() },
  handler: async (ctx, a) => {
    ensure(
      Number.isSafeInteger(a.asOf) && a.asOf > 0 && a.asOf <= Date.now(),
      "INVALID_INPUT",
      "Invalid evidence backup checkpoint.",
    );
    return retainedFrame(ctx, a.key, a.asOf);
  },
});
// Operator-only current-record projection for each restore write/read fence.
// Applying the latest independent markers remains a separate required step.
export const evidenceRestoreCurrent = internalQuery({
  args: { key: v.string(), asOf: v.number() },
  handler: async (ctx, a) => {
    ctx = knowledgeReadContext(ctx);
    ensure(
      process.env.RESTORE_LOCK === "true",
      "POLICY_BLOCKED",
      "Evidence restoration requires a locked destination.",
    );
    ensure(a.key.length <= 300, "INVALID_INPUT", "Use a bounded evidence key.");
    const evidence = await retainedFrame(ctx, a.key, a.asOf);
    if (!evidence) return null;
    const source = (await sourceAuthority(ctx, evidence.sourceId))!;
    return {
      locked: true,
      source: {
        id: source._id,
        organizationId: source.organizationId,
        generation: source.generation,
        state: source.state,
      },
      organization: { id: evidence.organizationId, status: "active" },
      asset: {
        key: evidence.key,
        sourceId: evidence.sourceId,
        organizationId: evidence.organizationId,
        state: "complete",
        type: evidence.type,
        size: evidence.size,
        ...(evidence.expiresAt === undefined
          ? {}
          : { expiresAt: evidence.expiresAt }),
      },
      retiredKeys: [],
      deletedSources: [],
      deletedWorkspaces: [],
    };
  },
});
const entry = v.object({
  kind: v.union(
    v.literal("source"),
    v.literal("workspace"),
    v.literal("account"),
  ),
  target: v.string(),
  organizationId: v.optional(v.string()),
  subjectHash: v.optional(v.string()),
  at: v.number(),
});
// Only deployment administrators can call these internal endpoints. Never expose them in product routes.
export const backupIdentity = internalQuery({
  args: {},
  handler: () => ({
    deployment: new URL(process.env.CONVEX_CLOUD_URL!).hostname.replace(
      /\.convex\.cloud$/,
      "",
    ),
  }),
});
export const markerPage = internalQuery({
  args: {
    section: v.union(v.literal("tombstones"), v.literal("deletionMarkers")),
    cursor: v.union(v.string(), v.null()),
  },
  handler: async (ctx, a) => {
    const rows = await ctx.db
      .query(a.section)
      .paginate({ cursor: a.cursor, numItems: 100 });
    return {
      ...rows,
      page: rows.page.map((row) =>
        "kind" in row
          ? {
              kind: row.kind,
              target: row.target,
              subjectHash: row.subjectHash,
              at: row.at,
            }
          : {
              kind: "source" as const,
              target: row.target,
              organizationId: row.organizationId,
              at: row.at,
            },
      ),
    };
  },
});
export const applyMarkers = internalMutation({
  args: { entries: v.array(entry) },
  handler: async (ctx, a) => {
    ensure(
      process.env.RESTORE_LOCK === "true",
      "POLICY_BLOCKED",
      "Apply deletion records only to a locked isolated restore deployment.",
    );
    ensure(
      a.entries.length <= 10 &&
        a.entries.every(
          (e) => Number.isSafeInteger(e.at) && e.at > 0 && e.at <= Date.now(),
        ),
      "INVALID_INPUT",
      "Invalid bounded restore manifest.",
    );
    for (const marker of a.entries) {
      if (marker.kind === "source") {
        const id = ctx.db.normalizeId("sources", marker.target),
          organizationId =
            marker.organizationId &&
            ctx.db.normalizeId("organizations", marker.organizationId);
        ensure(
          id && organizationId,
          "INVALID_INPUT",
          "Invalid source deletion identifier.",
        );
        const source = await ctx.db.get(id);
        ensure(
          !source || source.organizationId === organizationId,
          "FORBIDDEN",
          "Deletion marker belongs to another workspace.",
        );
        if (source) await redactSource(ctx, id);
        else if (
          !(await ctx.db
            .query("tombstones")
            .withIndex("by_target", (q) => q.eq("target", id))
            .first())
        )
          await ctx.db.insert("tombstones", {
            target: id,
            organizationId,
            at: marker.at,
          });
      } else if (marker.kind === "workspace") {
        const id = ctx.db.normalizeId("organizations", marker.target);
        ensure(id, "INVALID_INPUT", "Invalid workspace deletion identifier.");
        await rememberDeletion(ctx, "workspace", id, undefined, marker.at);
        const organization = await ctx.db.get(id);
        if (organization) {
          await ctx.db.patch(id, { status: "deleting" });
          await ctx.scheduler.runAfter(
            0,
            internal.maintenance.purgeOrganization,
            { organizationId: id },
          );
        }
      } else {
        const id = ctx.db.normalizeId("users", marker.target);
        ensure(
          id && marker.subjectHash && /^[a-f0-9]{64}$/.test(marker.subjectHash),
          "INVALID_INPUT",
          "Invalid account deletion marker.",
        );
        const actor = await ctx.db.get(id);
        ensure(
          !actor || (await subjectHash(actor.subject)) === marker.subjectHash,
          "FORBIDDEN",
          "Account marker identity mismatch.",
        );
        await rememberDeletion(
          ctx,
          "account",
          id,
          marker.subjectHash,
          marker.at,
        );
        if (actor) {
          for (const membership of await ctx.db
            .query("memberships")
            .withIndex("by_user", (q) => q.eq("userId", id))
            .collect())
            await ctx.db.delete(membership._id);
          await ctx.db.delete(id);
        }
      }
    }
    return { applied: a.entries.length };
  },
});

async function quarantineSource(ctx: MutationCtx, source: Doc<"sources">) {
  if (source.privateSourceAnalysis || source.privateSourceAnalysisRunId)
    await ctx.db.patch(source._id, {
      privateSourceAnalysis: undefined,
      privateSourceAnalysisRunId: undefined,
    });
  const provider =
    Boolean(
      source.orderedMedia ||
      source.orderedPreparation ||
      source.personalOrderedInput,
    ) ||
    source.sourceType === "github_repository" ||
    source.sourceType === "reddit_thread" ||
    source.sourceRetentionUntil !== undefined;
  if (!provider && !source.currentRevisionId && !source.publicImportId) {
    // Retained local preparation is temporary execution state, including on
    // otherwise preserved uploads. A restored snapshot cannot authorize reuse.
    if (source.personalMedia?.preparation)
      await ctx.db.patch(source._id, { personalMedia: undefined });
    return;
  }
  const retainedContent =
    source.personalOrderedInput ||
    source.orderedPreparation ||
    source.currentRevisionId ||
    source.analysis ||
    source.summary ||
    source.originalText ||
    source.mediaEvidence ||
    source.originalMediaEvidence ||
    source.personalMedia ||
    source.acquisition ||
    source.sourceRetentionUntil !== undefined ||
    (provider && source.text);
  if (
    !retainedContent &&
    !["queued", "processing", "ready"].includes(source.state)
  )
    return;
  await ctx.db.patch(source._id, {
    rightsAttested: provider ? false : source.rightsAttested,
    objectKey:
      source.personalOrderedInput ||
      source.orderedMedia ||
      source.orderedPreparation
        ? undefined
        : source.objectKey,
    currentRevisionId: undefined,
    orderedMedia: undefined,
    personalOrderedInput: undefined,
    orderedPreparation: undefined,
    serviceIntent: undefined,
    sourceRetentionUntil: undefined,
    state:
      source.state === "deleted"
        ? "deleted"
        : provider
          ? "needs_upload"
          : "saved",
    retrievalState: provider ? "needs_supplied_text" : source.retrievalState,
    generation: source.generation + 1,
    text: provider || source.publicImportId ? undefined : source.text,
    originalText: undefined,
    summary: undefined,
    analysis: undefined,
    mediaEvidence: undefined,
    originalMediaEvidence: undefined,
    personalMedia: undefined,
    acquisition: undefined,
    personalAnalysis: undefined,
    repositorySelection: undefined,
    searchable: source.title,
    coverage: "metadata_only",
    updatedAt: Math.max(Date.now(), source.updatedAt + 1),
  });
}
export const quarantinePage = internalMutation({
  args: {
    section: v.union(
      ...recoveryQuarantineSections.map((section) => v.literal(section)),
    ),
    cursor: v.union(v.string(), v.null()),
  },
  handler: async (ctx, a) => {
    ensure(
      process.env.RESTORE_LOCK === "true",
      "POLICY_BLOCKED",
      "Recovery quarantine requires a locked deployment.",
    );
    const page = await ctx.db
      .query(a.section)
      .paginate({ cursor: a.cursor, numItems: 25 });
    for (const row of page.page) {
      if (a.section === "creatorWatches") {
        const watch = row as Doc<"creatorWatches">;
        await ctx.db.patch(watch._id, {
          state: "quarantined",
          generation: watch.generation + 1,
          lease: undefined,
          leaseUntil: undefined,
          checkpoint: undefined,
          reservationKey: undefined,
          updatedAt: Date.now(),
        });
      } else if (a.section === "creatorPosts") {
        await ctx.db.patch(row._id as Doc<"creatorPosts">["_id"], {
          state: "removed",
          metadata: { removed: true },
          updatedAt: Date.now(),
        });
      } else if (a.section === "creatorSubscriptions") {
        await ctx.db.patch(row._id as Doc<"creatorSubscriptions">["_id"], {
          state: "quarantined",
          watchId: undefined,
          rightsAttested: false,
          catchUpSince: undefined,
          updatedAt: Date.now(),
        });
      } else if (a.section === "creatorDeliveries") {
        await ctx.db.patch(row._id as Doc<"creatorDeliveries">["_id"], {
          state: "withdrawn",
          reason: "recovery_quarantined",
          updatedAt: Date.now(),
        });
      } else if (a.section === "localLibraryRuns") {
        const run = row as Doc<"localLibraryRuns">;
        if (
          run.task &&
          run.task.schemaVersion !== "2.0.0" &&
          run.task.proposal
        ) {
          const p = await ctx.db.get(run.task.proposal.id);
          if (p?.localPlanRunId === run._id)
            await ctx.db.patch(p._id, { localPlanRunId: undefined });
        }
        await ctx.db.patch(run._id, {
          state: "canceled",
          task: undefined,
          sourceTaskResult: undefined,
          updatedAt: Date.now(),
        });
      } else if (a.section === "devices") {
        // Includes new catalogue/profile snapshots: restored devices never
        // retain pairing, account readiness or task dispatch authority.
        await ctx.db.delete(row._id);
      } else if (a.section === "pilotPaymentObservations") {
        // Keep the opaque dedup key: old verified webhook replay must not
        // recreate an observation that restoration has withdrawn.
        await ctx.db.patch(row._id as Doc<"pilotPaymentObservations">["_id"], {
          state: "withdrawn",
          updatedAt: Date.now(),
        });
      } else if (a.section === "publicImports") {
        const layer = row as Doc<"publicImports">;
        if (layer.origin === "service")
          await ctx.db.patch(layer._id, { snapshot: undefined });
        // Authored notes survive restoration. A restored retained copy cannot
        // bypass the quarantined source, artifact or provider authority.
      } else if (
        a.section === "publicReports" ||
        a.section === "publicModerationBlocks" ||
        a.section === "publicCorrections"
      ) {
        // Preserve authored personal layers/report history. Their restored base
        // never becomes available because editions/artifacts are quarantined.
        continue;
      } else if (a.section === "publicEditions") {
        const edition = row as Doc<"publicEditions">;
        await preserveLegacyEditionModeration(ctx, edition);
        await ctx.db.patch(edition._id, {
          state: "removed",
          payload: {
            ...edition.payload,
            title: "Unavailable restored edition",
            summary: "",
            insights: [],
            sourceUrl: null,
            publisher: "",
          },
          permissionReference: "Recovery quarantined",
          removalReason: "recovery_quarantined",
          updatedAt: Date.now(),
        });
      } else if (a.section === "publicCollections") {
        await ctx.db.patch(row._id as Doc<"publicCollections">["_id"], {
          state: "removed",
          editions: [],
          bindings: [],
          reviewedHash: undefined,
          updatedAt: Date.now(),
        });
      } else if (
        a.section === "publicArtifacts" ||
        a.section === "publicGeography" ||
        a.section === "sourceAcquisitions"
      ) {
        await ctx.db.delete(row._id);
      } else if (a.section === "sources") {
        await quarantineSource(ctx, row as Doc<"sources">);
      } else if (a.section === "sourceRevisions") {
        const revision = row as Doc<"sourceRevisions">;
        const source = await ctx.db.get(revision.sourceId);
        if (
          source?.organizationId === revision.organizationId &&
          source.currentRevisionId === revision._id
        )
          await quarantineSource(ctx, source);
        await ctx.db.delete(revision._id);
      } else if ("body" in row)
        await ctx.db.patch(row._id, {
          title: "Recovery quarantined draft",
          body: "",
          references: [],
          state: "deleted",
        });
      else if ("ceiling" in row)
        await ctx.db.patch(row._id, {
          enabled: false,
          state: "paused",
          version: row.version + 1,
        });
      else if (
        a.section === "knowledgeEvaluations" ||
        "topicVersion" in row ||
        "policyVersion" in row
      )
        await ctx.db.patch(row._id, {
          state: "quarantined",
          output: undefined,
          updatedAt: Date.now(),
        });
      else if ("draftVersion" in row)
        await ctx.db.patch(row._id, {
          state: row.number ? "published" : "unknown",
          updatedAt: Date.now(),
        });
      else if ("fundingRoute" in row) {
        if (!["completed", "failed", "canceled"].includes(row.state))
          await ctx.db.patch(row._id, {
            state: "canceled",
            generation: row.generation + 1,
            updatedAt: Date.now(),
            events: [
              ...row.events,
              "Backup recovery canceled unpublished execution. Reconcile outstanding usage before a new approval.",
            ],
          });
      } else if ("fullName" in row) {
        await clearRepositoryContent(ctx, row._id);
        await clearRepositoryManifest(ctx, row._id);
        await ctx.db.patch(row._id, {
          enabled: false,
          status: "reconnect_required",
          context: "",
          contextExcerpts: [],
          contextTree: "",
          contextFiles: [],
          manifestEntries: [],
          snapshotSummary: undefined,
          snapshotDelta: undefined,
        });
      } else await ctx.db.delete(row._id);
    }
    return {
      isDone: page.isDone,
      continueCursor: page.continueCursor,
      visited: page.page.length,
    };
  },
});
export const readiness = internalQuery({
  args: {},
  handler: async (ctx) => {
    const deleting = await ctx.db
      .query("organizations")
      .filter((q) => q.eq(q.field("status"), "deleting"))
      .first();
    const credentials = await ctx.db.query("connections").first();
    const device = await ctx.db.query("devices").first();
    const activeRun = await ctx.db
      .query("runs")
      .filter((q) =>
        q.and(
          q.neq(q.field("state"), "completed"),
          q.neq(q.field("state"), "failed"),
          q.neq(q.field("state"), "canceled"),
        ),
      )
      .first();
    const knowledgeAuthority = await ctx.db
      .query("knowledgePolicies")
      .filter((q) => q.eq(q.field("enabled"), true))
      .first();
    const activeKnowledge =
      (await ctx.db
        .query("knowledgeJobs")
        .withIndex("by_state_updated", (q) => q.eq("state", "queued"))
        .first()) ??
      (await ctx.db
        .query("knowledgeJobs")
        .withIndex("by_state_updated", (q) => q.eq("state", "running"))
        .first());
    const activeEvaluation =
      (await ctx.db
        .query("knowledgeEvaluations")
        .withIndex("by_state_updated", (q) => q.eq("state", "queued"))
        .first()) ??
      (await ctx.db
        .query("knowledgeEvaluations")
        .withIndex("by_state_updated", (q) => q.eq("state", "running"))
        .first());
    const activeIssue = await ctx.db
      .query("issueAttempts")
      .filter((q) =>
        q.or(
          q.eq(q.field("state"), "approved"),
          q.eq(q.field("state"), "publishing"),
        ),
      )
      .first();
    const assistantAuthority = await ctx.db
      .query("assistantSubscriptions")
      .first();
    const assistantGrant = await ctx.db.query("assistantGrants").first();
    const assistantDelivery = await ctx.db.query("assistantDeliveries").first();
    const publicEdition = await ctx.db
      .query("publicEditions")
      .withIndex("by_state", (q) => q.eq("state", "published"))
      .first();
    const publicCollection = await ctx.db
      .query("publicCollections")
      .withIndex("by_state", (q) => q.eq("state", "published"))
      .first();
    const publicArtifact = await ctx.db.query("publicArtifacts").first();
    const geography = await ctx.db.query("publicGeography").first();
    const acquisition = await ctx.db.query("sourceAcquisitions").first();
    const retainedRevision = await ctx.db.query("sourceRevisions").first();
    const paymentObservation = await ctx.db
      .query("pilotPaymentObservations")
      .filter((q) => q.eq(q.field("state"), "pending"))
      .first();
    return {
      locked: process.env.RESTORE_LOCK === "true",
      quarantineComplete:
        !assistantAuthority &&
        !assistantGrant &&
        !assistantDelivery &&
        !publicEdition &&
        !publicCollection &&
        !publicArtifact &&
        !geography &&
        !acquisition &&
        !retainedRevision &&
        !paymentObservation &&
        !deleting &&
        !credentials &&
        !device &&
        !activeRun &&
        !knowledgeAuthority &&
        !activeKnowledge &&
        !activeEvaluation &&
        !activeIssue,
      limitations:
        "Does not establish manifest freshness, restored backup integrity, external media deletion or production readiness.",
    };
  },
});
