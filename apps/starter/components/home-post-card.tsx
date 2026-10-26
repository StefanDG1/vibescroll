"use client";

import { type MouseEvent, type ReactNode } from "react";
import { ArrowRight, FileText, Link2, Video } from "lucide-react";
import type { PostSummaryV1 } from "../../../packages/contracts/post-summary";
const platformLabels: Record<string, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  vimeo: "Vimeo",
};

export type HomePostCardProps = {
  summary: PostSummaryV1;
  href: string;
  onOpen?: (sourceId: string) => void;
  /** Noninteractive image content resolved through the authorized asset route. */
  thumbnailNode?: ReactNode;
  progressTime?: number;
};

export function HomePostCard({
  summary,
  href,
  onOpen,
  thumbnailNode,
  progressTime,
}: HomePostCardProps) {
  const title = summary.title || "Untitled post";
  const intentNeedsReview =
    summary.progress.executor === "work_cloud" &&
    summary.progress.executionState === null &&
    summary.progress.stage === "preflight" &&
    progressTime !== undefined &&
    summary.progress.activeUntil !== null &&
    summary.progress.activeUntil <= progressTime;
  const status = intentNeedsReview
    ? "Review Cloud setup"
    : summary.progress.active
      ? summary.progress.executor === "work_cloud" &&
        summary.progress.executionState === null &&
        summary.progress.stage === "preflight"
        ? "Waiting for ChatGPT"
        : (summary.progress.stage ?? summary.progress.state).replaceAll(
            "_",
            " ",
          )
      : {
          saved: "Saved",
          needs_upload: "Upload needed",
          queued: "Queued",
          processing: "Processing",
          ready: "Insights ready",
          failed: "Analysis failed",
        }[summary.progress.state];
  const openLink = (event: MouseEvent<HTMLAnchorElement>) => {
    const selection = window.getSelection();
    if (
      event.button === 0 &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.shiftKey &&
      !event.altKey &&
      selection?.isCollapsed === false &&
      event.currentTarget.contains(selection.anchorNode)
    ) {
      event.preventDefault();
      return;
    }
    if (
      onOpen &&
      !event.defaultPrevented &&
      event.button === 0 &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.shiftKey &&
      !event.altKey
    ) {
      event.preventDefault();
      onOpen(summary.sourceId);
    }
  };
  const ThumbnailIcon =
    summary.sourceKind === "text"
      ? FileText
      : summary.sourceKind === "upload"
        ? Video
        : Link2;

  return (
    <article className="home-post-card" aria-label={title}>
      <a
        className="home-post-card-thumbnail"
        href={href}
        onClick={openLink}
        aria-label={`Open analysis for ${title}`}
      >
        <span className="home-post-card-image" aria-hidden="true">
          {summary.thumbnail && thumbnailNode ? (
            thumbnailNode
          ) : (
            <ThumbnailIcon size={24} strokeWidth={1.5} />
          )}
        </span>
      </a>
      <a
        className="home-post-card-body"
        href={href}
        aria-label={`Open analysis for ${title}`}
        onClick={openLink}
      >
        <strong>{title}</strong>
        <span className="home-post-card-meta">
          {summary.authorName && <span>{summary.authorName}</span>}
          <span>
            {summary.platform
              ? (platformLabels[summary.platform] ?? summary.platform)
              : summary.sourceKind === "url"
                ? "Link"
                : (summary.sourceKind?.replaceAll("_", " ") ??
                  "Source type unknown")}
          </span>
          <span>{status}</span>
          <span>
            {summary.insightCount === null
              ? "Insight count unavailable"
              : `${summary.insightCount} ${summary.insightCount === 1 ? "insight" : "insights"}`}
          </span>
        </span>
        <span className="home-post-card-hint">Open post</span>
      </a>
      <a
        className="home-post-card-open"
        href={href}
        onClick={openLink}
        aria-label={`Open analysis for ${title}`}
      >
        <ArrowRight size={19} aria-hidden="true" />
      </a>
    </article>
  );
}
