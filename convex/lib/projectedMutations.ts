import {
  mutation as rawMutation,
  internalMutation as rawInternalMutation,
  type MutationCtx,
} from "../_generated/server";
import type { DataModel } from "../_generated/dataModel";
import { Triggers } from "convex-helpers/server/triggers";
import {
  customCtx,
  customMutation,
} from "convex-helpers/server/customFunctions";
import { queueSourceCompletion, eventsEnabled } from "./assistantEvents";
import { internal } from "../_generated/api";
import { ensure } from "../../packages/policy";
import { syncDashboardCard } from "./dashboardProjection";

// Use the existing helper's atomic write triggers. Failed projection writes
// abort the underlying mutation; no eventually consistent private cache.
const triggers = new Triggers<DataModel>();
triggers.register("sources", async (ctx, change) => {
  const before = change.oldDoc,
    next = change.newDoc;
  if (!before || !next || before.generation === next.generation) return;
  if (
    before.personalMedia?.version === "service-preparation-progress-v1" &&
    next.state !== "deleted" &&
    process.env.RESTORE_LOCK !== "true"
  ) {
    const id = ctx.db.normalizeId(
      "mediaPreparations",
      before.personalMedia.runId,
    );
    const preparation = id ? await ctx.db.get(id) : null;
    ensure(
      preparation && ["ready", "failed"].includes(preparation.state),
      "SOURCE_BUSY",
      "Reconcile the current media preparation before replacing source input.",
    );
  }
  if (
    before.pendingAnalysisAttemptId &&
    next.state !== "deleted" &&
    process.env.RESTORE_LOCK !== "true"
  ) {
    const pending = await ctx.db.get(before.pendingAnalysisAttemptId);
    ensure(
      !pending || !["running", "unknown"].includes(pending.state),
      "COST_RECONCILIATION_REQUIRED",
      "Reconcile the retained-evidence attempt before replacing source input.",
    );
    if (pending?.state === "queued" && !pending.taskId)
      await ctx.db.patch(pending._id, {
        state: "cancelled",
        diagnostic: "source_input_changed_before_claim",
        updatedAt: Date.now(),
      });
  }
  if (
    next.selectedAnalysisVersionId ||
    next.pendingAnalysisAttemptId ||
    next.selectedAnalysisSummary !== undefined
  ) {
    await ctx.db.patch(change.id, {
      selectedAnalysisVersionId: undefined,
      analysisSelectionRevision: undefined,
      pendingAnalysisAttemptId: undefined,
      pendingAnalysisAttemptState: undefined,
      selectedAnalysisSummary: undefined,
      selectedAnalysisInsightCount: undefined,
      selectedAnalysisMainPoints: undefined,
    });
  }
});
triggers.register("sources", async (ctx, change) => {
  const prior = change.oldDoc?.personalAnalysis;
  const next = change.newDoc;
  if (
    prior?.executor !== "work_cloud" ||
    !prior.cloud.taskId ||
    prior.state === "completed" ||
    !next ||
    next.state === "deleted" ||
    process.env.RESTORE_LOCK === "true"
  )
    return;
  const job = next.personalAnalysis;
  ensure(
    !(
      ["queued", "processing", "ready"].includes(next.state) &&
      next.generation !== prior.generation
    ),
    "COST_RECONCILIATION_REQUIRED",
    "Reconcile earlier Cloud usage before starting another executor.",
  );
  if (
    job?.executor === "work_cloud" &&
    job.generation === prior.generation &&
    job.cloud.taskId === prior.cloud.taskId &&
    job.cloud.leaseTokenHash === prior.cloud.leaseTokenHash &&
    job.cloud.inputHash === prior.cloud.inputHash &&
    job.cloud.grantId === prior.cloud.grantId &&
    job.cloud.grantVersion === prior.cloud.grantVersion &&
    job.cloud.consentId === prior.cloud.consentId
  )
    return;
  ensure(
    !job && !["queued", "processing", "ready"].includes(next.state),
    "COST_RECONCILIATION_REQUIRED",
    "The earlier Cloud attempt has unresolved host usage. No other executor was started.",
  );
  // Retain only the existing job metadata, never old source bytes. Subsequent
  // approvals remain blocked until its actual host outcome can be reconciled.
  await ctx.db.patch(change.id, {
    personalAnalysis: { ...prior, state: "unknown" },
  });
});

for (const table of ["sources", "repositories", "proposals", "runs"] as const)
  triggers.register(table, async (ctx, change) => {
    await syncDashboardCard(
      { ...ctx, db: ctx.innerDb },
      table,
      change.id,
      change.newDoc,
    );
  });
triggers.register("sources", async (ctx, change) => {
  if (!eventsEnabled()) return;
  if (
    !change.newDoc ||
    change.newDoc.state === "deleted" ||
    !change.newDoc.rightsAttested ||
    change.oldDoc?.generation !== change.newDoc.generation
  )
    await ctx.scheduler.runAfter(0, internal.assistantEvents.invalidate, {
      sourceId: change.id,
      cursor: null,
    });
  if (!change.newDoc) return;
  for (const id of await queueSourceCompletion(
    { ...ctx, db: ctx.innerDb },
    change.newDoc,
    change.oldDoc,
  ))
    await ctx.scheduler.runAfter(0, internal.assistantEventRuntime.deliver, {
      id,
    });
});
triggers.register("assistantGrants", async (ctx, change) => {
  if (!eventsEnabled()) return;
  if (change.oldDoc)
    await ctx.scheduler.runAfter(0, internal.assistantEvents.invalidate, {
      grantId: change.id,
      cursor: null,
    });
});
triggers.register("memberships", async (ctx, change) => {
  if (!eventsEnabled()) return;
  const organizationId = change.oldDoc?.organizationId;
  if (organizationId)
    await ctx.scheduler.runAfter(0, internal.assistantEvents.invalidate, {
      organizationId,
      cursor: null,
    });
});
triggers.register("organizations", async (ctx, change) => {
  if (!eventsEnabled()) return;
  if (!change.newDoc || change.newDoc.status !== "active")
    await ctx.scheduler.runAfter(0, internal.assistantEvents.invalidate, {
      organizationId: change.id,
      cursor: null,
    });
});
triggers.register("users", async (ctx, change) => {
  if (!eventsEnabled()) return;
  if (!change.newDoc || change.newDoc.status !== "active")
    await ctx.scheduler.runAfter(0, internal.assistantEvents.invalidate, {
      actor: change.id,
      cursor: null,
    });
});
const context = customCtx((ctx: MutationCtx) => ({
  db: triggers.wrapDB(ctx).db,
}));
export const mutation = customMutation(rawMutation, context);
export const internalMutation = customMutation(rawInternalMutation, context);
