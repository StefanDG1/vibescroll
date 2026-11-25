import type { FunctionReturnType } from "convex/server";
import type { api } from "../../../convex/_generated/api";
import type { ProjectSuggestions } from "./project-suggestions";
import { defaultVocabulary } from "../../../packages/categories";
import {
  cloudCitationForDisplay,
  sourceEvidenceFrames,
} from "../../../packages/media/cloud-frames";

export type FeedPage = FunctionReturnType<typeof api.posts.recent>;
export type FeedPost = FeedPage["items"][number];
export type FeedInsight = {
  id: string;
  title?: string;
  claim: string;
  icon?: string;
  categories?: string[];
  frame?: { id: string; timeMs: number };
  hasTranscript?: boolean;
  resources?: { url: string; name: string }[];
};
export type HomeMode = "review" | "browse" | "snap";

export function postTopicName(key: string) {
  const known = defaultVocabulary.find((category) => category.key === key);
  if (known) return known.name;
  const readable = key.replaceAll("_", " ");
  return readable.charAt(0).toUpperCase() + readable.slice(1);
}

export function feedInsightEvidence(
  source: Parameters<typeof sourceEvidenceFrames>[0],
  evidence: {
    id: string;
    kind: string;
    startMs?: number | null;
    canonicalUrl?: string | null;
    originalUrl?: string | null;
    path?: string;
  }[] = [],
  now = Date.now(),
): Pick<FeedInsight, "frame" | "hasTranscript" | "resources"> {
  const frames: { id: string; startMs: number }[] = sourceEvidenceFrames(
    source,
    now,
  );
  const citations = evidence
    .filter((reference) => reference && typeof reference.id === "string")
    .map((reference) => cloudCitationForDisplay(source, reference, now));
  const frame = citations
    .filter((reference) => reference.kind === "frame")
    .map((reference) =>
      frames.find((candidate) => candidate.id === reference.id),
    )
    .find(Boolean);
  const resources = new Map<string, { url: string; name: string }>();
  for (const reference of citations) {
    const href = reference.canonicalUrl ?? reference.originalUrl;
    if (!href) continue;
    try {
      const url = new URL(href);
      if (url.protocol === "https:" && !url.username && !url.password)
        resources.set(url.href, {
          url: url.href,
          name: reference.path ?? url.hostname,
        });
    } catch {
      // Some older evidence records lack a usable link.
    }
  }
  return {
    frame: frame ? { id: frame.id, timeMs: frame.startMs } : undefined,
    hasTranscript: citations.some(
      (reference) => reference.kind === "transcript",
    ),
    resources: [...resources.values()].slice(0, 4),
  };
}
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
  /** Compatibility field for distinct link requesters, never outbound shares. */
  shares: number;
  liked: boolean;
  revision: number;
};
export type PostSlide = {
  id: string;
  index: number;
  kind: "image" | "video";
  portrait?: boolean;
};

export function orderedFeedMedia(
  source: Parameters<typeof sourceEvidenceFrames>[0],
) {
  const slides = new Map<number, PostSlide>();
  for (const frame of sourceEvidenceFrames(source)) {
    if (
      (frame.mediaKind === "image" || frame.mediaKind === "video") &&
      Number.isSafeInteger(frame.sourceAssetIndex) &&
      !slides.has(frame.sourceAssetIndex)
    ) {
      const asset =
        source.preparedService?.post?.assets?.[frame.sourceAssetIndex];
      slides.set(frame.sourceAssetIndex, {
        id: frame.id,
        index: frame.sourceAssetIndex,
        kind: frame.mediaKind,
        ...(asset?.height > asset?.width ? { portrait: true } : {}),
      });
    }
  }
  return [...slides.values()].sort((a, b) => a.index - b.index);
}

export type FeedDetail = {
  id: string;
  generation: number;
  title: string;
  authorName: string | null;
  creatorKey?: string;
  originalLinks?: string[];
  caption?: string;
  slides?: PostSlide[];
  url: string | null;
  summary: string;
  categoryKeys: string[];
  thumbnailAssetIds: string[];
  analysisVersionId: string | null;
  insights: FeedInsight[];
  proposals: FeedProposal[];
  suggestions: ProjectSuggestions;
  projects: { id: string; name: string }[];
  allProjects?: { id: string; name: string }[];
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
