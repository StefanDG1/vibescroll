"use client";

import {
  useId,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { ArrowRight, FileText, Link2, Video } from "lucide-react";
import type { PostSummaryV1 } from "../../../packages/contracts/post-summary";
import { sourceCoverageLabel } from "@/lib/library-sources";

export type HomePostCardProps = {
  summary: PostSummaryV1;
  href: string;
  onOpen?: (sourceId: string) => void;
  /** Noninteractive image content resolved through the authorized asset route. */
  thumbnailNode?: ReactNode;
};

export function HomePostCard(props: HomePostCardProps) {
  const { summary, href } = props;
  // Scope/access changes are owned by the parent. Content changes also discard
  // expansion synchronously, including legacy rows without a content revision.
  const identity = JSON.stringify([
    href,
    summary.sourceId,
    summary.generation,
    summary.contentRevision,
    summary.insightPreview,
  ]);
  return <HomePostCardContent key={identity} {...props} />;
}

function HomePostCardContent({
  summary,
  href,
  onOpen,
  thumbnailNode,
}: HomePostCardProps) {
  const [expanded, setExpanded] = useState(false);
  const bodyRef = useRef<HTMLButtonElement>(null);
  const previewId = useId();
  const title = summary.title || "Untitled post";
  const previews = summary.insightPreview.slice(0, 3);
  const status = summary.progress.active
    ? (summary.progress.stage ?? summary.progress.state).replaceAll("_", " ")
    : {
        saved: "Saved",
        needs_upload: "Upload needed",
        queued: "Queued",
        processing: "Processing",
        ready: "Insights ready",
        failed: "Analysis failed",
      }[summary.progress.state];
  const open = () => {
    if (onOpen) onOpen(summary.sourceId);
    else window.location.assign(href);
  };
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
      <button
        ref={bodyRef}
        type="button"
        className="home-post-card-body"
        aria-expanded={expanded}
        aria-controls={previewId}
        aria-label={`${expanded ? "Open analysis for" : "Preview"} ${title}`}
        onClick={(event) => {
          const selection = window.getSelection();
          if (
            selection?.isCollapsed === false &&
            event.currentTarget.contains(selection.anchorNode)
          )
            return;
          if (expanded) open();
          else setExpanded(true);
        }}
      >
        <strong>{title}</strong>
        <span className="home-post-card-meta">
          <span>
            {summary.sourceKind?.replaceAll("_", " ") ?? "Source type unknown"}
          </span>
          <span>{status}</span>
          <span>
            {summary.insightCount === null
              ? "Insight count unavailable"
              : `${summary.insightCount} ${summary.insightCount === 1 ? "insight" : "insights"}`}
          </span>
        </span>
        <span className="home-post-card-hint">
          {expanded ? "Open analysis" : "Preview insights"}
        </span>
      </button>
      <a
        className="home-post-card-open"
        href={href}
        onClick={openLink}
        aria-label={`Open analysis for ${title}`}
      >
        <ArrowRight size={19} aria-hidden="true" />
      </a>
      <div id={previewId} className="home-post-card-preview" hidden={!expanded}>
        {expanded && (
          <>
            <p className="home-post-card-coverage">
              {sourceCoverageLabel(summary.coverage)}
            </p>
            <a
              className="home-post-card-preview-link"
              href={href}
              onClick={openLink}
            >
              {previews.length > 0 ? (
                <ul>
                  {previews.map((insight) => (
                    <li key={insight.insightId}>
                      <strong>{insight.title}</strong>
                      {insight.claimExcerpt && <p>{insight.claimExcerpt}</p>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No insight preview available.</p>
              )}
              <span className="home-post-card-hint">
                {summary.insightPreviewTruncated ? "Partial preview. " : ""}
                Open analysis <ArrowRight size={16} aria-hidden="true" />
              </span>
            </a>
            <button
              className="home-post-card-collapse"
              type="button"
              onClick={() => {
                setExpanded(false);
                bodyRef.current?.focus();
              }}
            >
              Collapse
            </button>
          </>
        )}
      </div>
    </article>
  );
}
