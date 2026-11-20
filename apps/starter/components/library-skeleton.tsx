"use client";
import Skeleton, { SkeletonTheme } from "react-loading-skeleton";
import { useInterfaceMotion } from "./motion-preference";
export function LibrarySkeleton({
  kind = "insights",
  rows = 5,
}: {
  kind?: "topics" | "insights" | "proposals" | "posts" | "page";
  rows?: number;
}) {
  const animate = useInterfaceMotion();
  const postRow = kind === "posts";
  return (
    <output
      className={`library-skeleton library-skeleton-${kind}`}
      aria-busy="true"
    >
      <span className="sr-only">
        {kind === "topics"
          ? "Loading topics"
          : kind === "proposals"
            ? "Checking proposals"
            : kind === "posts"
              ? "Loading posts"
              : kind === "page"
                ? "Loading page"
                : "Loading insights"}
      </span>
      <SkeletonTheme
        baseColor="var(--line)"
        highlightColor="var(--panel)"
        enableAnimation={animate}
        duration={1.6}
      >
        <span aria-hidden="true">
          {Array.from({ length: rows }, (_, i) => (
            <span className="library-skeleton-row" key={i}>
              <Skeleton
                width={postRow ? "100%" : 36}
                height={postRow ? 74 : 36}
                borderRadius={postRow ? 7 : 10}
              />
              <span>
                <Skeleton width="78%" />
                <Skeleton width="52%" height={11} />
                {postRow && <Skeleton width="68%" height={11} />}
              </span>
            </span>
          ))}
        </span>
      </SkeletonTheme>
    </output>
  );
}
