import type { FunctionReturnType } from "convex/server";
import type { api } from "../../../convex/_generated/api";
import type { ProjectSuggestions } from "./project-suggestions";

export type FeedPage = FunctionReturnType<typeof api.posts.recent>;
export type FeedPost = FeedPage["items"][number];
export type FeedInsight = {
  id: string;
  title?: string;
  claim: string;
  icon?: string;
  categories?: string[];
};
export type FeedProposal = {
  id: string;
  title: string;
  projectId: string;
  projectName: string;
  version: number;
  review: string;
  disposition: string;
  currentProblem?: string;
  proposedChange?: string;
  steps?: string[];
  insightIds?: string[];
  discussion?: {
    id: string;
    author: string;
    body: string;
    role: "user" | "assistant";
  }[];
  acceptanceCriteria: string[];
};
export type FeedEngagement = {
  scopeKey: string;
  likes: number;
  shares: number;
  liked: boolean;
  revision: number;
};
export type FeedDetail = {
  id: string;
  generation: number;
  title: string;
  authorName: string | null;
  url: string | null;
  summary: string;
  categoryKeys: string[];
  thumbnailAssetIds: string[];
  analysisVersionId: string | null;
  insights: FeedInsight[];
  proposals: FeedProposal[];
  suggestions: ProjectSuggestions;
  projects: { id: string; name: string }[];
  durationMs?: number | null;
  engagement?: FeedEngagement;
};

/** Keep first-seen ordering when cursor pages overlap. A later page can refresh metadata. */
export function mergeFeedPage(current: FeedPost[], incoming: FeedPost[]) {
  const merged = new Map(current.map((post) => [post.id, post]));
  for (const post of incoming) merged.set(post.id, post);
  return [...merged.values()];
}

/** Only an active post and its immediate neighbors may hold full analysis in memory. */
export function feedNeighbors(posts: FeedPost[], activeId: string | null) {
  const index = Math.max(
    0,
    posts.findIndex((post) => post.id === activeId),
  );
  return posts.slice(Math.max(0, index - 1), index + 2).map((post) => post.id);
}

export function sourceReadKey(source: {
  generation: number;
  selectedAnalysisVersionId?: string | null;
  analysisSelectionRevision?: number;
  updatedAt?: number;
}) {
  return JSON.stringify([
    source.generation,
    source.selectedAnalysisVersionId ?? null,
    source.analysisSelectionRevision ?? 0,
    source.updatedAt ?? 0,
  ]);
}

export function projectLabel(name: string) {
  const label = name.split("/").at(-1) ?? name;
  return label.toLowerCase() === "vibescroll" ? "VibeScroll" : label;
}
