import { projectCategoryMatches } from "../../../packages/contracts/project-application";
import { projectTopicFit } from "../../../packages/contracts/project-fit";

export type ProjectSuggestions = {
  versionId: string | null;
  rubric?: string;
  fingerprint?: string;
  items: {
    id: string;
    name: string;
    topics: string[];
    fit: TopicFit;
    priority?: ProjectPriority;
    priorityRevision?: number;
    history?: ProjectHistory;
  }[];
};
export type ProjectPriority = "low" | "normal" | "high";
export type ProjectHistory = {
  samePost: {
    id: string;
    title: string;
    version: number;
    review: string;
    current: boolean;
    outcome?: {
      githubIssueState: "open" | "closed" | "unknown" | null;
      githubObservedAt: number | null;
      issuePublicationConfirmed: boolean;
      modelReportedStatus: "completed" | "blocked" | "failed" | null;
      measuredBenefit: null;
    };
  }[];
  samePostLimited: boolean;
  relatedPosts: number;
  relatedAccepted: number;
  relatedRejected: number;
  lastPlanActivityAt: number | null;
  measuredOutcomes: null;
};
export type TopicFit = {
  rubric: "topic-coverage-v1";
  matched: number;
  total: number;
  criteria: { category: string; matched: boolean; terms: string[] }[];
};
type Source = {
  categoryKeys?: string[];
  analysisVersion?: { id?: string };
  analysis?: {
    insights?: { title?: string; claim?: string; categories?: string[] }[];
  };
  summary?: string;
};
type Project = {
  _id: string;
  fullName: string;
  enabled: boolean;
  confirmed: boolean;
  status?: string;
  profile?: string;
};
const categories = [
  "coding",
  "ai",
  "video_editing",
  "sales",
  "business_operations",
  "marketing",
  "product_design",
];

// Sync timestamps are not user activity or priority. Do not invent those signals.
export function postTopics(source: Source): string[] {
  const insights = source.analysis?.insights ?? [];
  const explicit = [
    ...new Set([
      ...(source.categoryKeys ?? []),
      ...insights.flatMap((i) => i.categories ?? []),
    ]),
  ];
  return explicit.length
    ? explicit
    : projectCategoryMatches(
        categories,
        [
          source.summary ?? "",
          ...insights.map((i) => `${i.title ?? ""} ${i.claim ?? ""}`),
        ].join(" "),
      ).map((m) => m.category);
}

export function suggestProjects(
  source: Source,
  projects: Project[],
): ProjectSuggestions {
  const topics = postTopics(source);
  const items = projects
    .filter((p) => p.enabled && p.confirmed && p.status === "connected")
    .map((p) => {
      const fit = projectTopicFit(topics, p.profile ?? "");
      return {
        id: p._id,
        name: p.fullName,
        topics: fit.criteria.filter((c) => c.matched).map((c) => c.category),
        fit,
        score: fit.matched,
      };
    })
    .filter((p) => p.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.name.localeCompare(b.name) ||
        a.id.localeCompare(b.id),
    )
    .slice(0, 3)
    .map(({ score: _score, ...p }) => p);
  return { versionId: source.analysisVersion?.id ?? null, items };
}
