import { query } from "./_generated/server";
import { mutation } from "./lib/projectedMutations";
import type { QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { v } from "convex/values";
import { access, limit, audit } from "./lib";
import { privateLibrary } from "./librarySpaces";
import { workspaceReadable } from "./lib/workspacePrivacy";
import { ensure } from "../packages/policy";
import { sharedTypedCitations } from "./lib/sourceCitations";
import { cardSourceRetained, sourceRetained } from "./lib/sourceAuthority";
import { knowledgeReadContext } from "./lib/knowledgeReadContext";
const binding = v.object({
  sourceId: v.id("sources"),
  generation: v.number(),
  revision: v.number(),
});
async function grantCurrent(ctx: QueryCtx, grant: Doc<"teamKnowledgeGrants">) {
  if (
    process.env.RESTORE_LOCK === "true" ||
    grant.state !== "active" ||
    grant.expiresAt <= Date.now()
  )
    return false;
  const owner = await ctx.db.get(grant.actor),
    org = await ctx.db.get(grant.organizationId),
    recipient = await ctx.db.get(grant.recipientOrganizationId);
  if (
    owner?.status !== "active" ||
    org?.status !== "active" ||
    org.privateOwnerId !== owner._id ||
    recipient?.status !== "active" ||
    recipient.privateOwnerId
  )
    return false;
  const member = await ctx.db
    .query("memberships")
    .withIndex("by_pair", (q) =>
      q.eq("organizationId", grant.organizationId).eq("userId", owner._id),
    )
    .unique();
  const targetMember = await ctx.db
    .query("memberships")
    .withIndex("by_pair", (q) =>
      q
        .eq("organizationId", grant.recipientOrganizationId)
        .eq("userId", owner._id),
    )
    .unique();
  return (
    !!member &&
    !!targetMember &&
    ["owner", "admin", "member"].includes(targetMember.role)
  );
}
export async function grantedSources(
  ctx: QueryCtx,
  grant: Doc<"teamKnowledgeGrants">,
) {
  if (grant.sources.length > 50 || !(await grantCurrent(ctx, grant))) return [];
  const items = [];
  for (const reference of grant.sources) {
    const card = await ctx.db
      .query("dashboardCards")
      .withIndex("by_entity", (q) => q.eq("entityId", reference.sourceId))
      .unique();
    if (
      card?.kind === "source" &&
      card.organizationId === grant.organizationId &&
      card.rightsAttested &&
      (await cardSourceRetained(ctx, card)) &&
      card.generation === reference.generation &&
      card.updatedAt === reference.revision
    ) {
      // One canonical read per selected source, never per point. Compact cards
      // alone cannot establish provider policy or a typed revision's authority.
      const source = await ctx.db.get(reference.sourceId);
      if (
        !source ||
        source.organizationId !== grant.organizationId ||
        source.state === "deleted" ||
        !source.rightsAttested ||
        !sourceRetained(source.sourceRetentionUntil) ||
        source.generation !== reference.generation ||
        source.updatedAt !== reference.revision
      )
        continue;
      try {
        await sharedTypedCitations(ctx, source);
      } catch {
        continue;
      }
      items.push({
        sourceId: reference.sourceId,
        title: source.title,
        state: source.state,
        generation: reference.generation,
        revision: reference.revision,
        mainPoints:
          source.state === "ready"
            ? (source.analysis?.insights ?? [])
                .slice(0, 3)
                .flatMap((i: { title?: unknown }) =>
                  typeof i?.title === "string" ? [i.title.slice(0, 140)] : [],
                )
            : undefined,
      });
    }
  }
  return items;
}
export const targets = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, a) => {
    const { actor } = await privateLibrary(ctx, a.organizationId);
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_user", (q) => q.eq("userId", actor._id))
      .take(100);
    const items = [];
    for (const m of memberships) {
      const org = await ctx.db.get(m.organizationId);
      if (
        org &&
        !org.privateOwnerId &&
        ["owner", "admin", "member"].includes(m.role) &&
        workspaceReadable(org, actor._id)
      )
        items.push({ id: org._id, name: org.name });
    }
    return items;
  },
});
export const listOwn = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, a) => {
    const { actor } = await privateLibrary(ctx, a.organizationId);
    const rows = await ctx.db
      .query("teamKnowledgeGrants")
      .withIndex("by_org", (q) => q.eq("organizationId", a.organizationId))
      .take(50);
    const items = [];
    for (const grant of rows) {
      const target = await ctx.db.get(grant.recipientOrganizationId);
      const targetMember = await ctx.db
        .query("memberships")
        .withIndex("by_pair", (q) =>
          q
            .eq("organizationId", grant.recipientOrganizationId)
            .eq("userId", actor._id),
        )
        .unique();
      items.push({
        id: grant._id,
        recipientOrganizationId: grant.recipientOrganizationId,
        targetName:
          target?.status === "active" && targetMember
            ? target.name
            : "Unavailable workspace",
        version: grant.version,
        state: grant.state,
        expiresAt: grant.expiresAt,
        expired: grant.expiresAt <= Date.now(),
        sources: grant.sources,
        selectedSourceCount: grant.sources.length,
      });
    }
    return items;
  },
});
export const save = mutation({
  args: {
    organizationId: v.id("organizations"),
    recipientOrganizationId: v.id("organizations"),
    expectedVersion: v.number(),
    sources: v.array(binding),
    expiresAt: v.number(),
    acknowledged: v.literal(true),
  },
  handler: async (ctx, a) => {
    const { actor } = await privateLibrary(ctx, a.organizationId);
    await limit(ctx, `team-grant:${a.organizationId}`, 10);
    const target = await access(ctx, a.recipientOrganizationId, [
      "owner",
      "admin",
      "member",
    ]);
    ensure(
      !target.organization.privateOwnerId &&
        a.recipientOrganizationId !== a.organizationId,
      "INVALID_INPUT",
      "Choose a separate shared workspace.",
    );
    ensure(
      a.sources.length > 0 &&
        a.sources.length <= 50 &&
        new Set(a.sources.map((s) => s.sourceId)).size === a.sources.length,
      "INVALID_INPUT",
      "Choose one to 50 distinct current posts.",
    );
    ensure(
      Number.isSafeInteger(a.expiresAt) &&
        a.expiresAt > Date.now() &&
        a.expiresAt <= Date.now() + 30 * 86400000,
      "INVALID_INPUT",
      "Choose an expiry within 30 days.",
    );
    for (const ref of a.sources) {
      const source = await ctx.db.get(ref.sourceId);
      ensure(
        source &&
          source.organizationId === a.organizationId &&
          source.state !== "deleted" &&
          source.rightsAttested &&
          sourceRetained(source.sourceRetentionUntil) &&
          source.generation === ref.generation &&
          source.updatedAt === ref.revision,
        "STALE_APPROVAL",
        "A selected source changed. Review it before sharing.",
      );
    }
    const old = await ctx.db
      .query("teamKnowledgeGrants")
      .withIndex("by_pair", (q) =>
        q
          .eq("organizationId", a.organizationId)
          .eq("recipientOrganizationId", a.recipientOrganizationId),
      )
      .unique();
    ensure(
      a.expectedVersion === (old?.version ?? 0),
      "STALE_APPROVAL",
      "The sharing grant changed. Reload before saving.",
    );
    if (!old)
      ensure(
        (
          await ctx.db
            .query("teamKnowledgeGrants")
            .withIndex("by_org", (q) =>
              q.eq("organizationId", a.organizationId),
            )
            .take(50)
        ).length < 50,
        "QUOTA_EXCEEDED",
        "This private library has reached 50 workspace grants.",
      );
    const fields = {
      organizationId: a.organizationId,
      recipientOrganizationId: a.recipientOrganizationId,
      actor: actor._id,
      sources: a.sources,
      version: (old?.version ?? 0) + 1,
      state: "active" as const,
      expiresAt: a.expiresAt,
      updatedAt: Date.now(),
    };
    const id = old
      ? old._id
      : await ctx.db.insert("teamKnowledgeGrants", fields);
    if (old) await ctx.db.patch(old._id, fields);
    await audit(
      ctx,
      a.organizationId,
      actor._id,
      "private_knowledge_share",
      id,
    );
    return { id, version: fields.version };
  },
});
export const revoke = mutation({
  args: {
    organizationId: v.id("organizations"),
    id: v.id("teamKnowledgeGrants"),
    expectedVersion: v.number(),
  },
  handler: async (ctx, a) => {
    const { actor } = await privateLibrary(ctx, a.organizationId);
    const grant = await ctx.db.get(a.id);
    ensure(
      grant &&
        grant.organizationId === a.organizationId &&
        grant.version === a.expectedVersion,
      "STALE_APPROVAL",
      "Sharing grant unavailable or changed.",
    );
    await ctx.db.patch(grant._id, {
      state: "revoked",
      version: grant.version + 1,
      updatedAt: Date.now(),
    });
    await audit(
      ctx,
      a.organizationId,
      actor._id,
      "private_knowledge_revoke",
      grant._id,
    );
    return { revoked: true };
  },
});
export const shared = query({
  args: {
    organizationId: v.id("organizations"),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    ctx = knowledgeReadContext(ctx);
    await access(ctx, a.organizationId);
    const page = await ctx.db
      .query("teamKnowledgeGrants")
      .withIndex("by_recipient", (q) =>
        q.eq("recipientOrganizationId", a.organizationId),
      )
      .paginate({ cursor: a.cursor ?? null, numItems: 1 });
    const items = [];
    for (const grant of page.page) {
      for (const source of await grantedSources(ctx, grant))
        items.push({
          ...source,
          grantId: grant._id,
          grantVersion: grant.version,
          expiresAt: grant.expiresAt,
        });
    }
    return { items, next: page.isDone ? null : page.continueCursor };
  },
});
export const fetchShared = query({
  args: {
    organizationId: v.id("organizations"),
    grantId: v.id("teamKnowledgeGrants"),
    sourceId: v.id("sources"),
  },
  handler: async (ctx, a) => {
    ctx = knowledgeReadContext(ctx);
    await access(ctx, a.organizationId);
    const grant = await ctx.db.get(a.grantId);
    ensure(
      grant && grant.recipientOrganizationId === a.organizationId,
      "FORBIDDEN",
      "Shared source unavailable.",
    );
    const current = (await grantedSources(ctx, grant)).find(
      (s) => s.sourceId === a.sourceId,
    );
    ensure(current, "FORBIDDEN", "Shared source unavailable or changed.");
    const source = await ctx.db.get(a.sourceId);
    ensure(
      source &&
        source.organizationId === grant.organizationId &&
        source.state !== "deleted" &&
        source.rightsAttested &&
        sourceRetained(source.sourceRetentionUntil) &&
        source.generation === current.generation &&
        source.updatedAt === current.revision,
      "FORBIDDEN",
      "Shared source unavailable or changed.",
    );
    const typed = await sharedTypedCitations(ctx, source);
    return {
      ...current,
      ...(typed
        ? {
            sourceRevisionId: typed.sourceRevisionId,
            sourceContentHash: typed.sourceContentHash,
            sourceCoverage: typed.coverage,
          }
        : {}),
      url: `https://scroll.companynerve.com/app/${a.organizationId}/shared?grant=${grant._id}&source=${a.sourceId}`,
      insights:
        source.state === "ready"
          ? (source.analysis?.insights ?? []).slice(0, 20).map((i: any) => ({
              id: i.id,
              reference: {
                sourceId: current.sourceId,
                generation: current.generation,
                revision: current.revision,
                insightId: i.id,
              },
              title: String(i.title ?? "").slice(0, 200),
              claim: String(i.claim ?? "").slice(0, 2000),
              evidence: typed
                ? typed.summarize(i.evidence ?? [])
                : (i.evidence ?? []).slice(0, 10).map((e: any) => ({
                    kind: e.kind,
                    startMs: e.startMs,
                    endMs: e.endMs,
                  })),
            }))
          : [],
      grantVersion: grant.version,
      expiresAt: grant.expiresAt,
      coverage: source.coverage ?? "metadata_only",
    };
  },
});

