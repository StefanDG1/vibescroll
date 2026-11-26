import { creatorPoolEnabled, sponsorAllowance } from "./lib/creatorPool";
import { creatorFeedAvailable } from "../packages/social/creator-feed";
import { ensureCreatorWatch } from "./creatorDiscovery";
import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { assistantGrant } from "./lib/assistantPrincipal";
import { sourceWithinAssistantScope } from "./lib/assistantSourceScope";
import { access, writeAccess } from "./lib";
import { selectedAnalysis } from "./lib/analysisHistory";
import { sourceRetained } from "./lib/sourceAuthority";
import { ensure } from "../packages/policy";
import { linkedCreatorKeys, visibleOriginals } from "./lib/creatorLinks";
import { postDisplayTitle } from "../packages/sources/display";
import { creatorCatalogPage } from "./lib/creatorCatalog";
import { requireFullCatalog } from "./lib/fullCatalogAccess";
import { currentCloudArtifact } from "./lib/cloudCatalog";
import { internal } from "./_generated/api";

const args = {
  organizationId: v.id("organizations"),
  creatorKey: v.string(),
};

async function followHandle(
  ctx: QueryCtx,
  organizationId: Id<"organizations">,
  creatorKey: string,
  observed: { key: string; handle: string },
) {
  if (observed.key === creatorKey) return observed.handle;
  ensure(
    (await linkedCreatorKeys(ctx, organizationId, observed.key)).includes(
      creatorKey,
    ),
    "SOURCE_UNAVAILABLE",
    "Creator unavailable.",
  );
  const watch = await ctx.db
    .query("creatorWatches")
    .withIndex("by_key", (q) => q.eq("creatorKey", creatorKey))
    .unique();
  ensure(
    watch?.profile?.key === creatorKey &&
      watch.profile.observedAt > Date.now() - 86400000,
    "SOURCE_UNAVAILABLE",
    "Creator unavailable. Refresh the profile.",
  );
  return watch.profile.handle;
}

async function readyPosts(
  ctx: QueryCtx,
  organizationId: Id<"organizations">,
  creatorKey: string,
  cursor: string | null,
) {
  ensure(
    /^(tiktok|instagram|x):[A-Za-z0-9_-]{1,100}$/.test(creatorKey),
    "INVALID_INPUT",
    "Creator unavailable.",
  );
  const before = cursor === null ? null : Number(cursor);
  ensure(
    before === null || (Number.isFinite(before) && before > 0),
    "INVALID_INPUT",
    "Invalid creator cursor.",
  );
  const keys = await linkedCreatorKeys(ctx, organizationId, creatorKey);
  const candidates = (
    await Promise.all(
      keys.map((key) =>
        ctx.db
          .query("sources")
          .withIndex("by_org_creator", (q) => {
            const prefix = q
              .eq("organizationId", organizationId)
              .eq("creator.key", key)
              .eq("state", "ready");
            return before === null
              ? prefix
              : prefix.lt("_creationTime", before);
          })
          .order("desc")
          .take(13),
      ),
    )
  ).flat();
  candidates.sort((a, b) => b._creationTime - a._creationTime);
  const page = candidates.slice(0, 12);
  const visible: Doc<"sources">[] = [];
  for (const source of page) {
    if (
      !source.url ||
      !source.rightsAttested ||
      !sourceRetained(source.sourceRetentionUntil) ||
      source.creator?.generation !== source.generation
    )
      continue;
    try {
      if (await selectedAnalysis(ctx, source)) visible.push(source);
    } catch {
      // Withdrawn and expired versions must not appear in creator metadata.
    }
  }
  return {
    visible,
    next: candidates.length > 12 ? String(page[11]._creationTime) : null,
  };
}

