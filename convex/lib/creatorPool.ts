import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { creatorFeedAvailable } from "../../packages/social/creator-feed";
import { readAdminProcessingAllowance } from "./adminProcessingAllowance";
import { requirePaidProcessing } from "./paidProcessing";
import { PolicyError } from "../../packages/policy";

export async function requireCreatorFunding(
  ctx: QueryCtx,
  actor: Doc<"users">,
  organizationId: Id<"organizations">,
) {
  if (!(await readAdminProcessingAllowance(ctx, actor, organizationId)))
    await requirePaidProcessing(ctx, actor, organizationId);
}

export function creatorPoolDailyExposureLimit() {
  const value = Number(process.env.VIBESCROLL_CREATOR_POOL_DAILY_NANO_USD);
  return Number.isSafeInteger(value) && value > 0 && value <= 1e9 ? value : 0;
}

export function creatorPoolEnabled(creatorKey: string) {
  return (
    process.env.VIBESCROLL_CREATOR_POOL_ENABLED === "true" &&
    process.env.VIBESCROLL_MANAGED_AUTO_ENABLED === "true" &&
    process.env.RESTORE_LOCK !== "true" &&
    creatorPoolDailyExposureLimit() > 0 &&
    creatorFeedAvailable(creatorKey)
  );
}

export async function sponsorAllowance(
  ctx: QueryCtx,
  actor: Doc<"users">,
  org: Doc<"organizations">,
  now: number,
) {
  if (
    actor.status !== "active" ||
    org.status !== "active" ||
    org.privateOwnerId !== actor._id
  )
    return null;
  const dayStart = Math.floor(now / 86400000) * 86400000;
  const admin = await readAdminProcessingAllowance(ctx, actor, org._id);
  const pools = await ctx.db
    .query("creditPools")
    .withIndex("by_org", (q) => q.eq("organizationId", org._id))
    .take(64);
  if (pools.length === 64) return null;
  const included = pools.filter(
    (p) =>
      (admin ? p.kind === "admin_monthly" : p.kind === "included") &&
      p.expiresAt !== undefined &&
      p.expiresAt > now,
  );
  const primary = included.sort((a, b) => b.createdAt - a.createdAt)[0];
  if (!primary?.expiresAt) return null;
  const periodEnd = primary.expiresAt;
  const matching = included.filter((p) => p.expiresAt === periodEnd);
  const cap = Math.floor(
    matching.reduce(
      (sum, p) => sum + Math.max(0, p.granted - (p.revoked ?? 0)),
      0,
    ) / 10,
  );
  const limitedByWallet = included.reduce(
    (sum, p) =>
      sum + Math.max(0, p.granted - (p.revoked ?? 0) - p.spent - p.reserved),
    0,
  );
  const [period, daily] = await Promise.all([
    ctx.db
      .query("creatorPoolRuns")
      .withIndex("by_sponsor_period", (q) =>
        q.eq("sponsorId", actor._id).eq("periodEnd", periodEnd),
      )
      .take(100),
    ctx.db
      .query("creatorPoolRuns")
      .withIndex("by_sponsor_day", (q) =>
        q.eq("sponsorId", actor._id).eq("dayStart", dayStart),
      )
      .take(25),
  ]);
  // A late or unknown outcome continues to count exactly as reserved.
  const use = (rows: Doc<"creatorPoolRuns">[]) =>
    rows.reduce(
      (n, row) =>
        n +
        (row.state === "active" ? row.maxCredits : (row.chargedCredits ?? 0)),
      0,
    );
  const used = use(period),
    usedToday = use(daily);
  const available = Math.min(
    limitedByWallet,
    cap - used,
    Math.ceil(cap / 3) - usedToday,
  );
  if (!cap || period.length === 100 || daily.length === 25) return null;
  return { cap, used, available, periodEnd, dayStart };
}

export async function candidateSponsor(
  ctx: QueryCtx,
  follower: Doc<"creatorFollows">,
  publishedAt: number,
) {
  if (
    !follower.sponsor ||
    follower.state !== "following" ||
    (follower.activeSince ?? follower.firstFollowedAt) >= publishedAt
  )
    return null;
  const [actor, organization] = await Promise.all([
    ctx.db.get(follower.actorId),
    ctx.db.get(follower.organizationId),
  ]);
  if (!actor || !organization) return null;
  const membership = await ctx.db
    .query("memberships")
    .withIndex("by_pair", (q) =>
      q.eq("organizationId", organization._id).eq("userId", actor._id),
    )
    .unique();
  if (!membership || membership.role !== "owner") return null;
  try {
    await requireCreatorFunding(ctx, actor, organization._id);
  } catch (error) {
    if (
      error instanceof PolicyError &&
      [
        "FORBIDDEN",
        "PRO_REQUIRED",
        "PAYMENT_REQUIRED",
        "PAYMENT_REVIEW_REQUIRED",
      ].includes(error.code)
    )
      return null;
    throw error;
  }
  const allowance = await sponsorAllowance(
    ctx,
    actor,
    organization,
    Date.now(),
  );
  return allowance && allowance.available > 0
    ? { actor, organization, membership, allowance }
    : null;
}

export function rankSponsors<
  T extends {
    sponsorId: Id<"users">;
    used: number;
    cap: number;
    draw: string;
    quote: number;
  },
>(choices: T[]) {
  // A 5-point band spreads jobs among nearly equal users. The keyed draw stays
  // stable for a post, including restarts and rescheduling the candidate list.
  return choices.sort(
    (a, b) =>
      Math.floor(((a.used + a.quote) * 20) / a.cap) -
        Math.floor(((b.used + b.quote) * 20) / b.cap) ||
      a.draw.localeCompare(b.draw),
  );
}
