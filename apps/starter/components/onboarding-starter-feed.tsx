"use client";
import { useEffect, useRef, useState } from "react";
import { FeedPostCard, type FeedCardPost } from "./home-feed-post";
import { ErrorState } from "./assistant-elements/error-state";
import { LibrarySkeleton } from "./library-skeleton";
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
  onContinue,
  onSkip,
}: {
  draft: Partial<OnboardingDraft>;
  onContinue: (id: string) => void;
  onSkip: () => void;
}) {
  const [previewPost, setPreviewPost] = useState<StarterPost>();
  const [detail, setDetail] = useState<StarterDetail>();
  const [loadedKey, setLoadedKey] = useState("");
  const [error, setError] = useState("");
  const [revision, retry] = useState(0);
  const selected = useRef(draft.selectedFamilyId);
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
        const first =
          items.find((post) => post.familyId === selected.current) ?? items[0];
        const familyId =
          response.headers.get("x-vibescroll-preview") ?? first?.familyId;
        if (!familyId) {
          track("onboarding_failure", { step: "feed", reason: "no_example" });
          return;
        }
        const result = await fetch("/api/onboarding/starter", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ familyId }),
          signal: controller.signal,
        });
        const value = await result.json();
        if (!result.ok)
          throw Error(value.error || "This preview is unavailable.");
        if (controller.signal.aborted) return;
        setPreviewPost(
          items.find((item) => item.familyId === value.familyId) ?? {
            ...value,
            thumbnailFrameId: null,
            insightCount: value.analysis.insights.length,
          },
        );
        setDetail(value);
        selected.current = value.familyId;
        track("onboarding_result_viewed", { route: "cached" });
      } catch (e) {
        if (!controller.signal.aborted) {
          setError(
            e instanceof Error
              ? e.message
              : "This preview could not be loaded.",
          );
          track("onboarding_failure", {
            step: "feed",
            reason: "preview_failed",
          });
        }
      } finally {
        if (!controller.signal.aborted)
          setLoadedKey(`${interests}:${goal}:${revision}`);
      }
    })();
    return () => controller.abort();
  }, [interests, goal, revision]);
  const retryPreview = () => {
    setError("");
    retry((value) => value + 1);
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
            onClick={() =>
              track("onboarding_evidence_opened", { kind: "frame" })
            }
          >
            Screenshot at {(frame.timestampMs / 1000).toFixed(1)}s
          </a>
        ))}
      </div>
    </details>
  );
  return (
    <section className={styles.sharedFeed} aria-busy={loading}>
      {error && (
        <ErrorState
          title="Could not open the preview"
          detail={error}
          onRetry={retryPreview}
        />
      )}
      {loading && (
        <div className={styles.previewLoading}>
          <LibrarySkeleton rows={3} kind="posts" />
        </div>
      )}
      {!loading && (!previewPost || error) && (
        <div className={styles.empty}>
          {!error && <h2>No example is available right now.</h2>}
          <button type="button" className={styles.secondary} onClick={onSkip}>
            Continue setup
          </button>
        </div>
      )}
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
                  insight.evidence?.some(
                    (reference) => reference.id === item.id,
                  ),
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
          preview={{
            onContinue: () => onContinue(previewPost.familyId),
            onProof: (kind) => track("onboarding_evidence_opened", { kind }),
            evidence,
            resolveThumbnail: (frameId, familyId) =>
              starterFrame(familyId ?? previewPost.familyId, frameId, true),
            resolveEvidenceFrame: (frameId) =>
              starterFrame(previewPost.familyId, frameId),
          }}
        />
      )}
    </section>
  );
}