const profile = v.object({
  name: v.string(),
  handle: v.string(),
  following: v.boolean(),
  pool: v.union(
    v.null(),
    v.object({
      enabled: v.boolean(),
      cap: v.number(),
      used: v.number(),
    }),
  ),
  monitoring: v.union(
    v.null(),
    v.object({
      state: v.string(),
      lastSuccessAt: v.union(v.number(), v.null()),
      nextCheckAt: v.number(),
      discoveries: v.array(
        v.object({ url: v.string(), publishedAt: v.number() }),
      ),
    }),
  ),
  platform: v.union(
    v.literal("instagram"),
    v.literal("tiktok"),
    v.literal("x"),
  ),
  items: v.array(
    v.object({
      id: v.id("sources"),
      title: v.string(),
      publishedAt: v.union(v.number(), v.null()),
      originals: v.array(v.string()),
    }),
  ),
  sharedItems: v.array(
    v.object({
      familyId: v.id("catalogFamilies"),
      artifactId: v.id("publicArtifacts"),
      creatorKey: v.string(),
      handle: v.string(),
      title: v.string(),
      canonical: v.string(),
      originals: v.array(v.string()),
      publishedAt: v.union(v.number(), v.null()),
    }),
  ),
  sharedNext: v.union(v.string(), v.null()),
  next: v.union(v.string(), v.null()),
});

export const read = query({
  args: {
    ...args,
    cursor: v.optional(v.string()),
    sharedCursor: v.optional(v.string()),
  },
  returns: v.union(profile, v.null()),
  handler: async (
    ctx,
    { organizationId, creatorKey, cursor, sharedCursor },
  ) => {
    const { actor, organization } = await access(ctx, organizationId);
    ensure(
      !cursor || cursor.length <= 4096,
      "INVALID_INPUT",
      "Invalid cursor.",
    );
    const { visible, next } = await readyPosts(
      ctx,
      organizationId,
      creatorKey,
      cursor ?? null,
    );
    const first =
      visible.find((source) => source.creator?.key === creatorKey) ??
      visible[0];
    const shared = await creatorCatalogPage(
      ctx,
      organizationId,
      creatorKey,
      sharedCursor,
    );
    const sharedCreator =
      shared.items.find((item) => item.creatorKey === creatorKey) ??
      shared.items[0];
    const follow = await ctx.db
      .query("creatorFollows")
      .withIndex("by_actor_workspace_creator", (q) =>
        q
          .eq("actorId", actor._id)
          .eq("organizationId", organizationId)
          .eq("creatorKey", creatorKey),
      )
      .unique();
    if (!first?.creator && !sharedCreator && !shared.next && !follow)
      return null;
    const identityWatch = await ctx.db
      .query("creatorWatches")
      .withIndex("by_key", (q) => q.eq("creatorKey", creatorKey))
      .unique();
    const handle =
      identityWatch?.profile?.handle ??
      first?.creator?.handle ??
      sharedCreator?.handle ??
      identityWatch?.handle ??
      "";
    const watch =
      follow?.state === "following" && creatorFeedAvailable(creatorKey)
        ? identityWatch
        : null;
    const discoveries =
      watch && follow
        ? await ctx.db
            .query("creatorDiscoveries")
            .withIndex("by_creator_published", (q) =>
              q
                .eq("creatorKey", creatorKey)
                .gt(
                  "publishedAt",
                  follow.activeSince ?? follow.firstFollowedAt,
                ),
            )
            .order("desc")
            .take(12)
        : [];
    return {
      name: first?.linkPreview?.authorName || handle || "Creator",
      handle,
      following: follow?.state === "following",
      pool:
        follow?.state === "following" &&
        creatorPoolEnabled(creatorKey) &&
        organization.privateOwnerId === actor._id
          ? await (async () => {
              const allowance = await sponsorAllowance(
                ctx,
                actor,
                organization,
                Date.now(),
              );
              return {
                enabled: !!follow.sponsor,
                cap: allowance?.cap ?? 0,
                used: allowance?.used ?? 0,
              };
            })()
          : null,
      monitoring: watch
        ? {
            state: watch.state,
            lastSuccessAt: watch.lastSuccessAt ?? null,
            nextCheckAt: watch.dueAt,
            discoveries: discoveries.map(({ url, publishedAt }) => ({
              url,
              publishedAt,
            })),
          }
        : null,
      platform: creatorKey.startsWith("instagram:")
        ? ("instagram" as const)
        : creatorKey.startsWith("x:")
          ? ("x" as const)
          : ("tiktok" as const),
      items: await Promise.all(
        visible.map(async (source) => ({
          id: source._id,
          title: postDisplayTitle(source),
          publishedAt: source.publishedAt ?? null,
          originals: await visibleOriginals(ctx, source),
        })),
      ),
      next,
      sharedItems: shared.items,
      sharedNext: shared.next,
    };
  },
});

