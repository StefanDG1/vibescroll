import { query, type QueryCtx } from "./_generated/server";
import { mutation } from "./lib/projectedMutations";
import { v } from "convex/values";
import { role } from "./schema";
import {
  access,
  user,
  fail,
  short,
  limit,
  audit,
  billingFor,
  writeAccess,
  recentAuthentication,
} from "./lib";
import { internal } from "./_generated/api";
import { rememberDeletion } from "./lib/deletionMarkers";
import { workspaceReadable } from "./lib/workspacePrivacy";
import {
  requireAccountPro,
  requireTeamSubscription,
} from "./lib/accountSubscription";
export const ensureDefault = mutation({
  args: { preferredId: v.optional(v.id("organizations")) },
  handler: async (ctx, { preferredId }) => {
    const actor = await user(ctx);
    if (preferredId) {
      await access(ctx, preferredId);
      await ctx.db.patch(actor._id, { defaultWorkspaceId: preferredId });
      return preferredId;
    }
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_user", (q) => q.eq("userId", actor._id))
      .collect();
    const active = (
      await Promise.all(
        memberships.map(async (m) => {
          const workspace = await ctx.db.get(m.organizationId);
          return workspace && workspaceReadable(workspace, actor._id)
            ? { workspace, membership: m }
            : null;
        }),
      )
    ).filter((row) => row !== null);
    const selected =
      active.find((row) => row.workspace._id === actor.defaultWorkspaceId) ??
      active.find((row) => row.membership.role === "owner") ??
      active[0];
    if (selected) {
      if (actor.defaultWorkspaceId !== selected.workspace._id)
        await ctx.db.patch(actor._id, {
          defaultWorkspaceId: selected.workspace._id,
        });
      return selected.workspace._id;
    }
    // Provision only on first entry. Rendering/prefetching /app after a user
    // deletes their workspace must not undo that deletion.
    if (actor.defaultWorkspaceId || memberships.length) return null;
    await limit(ctx, `org:${actor._id}`, 5);
    const id = await ctx.db.insert("organizations", {
      name: "Personal workspace",
      status: "active",
      createdBy: actor._id,
      createdAt: Date.now(),
      privateOwnerId: actor._id,
    });
    await ctx.db.insert("memberships", {
      organizationId: id,
      userId: actor._id,
      role: "owner",
    });
    await ctx.db.patch(actor._id, { defaultWorkspaceId: id });
    await audit(ctx, id, actor._id, "organization.created", id);
    return id;
  },
});
export const create = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const actor = await user(ctx);
    await limit(ctx, `org:${actor._id}`, 5);
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_user", (q) => q.eq("userId", actor._id))
      .take(10);
    if (memberships.length >= 10)
      fail("You can belong to at most 10 organizations.");
    const id = await ctx.db.insert("organizations", {
      name: short(name),
      status: "active",
      createdBy: actor._id,
      createdAt: Date.now(),
    });
    await ctx.db.insert("memberships", {
      organizationId: id,
      userId: actor._id,
      role: "owner",
    });
    if (!actor.defaultWorkspaceId)
      await ctx.db.patch(actor._id, { defaultWorkspaceId: id });
    await audit(ctx, id, actor._id, "organization.created", id);
    return id;
  },
});

// New paid teams have individual subscriptions. Legacy workspaces retain their
// existing contract until an explicit migration, rather than being backfilled.
export const createTeam = mutation({
  args: { name: v.string() },
  returns: v.id("organizations"),
  handler: async (ctx, { name }) => {
    const actor = await user(ctx);
    await requireAccountPro(ctx, actor);
    await limit(ctx, `org:${actor._id}`, 5);
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_user", (q) => q.eq("userId", actor._id))
      .take(10);
    if (memberships.length >= 10)
      fail("You can belong to at most 10 organizations.");
    const id = await ctx.db.insert("organizations", {
      name: short(name),
      status: "active",
      createdBy: actor._id,
      createdAt: Date.now(),
      memberSubscriptionPolicy: "individual_pro_v1",
    });
    await ctx.db.insert("memberships", {
      organizationId: id,
      userId: actor._id,
      role: "owner",
    });
    await audit(ctx, id, actor._id, "organization.team_created", id);
    return id;
  },
});
// Existing accounts opt in explicitly. Never move existing shared content or
// reinterpret a workspace name as an ownership restriction.
export const createPrivate = mutation({
  args: {},
  handler: async (ctx) => {
    const actor = await user(ctx);
    const existing = await ctx.db
      .query("organizations")
      .withIndex("by_private_owner", (q) => q.eq("privateOwnerId", actor._id))
      .first();
    if (existing) {
      if (existing.status !== "active")
        fail("Private library deletion is in progress.");
      await access(ctx, existing._id, ["owner"]);
      return existing._id;
    }
    await limit(ctx, `org:${actor._id}`, 5);
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_user", (q) => q.eq("userId", actor._id))
      .take(10);
    if (memberships.length >= 10)
      fail("You can belong to at most 10 organizations.");
    const id = await ctx.db.insert("organizations", {
      name: "My private library",
      status: "active",
      createdBy: actor._id,
      privateOwnerId: actor._id,
      createdAt: Date.now(),
    });
    await ctx.db.insert("memberships", {
      organizationId: id,
      userId: actor._id,
      role: "owner",
    });
    await audit(ctx, id, actor._id, "organization.private_created", id);
    return id;
  },
});

