import type { ToolRecord } from "../../../packages/widget/contracts";
const profile = "demo-private-workspace";
export const demoCardPayload = {
  route: { view: "insight", profileId: profile, sourceId: "sample-onboarding" },
};
const sources = [
  [
    "sample-onboarding",
    "Designing a useful first experience",
    "Let people try the useful part first",
    "Show a useful result before asking people to connect every part of their workflow.",
  ],
  [
    "sample-evidence",
    "Building tools people trust",
    "Keep the evidence next to the idea",
    "A claim is easier to assess when its original source and context are close by.",
  ],
  [
    "sample-actions",
    "From saved content to useful work",
    "Give every insight a clear next step",
    "Let the next action follow from the insight and its evidence.",
  ],
].map(([id, title, insightTitle, claim], index) => ({
  id,
  title,
  state: "ready",
  kind: "youtube",
  generation: 1,
  revision: 100 + index,
  url: `https://scroll.companynerve.com/app/${profile}/library/${id}`,
  insights: [
    {
      id: `idea-${index}`,
      fetch_id: `${id}~0`,
      title: insightTitle,
      claim,
      reference: {
        sourceId: id,
        generation: 1,
        revision: 100 + index,
        insightId: `idea-${index}`,
        analysisVersionId: `demo-analysis-version-${index}`,
      },
      evidence: [{ kind: "speech", startMs: 102000, endMs: 138000 }],
    },
  ],
}));
const links = Object.fromEntries(
  ["home", "connections", "projects", "usage", "privacy", "account"].map(
    (key) => [
      key,
      `https://scroll.companynerve.com/app/${profile}/${key === "home" ? "" : key}`,
    ],
  ),
);
export async function demoCall(
  name: string,
  args: ToolRecord,
): Promise<ToolRecord> {
  if (name === "get_project_application_context")
    return {
      contextHash: "c".repeat(64),
      source: { analysisVersionId: args.analysisVersionId },
    };
  if (name === "save_project_proposal")
    return {
      proposalId: "demo-planning-proposal",
      version: 1,
      creditsSpent: 0,
      analysisStarted: false,
      codingAuthorized: false,
    };
  if (name === "get_project_proposal")
    return { proposalId: "demo-planning-proposal", version: 1 };
  if (name === "get_profile" || name === "widget_profiles")
    return {
      profiles: [
        {
          profile_id: profile,
          name: "Sample personal workspace",
          grant_version: 1,
          expires_at: null,
          projects: [
            {
              repository_id: "demo-project",
              name: "VibeScroll",
              context:
                "Turn saved knowledge into reviewed project improvements.",
              evaluations: [
                {
                  evaluation_id: "sample-evaluation",
                  evaluation_hash: "sample-hash",
                  disposition: "review_fit",
                  title: "Make the first insight useful before more setup",
                  summary:
                    "Offer an evidence-backed result before asking a new user to connect a repository.",
                },
              ],
            },
          ],
          automatic_analysis: true,
          cloud_request_policy: "explicit_per_source_v1",
        },
      ],
      next_cursor: null,
    };
  if (name === "widget_state")
    return {
      profile_id: profile,
      name: "Sample personal workspace",
      role: "owner",
      grant_version: 1,
      expires_at: null,
      scope: "all",
      automatic_analysis: true,
      cloud_request_policy: "explicit_per_source_v1",
      actions: {
        context: true,
        jobs: true,
        save: true,
        feedback: true,
        analysis: true,
        cloud: true,
        draft: true,
        events: true,
      },
      links,
      notice:
        "Illustrative data only. This preview makes no live VibeScroll requests.",
    };
  if (name === "widget_browse")
    return {
      profile_id: profile,
      grant_version: 1,
      items:
        args.kind === "topics"
          ? [
              {
                id: "sample-topic",
                name: "Product design",
                parent_id: null,
                version: 1,
                pinned: true,
              },
            ]
          : args.kind === "proposals"
            ? [
                {
                  id: "sample-proposal",
                  title: "Keep source evidence beside the first useful result",
                  version: 1,
                  state: "draft",
                  url: `${links.projects}?proposal=sample-proposal`,
                },
              ]
            : args.kind === "jobs"
              ? sources.map((source) => ({ ...source, status: "ready" }))
              : sources,
      next_cursor: null,
      next_offset: null,
      coverage:
        "Illustrative sample records. No production account or analysis is used.",
    };
  if (name === "widget_proposal")
    return {
      id: "sample-proposal",
      title: "Keep source evidence beside the first useful result",
      version: 1,
      state: "draft",
      body: "Why this fits\nThe selected source recommends letting people inspect a useful result before completing every setup step.\n\nProposed change\nShow the first insight and its evidence together. Offer project setup when the person is ready to apply the idea.\n\nReview needed\nConfirm the source, scope and current project context before planning implementation.",
      review_url: `${links.projects}?proposal=sample-proposal`,
    };
  if (name === "widget_topic")
    return {
      topic: { id: "sample-topic", name: "Product design" },
      items: sources,
      next_cursor: null,
    };
  if (name === "fetch") {
    const source =
      sources.find((item) => item.id === String(args.id).split("~")[0]) ??
      sources[0];
    return {
      id: args.id,
      title: source.title,
      url: source.url,
      profile_id: profile,
      grant_version: 1,
      text: JSON.stringify({
        state: source.state,
        coverage: "audio_only",
        insights: source.insights,
      }),
      more_ideas: false,
    };
  }
  if (name === "get_job_status")
    return {
      title:
        sources.find((source) => source.id === args.sourceId)?.title ??
        "Saved sample source",
      source_id: args.sourceId,
      status: "ready",
      generation: 1,
      revision: 100,
      grant_version: 1,
      processing: {
        executor: "work_cloud",
        state: "completed",
        stage: "completed",
      },
    };
  if (name === "save_link")
    return {
      source_id: "sample-onboarding",
      profile_id: profile,
      status: "saved",
      url: sources[0].url,
      note: "Illustrative save receipt. No real source was saved.",
    };
  if (name === "record_feedback")
    return {
      feedback_version: Number(args.expectedVersion) + 1,
      action: args.action,
      note: "Illustrative feedback only.",
    };
  if (name === "search")
    return {
      results: sources.flatMap((source) =>
        source.insights
          .filter((idea) =>
            `${idea.title} ${idea.claim} ${source.title}`
              .toLowerCase()
              .includes(String(args.query).toLowerCase()),
          )
          .map((idea) => ({
            id: idea.fetch_id,
            title: idea.title,
            excerpt: idea.claim,
            url: source.url,
            reference: idea.reference,
          })),
      ),
      next_cursor: null,
      next_offset: null,
      coverage: "Sample search only.",
    };
  throw new Error(
    "This action needs the connected plugin. The preview does not create live work.",
  );
}
