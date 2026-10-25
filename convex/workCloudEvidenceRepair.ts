import { v } from "convex/values";
import { internalMutation, mutation } from "./lib/projectedMutations";
import {
  internalQuery,
  type QueryCtx,
  type MutationCtx,
} from "./_generated/server";
import type { Id, Doc } from "./_generated/dataModel";
import { access, recentAuthentication, audit } from "./lib";
import { ensure } from "../packages/policy";
import { assistantGrant } from "./lib/assistantPrincipal";
import { sourceWithinAssistantScope } from "./lib/assistantSourceScope";
import { assistantGrantActive } from "../packages/policy/assistant";
import { workCloudSourceEligible } from "./lib/workCloudSourceAccess";
import { workCloudMediaAllowed } from "./lib/personalAccess";
import { sourceRetained } from "./lib/sourceAuthority";
import {
  privateCloudMediaIdentity,
  isCloudObservedMedia,
} from "../packages/social/contracts";
import { retainedCloudFrames } from "../packages/media/cloud-frames";
import { canonicalJson } from "../packages/contracts/canonical-json.mjs";
import { workCloudMediaPreparation } from "../packages/contracts/work-cloud-text";
import { digest } from "./product";
import type { WorkCloudJob } from "./personalAnalysisSchema";

const sourceArgs = {
  sourceId: v.id("sources"),
  generation: v.number(),
  taskId: v.string(),
};
const leaseArgs = { ...sourceArgs, leaseToken: v.string() };
type RepairLease = {
  sourceId: Id<"sources">;
  generation: number;
  taskId: string;
  leaseToken: string;
};

async function retainedSource(
  ctx: QueryCtx,
  id: Id<"sources">,
  generation: number,
  selected?: Doc<"sources">,
) {
  ensure(
    process.env.RESTORE_LOCK !== "true",
    "FORBIDDEN",
    "Recovery is locked.",
  );
  const source = selected ?? (await ctx.db.get(id)),
    job = source?.personalAnalysis;
  ensure(
    source &&
      source.kind === "url" &&
      source.url &&
      sourceRetained(source) &&
      source.rightsAttested &&
      source.state === "ready" &&
      source.generation === generation &&
      job?.executor === "work_cloud" &&
      job.state === "completed" &&
      job.generation === generation &&
      job.cloud.media &&
      source.orderedMedia &&
      !source.currentRevisionId &&
      !source.publicImportId &&
      !source.creatorRights &&
      !source.serviceIntent,
    "SOURCE_UNAVAILABLE",
    "Use a current completed private Cloud result.",
  );
  const post = source.orderedMedia.post;
  ensure(
    isCloudObservedMedia(post) &&
      privateCloudMediaIdentity(source.url!).url === post.canonical &&
      privateCloudMediaIdentity(source.canonical).url === post.canonical &&
      post.retainUntil > Date.now() &&
      job.cloud.media.retainUntil === post.retainUntil &&
      job.cloud.media.preparationHash ===
        (await digest(canonicalJson(source.orderedMedia))),
    "APPROVAL_STALE",
    "The original evidence or retention changed.",
  );
  workCloudMediaPreparation.parse({
    schemaVersion:
      post.schemaVersion === "work-cloud-observed-media-v2"
        ? "work-cloud-media-preparation-v3"
        : "work-cloud-media-preparation-v2",
    post,
    evidence: source.orderedMedia.evidence,
  });
  return { source, job, post };
}

