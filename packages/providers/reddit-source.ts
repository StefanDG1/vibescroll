import { redditEligibilityCurrent } from "../sources/types";
export {
  redditEligibilityCurrent,
  redditEligibilitySchema,
} from "../sources/types";
import { z } from "zod";
import { containsSecret } from "../policy/secrets.mjs";
import {
  createEvidence,
  registryHash,
  validateEvidenceRegistry,
} from "../sources/evidence";
import {
  acquisitionFailure,
  SourceRequestBudget,
  sourceLimits,
} from "../sources/limits";
import { redditSourceUrl } from "../sources/urls";
import type {
  AcquisitionResult,
  AdapterContext,
  EvidenceRecord,
  SourceRevision,
} from "../sources/types";

const listing = z.object({
  kind: z.literal("Listing"),
  data: z.object({ children: z.array(z.unknown()).max(1000) }),
});
const postSchema = z.object({
  kind: z.literal("t3"),
  data: z.object({
    id: z.string().regex(/^[a-z0-9]{3,10}$/),
    subreddit: z.string().min(2).max(30),
    title: z.string().min(1).max(1000),
    selftext: z.string().max(262144),
    author: z.string().min(1).max(100),
    created_utc: z.number().nonnegative(),
    edited: z.union([z.boolean(), z.number().nonnegative()]),
    removed_by_category: z.string().nullable().optional(),
  }),
});
const commentSchema = z.object({
  kind: z.literal("t1"),
  data: z.object({
    id: z.string().regex(/^[a-z0-9]{1,10}$/),
    parent_id: z.string().regex(/^t[13]_[a-z0-9]{1,10}$/),
    body: z.string().max(262144),
    author: z.string().min(1).max(100),
    created_utc: z.number().nonnegative(),
    edited: z.union([z.boolean(), z.number().nonnegative()]),
    replies: z.unknown().optional(),
  }),
});
type Comment = z.infer<typeof commentSchema>["data"];
const milliseconds = (seconds: number) => {
  const value = Math.floor(seconds * 1000);
  if (!Number.isSafeInteger(value)) throw Error("INVALID_PROVIDER_TIME");
  return value;
};
function availability(text: string): "available" | "deleted" | "removed" {
  return text === "[deleted]"
    ? "deleted"
    : text === "[removed]"
      ? "removed"
      : "available";
}
export async function acquireRedditSource(
  input: { url: string; eligibility: unknown },
  context: AdapterContext,
): Promise<AcquisitionResult> {
  const now = context.now?.() ?? Date.now();
  if (!redditEligibilityCurrent(input.eligibility, now))
    return {
      status: "needs_supplied_text",
      reason: "reddit_permission_required",
    };
  const eligibility = input.eligibility;
  try {
    const source = redditSourceUrl(input.url);
    const budget = new SourceRequestBudget(context, "reddit");
    const response = await budget.json(
      `https://oauth.reddit.com/r/${source.subreddit}/comments/${source.postId}?limit=100&depth=4&sort=old&raw_json=1`,
      sourceLimits.reddit.totalBytes,
    );
    if (!Array.isArray(response) || response.length !== 2)
      throw Error("INVALID_THREAD_LISTINGS");
    const posts = listing.parse(response[0]).data.children;
    if (posts.length !== 1) throw Error("INVALID_POST_LISTING");
    const post = postSchema.parse(posts[0]).data;
    if (
      post.id !== source.postId ||
      post.subreddit.toLowerCase() !== source.subreddit.toLowerCase()
    )
      throw Error("WRONG_REDDIT_THREAD");
    if (post.removed_by_category || availability(post.selftext) !== "available")
      return { status: "needs_supplied_text", reason: "reddit_post_removed" };
    const postText = post.selftext
      ? `${post.title}\n\n${post.selftext}`
      : post.title;
    if (
      containsSecret(postText) ||
      postText.length > sourceLimits.textCharacters
    )
      return {
        status: "needs_supplied_text",
        reason: "reddit_post_content_policy",
      };
    const comments = new Map<string, Comment>();
    const omissions: string[] = [];
    let omitted = 0,
      inspected = 0;
    const stack = [
      {
        children: listing.parse(response[1]).data.children,
        parent: `t3_${post.id}`,
        depth: 1,
      },
    ];
    while (stack.length) {
      const level = stack.pop()!;
      for (const item of level.children) {
        if (++inspected > 2000) throw Error("COMMENT_LISTING_LIMIT");
        const more = z
          .object({
            kind: z.literal("more"),
            data: z.object({ count: z.number().int().nonnegative() }),
          })
          .safeParse(item);
        if (more.success) {
          omitted += more.data.data.count;
          omissions.push("provider_more_branches_not_fetched");
          continue;
        }
        const data = commentSchema.parse(item).data;
        if (data.parent_id !== level.parent || comments.has(data.id))
          throw Error("INVALID_COMMENT_ANCESTRY");
        if (level.depth > sourceLimits.reddit.depth) {
          omitted++;
          omissions.push("reply_depth_limit");
          continue;
        }
        comments.set(data.id, data);
        if (data.replies && data.replies !== "") {
          const replies = listing.parse(data.replies).data.children;
          stack.push({
            children: replies,
            parent: `t1_${data.id}`,
            depth: level.depth + 1,
          });
        }
      }
    }
    const observedAt = budget.now();
    const evidence: EvidenceRecord[] = [
      await createEvidence({
        kind: "reddit_post",
        postId: post.id,
        itemId: post.id,
        parentId: null,
        author: post.author,
        role: "op",
        availability: "available",
        createdAt: milliseconds(post.created_utc),
        editedAt:
          typeof post.edited === "number" ? milliseconds(post.edited) : null,
        excerpt: postText,
        canonicalUrl: source.url,
        observedAt,
      }),
    ];
    let textLength = postText.length;
    // Oldest-first deterministic order does not equate votes with correctness.
    // Include available parents before a reply, within the same sample budget.
    const ordered = [...comments.values()].sort(
      (a, b) => a.created_utc - b.created_utc || a.id.localeCompare(b.id),
    );
    const selected = new Set<string>();
    for (const candidate of ordered) {
      if (selected.has(candidate.id)) continue;
      const chain: Comment[] = [];
      let current: Comment | undefined = candidate;
      while (current && !selected.has(current.id)) {
        if (chain.some((c) => c.id === current!.id))
          throw Error("COMMENT_CYCLE");
        chain.unshift(current);
        current = current.parent_id.startsWith("t1_")
          ? comments.get(current.parent_id.slice(3))
          : undefined;
      }
      if (
        chain[0].parent_id.startsWith("t1_") &&
        !selected.has(chain[0].parent_id.slice(3))
      ) {
        omitted++;
        omissions.push("missing_parent_context");
        continue;
      }
      const chainText = chain.reduce((sum, c) => sum + c.body.length + 1, 0);
      if (
        selected.size + chain.length > sourceLimits.reddit.comments ||
        textLength + chainText > sourceLimits.textCharacters
      ) {
        omitted++;
        omissions.push("comment_sample_limit");
        continue;
      }
      if (chain.some((c) => !c.body.trim() || containsSecret(c.body))) {
        omitted++;
        omissions.push("comment_content_policy");
        continue;
      }
      for (const item of chain) {
        selected.add(item.id);
        textLength += item.body.length + 1;
        const state = availability(item.body);
        if (state !== "available") omissions.push(`${state}_comment_marker`);
        evidence.push(
          await createEvidence({
            kind: "reddit_comment",
            postId: post.id,
            itemId: item.id,
            parentId: item.parent_id,
            author: item.author,
            role:
              item.author === post.author && item.author !== "[deleted]"
                ? "op"
                : "commenter",
            availability: state,
            createdAt: milliseconds(item.created_utc),
            editedAt:
              typeof item.edited === "number"
                ? milliseconds(item.edited)
                : null,
            excerpt: item.body,
            canonicalUrl: `${source.url}${item.id}/`,
            observedAt,
          }),
        );
      }
    }
    // A permission that expired during retrieval cannot authorize result storage.
    if (!redditEligibilityCurrent(eligibility, budget.now()))
      return {
        status: "needs_supplied_text",
        reason: "reddit_permission_expired",
      };
    const revision: SourceRevision = {
      schemaVersion: "1.0.0",
      sourceType: "reddit_thread",
      canonical: source.url,
      providerIdentity: `reddit:${post.id}`,
      contentHash: await registryHash(evidence),
      adapterVersion: "reddit-source-v1",
      observedAt,
      rightsBasis: `verified_reddit_contract:${eligibility.evidenceId}`,
      retention: {
        retainUntil: Math.min(
          observedAt + eligibility.retention.maxAgeMs,
          eligibility.expiresAt,
        ),
        deletionWithinMs: eligibility.retention.deletionWithinMs,
        policyEvidenceId: eligibility.evidenceId,
      },
      coverage: {
        method: "oldest_first_with_ancestors_depth_3_max_50_comments",
        retrieved: evidence.length,
        omitted,
        omissions: [...new Set(omissions)],
      },
    };
    await validateEvidenceRegistry(revision, evidence);
    return {
      status: omissions.length ? "partial" : "ready",
      revision,
      evidence,
      text: evidence.map((e) => e.excerpt).join("\n"),
    };
  } catch (error) {
    return acquisitionFailure(error);
  }
}
