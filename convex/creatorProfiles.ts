import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { creatorMatchingEnabled as enabled } from "./lib/creatorMatching";
import {
  creatorProfileUrl,
  publicCreatorProfile,
  publicProfileLink,
  readPublicCreatorProfile,
  type PublicCreatorProfile,
} from "../packages/social/public-creators";
import { selectedAnalysis } from "./lib/analysisHistory";
import { sourceRetained } from "./lib/sourceAuthority";
import { socialHash } from "../packages/social/contracts";
import { canonicalJson } from "../packages/contracts/canonical-json.mjs";
import { ensure } from "../packages/policy";

import { reciprocalCreatorComponent } from "../packages/social/creator-identity";

const day = 86400000;
export const sourceContext = internalQuery({
  args: { sourceId: v.id("sources") },
  returns: v.any(),
  handler: async (ctx, { sourceId }) => {
    if (!enabled()) return null;
    const source = await ctx.db.get(sourceId);
    if (
      !source?.creator ||
      source.creator.generation !== source.generation ||
      source.state !== "ready" ||
      !source.rightsAttested ||
      !sourceRetained(source.sourceRetentionUntil)
    )
      return null;
    const org = await ctx.db.get(source.organizationId);
    if (org?.status !== "active" || !(await selectedAnalysis(ctx, source)))
      return null;
    return {
      sourceId,
      generation: source.generation,
      organizationId: org._id,
      key: source.creator.key,
      handle: source.creator.handle,
    };
  },
});

export const acquire = internalMutation({
  args: { key: v.string(), handle: v.string() },
  returns: v.any(),
  handler: async (ctx, { key, handle }) => {
    if (!enabled()) return null;
    creatorProfileUrl(key, handle);
    ensure(
      /^(instagram|tiktok|x):[0-9]{1,30}$/.test(key),
      "INVALID_INPUT",
      "Creator unavailable.",
    );
    const now = Date.now(),
      old = await ctx.db
        .query("creatorWatches")
        .withIndex("by_key", (q) => q.eq("creatorKey", key))
        .unique();
    if (old?.profile && old.profile.observedAt > now - day)
      return { profile: old.profile };
    if (old?.profileLease && old.profileLease.expiresAt > now) return null;
    const token = crypto.randomUUID(),
      profileLease = { token, expiresAt: now + 40000 };
    if (old) await ctx.db.patch(old._id, { profileLease });
    else
      await ctx.db.insert("creatorWatches", {
        creatorKey: key,
        handle,
        profileLease,
        dueAt: now + day,
        state: "incomplete",
      });
    return { token };
  },
});

export const retain = internalMutation({
  args: { key: v.string(), token: v.string(), profile: v.any() },
  returns: v.boolean(),
  handler: async (ctx, { key, token, profile: raw }) => {
    if (!enabled()) return false;
    const old = await ctx.db
        .query("creatorWatches")
        .withIndex("by_key", (q) => q.eq("creatorKey", key))
        .unique(),
      now = Date.now();
    if (
      !old ||
      old.profileLease?.token !== token ||
      old.profileLease.expiresAt <= now
    )
      return false;
    if (!raw) {
      await ctx.db.patch(old._id, { profileLease: undefined });
      return false;
    }
    const profile = publicCreatorProfile.parse(raw);
    ensure(
      profile.key === key &&
        profile.observedAt <= now + 5000 &&
        profile.observedAt >= now - 40000 &&
        profile.links.every((link) => publicProfileLink(link) === link),
      "INVALID_INPUT",
      "Creator profile identity changed.",
    );
    await ctx.db.patch(old._id, {
      profile,
      profileUrl: creatorProfileUrl(profile.key, profile.handle),
      handle: profile.handle,
      profileLease: undefined,
    });
    return true;
  },
});

