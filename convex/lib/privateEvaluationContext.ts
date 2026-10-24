import type { PrivateEvaluationOrigin } from "../../packages/contracts/private-evaluation-context";
import { canonicalJson } from "../../packages/contracts/canonical-json.mjs";
import { containsSecret, ensure } from "../../packages/policy";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { digest } from "../product";

export function validatePrivateEvaluationBrief(text: string) {
  ensure(
    typeof text === "string" &&
      text.length <= 4000 &&
      text.trim().length > 0 &&
      // Unicode mode matches lone surrogates, but treats valid pairs as a code point.
      !/[\ud800-\udfff]/u.test(text) &&
      new TextEncoder().encode(text).length <= 4000 &&
      Array.from(text).every((character) => {
        const code = character.codePointAt(0)!;
        return (
          code === 9 ||
          code === 10 ||
          code === 13 ||
          (code >= 32 && (code < 127 || code > 159))
        );
      }) &&
      !containsSecret(text),
    "INVALID_INPUT",
    "Use a private evaluation brief of at most 4000 UTF-8 bytes without credentials or unsafe characters.",
  );
  return text;
}

export function samePrivateEvaluationOrigin(
  left?: PrivateEvaluationOrigin,
  right?: PrivateEvaluationOrigin,
) {
  return canonicalJson(left ?? null) === canonicalJson(right ?? null);
}

export async function privateEvaluationOwnerCurrent(
  ctx: QueryCtx,
  organizationId: Id<"organizations">,
  origin: PrivateEvaluationOrigin,
) {
  const organization = await ctx.db.get(organizationId),
    owner = await ctx.db.get(origin.ownerId);
  const member = await ctx.db
    .query("memberships")
    .withIndex("by_pair", (q) =>
      q.eq("organizationId", organizationId).eq("userId", origin.ownerId),
    )
    .unique();
  return (
    process.env.RESTORE_LOCK !== "true" &&
    organization?.status === "active" &&
    organization.privateOwnerId === origin.ownerId &&
    owner?.status === "active" &&
    !!member &&
    origin.schemaVersion === "1.0.0" &&
    origin.kind === "private_evaluation_brief" &&
    /^[a-f0-9]{64}$/.test(origin.briefHash) &&
    origin.model.length > 0 &&
    origin.effort.length > 0
  );
}

export async function privateEvaluationTaskCurrent(
  ctx: QueryCtx,
  run: Doc<"localLibraryRuns">,
) {
  const task = run.task;
  if (!task || task.schemaVersion !== "1.0.0") return false;
  const origin = task.privateEvaluationOrigin,
    text = task.privateEvaluationBrief;
  if (task.workload === "plan_draft") {
    const proposal = task.proposal && (await ctx.db.get(task.proposal.id));
    if (
      text !== undefined ||
      !proposal ||
      !samePrivateEvaluationOrigin(origin, proposal.privateEvaluationOrigin)
    )
      return false;
  }
  if (!origin) return text === undefined;
  if (
    origin.ownerId !== run.actor ||
    !(await privateEvaluationOwnerCurrent(ctx, run.organizationId, origin))
  )
    return false;
  if (task.workload === "plan_draft") {
    return true;
  }
  if (
    text === undefined ||
    origin.model !== run.model ||
    origin.effort !== run.effort
  )
    return false;
  try {
    validatePrivateEvaluationBrief(text);
  } catch {
    return false;
  }
  return origin.briefHash === (await digest(text));
}
