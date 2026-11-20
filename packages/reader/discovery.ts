/** A display projection of returned citations, never inferred semantic edges. */
export type DiscoverySource = {
  key: string;
  id: string;
  profileId: string;
  title: string;
  url: string;
  fetchId: string;
  sharedGrantId?: string;
  sharedGrantVersion?: number;
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
  const byId = new Map<string, DiscoverySource>();
  for (const post of rows(value.posts)) {
    const id = text(post.id);
    if (!id || !text(post.fetch_id) || !text(post.url)) continue;
    const path = rows(post.access_paths)[0];
    const sourceProfile = text(path?.profile_id) || profileId;
    const reference = object(path?.reference ?? post.reference);
    const source = {
      key: sourceKey(sourceProfile, id, reference),
      id,
      profileId: sourceProfile,
      title: text(post.title),
      url: text(post.url),
      fetchId: text(post.fetch_id),
      ...(typeof reference.sharedGrantId === "string" &&
      typeof reference.sharedGrantVersion === "number"
        ? {
            sharedGrantId: reference.sharedGrantId,
            sharedGrantVersion: reference.sharedGrantVersion,
          }
        : {}),
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
      ...(text(match.insight_id) ? { insightId: text(match.insight_id) } : {}),
    });
  }
  return {
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