export const setFollow = mutation({
  args: {
    ...args,
    following: v.boolean(),
    sourceId: v.optional(v.id("sources")),
    familyId: v.optional(v.id("catalogFamilies")),
  },
  returns: v.boolean(),
  handler: async (
    ctx,
    { organizationId, creatorKey, following, sourceId, familyId },
  ) => {
    const { actor } = await writeAccess(ctx, organizationId);
    ensure(
      /^(tiktok|instagram|x):[A-Za-z0-9_-]{1,100}$/.test(creatorKey),
      "INVALID_INPUT",
      "Creator unavailable.",
    );
    if (!following)
      return saveFollow(ctx, actor._id, organizationId, creatorKey, false);
    if (!sourceId && familyId) {
      await requireFullCatalog(ctx, organizationId);
      const family = await ctx.db.get(familyId);
      ensure(
        family?.selectedArtifactId,
        "SOURCE_UNAVAILABLE",
        "Creator unavailable.",
      );
      const shared = await currentCloudArtifact(ctx, family.selectedArtifactId),
        post = shared.prepared.post;
      const platform =
        post?.version === "x-post-evidence-v1" ? "x" : post?.platform;
      ensure(
        post?.authorId && post.authorHandle,
        "SOURCE_UNAVAILABLE",
        "Creator unavailable.",
      );
      return saveFollow(
        ctx,
        actor._id,
        organizationId,
        creatorKey,
        following,
        await followHandle(ctx, organizationId, creatorKey, {
          key: `${platform}:${post.authorId}`,
          handle: post.authorHandle,
        }),
      );
    }
    const source = sourceId ? await ctx.db.get(sourceId) : null;
    ensure(
      source &&
        source.organizationId === organizationId &&
        source.state === "ready" &&
        source.rightsAttested &&
        sourceRetained(source.sourceRetentionUntil) &&
        source.creator?.generation === source.generation &&
        !!(await selectedAnalysis(ctx, source)),
      "SOURCE_UNAVAILABLE",
      "Creator unavailable.",
    );
    return saveFollow(
      ctx,
      actor._id,
      organizationId,
      creatorKey,
      following,
      await followHandle(ctx, organizationId, creatorKey, source.creator),
    );
  },
});

async function saveFollow(
  ctx: MutationCtx,
  actorId: Id<"users">,
  organizationId: Id<"organizations">,
  creatorKey: string,
  following: boolean,
  handle?: string,
) {
  const old = await ctx.db
    .query("creatorFollows")
    .withIndex("by_actor_workspace_creator", (q) =>
      q
        .eq("actorId", actorId)
        .eq("organizationId", organizationId)
        .eq("creatorKey", creatorKey),
    )
    .unique();
  const state = following ? ("following" as const) : ("unfollowed" as const);
  const now = Date.now();
  if (old?.state === state) return following;
  if (following) {
    await ensureCreatorWatch(ctx, creatorKey, now, handle);
    await ctx.scheduler.runAfter(0, internal.creatorDiscovery.schedule, {});
  }
  if (old)
    await ctx.db.patch(old._id, {
      state,
      updatedAt: now,
      ...(following ? { activeSince: now } : { sponsor: false }),
    });
  else if (following)
    await ctx.db.insert("creatorFollows", {
      organizationId,
      actorId,
      creatorKey,
      state,
      firstFollowedAt: now,
      activeSince: now,
      updatedAt: now,
    });
  return following;
}