// Derived material is indivisible: reject the whole group unless every cited input
// is explicitly granted at its exact version and still has its cited insight.
export async function referencesGranted(
  ctx: QueryCtx,
  grant: Doc<"teamKnowledgeGrants">,
  references: {
    sourceId: string;
    generation: number;
    revision: number;
    insightId: string;
  }[],
) {
  if (
    !references.length ||
    references.length > 128 ||
    !(await grantCurrent(ctx, grant))
  )
    return false;
  const sources = new Map<string, Doc<"sources"> | null>();
  for (const ref of references) {
    if (
      !grant.sources.some(
        (s) =>
          s.sourceId === ref.sourceId &&
          s.generation === ref.generation &&
          s.revision === ref.revision,
      )
    )
      return false;
    const id = ctx.db.normalizeId("sources", ref.sourceId);
    if (!id) return false;
    if (!sources.has(id)) sources.set(id, await ctx.db.get(id));
    const source = sources.get(id);
    if (
      !source ||
      source.organizationId !== grant.organizationId ||
      source.state !== "ready" ||
      !source.rightsAttested ||
      !sourceRetained(source.sourceRetentionUntil) ||
      source.generation !== ref.generation ||
      source.updatedAt !== ref.revision ||
      !source.analysis?.insights?.some((i: any) => i.id === ref.insightId)
    )
      return false;
  }
  return true;
}
