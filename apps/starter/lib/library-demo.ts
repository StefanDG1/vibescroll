// Labeled UI examples only. These records are never persisted or evaluated.
export const libraryDemoMembers = [
  [
    "Show a populated example before asking for project setup.",
    "Show a useful example",
    "palette",
  ],
  [
    "Offer one clear next decision after the first result.",
    "Offer one clear next step",
    "compass",
  ],
  [
    "Show the source behind a recommendation.",
    "Show the source evidence",
    "shield",
  ],
  [
    "Keep setup reversible until the person confirms it.",
    "Keep optional setup reversible",
    "checklist",
  ],
  [
    "Let the person inspect uncertainty before acting.",
    "Review uncertainty before acting",
    "book",
  ],
  [
    "Record the observed result separately from implementation.",
    "Measure the actual result",
    "chart",
  ],
].map(([claim, title, icon], i) => ({
  _id: `demo-${i}`,
  evidence: {
    title: `Synthetic example ${i + 1}`,
    reference: {
      sourceId: `demo-${i}`,
      generation: 1,
      revision: 1,
      insightId: `idea-${i}`,
    },
    insight: { claim, title, icon },
  },
}));
export const libraryDemoProposals = [
  {
    id: "demo-proposal-draft",
    title: "Preview a useful result before setup",
    description:
      "Show a labeled example before asking for optional configuration.",
    state: "draft",
    repository: "Demo shop",
  },
  {
    id: "demo-proposal-ready",
    title: "Keep setup reversible",
    description:
      "Let people change their project choice before confirming setup.",
    state: "approved",
    repository: "Demo planner",
  },
  {
    id: "demo-proposal-open",
    title: "Explain the next action",
    description: "Add one clear next action beside the first useful result.",
    state: "published",
    repository: "Demo shop",
    run: { prState: "open" },
  },
  {
    id: "demo-proposal-closed",
    title: "Try an optional setup tour",
    description:
      "Synthetic proposal closed without merging. No benefit is claimed.",
    state: "published",
    repository: "Demo planner",
    run: { prState: "closed_unmerged" },
  },
  {
    id: "demo-proposal-merged",
    title: "Keep source evidence visible",
    description:
      "Synthetic merged change. A merge does not establish a measured benefit.",
    state: "published",
    repository: "Demo shop",
    run: { prState: "merged", mergedAt: 1 },
  },
];
const demoProposalReferences = [[0, 1], [0, 3], [0, 2], [0], [2]];
export function demoInsightJourney(_members: typeof libraryDemoMembers) {
  return {
    items: libraryDemoProposals.map((step, i) => {
      const references = demoProposalReferences[i].map(
        (index) => libraryDemoMembers[index].evidence.reference,
      );
      return {
        id: `demo-evaluation-${i}`,
        current: true,
        repository: step.repository,
        sources: references.map((ref) => ({
          id: ref.sourceId,
          insights: [ref.insightId],
        })),
        steps: [{ ...step, references }],
      };
    }),
    next: null,
  };
}
export function demoProposalBadges() {
  const memberships: Record<number, string[]> = {
    0: ["demo-next", "demo-guidance", "demo-topic"],
    1: ["demo-next", "demo-control", "demo-guidance", "demo-topic"],
    2: [
      "demo-next",
      "demo-outcomes",
      "demo-guidance",
      "demo-evidence",
      "demo-topic",
    ],
    3: ["demo-next", "demo-control", "demo-guidance", "demo-topic"],
    4: ["demo-next", "demo-guidance", "demo-topic"],
    5: [
      "demo-next",
      "demo-outcomes",
      "demo-guidance",
      "demo-evidence",
      "demo-topic",
    ],
  };
  return {
    items: libraryDemoProposals.map((step, i) => ({
      ...step,
      references: demoProposalReferences[i].map(
        (index) => libraryDemoMembers[index].evidence.reference,
      ),
      topicIds: [
        ...new Set(
          demoProposalReferences[i].flatMap((index) => memberships[index]),
        ),
      ],
    })),
    next: null,
    complete: true,
    scope: "workspace",
  };
}
export const libraryDemoDrafts = libraryDemoProposals.map((p) => ({
  ...p,
  _id: p.id,
  version: 1,
  current: true,
  visibility: "private",
  permissionCurrent: false,
  sensitive: false,
  hash: "synthetic-only",
  body: `## Synthetic proposal\n\n${p.description}\n\n## Acceptance\n\nKeep the example labeled synthetic. No real source, repository, authorization, execution or publication is represented.`,
  attempts: [],
}));
export const libraryDemoSources = libraryDemoMembers.map((m) => ({
  _id: m._id,
  ...(m._id === "demo-0"
    ? { kind: "url", url: "https://example.com/synthetic-post" }
    : {}),
  title: m.evidence.title,
  state: "ready",
  coverage: "synthetic",
  summary: m.evidence.insight.claim,
  mainPoints: [m.evidence.insight.claim],
}));
