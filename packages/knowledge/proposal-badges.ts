import { insightProposalStatus } from "./proposal-status";
export type BadgeReference = {
  sourceId: string;
  generation: number;
  revision: number;
  insightId: string;
};
export type BadgeProposal = {
  id: string;
  references: BadgeReference[];
  topicIds: string[];
  state: string;
  [key: string]: any;
};
export type ProposalBadgePage = {
  items: BadgeProposal[];
  next: string | null;
  complete: boolean;
  scope?: string;
};
export const badgeReferenceKey = (ref: BadgeReference) =>
  JSON.stringify([ref.sourceId, ref.generation, ref.revision, ref.insightId]);
export function appendProposalBadges(
  previous: ProposalBadgePage | null,
  page: ProposalBadgePage,
): ProposalBadgePage {
  const items = new Map((previous?.items ?? []).map((item) => [item.id, item]));
  for (const item of page.items) items.set(item.id, item);
  return {
    ...page,
    items: [...items.values()],
    complete: page.complete && (previous?.complete ?? true),
  };
}
export function openReferenceProposals(
  page: ProposalBadgePage | null,
  ref: BadgeReference,
) {
  const key = badgeReferenceKey(ref);
  return distinctOpenProposals(page).filter(
    (item) =>
      insightProposalStatus(item).open &&
      item.references.some((cited) => badgeReferenceKey(cited) === key),
  );
}
function distinctOpenProposals(page: ProposalBadgePage | null) {
  return [
    ...new Map((page?.items ?? []).map((item) => [item.id, item])).values(),
  ].filter((item) => insightProposalStatus(item).open);
}
export type ProposalSelection =
  { topicId: string } | { reference: BadgeReference };
/** A drilldown must explain the same complete proof as its bubble. */
export function proposalDrilldown(
  page: ProposalBadgePage | null,
  selection: ProposalSelection,
) {
  if (!page || page.next || !page.complete) return null;
  return "topicId" in selection
    ? distinctOpenProposals(page).filter((item) =>
        item.topicIds.includes(selection.topicId),
      )
    : openReferenceProposals(page, selection.reference);
}
export function proposalTopicLabels(
  proposal: BadgeProposal,
  topics: { id: string; name: string; parentId?: string }[],
) {
  const cited = new Set(proposal.topicIds);
  const ancestors = new Set<string>();
  const records = new Map(topics.map((topic) => [topic.id, topic]));
  for (const id of cited) {
    let parent = records.get(id)?.parentId;
    const visited = new Set([id]);
    while (parent && !visited.has(parent)) {
      visited.add(parent);
      ancestors.add(parent);
      parent = records.get(parent)?.parentId;
    }
  }
  return topics.filter(
    (topic) => cited.has(topic.id) && !ancestors.has(topic.id),
  );
}
export function proposalBadgeTotals(page: ProposalBadgePage | null) {
  if (!page || page.next || !page.complete) return null;
  const topics = new Map<string, Set<string>>(),
    references = new Map<string, Set<string>>();
  for (const item of distinctOpenProposals(page)) {
    if (!insightProposalStatus(item).open) continue;
    for (const id of item.topicIds) {
      const set = topics.get(id) ?? new Set<string>();
      set.add(item.id);
      topics.set(id, set);
    }
    for (const ref of item.references) {
      const key = badgeReferenceKey(ref);
      const set = references.get(key) ?? new Set<string>();
      set.add(item.id);
      references.set(key, set);
    }
  }
  return {
    topics: Object.fromEntries([...topics].map(([id, set]) => [id, set.size])),
    references: Object.fromEntries(
      [...references].map(([key, set]) => [key, set.size]),
    ),
  };
}
