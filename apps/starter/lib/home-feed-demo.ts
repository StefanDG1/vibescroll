import type { FeedDetail, FeedPage } from "./home-feed";
import { suggestProjects } from "./project-suggestions";

const project = {
  _id: "synthetic-project",
  fullName: "VibeScroll",
  enabled: true,
  confirmed: true,
  status: "connected",
  profile:
    "purpose: Product design and onboarding\n\ngoals: Improve product design and marketing",
};
export const feedDemoDetails: Record<string, FeedDetail> = Object.fromEntries(
  ["Make the first screen useful", "Keep the next step clear"].map(
    (title, index) => {
      const id = `feed-demo-${index}`;
      const insights = [
        {
          id: "first-value",
          title: "Show value before setup",
          claim:
            "Let visitors explore a working example before asking them to configure a project.",
          icon: "lightbulb",
          categories: ["product_design"],
        },
        {
          id: "optional",
          title: "Keep the next step optional",
          claim:
            "Offer a clear path forward while keeping existing users in control of their setup.",
          icon: "compass",
          categories: ["product_design"],
        },
        {
          id: "primary",
          title: "Use one clear primary action",
          claim:
            "Make the next decision easy to find. Keep secondary actions in context.",
          icon: "checklist",
          categories: ["marketing"],
        },
        {
          id: "context",
          title: "Keep context visible",
          claim:
            "Show the source beside the recommendation so readers can inspect why it matters.",
          icon: "book",
          categories: ["product_design"],
        },
      ];
      const suggestions = suggestProjects(
        { analysisVersion: { id: `${id}-version` }, analysis: { insights } },
        [
          project,
          { ...project, _id: "synthetic-marketing", fullName: "Marketing" },
          { ...project, _id: "synthetic-onboarding", fullName: "Onboarding" },
        ],
      );
      return [
        id,
        {
          id,
          generation: 1,
          title,
          authorName: "VibeScroll example",
          url: null,
          summary:
            "A synthetic walkthrough of a clearer first-use experience. Example content only.",
          categoryKeys: ["product_design", "marketing"],
          thumbnailAssetIds: [],
          durationMs: 48000,
          engagement: {
            scopeKey: `synthetic:${id}`,
            revision: 0,
            likes: 128,
            shares: 56,
            liked: true,
          },
          analysisVersionId: `${id}-version`,
          insights,
          suggestions,
          projects: [{ id: project._id, name: project.fullName }],
          proposals:
            index === 0
              ? [
                  {
                    id: "synthetic-review",
                    title: "Let visitors try an example first",
                    projectId: project._id,
                    projectName: project.fullName,
                    version: 1,
                    review: "unreviewed",
                    disposition: "relevant",
                    currentProblem:
                      "The first screen asks for setup before showing a useful result.",
                    proposedChange:
                      "Offer a labeled interactive example, then let visitors connect a project when they are ready.",
                    steps: [
                      "Add a small interactive example to the first screen.",
                      "Keep project setup as the next optional action.",
                    ],
                    insightIds: insights.map((insight) => insight.id),
                    discussion: [
                      {
                        id: "example-user",
                        author: "You",
                        role: "user",
                        body: "Can we keep the example simple on mobile?",
                      },
                      {
                        id: "example-assistant",
                        author: "VibeScroll",
                        role: "assistant",
                        body: "Yes. Start with one post, its insights and a clear next step.",
                      },
                    ],
                    acceptanceCriteria: [
                      "The example works on desktop and mobile.",
                      "Keep account, credit and authorization behavior unchanged.",
                    ],
                  },
                  {
                    id: "synthetic-marketing-plan",
                    title: "Keep the first promise clear",
                    projectId: "synthetic-marketing",
                    projectName: "Marketing",
                    version: 1,
                    review: "unreviewed",
                    disposition: "relevant",
                    proposedChange:
                      "Explain the first useful result with one short example.",
                    acceptanceCriteria: ["One visible primary action."],
                  },
                ]
              : [],
        } satisfies FeedDetail,
      ];
    },
  ),
);
export const feedDemoPage: FeedPage = {
  items: Object.values(feedDemoDetails).map((detail, index) => ({
    id: detail.id as FeedPage["items"][number]["id"],
    title: detail.title,
    authorName: detail.authorName,
    kind: "url",
    state: "ready",
    generation: 1,
    createdAt: 2 - index,
    metadataUpdatedAt: 1,
    thumbnailAssetIds: [],
  })),
  next: null,
};
