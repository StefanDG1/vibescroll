import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { ProcessingAdmission } from "../../packages/contracts/processing-account";
import { preparedServiceConfiguration } from "./preparedServicePolicy";
import { readAdminProcessingAllowance } from "./adminProcessingAllowance";

export const admissionAllowed: ProcessingAdmission = {
  allowed: true,
  reason: null,
  message: null,
  dimension: null,
  retryAt: null,
  limit: null,
  used: null,
};

// The finite historical pilot remains intact. Funded personal accounts use
// rolling rate limits, not a lifetime number of failed/successful attempts.
export async function processingAdmission(
  ctx: QueryCtx,
  actor: Doc<"users">,
  organizationId: Id<"organizations">,
): Promise<ProcessingAdmission> {
  const policy = preparedServiceConfiguration(actor.subject);
  if (!policy)
    return {
      ...admissionAllowed,
      allowed: false,
      reason: "SETUP_REQUIRED",
      message: "Processing is not configured for this account.",
      dimension: "setup",
    };
  const admin = await readAdminProcessingAllowance(ctx, actor, organizationId);
  const hourly = admin?.maximumHourlyJobs ?? policy.maximumHourlyJobs;
  const daily = admin?.maximumDailyJobs ?? policy.maximumDailyJobs;
  const lifetime = !admin && !policy.paidCustomer;
  const rows = await ctx.db
    .query("mediaPreparations")
    .withIndex("by_actor_policy", (q) =>
      q.eq("actor", actor._id).eq("policyId", policy.id),
    )
    .order("desc")
    .take(lifetime ? Math.max(101, policy.maximumTotalJobs + 1) : daily + 1);
  const now = Date.now();
  for (const [dimension, span, maximum] of [
    ["hour", 3600000, hourly],
    ["day", 86400000, daily],
  ] as const) {
    const recent = rows.filter((r) => r.createdAt > now - span);
    if (recent.length >= maximum) {
      // Descending rows: enough oldest still-counted starts must leave the
      // window for one more request to fit. No retry occurs automatically.
      const unblock = recent[maximum - 1].createdAt + span;
      return {
        allowed: false,
        reason: "QUOTA_EXCEEDED",
        message: `The ${dimension === "hour" ? "hourly" : "daily"} processing limit is reached. Your link can stay saved.`,
        dimension,
        retryAt: unblock,
        limit: maximum,
        used: recent.length,
      };
    }
  }
  if (lifetime && rows.length >= policy.maximumTotalJobs)
    return {
      allowed: false,
      reason: "QUOTA_EXCEEDED",
      message:
        "The legacy processing pilot is used. Your available credits are separate from this limit.",
      dimension: "pilot",
      retryAt: null,
      limit: policy.maximumTotalJobs,
      used: rows.length,
    };
  return admissionAllowed;
}