const privateAdoptionLifetime = 5 * 60_000;
const privateAdoptionInvitationLimit = 51;

// This is a compare-and-swap snapshot, not an authorization credential. Every
// mutation checks current identity, membership, invitations and ownership again.
function privateAdoptionVersion(a: Awaited<ReturnType<typeof access>>) {
  const o = a.organization;
  const m = a.membership;
  return JSON.stringify([
    "private-adoption-v1",
    o._id,
    o._creationTime,
    o.name,
    o.status,
    o.createdBy,
    o.createdAt,
    o.privateOwnerId ?? null,
    m._id,
    m._creationTime,
    m.organizationId,
    m.userId,
    m.role,
  ]);
}

async function privateAdoptionState(
  ctx: QueryCtx,
  a: Awaited<ReturnType<typeof access>>,
) {
  if (a.membership.role !== "owner") return "owner_required";
  if (a.organization.createdBy !== a.actor._id) return "creator_required";
  // Two rows are sufficient to disprove sole membership. Do not scan the team.
  const members = await ctx.db
    .query("memberships")
    .withIndex("by_org", (q) => q.eq("organizationId", a.organization._id))
    .take(2);
  if (
    members.length !== 1 ||
    members[0]._id !== a.membership._id ||
    members[0].userId !== a.actor._id ||
    members[0].role !== "owner"
  )
    return "shared_workspace";
  const invitations = await ctx.db
    .query("invitations")
    .withIndex("by_org", (q) => q.eq("organizationId", a.organization._id))
    .take(privateAdoptionInvitationLimit);
  // An expired prefix cannot prove that a later invitation is also expired.
  if (invitations.length === privateAdoptionInvitationLimit)
    return "invitation_check_limit";
  if (invitations.some((invitation) => invitation.expiresAt > Date.now()))
    return "pending_invitations";
  const privateWorkspaces = await ctx.db
    .query("organizations")
    .withIndex("by_private_owner", (q) => q.eq("privateOwnerId", a.actor._id))
    .take(2);
  // Match createPrivate's single-library contract, including deletion in progress.
  if (
    privateWorkspaces.some((workspace) => workspace._id !== a.organization._id)
  )
    return "other_private_workspace";
  return a.organization.privateOwnerId ? "already_private" : "eligible";
}

export const previewPrivateAdoption = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    const a = await access(ctx, organizationId);
    const reason = await privateAdoptionState(ctx, a);
    const previewedAt = Date.now();
    return {
      organizationId,
      organizationName: a.organization.name,
      membershipId: a.membership._id,
      eligible: reason === "eligible",
      reason,
      expectedVersion: privateAdoptionVersion(a),
      previewedAt,
      expiresAt: previewedAt + privateAdoptionLifetime,
      preservesPosts: true,
      preservesProjects: true,
      teamInvitationsDisabled: true,
    };
  },
});