// Owner approval creates only a new bounded image-return permission. The old
// completed analysis, preparation, generation and original lease stay intact.
export const approve = mutation({
  args: {
    sourceId: v.id("sources"),
    generation: v.number(),
    preparationHash: v.string(),
    acknowledged: v.literal(true),
  },
  returns: v.object({
    needed: v.boolean(),
    state: v.string(),
    expiresAt: v.number(),
  }),
  handler: async (ctx, a) => {
    const selected = await ctx.db.get(a.sourceId);
    ensure(selected, "SOURCE_UNAVAILABLE", "Source unavailable.");
    const auth = await access(ctx, selected.organizationId, ["owner"]);
    await recentAuthentication(ctx);
    const c = await retainedSource(ctx, a.sourceId, a.generation, selected);
    ensure(
      workCloudMediaAllowed(auth.actor.subject) &&
        (await workCloudSourceEligible(
          ctx,
          auth.organization,
          auth.actor._id,
        )) &&
        c.job.actor === auth.actor._id &&
        a.preparationHash === c.job.cloud.media!.preparationHash,
      "FORBIDDEN",
      "Review repair of your own exact retained preparation.",
    );
    const grant = await ctx.db.get(c.job.cloud.grantId);
    ensure(
      grant &&
        assistantGrantActive(grant) &&
        grant.actor === auth.actor._id &&
        grant.organizationId === c.source.organizationId &&
        grant.scopes.includes("analysis:execute") &&
        (await repairScope(ctx, c, grant, auth.organization, auth.actor._id)),
      "APPROVAL_STALE",
      "Review a current execution connection for this result.",
    );
    ensure(
      c.post.frames.length > 0 &&
        c.post.frames.every((frame) => frame.bytes <= 150000),
      "INVALID_EVIDENCE",
      "Use the existing bounded prepared JPEGs without changing their hashes.",
    );
    const existing = retainedCloudFrames(c.source);
    if (
      c.post.frames.every((frame) =>
        existing.some((saved) => saved.frameId === frame.id),
      )
    )
      return { needed: false, state: "completed", expiresAt: 0 };
    const prior = c.job.cloud.media!.evidenceRepair;
    if (prior) {
      ensure(
        prior.state === "queued" &&
          prior.expiresAt > Date.now() &&
          prior.grantVersion === grant.version,
        "APPROVAL_STALE",
        "Reconcile the earlier evidence repair; do not replace an uncertain attempt.",
      );
      return { needed: true, state: prior.state, expiresAt: prior.expiresAt };
    }
    const now = Date.now(),
      repair = {
        state: "queued" as const,
        actor: auth.actor._id,
        grantId: grant._id,
        grantVersion: grant.version,
        preparationHash: a.preparationHash,
        approvedAt: now,
        expiresAt: Math.min(now + 900000, c.post.retainUntil),
        leaseUntil: 0,
        rawMediaDeleteBy: Math.min(now + 3600000, c.post.retainUntil),
      };
    await saveRepair(ctx, c.source, c.job, repair);
    await audit(
      ctx,
      c.source.organizationId,
      auth.actor._id,
      "work_cloud.evidence_repair_approved",
      `${a.sourceId}:${a.generation}:${a.preparationHash}`,
    );
    return { needed: true, state: repair.state, expiresAt: repair.expiresAt };
  },
});

type Repair = NonNullable<
  NonNullable<WorkCloudJob["cloud"]["media"]>["evidenceRepair"]
>;
async function repairScope(
  ctx: QueryCtx,
  c: Awaited<ReturnType<typeof retainedSource>>,
  grant: Doc<"assistantGrants">,
  organization: Doc<"organizations">,
  actor: Id<"users">,
) {
  return (
    (await sourceWithinAssistantScope(
      ctx,
      grant,
      organization,
      actor,
      c.source,
      false,
    )) ||
    (!grant.libraryScope &&
      grant._id === c.job.cloud.grantId &&
      grant.sources.some(
        (ref) =>
          ref.sourceId === c.source._id &&
          ref.generation === c.job.cloud.selectedGeneration &&
          ref.revision === c.job.cloud.selectedRevision,
      ))
  );
}
async function saveRepair(
  ctx: MutationCtx,
  source: Doc<"sources">,
  job: WorkCloudJob,
  repair: Repair,
) {
  ensure(job.cloud.media, "APPROVAL_STALE", "Media authority changed.");
  await ctx.db.patch(source._id, {
    personalAnalysis: {
      ...job,
      cloud: {
        ...job.cloud,
        media: { ...job.cloud.media, evidenceRepair: repair },
      },
    },
  });
}

async function currentRepair(
  ctx: QueryCtx,
  a: { sourceId: Id<"sources">; generation: number },
) {
  const selected = await ctx.db.get(a.sourceId);
  ensure(selected, "SOURCE_UNAVAILABLE", "Source unavailable.");
  const auth = await assistantGrant(
    ctx,
    selected.organizationId,
    "analysis:execute",
  );
  ensure(
    auth.membership.role === "owner",
    "FORBIDDEN",
    "Repair requires owner access.",
  );
  const c = await retainedSource(ctx, a.sourceId, a.generation, selected);
  const repair = c.job.cloud.media!.evidenceRepair;
  ensure(
    repair &&
      workCloudMediaAllowed(auth.actor.subject) &&
      auth.membership.role === "owner" &&
      (await workCloudSourceEligible(ctx, auth.organization, auth.actor._id)) &&
      repair.actor === auth.actor._id &&
      repair.grantId === auth.grant._id &&
      repair.grantVersion === auth.grant.version &&
      c.job.actor === auth.actor._id &&
      (await repairScope(
        ctx,
        c,
        auth.grant,
        auth.organization,
        auth.actor._id,
      )) &&
      repair.preparationHash === c.job.cloud.media!.preparationHash &&
      repair.expiresAt > Date.now(),
    "APPROVAL_STALE",
    "The exact evidence-repair permission expired or changed.",
  );
  return { ...c, ...auth, repair };
}

