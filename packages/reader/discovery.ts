/** A display projection of returned citations, never inferred semantic edges. */
export type DiscoverySource = {
  key: string;
  id: string;
  profileId: string;
  title: string;
  url: string;
  fetchId: string;
};
export type DiscoveryInsight = {
  key: string;
  title: string;
  excerpt: string;
  kind: "insight" | "post";
  sourceKey: string;
  insightId?: string;
};
export type DiscoveryPage = {
  mode: "ranked_v1" | "legacy";
  profileId: string;
  grantVersion: number;
  sources: DiscoverySource[];
  insights: DiscoveryInsight[];
  cursor: string | null;
  hasMore: boolean;
  partial: boolean;
  truncated: boolean;
  coverage: string;
};
type Row = Record<string, unknown>;
const object = (value: unknown): Row =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Row)
    : {};
const rows = (value: unknown): Row[] =>
  Array.isArray(value) ? value.map(object) : [];
const text = (value: unknown) => (typeof value === "string" ? value : "");

/** Retain version identity so a newer analysis never merges into an old excerpt. */
function sourceKey(profileId: string, id: string, reference: Row) {
  return JSON.stringify([
    profileId,
    id,
    reference.generation ?? null,
    reference.revision ?? null,
    reference.analysisVersionId ?? null,
    reference.sharedGrantId ?? null,
    reference.sharedGrantVersion ?? null,
  ]);
}

export function discoveryPage(value: Row): DiscoveryPage {
  const profileId = text(value.profile_id);
  const sources: DiscoverySource[] = [];
  const insights: DiscoveryInsight[] = [];
  if (value.mode === "ranked_v1") {
    const byId = new Map<string, DiscoverySource>();
    for (const post of rows(value.posts)) {
      const id = text(post.id);
      if (!id || !text(post.fetch_id) || !text(post.url)) continue;
      const source = {
        key: sourceKey(profileId, id, object(post.reference)),
        id,
        profileId,
        title: text(post.title),
        url: text(post.url),
        fetchId: text(post.fetch_id),
      };
      byId.set(id, source);
      sources.push(source);
    }
    for (const match of rows(value.matches)) {
      const source = byId.get(text(match.post_id));
      // A source relationship requires the returned exact parent post.
      if (!source || !text(match.id)) continue;
      insights.push({
        key: `${source.key}:${text(match.id)}`,
        title: text(match.title),
        excerpt: text(match.excerpt),
        kind: match.kind === "insight" ? "insight" : "post",
        sourceKey: source.key,
        ...(text(match.insight_id)
          ? { insightId: text(match.insight_id) }
          : {}),
      });
    }
  } else {
    for (const result of rows(value.results)) {
      const id = text(result.id);
      if (!id || !text(result.url)) continue;
      const ref = object(result.reference);
      const postId = text(ref.sourceId) || id.split("~")[0];
      const key = sourceKey(profileId, postId, ref);
      if (!sources.some((source) => source.key === key))
        sources.push({
          key,
          id: postId,
          profileId,
          title: text(result.title),
          url: text(result.url),
          fetchId: id,
        });
      insights.push({
        key: `${key}:${id}`,
        title: text(result.title),
        excerpt: text(result.excerpt),
        kind: text(ref.insightId) ? "insight" : "post",
        sourceKey: key,
        ...(text(ref.insightId) ? { insightId: text(ref.insightId) } : {}),
      });
    }
  }
  return {
    mode: value.mode === "ranked_v1" ? "ranked_v1" : "legacy",
    profileId,
    grantVersion: Number(value.grant_version ?? 0),
    sources,
    insights,
    cursor: typeof value.next_cursor === "string" ? value.next_cursor : null,
    hasMore: value.has_more === true || typeof value.next_cursor === "string",
    partial: value.truncated === true || value.exhausted === false,
    truncated: value.truncated === true,
    coverage: text(value.coverage),
  };
}

/** Continuations must remain bound to the same authorized workspace and grant. */
export function appendDiscovery(previous: DiscoveryPage, next: DiscoveryPage) {
  if (
    previous.profileId !== next.profileId ||
    previous.grantVersion !== next.grantVersion
  )
    throw new Error("Search access changed. Run the search again.");
  return {
    ...next,
    sources: [
      ...new Map(
        [...previous.sources, ...next.sources].map((s) => [s.key, s]),
      ).values(),
    ],
    insights: [
      ...new Map(
        [...previous.insights, ...next.insights].map((s) => [s.key, s]),
      ).values(),
    ],
    truncated: previous.truncated || next.truncated,
    partial: previous.truncated || next.partial,
  };
}
