"use client";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Search, X } from "lucide-react";
import { FeedPostCard, type FeedCardPost } from "./home-feed-post";
import { FeedTour } from "./feed-tour";
import { ErrorState } from "./assistant-elements/error-state";
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
    insights: { id: string; title: string; claim: string }[];
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
  const [active, setActive] = useState<string>();
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
        setActive(first.familyId);
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
  const evidence = detail && (
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
  );
  return (
    <section className={styles.sharedFeed} data-onboarding-stage="feed">
      <div className={styles.previewToolbar}>
        <button type="button" className={styles.secondary} onClick={onBack}>
          <ArrowLeft size={17} /> Your answers
        </button>
        <label className={styles.searchBox}>
          <Search size={18} />
          <input
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
              onClick={() => setQuery("")}
            >
              <X size={16} />
            </button>
          )}
        </label>
        <FeedTour discovery />
        <button type="button" className={styles.primary} onClick={onContinue}>
          Continue <ArrowRight size={16} />
        </button>
      </div>
      <p className={styles.previewHint}>
        An insight is a useful takeaway from a post. Expand one, then see how it
        could help your project.
      </p>

      {error && (
        <ErrorState
          title="Your preview needs another look"
          detail={error}
          onRetry={() => (setError(""), retry((value) => value + 1))}
          action={
            <button type="button" onClick={onContinue}>
              Continue setup
            </button>
          }
        />
      )}
      {loading && !posts.length && (
        <output className={styles.previewLoading} aria-live="polite">
          Opening a ready post…
        </output>
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
      ) : !loading && !visible.length ? (
        <div className={styles.empty}>
          <h2>No ready posts found.</h2>
          <p>
            Try another topic, clear the search or continue with your own link.
          </p>
          <button
            type="button"
            className={styles.secondary}
            onClick={() => setQuery("")}
          >
            Clear search
          </button>
        </div>
      ) : (
        visible.map((post, index) => {
          const full = detail?.familyId === post.familyId ? detail : undefined;
          const value: FeedDetail | undefined = full
            ? {
                id: full.familyId,
                generation: 0,
                title: full.title,
                authorName: full.authorName,
                url: full.canonical,
                summary: full.analysis.summary,
                categoryKeys: full.interests,
                thumbnailAssetIds: post.thumbnailFrameId
                  ? [post.thumbnailFrameId]
                  : [],
                analysisVersionId: null,
                insights: full.analysis.insights,
                proposals: [],
                suggestions: { versionId: null, items: [] },
                projects: [],
              }
            : undefined;
          return (
            <FeedPostCard
              key={post.familyId}
              post={card(post)}
              detail={value}
              active={active === post.familyId}
              demo={false}
              readOnly
              organizationId=""
              base="/onboarding"
              onReaction={() => {}}
              call={async () => {
                throw Error("Continue setup to use this action.");
              }}
              onVisible={() => setActive(post.familyId)}
              onRetry={() => (setError(""), retry((value) => value + 1))}
              nextPost={
                visible[index + 1] ? card(visible[index + 1]) : undefined
              }
              preview={{
                onContinue,
                evidence: full ? evidence : undefined,
                projectName: draft.projectDescription,
                resolveThumbnail: (frameId, familyId) =>
                  starterFrame(familyId ?? post.familyId, frameId, true),
              }}
            />
          );
        })
      )}
      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={onContinue}>
          Make my saved posts useful <ArrowRight size={16} />
        </button>
      </div>
    </section>
  );
}
