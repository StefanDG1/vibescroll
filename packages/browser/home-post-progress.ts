import { z } from "zod";
import {
  homeSummaryV1,
  postProgressPageV1,
  type HomeSummaryV1,
  type PostProgressPageV1,
  type PostSummaryV1,
} from "../contracts/post-summary";

const requestIds = z
  .array(
    z
      .string()
      .min(1)
      .max(100)
      .regex(/^[a-zA-Z0-9_-]+$/),
  )
  .max(30)
  .refine((ids) => new Set(ids).size === ids.length, "Duplicate post IDs.");

// Bound input before creating an authenticated client or issuing any query.
export function parseHomePostProgressSourceIds(value: unknown): string[] {
  return requestIds.parse(value);
}

export type HomePostProgressMerge = {
  postSummaries: PostSummaryV1[];
  requiresRefresh: boolean;
  scopeChanged: boolean;
  asOf: number;
};

// The caller requests exactly the displayed snapshot.recent IDs. This returns
// a visible array patch, never a manufactured full-read Home revision/counts.
// The caller discards superseded responses and uses asOf to fence later patches.
export function mergeHomePostProgress(
  snapshot: HomeSummaryV1,
  page: PostProgressPageV1,
  now: number,
): HomePostProgressMerge {
  const full = homeSummaryV1.parse(snapshot);
  const update = postProgressPageV1.parse(page);
  if (!Number.isSafeInteger(now) || now < 0)
    throw Error("Invalid current time.");
  const requested = parseHomePostProgressSourceIds(
    full.recent.map((p) => p.sourceId),
  );
  if (
    full.recent.some(
      (p) =>
        p.progress.sourceId !== p.sourceId ||
        p.progress.generation !== p.generation ||
        p.progress.contentRevision !== p.contentRevision ||
        p.progress.availableUntil !== p.availableUntil,
    )
  )
    throw Error("Invalid Home post bindings.");
  const result = (
    postSummaries: PostSummaryV1[],
    requiresRefresh: boolean,
    scopeChanged = false,
  ): HomePostProgressMerge => ({
    postSummaries,
    requiresRefresh,
    scopeChanged,
    asOf: update.asOf,
  });
  if (
    update.organizationId !== full.organizationId ||
    update.scopeKey !== full.scopeKey
  )
    return result([], true, true);

  const expected = new Set(requested);
  const returned = [
    ...update.items.map((p) => p.sourceId),
    ...update.unavailableSourceIds,
  ];
  if (
    new Set(returned).size !== returned.length ||
    returned.some((id) => !expected.has(id))
  )
    return result([], true);

  const retained = (p: PostSummaryV1) =>
    p.availableUntil === null || p.availableUntil > now;
  if (update.asOf < full.asOf)
    return result(full.recent.filter(retained), true);

  const items = new Map(update.items.map((p) => [p.sourceId, p]));
  let requiresRefresh = returned.length !== requested.length;
  const postSummaries: PostSummaryV1[] = [];
  for (const post of full.recent) {
    const progress = items.get(post.sourceId);
    // Missing/unavailable IDs and current retention loss erase visible content
    // immediately. A subsequent full read decides whether anything can return.
    if (
      !progress ||
      !retained(post) ||
      (progress.availableUntil !== null && progress.availableUntil <= now) ||
      progress.generation !== post.generation ||
      progress.contentRevision !== post.contentRevision ||
      progress.availableUntil !== post.availableUntil ||
      (post.contentRevision === null &&
        progress.progressRevision !== post.progress.progressRevision)
    ) {
      requiresRefresh = true;
      continue;
    }
    // Preserve backend hashes. Active timers must also honor activeUntil; an
    // elapsed lease does not remove otherwise retained source content.
    postSummaries.push({ ...post, progress });
  }
  return result(postSummaries, requiresRefresh);
}
