import { expect, it } from "vitest";
import {
  appendProposalBadges,
  proposalBadgeTotals,
  openReferenceProposals,
  badgeReferenceKey,
  proposalDrilldown,
  proposalTopicLabels,
} from "../packages/knowledge/proposal-badges";
import { insightProposalStatus } from "../packages/knowledge/proposal-status";
import { demoProposalBadges } from "../apps/starter/lib/library-demo";
const a = { sourceId: "a", insightId: "i", generation: 1, revision: 2 },
  b = { ...a, insightId: "other" };
it("deduplicates proposals across references and descendant branches, withholding pending or incomplete totals", () => {
  const first = {
    items: [
      {
        id: "one",
        state: "draft",
        references: [a, b, a],
        topicIds: ["leaf", "root", "root"],
      },
    ],
    next: "next",
    complete: true,
  };
  expect(proposalBadgeTotals(first)).toBeNull();
  const all = appendProposalBadges(first, {
    items: [
      ...first.items,
      {
        id: "two",
        state: "approved",
        references: [a],
        topicIds: ["other", "root"],
      },
    ],
    next: null,
    complete: true,
  });
  expect(proposalBadgeTotals(all)).toEqual({
    topics: { leaf: 1, root: 2, other: 1 },
    references: { [badgeReferenceKey(a)]: 2, [badgeReferenceKey(b)]: 1 },
  });
  expect(proposalBadgeTotals({ ...all, complete: false })).toBeNull();
  expect(openReferenceProposals(all, { ...a, revision: 1 })).toEqual([]);
  expect(openReferenceProposals(all, a)).toHaveLength(2);
});
it("explains parent, child and exact insight bubbles with unique open proposals only", () => {
  const page = demoProposalBadges();
  const root = proposalDrilldown(page, { topicId: "demo-topic" })!;
  expect(root).toHaveLength(3);
  expect(new Set(root.map((item) => item.id)).size).toBe(3);
  expect(root.every((item) => insightProposalStatus(item).open)).toBe(true);
  expect(proposalDrilldown(page, { topicId: "demo-control" })).toHaveLength(2);
  expect(
    proposalDrilldown(page, { reference: page.items[0].references[0] }),
  ).toHaveLength(3);
  expect(
    proposalDrilldown(page, {
      reference: { ...page.items[0].references[0], revision: 999 },
    }),
  ).toEqual([]);
  expect(
    proposalDrilldown({ ...page, next: "pending" }, { topicId: "demo-topic" }),
  ).toBeNull();
  expect(
    proposalDrilldown({ ...page, complete: false }, { topicId: "demo-topic" }),
  ).toBeNull();
  expect(proposalDrilldown(null, { topicId: "demo-topic" })).toBeNull();
});
it("reconciles duplicate records to the newest lifecycle in both lists and totals", () => {
  const item = {
    id: "same",
    state: "draft",
    references: [a],
    topicIds: ["root"],
  };
  const page = {
    items: [item, item, { ...item, state: "rejected" }],
    next: null,
    complete: true,
  };
  expect(proposalDrilldown(page, { topicId: "root" })).toEqual([]);
  expect(proposalBadgeTotals(page)?.topics.root).toBeUndefined();
  const open = { ...page, items: [item, item] };
  expect(proposalDrilldown(open, { topicId: "root" })).toHaveLength(1);
  expect(proposalBadgeTotals(open)?.topics.root).toBe(1);
});
it("labels the most specific returned topics without exposing unavailable topic IDs", () => {
  const proposal = {
    id: "p",
    state: "draft",
    references: [a],
    topicIds: ["root", "child", "unknown"],
  };
  const topics = [
    { id: "root", name: "Business" },
    { id: "child", name: "Pricing", parentId: "root" },
  ];
  expect(proposalTopicLabels(proposal, topics)).toEqual([topics[1]]);
  expect(proposalTopicLabels(proposal, [])).toEqual([]);
  expect(() =>
    proposalTopicLabels(proposal, [
      { ...topics[0], parentId: "child" },
      topics[1],
    ]),
  ).not.toThrow();
});
it("excludes real closed-unmerged, closed issues, merged, rejected, deleted and unknown states", () => {
  for (const value of [
    { state: "published", run: { prState: "closed_unmerged" } },
    { state: "published", issueState: "closed" },
    { state: "published", run: { mergedAt: 1 } },
    { state: "rejected" },
    { state: "deleted" },
    { state: "legacy_unknown" },
  ])
    expect(insightProposalStatus(value).open).toBe(false);
  expect(insightProposalStatus({ state: "legacy_unknown" }).known).toBe(false);
});
it("keeps demo totals consistent when the same proposal appears under multiple topics and insights", () => {
  const page = demoProposalBadges(),
    totals = proposalBadgeTotals(page)!;
  expect(totals.topics).toMatchObject({
    "demo-topic": 3,
    "demo-guidance": 3,
    "demo-control": 2,
    "demo-evidence": 1,
  });
  expect(
    openReferenceProposals(page, page.items[0].references[0]),
  ).toHaveLength(3);
});
