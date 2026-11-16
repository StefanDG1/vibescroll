"use client";
import Link from "next/link";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Search, X } from "lucide-react";
import { FeedPostCard, type FeedCardPost } from "./home-feed-post";
import { FeedTour } from "./feed-tour";
import { ErrorState } from "./assistant-elements/error-state";
import { LibrarySkeleton } from "./library-skeleton";
import { matchesStarter } from "../../../packages/onboarding/discovery";
import { rankOnboardingPosts } from "../../../packages/onboarding/flow";
import type { OnboardingDraft } from "../../../packages/onboarding/journey";
import type { FeedDetail } from "@/lib/home-feed";
import { track } from "@/lib/analytics";
import styles from "./onboarding.module.css";
export type StarterPost = {
  familyId: string;
  title: string;
  authorName: string | null;
  canonical: string;
  interests: string[];
  insightCount: number;
  thumbnailFrameId: string | null;
};
type StarterDetail = {
  familyId: string;
  title: string;
  authorName: string | null;
  canonical: string;
  interests: string[];
  frames: { id: string; timestampMs: number }[];
  analysis: {
    summary: string;
    insights: {
      id: string;
      title: string;
      claim: string;
      evidence?: { id: string; kind: string }[];
    }[];
  };
};
export const starterFrame = (
  familyId: string,
  frameId: string,
  thumbnail = false,
) =>
  `/api/onboarding/starter?familyId=${encodeURIComponent(familyId)}&frameId=${encodeURIComponent(frameId)}${thumbnail ? "&thumbnail=1" : ""}`;
function card(post: StarterPost): FeedCardPost {
  return {
    id: post.familyId,
    title: post.title,
    authorName: post.authorName,
    kind: "url",
    thumbnailAssetIds: post.thumbnailFrameId ? [post.thumbnailFrameId] : [],
  };
}

