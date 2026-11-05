import { makeFunctionReference } from "convex/server";
import { z } from "zod";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

const configuration = z.strictObject({
  version: z.literal("admin-processing-allowance-v1"),
  id: z.string().trim().min(1).max(200),
  enabled: z.literal(true),
  subject: z.string().min(1).max(500),
  organizationId: z.string().min(1).max(200),
  monthlyCredits: z.literal(300),
  maximumHourlyJobs: z.literal(20),
  maximumDailyJobs: z.literal(100),
  startsAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
});

export type AdminProcessingAllowancePolicy = Omit<
  z.infer<typeof configuration>,
  "organizationId"
> & { organizationId: Id<"organizations"> };

export function parseAdminProcessingAllowanceConfiguration(
  raw = process.env.ADMIN_PROCESSING_ALLOWANCE_JSON,
) {
  if (!raw) return null;
  try {
    const parsed = configuration.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function adminProcessingAllowancePeriod(now = Date.now()) {
  const date = new Date(now);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  return {
    start: Date.UTC(year, month, 1),
    end: Date.UTC(year, month + 1, 1),
    keymonth: date.toISOString().slice(0, 7),
  };
}

// This is a read-only entitlement check. An owner/admin role alone never grants
// credits, and an expired or absent monthly pool is not an available balance.
export async function readAdminProcessingAllowance(
  ctx: QueryCtx,
  actor?: Doc<"users">,
  organizationId?: Id<"organizations">,
): Promise<AdminProcessingAllowancePolicy | null> {
  if (process.env.RESTORE_LOCK === "true") return null;
  const policy = parseAdminProcessingAllowanceConfiguration();
  if (!policy || policy.startsAt > Date.now()) return null;
  const configuredOrganizationId = ctx.db.normalizeId(
    "organizations",
    policy.organizationId,
  );
  if (
    !configuredOrganizationId ||
    (organizationId && organizationId !== configuredOrganizationId) ||
    (actor && actor.subject !== policy.subject)
  )
    return null;
  // Re-read persisted authority even when a caller supplied a previously read
  // actor. Scheduled renewal cannot rely on an old authentication snapshot.
  const owner = await ctx.db
    .query("users")
    .withIndex("by_subject", (q) => q.eq("subject", policy.subject))
    .unique();
  if (!owner || owner.status !== "active" || (actor && actor._id !== owner._id))
    return null;
  const organization = await ctx.db.get(configuredOrganizationId);
  if (
    !organization ||
    organization.status !== "active" ||
    organization.createdBy !== owner._id ||
    (organization.privateOwnerId &&
      organization.privateOwnerId !== owner._id) ||
    organization.memberSubscriptionPolicy === "individual_pro_v1"
  )
    return null;
  const membership = await ctx.db
    .query("memberships")
    .withIndex("by_pair", (q) =>
      q.eq("organizationId", organization._id).eq("userId", owner._id),
    )
    .unique();
  if (membership?.role !== "owner") return null;
  return { ...policy, organizationId: organization._id };
}

const renew = makeFunctionReference<
  "mutation",
  { organizationId: Id<"organizations"> },
  boolean
>("adminProcessingAllowance:renew");

export async function refreshAdminProcessingAllowance(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
): Promise<boolean> {
  const policy = await readAdminProcessingAllowance(
    ctx,
    undefined,
    organizationId,
  );
  if (!policy) return false;
  const wallet = await ctx.db
    .query("wallets")
    .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
    .unique();
  if (!wallet) return false;
  const now = Date.now();
  const period = adminProcessingAllowancePeriod(now);
  // Policy edits and retries share the same month key. OCC serializes
  // concurrent grants through this indexed read and the wallet update.
  const key = `admin-monthly:${organizationId}:${period.keymonth}`;
  const existing = await ctx.db
    .query("creditPools")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  if (existing) return false;
  await ctx.db.insert("creditPools", {
    organizationId,
    key,
    kind: "admin_monthly",
    granted: policy.monthlyCredits,
    spent: 0,
    reserved: 0,
    expiresAt: period.end,
    createdAt: now,
    updatedAt: now,
  });
  await ctx.db.patch(wallet._id, {
    granted: wallet.granted + policy.monthlyCredits,
    updatedAt: now,
  });
  // Scheduling belongs to the same transaction as the grant. A write or
  // scheduling failure must abort it, preserving retry safety.
  await ctx.scheduler.runAt(period.end, renew, { organizationId });
  return true;
}
