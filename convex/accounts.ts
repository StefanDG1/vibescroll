import { isAssistantIdentity } from "../packages/policy/assistant";
import { query } from "./_generated/server";
import { mutation, internalMutation } from "./lib/projectedMutations";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { user, fail, limit } from "./lib";
import { subjectHash, rememberDeletion } from "./lib/deletionMarkers";
import { workspaceReadable } from "./lib/workspacePrivacy";
export const syncUser = internalMutation({
  args: {
    subject: v.string(),
    email: v.string(),
    name: v.string(),
    verified: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { verified, ...profile } = args;
    if (process.env.RESTORE_LOCK === "true") fail("Recovery is in progress.");
    const hash = await subjectHash(args.subject);
    if (
      await ctx.db
        .query("deletionMarkers")
        .withIndex("by_subject", (q) => q.eq("subjectHash", hash))
        .first()
    )
      fail(
        "This identity was deleted. Create a new provider account to return.",
      );
    const existing = await ctx.db
      .query("users")
      .withIndex("by_subject", (q) => q.eq("subject", args.subject))
      .unique();
    if (existing) {
      if (existing.status !== "active")
        fail("Account deletion is in progress.");
      if (
        verified ||
        existing.email !== profile.email ||
        existing.name !== profile.name
      )
        await ctx.db.patch(existing._id, {
          ...profile,
          ...(verified ? { profileVerifiedAt: Date.now() } : {}),
        });
      return existing._id;
    }
    return ctx.db.insert("users", {
      ...profile,
      ...(verified ? { profileVerifiedAt: Date.now() } : {}),
      status: "active",
      createdAt: Date.now(),
    });
  },
});
// A verified JWT still authenticates every request. Refresh provider profile
// fields separately, rather than making each private read a provider action.
export const bootstrapRequired = query({
  args: {},
  handler: async (ctx) => {
    if (process.env.RESTORE_LOCK === "true") fail("Recovery is in progress.");
    const identity = await ctx.auth.getUserIdentity();
    if (!identity || isAssistantIdentity(identity))
      fail("Sign in to continue.");
    const actor = await ctx.db
      .query("users")
      .withIndex("by_subject", (q) => q.eq("subject", identity.subject))
      .unique();
    if (actor && actor.status !== "active")
      fail("Account deletion is in progress.");
    return (
      !actor?.profileVerifiedAt ||
      actor.profileVerifiedAt < Date.now() - 15 * 60000
    );
  },
});
export const current = query({
  args: {},
  handler: async (ctx) => {
    const actor = await user(ctx);
    const rows = await ctx.db
      .query("memberships")
      .withIndex("by_user", (q) => q.eq("userId", actor._id))
      .collect();
    return {
      user: { name: actor.name, email: actor.email },
      organizations: (
        await Promise.all(
          rows.map(async (m) => {
            const org = await ctx.db.get(m.organizationId);
            return org && workspaceReadable(org, actor._id)
              ? {
                  id: org._id,
                  name: org.name,
                  role: m.role,
                  private: Boolean(org.privateOwnerId),
                }
              : null;
          }),
        )
      ).filter((x) => x !== null),
    };
  },
});
export const exportAccount = query({
  args: {},
  handler: async (ctx) => {
    const actor = await user(ctx);
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_user", (q) => q.eq("userId", actor._id))
      .collect();
    const visibleMemberships = (
      await Promise.all(
        memberships.map(async (m) =>
          workspaceReadable(await ctx.db.get(m.organizationId), actor._id)
            ? m
            : null,
        ),
      )
    ).filter((m) => m !== null);
    return {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      profile: {
        name: actor.name,
        email: actor.email,
        createdAt: actor.createdAt,
        preferChatGPTPlan: actor.preferChatGPTPlan ?? false,
      },
      memberships: visibleMemberships.map((m) => ({
        organizationId: m.organizationId,
        role: m.role,
      })),
      note: "Organization content belongs to the organization. Owners can export it separately.",
    };
  },
});
export const deleteAccount = mutation({
  args: { confirmation: v.string() },
  handler: async (ctx, args) => {
    const actor = await user(ctx);
    if (args.confirmation !== actor.email)
      fail("Type your email address to confirm.");
    await limit(ctx, `delete:${actor._id}`, 3);
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_user", (q) => q.eq("userId", actor._id))
      .collect();
    for (const m of memberships) {
      if (m.role === "owner") {
        const org = await ctx.db.get(m.organizationId);
        // A confirmed workspace deletion already locks access and schedules
        // its purge. Finishing account deletion must not wait for that batch.
        if (!org || org.status === "deleting") continue;
        if (org.privateOwnerId && org.privateOwnerId !== actor._id) continue;
        if (org.privateOwnerId === actor._id)
          fail("Delete your private library before deleting your account.");
        const others = await ctx.db
          .query("memberships")
          .withIndex("by_org", (q) => q.eq("organizationId", m.organizationId))
          .collect();
        if (!others.some((x) => x._id !== m._id && x.role === "owner"))
          fail("Transfer ownership or delete your organizations first.");
      }
    }
    await rememberDeletion(
      ctx,
      "account",
      actor._id,
      await subjectHash(actor.subject),
    );
    for (const m of memberships) await ctx.db.delete(m._id);
    await ctx.db.patch(actor._id, { status: "deleting" });
    const job = await ctx.db.insert("deletionJobs", {
      userId: actor._id,
      subject: actor.subject,
      state: "pending",
      attempts: 0,
    });
    await ctx.scheduler.runAfter(0, internal.identity.finishDeletion, {
      jobId: job,
    });
    return { status: "deleting" };
  },
});
export const finishDelete = internalMutation({
  args: { jobId: v.id("deletionJobs") },
  handler: async (ctx, { jobId }) => {
    const job = await ctx.db.get(jobId);
    if (!job) return;
    const subscriptions = await ctx.db
      .query("assistantSubscriptions")
      .withIndex("by_actor", (q) => q.eq("actor", job.userId))
      .take(25);
    for (const s of subscriptions)
      await ctx.scheduler.runAfter(0, internal.assistantEvents.expire, {
        id: s._id,
      });
    const intakes = await ctx.db
      .query("assistantIntakes")
      .withIndex("by_actor", (q) => q.eq("actor", job.userId))
      .take(100);
    for (const intake of intakes) await ctx.db.delete(intake._id);
    const libraryCommands = await ctx.db
      .query("assistantLibraryCommands")
      .withIndex("by_actor", (q) => q.eq("actor", job.userId))
      .take(100);
    for (const command of libraryCommands) await ctx.db.delete(command._id);
    const grants = await ctx.db
      .query("assistantGrants")
      .withIndex("by_actor_client", (q) => q.eq("actor", job.userId))
      .take(100);
    for (const grant of grants) await ctx.db.delete(grant._id);
    if (
      subscriptions.length > 0 ||
      grants.length === 100 ||
      intakes.length === 100 ||
      libraryCommands.length === 100
    ) {
      await ctx.scheduler.runAfter(0, internal.accounts.finishDelete, {
        jobId,
      });
      return;
    }
    await ctx.db.delete(job.userId);
    await ctx.db.delete(jobId);
  },
});
export const deletionFailed = internalMutation({
  args: { jobId: v.id("deletionJobs") },
  handler: async (ctx, { jobId }) => {
    const job = await ctx.db.get(jobId);
    if (!job) return;
    const attempts = job.attempts + 1;
    await ctx.db.patch(jobId, {
      attempts,
      state: attempts >= 5 ? "failed" : "pending",
      error: "Identity provider deletion failed. Retry from operations.",
    });
    if (attempts < 5)
      await ctx.scheduler.runAfter(
        60000 * 2 ** attempts,
        internal.identity.finishDeletion,
        { jobId },
      );
  },
});
