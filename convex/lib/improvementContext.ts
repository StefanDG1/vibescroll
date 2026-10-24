import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { retainedSourceRevision } from "./sourceAuthority";
import { sourcePolicyCurrent } from "./sourcePolicy";
import {
  privateEvaluationOwnerCurrent,
  samePrivateEvaluationOrigin,
} from "./privateEvaluationContext";
import {
  evaluationCurrent,
  referencesCurrent,
  actorCurrent,
} from "../knowledge";
export async function improvementCurrent(ctx: QueryCtx, p: Doc<"proposals">) {
  if (
    p.privateEvaluationOrigin &&
    ((!p.localEvaluationId && !p.improvementId) ||
      !(await privateEvaluationOwnerCurrent(
        ctx,
        p.organizationId,
        p.privateEvaluationOrigin,
      )))
  )
    return false;
  if (p.localEvaluationId) {
    const e = await ctx.db.get(p.localEvaluationId);
    if (
      !e ||
      e.state !== "ready" ||
      e.organizationId !== p.organizationId ||
      e.repositoryId !== p.repositoryId ||
      e.baseSha !== p.baseSha ||
      e.profileVersion !== p.profileVersion ||
      (p.opportunityIndex !== undefined &&
        (!Number.isSafeInteger(p.opportunityIndex) ||
          p.opportunityIndex < 0 ||
          p.opportunityIndex >= 5 ||
          !e.opportunityGroup)) ||
      !samePrivateEvaluationOrigin(
        e.privateEvaluationOrigin,
        p.privateEvaluationOrigin,
      ) ||
      JSON.stringify(
        p.opportunityIndex === undefined
          ? e.references
          : e.opportunityGroup?.opportunities[p.opportunityIndex]?.references,
      ) !== JSON.stringify(p.references) ||
      !(await evaluationCurrent(ctx, e))
    )
      return false;
  }
  if (p.detail?.schemaVersion === "2.0.0") {
    const source = await ctx.db.get(p.sourceId);
    const row = source?.currentRevisionId
      ? await ctx.db.get(source.currentRevisionId)
      : null;
    const registry = row ? await retainedSourceRevision(ctx, row) : null;
    if (
      !source ||
      source.organizationId !== p.organizationId ||
      source.state !== "ready" ||
      !row ||
      !registry ||
      !sourcePolicyCurrent(registry.revision) ||
      p.detail.sourceRevisionId !== row._id ||
      p.detail.sourceContentHash !== row.contentHash ||
      !p.references?.length ||
      !(await referencesCurrent(
        ctx,
        p.organizationId,
        p.references,
        p.privateEvaluationOrigin,
      ))
    )
      return false;
  }
  if (!p.improvementId) return true;
  const i = await ctx.db.get(p.improvementId);
  if (
    !i ||
    i.state === "deleted" ||
    i.organizationId !== p.organizationId ||
    i.proposalId !== p._id ||
    i.repositoryId !== p.repositoryId ||
    !samePrivateEvaluationOrigin(
      i.privateEvaluationOrigin,
      p.privateEvaluationOrigin,
    )
  )
    return false;
  const e = await ctx.db.get(i.evaluationId),
    d = await ctx.db.get(i.issueDraftId);
  return (
    !!e &&
    !!d &&
    samePrivateEvaluationOrigin(
      e.privateEvaluationOrigin,
      i.privateEvaluationOrigin,
    ) &&
    samePrivateEvaluationOrigin(
      e.privateEvaluationOrigin,
      d.privateEvaluationOrigin,
    ) &&
    e.organizationId === i.organizationId &&
    d.organizationId === i.organizationId &&
    d.repositoryId === i.repositoryId &&
    d.hash === i.issueHash &&
    d.version === i.issueVersion &&
    (await evaluationCurrent(ctx, e)) &&
    (await referencesCurrent(
      ctx,
      i.organizationId,
      i.references,
      i.privateEvaluationOrigin,
    ))
  );
}
export async function runPolicyCurrent(ctx: QueryCtx, run: Doc<"runs">) {
  if (!run.automationPolicyId) return true;
  const p = await ctx.db.get(run.automationPolicyId),
    repo = await ctx.db.get(run.repositoryId),
    proposal = await ctx.db.get(run.proposalId);
  return (
    process.env.RESTORE_LOCK !== "true" &&
    process.env.CONTINUOUS_VERIFIED === "true" &&
    process.env.DISABLE_CONTINUOUS !== "true" &&
    !!p &&
    !!proposal &&
    !proposal.privateEvaluationOrigin &&
    p.organizationId === run.organizationId &&
    p.repositoryId === run.repositoryId &&
    p.actor === run.approvedBy &&
    p.version === run.automationPolicyVersion &&
    p.mode === "routine" &&
    !p.paused &&
    p.expiresAt > Date.now() &&
    repo?.enabled === true &&
    p.selectionVersion === (repo.selectionVersion ?? 0) &&
    (await actorCurrent(ctx, p.organizationId, p.actor, ["owner", "admin"]))
  );
}