const assistantSource = {
  profileId: v.id("organizations"),
  sourceId: v.id("sources"),
};
async function scopedCreator(
  ctx: QueryCtx,
  profileId: Id<"organizations">,
  id: Id<"sources">,
) {
  const scope = await assistantGrant(ctx, profileId, "knowledge:read");
  const source = await ctx.db.get(id);
  ensure(
    source?.creator &&
      source.creator.generation === source.generation &&
      source.state === "ready" &&
      (await sourceWithinAssistantScope(
        ctx,
        scope.grant,
        scope.organization,
        scope.actor._id,
        source,
      )) &&
      !!(await selectedAnalysis(ctx, source)),
    "SOURCE_UNAVAILABLE",
    "This authorized post has no verified creator.",
  );
  return { scope, source, creator: source.creator };
}

export const assistantRead = internalQuery({
  args: assistantSource,
  returns: v.object({
    name: v.string(),
    handle: v.string(),
    url: v.string(),
    posts: v.array(
      v.object({
        sourceId: v.id("sources"),
        title: v.string(),
        url: v.string(),
      }),
    ),
    more: v.boolean(),
    sharedPosts: v.array(
      v.object({
        title: v.string(),
        url: v.string(),
        originalUrl: v.string(),
        originalUrls: v.array(v.string()),
      }),
    ),
    sharedMore: v.boolean(),
  }),
  handler: async (ctx, { profileId, sourceId }) => {
    const { scope, source, creator } = await scopedCreator(
      ctx,
      profileId,
      sourceId,
    );
    const { visible, next } = await readyPosts(
      ctx,
      profileId,
      creator.key,
      null,
    );
    const base = `https://scroll.companynerve.com/app/${profileId}`;
    const shared = await creatorCatalogPage(ctx, profileId, creator.key);
    const posts = [];
    for (const post of visible)
      if (
        await sourceWithinAssistantScope(
          ctx,
          scope.grant,
          scope.organization,
          scope.actor._id,
          post,
        )
      )
        posts.push({
          sourceId: post._id,
          title: postDisplayTitle(post),
          url: `${base}/posts/${post._id}`,
        });
    return {
      name: source.linkPreview?.authorName || creator.handle,
      handle: creator.handle,
      url: `${base}/creators/${encodeURIComponent(creator.key)}`,
      posts,
      // Do not disclose whether there are out-of-scope sources.
      more: scope.grant.libraryScope === "all" && next !== null,
      sharedPosts: shared.items.map((item) => ({
        title: item.title,
        url: `${base}/catalog/${item.familyId}`,
        originalUrl: item.canonical,
        originalUrls: item.originals,
      })),
      sharedMore: shared.next !== null,
    };
  },
});

export const assistantFollow = internalMutation({
  args: { ...assistantSource, following: v.boolean() },
  returns: v.object({
    following: v.boolean(),
    monitoringAvailable: v.boolean(),
  }),
  handler: async (ctx, { profileId, sourceId, following }) => {
    await assistantGrant(ctx, profileId, "links:save");
    const { scope, creator } = await scopedCreator(ctx, profileId, sourceId);
    ensure(
      scope.membership.role !== "viewer",
      "FORBIDDEN",
      "This workspace is read-only.",
    );
    await saveFollow(
      ctx,
      scope.actor._id,
      profileId,
      creator.key,
      following,
      creator.handle,
    );
    return {
      following,
      monitoringAvailable: creatorFeedAvailable(creator.key),
    };
  },
});