/** Shares Home's view; guest data and actions never use authenticated source APIs. */
export function OnboardingStarterFeed({
  draft,
  onSelected,
  onContinue,
  onBack,
  onLink,
}: {
  draft: Partial<OnboardingDraft>;
  onSelected: (id: string) => void;
  onContinue: () => void;
  onBack: () => void;
  onLink: (value: string) => void;
}) {
  const [posts, setPosts] = useState<StarterPost[]>([]);
  const [detail, setDetail] = useState<StarterDetail>();
  const [loadedKey, setLoadedKey] = useState("");
  const [error, setError] = useState("");
  const [revision, retry] = useState(0);
  const [query, setQuery] = useState(draft.pendingUrl ?? "");
  const field = useRef<HTMLInputElement>(null);
  const selected = useRef(draft.selectedFamilyId);
  const selectPost = useEffectEvent(onSelected);
  const interests = (draft.interests ?? []).join(",");
  const goal = draft.goal;
  const loadKey = `${interests}:${goal}:${revision}`;
  const loading = loadedKey !== loadKey;
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const response = await fetch(
          `/api/onboarding/starter?interests=${interests}`,
          { signal: controller.signal },
        );
        if (!response.ok)
          throw Error("The ready posts could not be loaded. Try again.");
        const items = rankOnboardingPosts<StarterPost>(await response.json(), {
          interests: interests
            .split(",")
            .filter(Boolean) as OnboardingDraft["interests"],
          goal,
        });
        if (controller.signal.aborted) return;
        setPosts(items);
        const first =
          items.find((post) => post.familyId === selected.current) ?? items[0];
        if (!first) return;
        const result = await fetch("/api/onboarding/starter", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ familyId: first.familyId }),
          signal: controller.signal,
        });
        const value = await result.json();
        if (!result.ok)
          throw Error(value.error || "This preview is unavailable.");
        if (controller.signal.aborted) return;
        setDetail(value);
        selected.current = value.familyId;
        selectPost(value.familyId);
        track("onboarding_result_viewed", { route: "cached" });
      } catch (e) {
        if (!controller.signal.aborted)
          setError(
            e instanceof Error
              ? e.message
              : "This preview could not be loaded.",
          );
      } finally {
        if (!controller.signal.aborted)
          setLoadedKey(`${interests}:${goal}:${revision}`);
      }
    })();
    return () => controller.abort();
  }, [interests, goal, revision]);
  const link = /^https?:\/\//i.test(query.trim());
  const visible = posts.filter((post) => !link && matchesStarter(post, query));
  const previewPost = visible.find(
    (post) => post.familyId === detail?.familyId,
  );
  const otherPosts = visible.filter(
    (post) => post.familyId !== detail?.familyId,
  );
  const clearSearch = () => {
    setQuery("");
    field.current?.focus();
  };
  const retryPreview = () => {
    setError("");
    retry((value) => value + 1);
    field.current?.focus();
  };
  const evidence = detail && detail.frames.length > 0 && (
    <details className={styles.previewEvidence}>
      <summary>Source screenshots ({detail.frames.length})</summary>
      <div className={styles.frameGrid}>
        {detail.frames.map((frame) => (
          <a
            key={frame.id}
            href={starterFrame(detail.familyId, frame.id)}
            target="_blank"
            rel="noreferrer"
          >
            Screenshot at {(frame.timestampMs / 1000).toFixed(1)}s
          </a>
        ))}
      </div>
    </details>
  );
  return (
    <section className={styles.sharedFeed} data-onboarding-stage="feed">
      <div className={styles.previewToolbar}>
        <button type="button" className={styles.secondary} onClick={onBack}>
          <ArrowLeft size={17} aria-hidden="true" /> Answers
        </button>
        <label className={styles.searchBox}>
          <Search size={18} />
          <input
            ref={field}
            type="search"
            aria-label="Search ready posts or paste a link"
            placeholder="Search posts or paste your own link"
            value={query}
            onChange={(event) => setQuery(event.target.value.slice(0, 2048))}
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={clearSearch}
            >
              <X size={16} />
            </button>
          )}
        </label>
        <FeedTour discovery />
        {!link && !previewPost && (
          <button type="button" className={styles.primary} onClick={onContinue}>
            Continue <ArrowRight size={16} aria-hidden="true" />
          </button>
        )}
      </div>
      <p className={styles.previewHint}>
        Explore one full example or paste a link you want to save.
      </p>

      {error && (
        <ErrorState
          title="Could not open the preview"
          detail={error}
          onRetry={retryPreview}
        />
      )}
      {loading && !link && (
        <div className={styles.previewLoading}>
          <LibrarySkeleton rows={3} kind="posts" />
        </div>
      )}
      {link ? (
        <div className={styles.empty}>
          <h2>Start with your link.</h2>
          <p className={styles.subtle}>
            Keep this link through setup. Fresh analysis is quoted after Pro.
          </p>
          <button
            type="button"
            className={styles.primary}
            onClick={() => onLink(query)}
          >
            Continue with this link <ArrowRight size={16} />
          </button>
        </div>
      ) : !loading && !error && !visible.length ? (
        <div className={styles.empty}>
          <h2>No ready posts found.</h2>
          <p className={styles.subtle}>
            {query
              ? "Try searching for another topic."
              : "You can still explore an example or paste your own link."}
          </p>
          {query && (
            <button
              type="button"
              className={styles.secondary}
              onClick={clearSearch}
            >
              Clear search
            </button>
          )}
          {!query && (
            <Link href="/example" className={styles.secondary}>
              Explore the example
            </Link>
          )}
        </div>
      ) : null}
      {previewPost && detail && (
        <FeedPostCard
          key={previewPost.familyId}
          post={card(previewPost)}
          detail={
            {
              id: detail.familyId,
              generation: 0,
              title: detail.title,
              authorName: detail.authorName,
              url: detail.canonical,
              summary: detail.analysis.summary,
              categoryKeys: detail.interests,
              thumbnailAssetIds: previewPost.thumbnailFrameId
                ? [previewPost.thumbnailFrameId]
                : [],
              analysisVersionId: null,
              insights: detail.analysis.insights.map((insight) => {
                const frame = detail.frames.find((item) =>
                  insight.evidence?.some((reference) => reference.id === item.id),
                );
                return {
                  ...insight,
                  frame: frame
                    ? { id: frame.id, timeMs: frame.timestampMs }
                    : undefined,
                };
              }),
              proposals: [],
              suggestions: { versionId: null, items: [] },
              projects: [],
            } satisfies FeedDetail
          }
          active
          demo={false}
          readOnly
          mode="browse"
          organizationId=""
          base="/onboarding"
          onReaction={() => {}}
          call={async () => {
            throw Error("Continue setup to use this action.");
          }}
          onVisible={() => {}}
          onRetry={retryPreview}
          showTour={false}
          endLabel="More posts are available after setup"
          preview={{
            onContinue,
            evidence,
            projectName: draft.projectDescription,
            resolveThumbnail: (frameId, familyId) =>
              starterFrame(familyId ?? previewPost.familyId, frameId, true),
            resolveEvidenceFrame: (frameId) =>
              starterFrame(previewPost.familyId, frameId),
          }}
        />
      )}
      {!loading && otherPosts.length > 0 && (
        <section
          className={styles.starterMetadata}
          aria-labelledby="starter-more-posts"
        >
          <h2 id="starter-more-posts">More posts</h2>
          <p className={styles.subtle}>Open more full posts after setup.</p>
          <ul>
            {otherPosts.map((post) => (
              <li key={post.familyId}>
                <strong>{post.title}</strong>
                <span>
                  {post.authorName && `${post.authorName} · `}
                  {post.insightCount}{" "}
                  {post.insightCount === 1 ? "insight" : "insights"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}