export const group = internalMutation({
  args: {
    sourceId: v.id("sources"),
    generation: v.number(),
    profiles: v.array(v.any()),
  },
  returns: v.boolean(),
  handler: async (ctx, { sourceId, generation, profiles: raw }) => {
    if (!enabled() || raw.length > 8) return false;
    const source = await ctx.db.get(sourceId),
      now = Date.now();
    if (
      !source?.creator ||
      source.generation !== generation ||
      source.creator.generation !== generation ||
      source.state !== "ready" ||
      !source.rightsAttested ||
      !sourceRetained(source.sourceRetentionUntil)
    )
      return false;
    const org = await ctx.db.get(source.organizationId);
    if (org?.status !== "active" || !(await selectedAnalysis(ctx, source)))
      return false;
    const profiles = raw.map((p) => publicCreatorProfile.parse(p));
    ensure(
      new Set(profiles.map((p) => p.key)).size === profiles.length &&
        profiles.every(
          (p) =>
            p.observedAt > now - day &&
            p.observedAt <= now + 5000 &&
            p.links.every((link) => publicProfileLink(link) === link),
        ),
      "INVALID_INPUT",
      "Use current verified creator profiles.",
    );
    // Every supplied profile must be the current server-retained observation.
    for (const profile of profiles) {
      const watch = await ctx.db
        .query("creatorWatches")
        .withIndex("by_key", (q) => q.eq("creatorKey", profile.key))
        .unique();
      ensure(
        watch?.profile &&
          canonicalJson(watch.profile) === canonicalJson(profile),
        "APPROVAL_STALE",
        "Creator matching evidence changed.",
      );
    }
    const component = reciprocalCreatorComponent(profiles, source.creator.key),
      visible: string[] = [];
    for (const key of component) {
      const candidates = await ctx.db
        .query("sources")
        .withIndex("by_org_creator", (q) =>
          q
            .eq("organizationId", source.organizationId)
            .eq("creator.key", key)
            .eq("state", "ready"),
        )
        .take(3);
      for (const candidate of candidates)
        if (
          candidate.creator?.generation === candidate.generation &&
          candidate.rightsAttested &&
          sourceRetained(candidate.sourceRetentionUntil)
        ) {
          try {
            if (await selectedAnalysis(ctx, candidate)) {
              visible.push(key);
              break;
            }
          } catch {
            /* Removed evidence never creates an identity association. */
          }
        }
    }
    if (visible.length < 2) return false;
    const existing: Doc<"creatorAccountLinks">[] = [];
    for (const key of visible) {
      const link = await ctx.db
        .query("creatorAccountLinks")
        .withIndex("by_org_account", (q) =>
          q.eq("organizationId", source.organizationId).eq("accountKey", key),
        )
        .unique();
      if (link && !link.groupKey.startsWith("auto_")) return false;
      if (link) existing.push(link);
    }
    // Do not discard another member of an existing group without fresh proof.
    for (const groupKey of new Set(existing.map((l) => l.groupKey))) {
      const members = await ctx.db
        .query("creatorAccountLinks")
        .withIndex("by_org_group", (q) =>
          q
            .eq("organizationId", source.organizationId)
            .eq("groupKey", groupKey),
        )
        .take(9);
      if (
        members.length > 8 ||
        members.some((m) => !visible.includes(m.accountKey))
      )
        return false;
    }
    const groupKey = `auto_${(await socialHash(canonicalJson(visible.sort()))).slice(0, 48)}`;
    const verifiedEvidenceHash = await socialHash(
      canonicalJson(
        profiles
          .filter((p) => component.includes(p.key))
          .sort((a, b) => a.key.localeCompare(b.key)),
      ),
    );
    for (const accountKey of visible) {
      const old = existing.find((l) => l.accountKey === accountKey),
        values = {
          organizationId: source.organizationId,
          accountKey,
          groupKey,
          verifiedEvidenceHash,
          linkedAt: now,
        };
      if (old) await ctx.db.patch(old._id, values);
      else await ctx.db.insert("creatorAccountLinks", values);
    }
    return true;
  },
});

export const matchSavedSource = internalAction({
  args: { sourceId: v.id("sources") },
  returns: v.null(),
  handler: async (ctx, { sourceId }) => {
    const source = await ctx.runQuery(internal.creatorProfiles.sourceContext, {
      sourceId,
    });
    if (!source) return null;
    const read = async (
      key: string,
      handle: string,
    ): Promise<PublicCreatorProfile | null> => {
      const acquired = await ctx.runMutation(internal.creatorProfiles.acquire, {
        key,
        handle,
      });
      if (!acquired) return null;
      if (acquired.profile) return publicCreatorProfile.parse(acquired.profile);
      try {
        const profile = await readPublicCreatorProfile(
          creatorProfileUrl(key, handle),
          key,
        );
        if (
          await ctx.runMutation(internal.creatorProfiles.retain, {
            key,
            token: acquired.token,
            profile,
          })
        )
          return profile;
      } catch {
        await ctx.runMutation(internal.creatorProfiles.retain, {
          key,
          token: acquired.token,
          profile: null,
        });
      }
      return null;
    };
    const seed = await read(source.key, source.handle);
    if (!seed) return null;
    const profiles = [seed],
      visited = new Set([creatorProfileUrl(seed.key, seed.handle)]);
    // Bound the crawl to explicit social profile links; never visit arbitrary bios or websites.
    for (let i = 0; i < profiles.length && profiles.length < 8; i++)
      for (const link of profiles[i].links) {
        if (visited.has(link) || profiles.length >= 8 || visited.size >= 12)
          continue;
        visited.add(link);
        try {
          const discovered = await readPublicCreatorProfile(link);
          if (profiles.some((p) => p.key === discovered.key)) continue;
          const acquired = await ctx.runMutation(
            internal.creatorProfiles.acquire,
            { key: discovered.key, handle: discovered.handle },
          );
          const profile = acquired?.profile
            ? publicCreatorProfile.parse(acquired.profile)
            : acquired?.token &&
                (await ctx.runMutation(internal.creatorProfiles.retain, {
                  key: discovered.key,
                  token: acquired.token,
                  profile: discovered,
                }))
              ? discovered
              : null;
          if (profile) profiles.push(profile);
        } catch {
          /* A missing reciprocal account does not invalidate the saved post. */
        }
      }
    if (profiles.length >= 2)
      await ctx.runMutation(internal.creatorProfiles.group, {
        sourceId,
        generation: source.generation,
        profiles,
      });
    return null;
  },
});