export async function evidenceRepairContext(
  ctx: QueryCtx,
  a: RepairLease,
  completed = false,
) {
  const c = await currentRepair(ctx, a);
  ensure(
    (c.repair.state === "running" ||
      (completed && c.repair.state === "completed")) &&
      (c.repair.leaseUntil > Date.now() ||
        (completed && c.repair.state === "completed")) &&
      c.repair.taskId === a.taskId &&
      c.repair.consentId === c.identity.sid &&
      c.repair.leaseTokenHash === (await digest(a.leaseToken)),
    "APPROVAL_STALE",
    "Use only the fresh evidence-repair lease, not the completed analysis lease.",
  );
  return c;
}

export const claim = internalMutation({
  args: sourceArgs,
  returns: v.object({
    leaseToken: v.string(),
    leaseUntil: v.number(),
    expiresAt: v.number(),
  }),
  handler: async (ctx, a) => {
    ensure(
      /^[A-Za-z0-9._:-]{1,160}$/.test(a.taskId),
      "INVALID_INPUT",
      "Use a bounded repair task ID.",
    );
    const c = await currentRepair(ctx, a);
    ensure(
      typeof c.identity.sid === "string" && c.identity.sid.length <= 200,
      "FORBIDDEN",
      "Use the current authenticated connection consent.",
    );
    ensure(
      c.repair.state === "queued" &&
        !c.repair.leaseTokenHash &&
        a.taskId !== c.job.cloud.taskId,
      "APPROVAL_STALE",
      "Claim repair once with a new task correlation; reconcile a lost acknowledgement.",
    );
    const leaseToken = crypto.randomUUID(),
      leaseUntil = Math.min(Date.now() + 180000, c.repair.expiresAt);
    await saveRepair(ctx, c.source, c.job, {
      ...c.repair,
      state: "running",
      taskId: a.taskId,
      consentId: c.identity.sid as string,
      leaseTokenHash: await digest(leaseToken),
      leaseUntil,
    });
    return { leaseToken, leaseUntil, expiresAt: c.repair.expiresAt };
  },
});

export const input = internalQuery({
  args: leaseArgs,
  returns: v.any(),
  handler: async (ctx, a) => {
    const c = await evidenceRepairContext(ctx, a);
    return {
      schemaVersion: "work-cloud-evidence-repair-v1",
      sourceId: c.source._id,
      generation: c.source.generation,
      canonicalUrl: c.post.canonical,
      allowedDomains: privateCloudMediaIdentity(c.source.url!).domains,
      preparationHash: c.repair.preparationHash,
      prepared: c.source.orderedMedia,
      leaseUntil: c.repair.leaseUntil,
      expiresAt: c.repair.expiresAt,
      rawMediaDeleteBy: c.repair.rawMediaDeleteBy,
      providerRetention: "unknown",
      maxApiUsd: 0,
      analysisAllowed: false,
      publication: "private_only",
      exactExistingPixelsRequired: true,
    };
  },
});

export const complete = internalMutation({
  args: leaseArgs,
  returns: v.object({ accepted: v.literal(true), cached: v.boolean() }),
  handler: async (ctx, a) => {
    const c = await evidenceRepairContext(ctx, a, true);
    const frames = retainedCloudFrames(c.source);
    ensure(
      c.post.frames.every((frame) =>
        frames.some((saved) => saved.frameId === frame.id),
      ),
      "INVALID_EVIDENCE",
      "Return every required prepared JPEG before completing repair.",
    );
    if (c.repair.state === "completed")
      return { accepted: true as const, cached: true };
    await saveRepair(ctx, c.source, c.job, {
      ...c.repair,
      state: "completed",
      leaseUntil: 0,
    });
    await audit(
      ctx,
      c.source.organizationId,
      c.actor._id,
      "work_cloud.evidence_repair_completed",
      `${a.sourceId}:${a.generation}:${c.repair.preparationHash}`,
    );
    return { accepted: true as const, cached: false };
  },
});
export const heartbeat = internalMutation({
  args: leaseArgs,
  returns: v.object({ leaseUntil: v.number(), expiresAt: v.number() }),
  handler: async (ctx, a) => {
    const c = await evidenceRepairContext(ctx, a);
    const leaseUntil = Math.min(Date.now() + 180000, c.repair.expiresAt);
    await saveRepair(ctx, c.source, c.job, { ...c.repair, leaseUntil });
    return { leaseUntil, expiresAt: c.repair.expiresAt };
  },
});
