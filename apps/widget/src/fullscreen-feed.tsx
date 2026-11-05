import type { ReactNode } from "react";
/* eslint-disable next/no-img-element -- MCP media uses authorized in-memory JPEGs; website callers keep the injected Next image adapter. */
import { FeedPostCardCore } from "../../starter/components/home-feed-post-core";
import type { FeedDetail } from "../../starter/lib/home-feed";
import type { Source } from "./data";
import type { SourceMedia } from "./source-media";

/** The website and fullscreen host render the same source/insight/plan scene. */
export function FullscreenFeed({
  posts,
  active,
  nextPage,
  onVisible,
  onOpen,
  projectPanel,
  evidence,
  status,
  media,
}: {
  posts: Source[];
  active: Source | null;
  nextPage: boolean;
  onVisible: (post: Source) => void;
  onOpen: (url: string) => void;
  projectPanel: ReactNode;
  evidence: ReactNode;
  status?: ReactNode;
  media?: SourceMedia | null;
}) {
  return (
    <div className="widget-shared-feed">
      {posts.map((post, index) => {
        const current = active?.id === post.id ? active : undefined;
        const currentMedia =
          current &&
          media?.sourceId === current.id &&
          media.analysisVersionId === current.analysisVersionId
            ? media
            : null;
        const metadata = {
          id: post.id,
          title: post.title,
          authorName: currentMedia?.authorName ?? null,
          kind: post.kind ?? "link",
          thumbnailAssetIds: [],
        };
        const detail: FeedDetail | undefined = current
          ? {
              id: current.id,
              generation: current.generation,
              title: current.title,
              authorName: currentMedia?.authorName ?? null,
              url: null,
              durationMs: currentMedia?.durationMs,
              summary: currentMedia?.summary ?? "",
              categoryKeys: [],
              thumbnailAssetIds: currentMedia?.image ? [currentMedia.key] : [],
              analysisVersionId: current.analysisVersionId ?? null,
              insights: current.insights,
              proposals: [],
              suggestions: {
                versionId: current.analysisVersionId ?? null,
                items: [],
              },
              projects: [],
            }
          : undefined;
        const next = posts[index + 1];
        return (
          <FeedPostCardCore
            key={post.id}
            post={metadata}
            detail={detail}
            active={!!current}
            demo={false}
            readOnly
            onReaction={() => {}}
            organizationId=""
            call={async () => {
              throw Error("This action is unavailable in this read view.");
            }}
            base={post.url.split("/posts/")[0].split("/library/")[0]}
            onVisible={() => onVisible(post)}
            onRetry={() => onVisible(post)}
            nextPost={
              next
                ? {
                    id: next.id,
                    title: next.title,
                    authorName: null,
                    kind: next.kind ?? "link",
                    thumbnailAssetIds: [],
                  }
                : undefined
            }
            endLabel={
              nextPage
                ? "More saved posts are available"
                : "End of this bounded page"
            }
            showTour={false}
            showPlayControl={false}
            renderThumbnail={({ candidates }) =>
              currentMedia?.image && candidates.includes(currentMedia.key) ? (
                <RetainedPoster src={currentMedia.image} />
              ) : undefined
            }
            observedState={current ? status : undefined}
            onNavigate={onOpen}
            evidence={evidence}
            projectPanel={
              current ? (
                projectPanel
              ) : (
                <p className="fine">
                  Project actions load with the selected post.
                </p>
              )
            }
          />
        );
      })}
    </div>
  );
}
function RetainedPoster({ src }: { src: string }) {
  return (
    <span className="source-thumb">
      <img
        className="source-preview ready"
        src={src}
        alt="Retained evidence frame"
        loading="lazy"
      />
    </span>
  );
}