// An operator records reviewed evidence separately. Names, handles and model
// output cannot create or expand a creator group.
export const recordReviewedGroup = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    groupKey: v.string(),
    sourceIds: v.array(v.id("sources")),
    verifiedEvidenceHash: v.string(),
  },
  returns: v.null(),
  handler: async (
    ctx,
    { organizationId, groupKey, sourceIds, verifiedEvidenceHash },
  ) => {
    ensure(
      /^[A-Za-z0-9_-]{8,64}$/.test(groupKey) &&
        /^[a-f0-9]{64}$/.test(verifiedEvidenceHash) &&
        sourceIds.length >= 2 &&
        sourceIds.length <= 8 &&
        new Set(sourceIds).size === sourceIds.length,
      "INVALID_INPUT",
      "Use the exact reviewed creator accounts and evidence.",
    );
    const keys = new Set<string>();
    for (const id of sourceIds) {
      const source = await ctx.db.get(id);
      ensure(
        source?.organizationId === organizationId &&
          source.state === "ready" &&
          source.rightsAttested &&
          sourceRetained(source.sourceRetentionUntil) &&
          source.creator?.generation === source.generation &&
          !!(await selectedAnalysis(ctx, source)),
        "SOURCE_UNAVAILABLE",
        "The reviewed creator's evidence changed.",
      );
      keys.add(source.creator!.key);
    }
    ensure(
      keys.size === sourceIds.length,
      "INVALID_INPUT",
      "Select one post per creator account.",
    );
    const old = await ctx.db
      .query("creatorAccountLinks")
      .withIndex("by_org_group", (q) =>
        q.eq("organizationId", organizationId).eq("groupKey", groupKey),
      )
      .take(8);
    ensure(
      !old.length ||
        (old.length === keys.size &&
          old.every(
            (row) =>
              keys.has(row.accountKey) &&
              row.verifiedEvidenceHash === verifiedEvidenceHash,
          )),
      "APPROVAL_STALE",
      "Split the existing group before replacing its review.",
    );
    if (old.length) return null;
    for (const accountKey of keys) {
      ensure(
        !(await ctx.db
          .query("creatorAccountLinks")
          .withIndex("by_org_account", (q) =>
            q.eq("organizationId", organizationId).eq("accountKey", accountKey),
          )
          .unique()),
        "APPROVAL_STALE",
        "One reviewed account already belongs to a creator group.",
      );
      await ctx.db.insert("creatorAccountLinks", {
        organizationId,
        accountKey,
        groupKey,
        verifiedEvidenceHash,
        linkedAt: Date.now(),
      });
    }
    return null;
  },
});

export const splitReviewedGroup = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    groupKey: v.string(),
    verifiedEvidenceHash: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { organizationId, groupKey, verifiedEvidenceHash }) => {
    const links = await ctx.db
      .query("creatorAccountLinks")
      .withIndex("by_org_group", (q) =>
        q.eq("organizationId", organizationId).eq("groupKey", groupKey),
      )
      .take(8);
    ensure(
      links.every((link) => link.verifiedEvidenceHash === verifiedEvidenceHash),
      "APPROVAL_STALE",
      "The current creator group needs review.",
    );
    for (const link of links) await ctx.db.delete(link._id);
    return null;
  },
});

export const setSponsorship = mutation({
  args: { ...args, sponsor: v.boolean() },
  returns: v.boolean(),
  handler: async (ctx, { organizationId, creatorKey, sponsor }) => {
    const { actor, organization } = await writeAccess(ctx, organizationId, [
      "owner",
    ]);
    ensure(
      organization.privateOwnerId === actor._id,
      "PERSONAL_FUNDING_REQUIRED",
      "Use your own credit wallet.",
    );
    if (sponsor)
      ensure(
        creatorPoolEnabled(creatorKey),
        "SETUP_REQUIRED",
        "Automatic credit contributions are unavailable.",
      );
    const follow = await ctx.db
      .query("creatorFollows")
      .withIndex("by_actor_workspace_creator", (q) =>
        q
          .eq("actorId", actor._id)
          .eq("organizationId", organizationId)
          .eq("creatorKey", creatorKey),
      )
      .unique();
    ensure(
      follow?.state === "following",
      "SOURCE_UNAVAILABLE",
      "Follow this creator first.",
    );
    if (sponsor && !follow.sponsor) {
      const enabled = await ctx.db
        .query("creatorFollows")
        .withIndex("by_creator_sponsor", (q) =>
          q
            .eq("creatorKey", creatorKey)
            .eq("state", "following")
            .eq("sponsor", true),
        )
        .take(63);
      ensure(
        enabled.length < 63,
        "QUOTA_EXCEEDED",
        "This creator's pilot pool is full.",
      );
    }
    if (follow.sponsor !== sponsor)
      await ctx.db.patch(follow._id, { sponsor, updatedAt: Date.now() });
    return sponsor;
  },
});