export const adoptPrivate = mutation({
  args: {
    organizationId: v.id("organizations"),
    expectedVersion: v.string(),
    previewedAt: v.number(),
    acknowledgePrivateOnly: v.literal(true),
  },
  handler: async (ctx, args) => {
    const a = await writeAccess(ctx, args.organizationId, ["owner"]);
    const now = Date.now();
    if (
      !Number.isSafeInteger(args.previewedAt) ||
      args.previewedAt > now ||
      now - args.previewedAt >= privateAdoptionLifetime ||
      args.expectedVersion !== privateAdoptionVersion(a)
    )
      fail("Private adoption preview changed or expired. Review it again.");
    const reason = await privateAdoptionState(ctx, a);
    if (reason === "already_private")
      return { organizationId: args.organizationId, status: "already_private" };
    if (reason !== "eligible")
      fail(
        `Private adoption unavailable: ${reason}. Review the workspace again.`,
      );
    await limit(ctx, `org-private-adopt:${a.actor._id}`, 5);
    // Keep the workspace and all sources/projects in place. No defaults, grants,
    // entitlements or processing jobs are written here.
    await ctx.db.patch(args.organizationId, { privateOwnerId: a.actor._id });
    await audit(
      ctx,
      args.organizationId,
      a.actor._id,
      "organization.private_adopted",
      args.organizationId,
    );
    return { organizationId: args.organizationId, status: "adopted" };
  },
});
export const details = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    const a = await access(ctx, organizationId);
    const b = await billingFor(ctx, organizationId);
    return {
      name: a.organization.name,
      role: a.membership.role,
      private: Boolean(a.organization.privateOwnerId),
      billing: b
        ? { status: b.status, periodEnd: b.periodEnd, verifiedAt: b.verifiedAt }
        : null,
    };
  },
});
export const rename = mutation({
  args: { organizationId: v.id("organizations"), name: v.string() },
  handler: async (ctx, { organizationId, name }) => {
    const a = await writeAccess(ctx, organizationId, ["owner", "admin"]);
    await limit(ctx, `org-edit:${a.actor._id}`);
    await ctx.db.patch(organizationId, { name: short(name) });
    await audit(
      ctx,
      organizationId,
      a.actor._id,
      "organization.renamed",
      organizationId,
    );
  },
});
export const members = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    await access(ctx, organizationId, ["owner", "admin"]);
    const rows = await ctx.db
      .query("memberships")
      .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
      .collect();
    return Promise.all(
      rows.map(async (m) => {
        const u = await ctx.db.get(m.userId);
        return {
          id: m._id,
          name: u?.name ?? "Deleted member",
          email: u?.email ?? "",
          role: m.role,
        };
      }),
    );
  },
});
export const changeMember = mutation({
  args: {
    organizationId: v.id("organizations"),
    membershipId: v.id("memberships"),
    role: v.union(role, v.literal("remove")),
  },
  handler: async (ctx, args) => {
    const a = await writeAccess(ctx, args.organizationId, ["owner"]);
    if (a.organization.privateOwnerId)
      fail(
        "Private library ownership cannot be transferred. Use a separate team workspace.",
      );
    await limit(ctx, `member:${a.actor._id}`);
    const target = await ctx.db.get(args.membershipId);
    if (!target || target.organizationId !== args.organizationId)
      fail("Member unavailable.");
    if (target.role === "owner" && args.role !== "owner") {
      const rows = await ctx.db
        .query("memberships")
        .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
        .collect();
      if (!rows.some((m) => m._id !== target._id && m.role === "owner"))
        fail("Transfer ownership before removing the last owner.");
    }
    if (args.role === "remove") await ctx.db.delete(target._id);
    else await ctx.db.patch(target._id, { role: args.role });
    await audit(
      ctx,
      args.organizationId,
      a.actor._id,
      `membership.${args.role}`,
      target.userId,
    );
  },
});
export const invite = mutation({
  args: {
    organizationId: v.id("organizations"),
    email: v.string(),
    role: v.union(v.literal("admin"), v.literal("member"), v.literal("viewer")),
    tokenHash: v.string(),
  },
  handler: async (ctx, args) => {
    const a = await writeAccess(ctx, args.organizationId, ["owner", "admin"]);
    if (a.organization.privateOwnerId)
      fail(
        "This library is private. Use a separate team workspace to invite people.",
      );
    await limit(ctx, `invite:${a.actor._id}`, 10);
    if (a.membership.role === "admin" && args.role === "admin")
      fail("Only an owner can invite an admin.");
    const email = args.email.trim().toLowerCase();
    if (
      email.length > 254 ||
      !/^\S+@\S+\.\S+$/.test(email) ||
      !/^[a-f0-9]{64}$/.test(args.tokenHash)
    )
      fail("Invalid invitation.");
    const old = await ctx.db
      .query("invitations")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    for (const inv of old) {
      if (inv.expiresAt < Date.now() || inv.email === email)
        await ctx.db.delete(inv._id);
    }
    if (
      old.filter((i) => i.expiresAt >= Date.now() && i.email !== email)
        .length >= 50
    )
      fail("Too many pending invitations.");
    await ctx.db.insert("invitations", {
      ...args,
      email,
      createdBy: a.actor._id,
      expiresAt: Date.now() + 7 * 86400000,
    });
    await audit(
      ctx,
      args.organizationId,
      a.actor._id,
      "invitation.created",
      email,
    );
  },
});
export const invitations = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    await access(ctx, organizationId, ["owner", "admin"]);
    const rows = await ctx.db
      .query("invitations")
      .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
      .collect();
    return rows.map(({ _id, email, role, expiresAt }) => ({
      id: _id,
      email,
      role,
      expiresAt,
    }));
  },
});
export const revokeInvite = mutation({
  args: { organizationId: v.id("organizations"), id: v.id("invitations") },
  handler: async (ctx, { organizationId, id }) => {
    const a = await writeAccess(ctx, organizationId, ["owner", "admin"]);
    const inv = await ctx.db.get(id);
    if (!inv || inv.organizationId !== organizationId)
      fail("Invitation unavailable.");
    if (a.membership.role === "admin" && inv.role === "admin")
      fail("Only owners can change admin invitations.");
    await ctx.db.delete(id);
  },
});
export const acceptInvite = mutation({
  args: { tokenHash: v.string() },
  handler: async (ctx, { tokenHash }) => {
    const actor = await user(ctx);
    await limit(ctx, `accept:${actor._id}`, 10);
    const inv = await ctx.db
      .query("invitations")
      .withIndex("by_hash", (q) => q.eq("tokenHash", tokenHash))
      .unique();
    if (!inv || inv.expiresAt <= Date.now() || inv.email !== actor.email)
      fail("Invitation unavailable for this account.");
    const org = await ctx.db.get(inv.organizationId);
    if (!org || org.status !== "active" || org.privateOwnerId)
      fail("Organization unavailable.");
    await requireTeamSubscription(ctx, actor, org);
    const existing = await ctx.db
      .query("memberships")
      .withIndex("by_pair", (q) =>
        q.eq("organizationId", inv.organizationId).eq("userId", actor._id),
      )
      .unique();
    if (!existing) {
      const members = await ctx.db
        .query("memberships")
        .withIndex("by_org", (q) => q.eq("organizationId", inv.organizationId))
        .take(50);
      if (members.length >= 50) fail("Organization member limit reached.");
      const mine = await ctx.db
        .query("memberships")
        .withIndex("by_user", (q) => q.eq("userId", actor._id))
        .take(10);
      if (mine.length >= 10) fail("Organization limit reached.");
      await ctx.db.insert("memberships", {
        organizationId: inv.organizationId,
        userId: actor._id,
        role: inv.role,
      });
    }
    await ctx.db.delete(inv._id);
    await audit(
      ctx,
      inv.organizationId,
      actor._id,
      "invitation.accepted",
      actor._id,
    );
    return inv.organizationId;
  },
});
export const exportData = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    const a = await access(ctx, organizationId, ["owner"]);
    return {
      schemaVersion: 1,
      organization: { name: a.organization.name },
      projects: await ctx.db
        .query("projects")
        .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
        .collect(),
    };
  },
});
export const remove = mutation({
  args: { organizationId: v.id("organizations"), confirmation: v.string() },
  handler: async (ctx, { organizationId, confirmation }) => {
    const a = await writeAccess(ctx, organizationId, ["owner"]);
    if (confirmation !== a.organization.name)
      fail("Type the organization name to confirm.");
    const b = await billingFor(ctx, organizationId);
    if (b && b.status !== "canceled" && b.status !== "free")
      fail(
        "Cancel the subscription and refresh billing before deleting this organization.",
      );
    await recentAuthentication(ctx, "delete_workspace");
    await rememberDeletion(ctx, "workspace", organizationId);
    await ctx.db.patch(organizationId, { status: "deleting" });
    await ctx.scheduler.runAfter(0, internal.maintenance.purgeOrganization, {
      organizationId,
    });
    return { status: "deleting" };
  },
});
export const auditLog = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    await access(ctx, organizationId, ["owner", "admin"]);
    return ctx.db
      .query("audit")
      .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
      .order("desc")
      .take(50);
  },
});
