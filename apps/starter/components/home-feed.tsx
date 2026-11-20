"use client";
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import { Link2 } from "lucide-react";
import { Button } from "@companynerve/ui";
import { ErrorState } from "./assistant-elements/error-state";
import {
  feedNeighbors,
  mergeFeedPage,
  sourceReadKey,
  type FeedDetail,
  type FeedEngagement,
  type FeedPage,
  type FeedPost,
} from "@/lib/home-feed";
import { feedDemoDetails, feedDemoPage } from "@/lib/home-feed-demo";
import { usePostsLive } from "@/lib/use-source-live";
import {
  feedBookmarkKey,
  readFeedBookmark,
  newReadyPosts,
} from "@/lib/feed-continuity";
import { FeedPostCard } from "./home-feed-post";
import styles from "./home-feed.module.css";

type Props = {
  organizationId: string;
  initialPage?: FeedPage;
  demo?: boolean;
  visible?: boolean;
  readOnly: boolean;
  call: (operation: string, args: unknown) => Promise<any>;
  onSave: () => void;
  onPosts: () => void;
};

export function HomeFeed({
  organizationId,
  initialPage,
  demo = false,
  visible = true,
  readOnly,
  call,
  onSave,
  onPosts,
}: Props) {
  const page = demo ? feedDemoPage : initialPage;
  const [posts, setPosts] = useState<FeedPost[]>(page?.items ?? []);
  const [next, setNext] = useState(page?.next ?? null);
  const [loaded, setLoaded] = useState(!!page);
  const [loading, setLoading] = useState(!page);
  const [error, setError] = useState("");
  const [denied, setDenied] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, FeedDetail>>(
    demo ? feedDemoDetails : {},
  );
  const [detailErrors, setDetailErrors] = useState<Record<string, string>>({});
  const [revision, setRevision] = useState(0);
  const [engagement, setEngagement] = useState<Record<string, FeedEngagement>>(
    {},
  );
  const [readerId, setReaderId] = useState<string | null>(null);
  const [recentReady, setRecentReady] = useState<
    { id: string; generation: number; createdAt: number }[]
  >([]);
  const [rememberReady, setRememberReady] = useState(false);
  const cursorByPost = useRef(
    new Map(
      (page?.items ?? []).map((post) => [
        String(post.id),
        null as string | null,
      ]),
    ),
  );
  const restoreScope = useRef<string | null>(null);
  const restoreTarget = useRef<string | null>(null);
  const bookmarkScope = useRef<string | null>(null);
  const wantedIds = useRef<string[]>([]);
  const staleDetails = useRef(new Set<string>());
  const requests = useRef(new Map<string, AbortController>());
  const pageFlight = useRef<AbortController | null>(null);
  const marker = useRef<HTMLDivElement>(null);
  const gesture = useRef(0);
  const consumedGesture = useRef(-1);
  const liveKeys = useRef(new Map<string, string>());
  const readyPosts = posts.filter((post) => post.state === "ready");
  const currentPostId = readyPosts.some((post) => post.id === activeId)
    ? activeId
    : readyPosts[0]?.id;
  const neighborKey = JSON.stringify(
    feedNeighbors(readyPosts, currentPostId ?? null),
  );
  const neighbors: string[] = JSON.parse(neighborKey);
  const liveIds = [...new Set([...neighbors, ...Object.keys(details)])].sort();
  const base = demo ? "/demo" : `/app/${organizationId}`;
  const clearAccess = useCallback(() => {
    try {
      if (bookmarkScope.current)
        sessionStorage.removeItem(bookmarkScope.current);
    } catch {
      /* Optional browser storage. */
    }
    pageFlight.current?.abort();
    for (const request of requests.current.values()) request.abort();
    requests.current.clear();
    staleDetails.current.clear();
    setDetails({});
    setEngagement({});
    setPosts([]);
    setNext(null);
    setDenied(true);
    setError("Posts are unavailable. Refresh to check your access.");
  }, []);

  usePostsLive(
    organizationId,
    liveIds,
    !demo && !denied,
    (snapshot) => {
      if (!snapshot) {
        clearAccess();
        return;
      }
      const metadata = Array.isArray(snapshot) ? snapshot : snapshot.sources;
      if (!Array.isArray(metadata)) return;
      if (!Array.isArray(snapshot)) {
        setReaderId(snapshot.readerId);
        setRecentReady(snapshot.recentReady);
      }
      setEngagement((current) => ({
        ...current,
        ...Object.fromEntries(
          metadata
            .filter((source: any) => source.engagement)
            .map((source: any) => {
              const incoming: FeedEngagement = source.engagement;
              const old = current[source._id];
              return [
                source._id,
                old?.scopeKey === incoming.scopeKey &&
                old.revision > incoming.revision
                  ? old
                  : incoming,
              ];
            }),
        ),
      }));
      const byId = new Map<string, any>(
        metadata.map((source: any) => [source._id, source]),
      );
      let changed = false;
      for (const id of liveIds) {
        const source = byId.get(id);
        const key = source ? sourceReadKey(source) : "unavailable";
        const previousKey = liveKeys.current.get(id);
        const retained = details[id];
        const replacedVersion =
          previousKey !== key &&
          !!retained &&
          !!source?.selectedAnalysisVersionId &&
          retained.analysisVersionId !== source.selectedAnalysisVersionId;
        if (
          !source ||
          source.state !== "ready" ||
          replacedVersion ||
          (!previousKey && !retained && requests.current.has(id)) ||
          (previousKey && previousKey !== key)
        ) {
          requests.current.get(id)?.abort();
          requests.current.delete(id);
          staleDetails.current.add(id);
          if (!source || source.state !== "ready" || replacedVersion) {
            setDetails((current) => {
              const copy = { ...current };
              delete copy[id];
              return copy;
            });
          }
          setDetailErrors((current) => {
            if (!current[id]) return current;
            const copy = { ...current };
            delete copy[id];
            return copy;
          });
          changed = true;
        }
        liveKeys.current.set(id, key);
      }
      if (changed) setRevision((value) => value + 1);
      for (const id of liveKeys.current.keys())
        if (!liveIds.includes(id)) liveKeys.current.delete(id);
      setPosts((current) =>
        current.flatMap((post) => {
          if (!liveIds.includes(post.id)) return [post];
          const source = byId.get(post.id);
          if (!source) return [];
          return [
            {
              ...post,
              title: source.title,
              state: source.state,
              generation: source.generation,
              authorName: source.linkPreview?.authorName ?? post.authorName,
              thumbnailAssetIds: [
                ...new Set([
                  ...(source.thumbnailAssetIds ?? []),
                  ...post.thumbnailAssetIds,
                ]),
              ].slice(0, 3),
            },
          ];
        }),
      );
    },
    true,
    true,
  );

  const loadPage = useCallback(
    async (cursor?: string, replace = false, restoring = false) => {
      if (pageFlight.current || demo || denied) return;
      const controller = new AbortController();
      pageFlight.current = controller;
      try {
        const response = await fetch(
          `/api/posts/${encodeURIComponent(organizationId)}${cursor ? `?${new URLSearchParams({ cursor })}` : ""}`,
          {
            cache: "no-store",
            credentials: "same-origin",
            signal: controller.signal,
          },
        );
        // An old opaque cursor can expire. Keep the authenticated first page;
        // its live subscription still enforces current account/source access.
        if (restoring && response.status === 404) return;
        if ([401, 403, 404].includes(response.status)) {
          clearAccess();
          return;
        }
        if (!response.ok) throw Error("Read failed");
        const incoming: FeedPage = await response.json();
        if (controller.signal.aborted || (restoring && gesture.current > 0))
          return;
        if (replace) cursorByPost.current.clear();
        for (const post of incoming.items)
          if (!cursorByPost.current.has(post.id))
            cursorByPost.current.set(post.id, cursor ?? null);
        setPosts((current) =>
          cursor && !replace
            ? mergeFeedPage(current, incoming.items)
            : incoming.items,
        );
        setNext(incoming.next === cursor ? null : incoming.next);
        setLoaded(true);
        setError("");
        return incoming;
      } catch {
        if (!controller.signal.aborted)
          setError(
            "More posts could not be loaded. Your current post is still here.",
          );
      } finally {
        if (pageFlight.current === controller) {
          pageFlight.current = null;
          setLoading(false);
        }
      }
    },
    [organizationId, demo, denied, clearAccess],
  );

  const restoreReading = useEffectEvent(async () => {
    if (demo || !readerId || !loaded || denied) return;
    const key = feedBookmarkKey(readerId, organizationId);
    if (restoreScope.current === key) return;
    restoreScope.current = key;
    bookmarkScope.current = key;
    let saved = null;
    try {
      saved = readFeedBookmark(sessionStorage.getItem(key));
    } catch {
      /* Optional browser storage. */
    }
    if (saved && gesture.current === 0) {
      if (!cursorByPost.current.has(saved.sourceId) && saved.cursor)
        await loadPage(saved.cursor, true, true);
      if (cursorByPost.current.has(saved.sourceId) && gesture.current === 0) {
        restoreTarget.current = saved.sourceId;
        setActiveId(saved.sourceId);
      }
    }
    setRememberReady(true);
  });
  useEffect(() => {
    void restoreReading();
  }, [readerId, loaded, organizationId, demo, denied]);
  useEffect(() => {
    const target = restoreTarget.current;
    if (!target) return;
    const frame = requestAnimationFrame(() => {
      document
        .getElementById(`feed-post-${target}`)
        ?.scrollIntoView({ block: "start", behavior: "instant" });
      restoreTarget.current = null;
    });
    return () => cancelAnimationFrame(frame);
  }, [activeId, posts, rememberReady]);
  useEffect(() => {
    if (
      demo ||
      denied ||
      !rememberReady ||
      !readerId ||
      !activeId ||
      !cursorByPost.current.has(activeId)
    )
      return;
    try {
      sessionStorage.setItem(
        feedBookmarkKey(readerId, organizationId),
        JSON.stringify({
          version: 1,
          sourceId: activeId,
          cursor: cursorByPost.current.get(activeId),
          updatedAt: Date.now(),
        }),
      );
    } catch {
      /* Optional browser storage. */
    }
  }, [activeId, readerId, organizationId, rememberReady, demo, denied]);

  const initialRead = useEffectEvent(() => {
    if (!loaded && !denied) void loadPage();
  });
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- Synchronize the initial authenticated request, including its access-denied response.
    initialRead();
  }, [loaded, denied, loadPage]);
  useEffect(
    () => () => {
      pageFlight.current?.abort();
      pageFlight.current = null;
      for (const request of requests.current.values()) request.abort();
      requests.current.clear();
    },
    [],
  );

  const fetchNeighborhood = useEffectEvent((wanted: string[]) => {
    if (demo || denied || !visible) return;
    for (const [id, request] of requests.current) {
      if (!wanted.includes(id)) {
        request.abort();
        requests.current.delete(id);
      }
    }
    wantedIds.current = wanted;
    for (const id of wanted) {
      if (
        (details[id] && !staleDetails.current.has(id)) ||
        requests.current.has(id) ||
        detailErrors[id]
      )
        continue;
      const controller = new AbortController();
      requests.current.set(id, controller);
      void fetch(
        `/api/feed/${encodeURIComponent(id)}?${new URLSearchParams({ organizationId })}`,
        {
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal,
        },
      )
        .then(async (response) => {
          if (controller.signal.aborted) return;
          if (response.redirected || response.status === 401) {
            clearAccess();
            return;
          }
          if ([403, 404].includes(response.status)) {
            setDetails((current) => {
              const copy = { ...current };
              delete copy[id];
              return copy;
            });
            throw Error(
              "This post is no longer available. Open Posts to check its status.",
            );
          }
          if (!response.ok) throw Error("The insights could not be loaded.");
          const detail: FeedDetail = await response.json();
          if (controller.signal.aborted) return;
          staleDetails.current.delete(id);
          if (detail.engagement) {
            const incoming = detail.engagement;
            setEngagement((current) => {
              const old = current[id];
              return old?.scopeKey === incoming.scopeKey &&
                old.revision > incoming.revision
                ? current
                : { ...current, [id]: incoming };
            });
          }
          setDetails((current) => {
            const retained = Object.entries(current).filter(
              ([key]) => key !== id,
            );
            retained.push([id, detail]);
            const recent = retained.filter(
              ([key]) => !wantedIds.current.includes(key),
            );
            return Object.fromEntries([
              ...recent.slice(-9),
              ...retained.filter(([key]) => wantedIds.current.includes(key)),
            ]);
          });
        })
        .catch((failure) => {
          if (!controller.signal.aborted)
            setDetailErrors((current) => ({
              ...current,
              [id]:
                failure instanceof TypeError
                  ? "Check your connection and try again."
                  : failure instanceof SyntaxError
                    ? "The insights could not be loaded. Try again."
                    : failure.message,
            }));
        })
        .finally(() => {
          if (requests.current.get(id) === controller)
            requests.current.delete(id);
        });
    }
    // Fetch once for the active neighborhood. Individual responses do not start another batch.
  });
  useEffect(() => {
    fetchNeighborhood(JSON.parse(neighborKey));
  }, [organizationId, demo, denied, visible, neighborKey, revision]);

  useEffect(() => {
    if (demo || !visible || denied) return;
    let lastCheck = 0;
    const revalidate = () => {
      if (document.hidden || Date.now() - lastCheck < 15_000) return;
      lastCheck = Date.now();
      for (const id of wantedIds.current) staleDetails.current.add(id);
      setDetailErrors({});
      setRevision((value) => value + 1);
    };
    window.addEventListener("focus", revalidate);
    window.addEventListener("online", revalidate);
    document.addEventListener("visibilitychange", revalidate);
    return () => {
      window.removeEventListener("focus", revalidate);
      window.removeEventListener("online", revalidate);
      document.removeEventListener("visibilitychange", revalidate);
    };
  }, [demo, visible, denied]);

  useEffect(() => {
    if (!visible) return;
    const browse = (event: Event) => {
      if (
        event instanceof KeyboardEvent &&
        !["PageDown", "ArrowDown", "End", " "].includes(event.key)
      )
        return;
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest(
          "input, textarea, select, [contenteditable=true], dialog[open]",
        )
      )
        return;
      gesture.current += 1;
    };
    window.addEventListener("wheel", browse, { passive: true });
    window.addEventListener("touchmove", browse, { passive: true });
    window.addEventListener("keydown", browse);
    return () => {
      window.removeEventListener("wheel", browse);
      window.removeEventListener("touchmove", browse);
      window.removeEventListener("keydown", browse);
    };
  }, [visible]);
  useEffect(() => {
    if (
      !visible ||
      !next ||
      loading ||
      error ||
      denied ||
      !marker.current ||
      typeof IntersectionObserver === "undefined"
    )
      return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (
          entry.isIntersecting &&
          document.visibilityState === "visible" &&
          consumedGesture.current !== gesture.current
        ) {
          consumedGesture.current = gesture.current;
          setLoading(true);
          setError("");
          void loadPage(next);
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(marker.current);
    return () => observer.disconnect();
  }, [visible, next, loading, error, denied, loadPage]);

  return (
    <section
      className={styles.feed}
      aria-label="Your analyzed posts"
      data-home-mode="browse"
      data-paused={!visible}
    >
      {!demo && loaded && newReadyPosts(posts, recentReady) > 0 && (
        <button
          type="button"
          className={styles.readyNotice}
          disabled={loading}
          onClick={() => {
            setLoading(true);
            void loadPage(undefined, true).then((incoming) => {
              const first = incoming?.items.find(
                (post) => post.state === "ready",
              );
              if (!first) return;
              restoreTarget.current = first.id;
              setActiveId(first.id);
            });
          }}
        >
          New posts ready
        </button>
      )}
      {demo && <span className={styles.demoLabel}>Synthetic demo</span>}
      {!loaded && !error && (
        <output className={styles.feedPlaceholder} aria-label="Loading posts">
          <span className={styles.placeholderSource} aria-hidden="true">
            <span className={styles.placeholderAuthor} />
            <span className={styles.placeholderMedia} />
            <span className={styles.placeholderCopy}>
              <span />
              <span />
              <span />
            </span>
          </span>
          <span className={styles.placeholderInsights} aria-hidden="true">
            <span className={styles.placeholderAuthor} />
            <span className={styles.placeholderCards}>
              <span />
              <span />
              <span />
            </span>
          </span>
        </output>
      )}
      {readyPosts.map((post) => (
        <FeedPostCard
          key={post.id}
          post={post}
          detail={details[post.id]}
          engagement={engagement[post.id] ?? details[post.id]?.engagement}
          onReaction={(ack) =>
            setEngagement((current) => {
              const previous = current[post.id] ?? details[post.id]?.engagement;
              if (
                !previous ||
                previous.scopeKey !== ack.scopeKey ||
                previous.revision > ack.revision
              )
                return current;
              return {
                ...current,
                [post.id]: {
                  ...previous,
                  likes:
                    ack.likes ??
                    Math.max(
                      0,
                      previous.likes +
                        Number(ack.liked) -
                        Number(previous.liked),
                    ),
                  shares: ack.shares ?? previous.shares,
                  liked: ack.liked,
                  revision: ack.revision,
                },
              };
            })
          }
          active={visible && neighbors.includes(post.id)}
          mode="browse"
          current={post.id === currentPostId}
          demo={demo}
          error={detailErrors[post.id]}
          organizationId={organizationId}
          readOnly={readOnly}
          call={call}
          base={base}
          onVisible={() => {
            if (!restoreTarget.current || restoreTarget.current === post.id)
              setActiveId(post.id);
          }}
          onRetry={() => {
            requests.current.get(post.id)?.abort();
            requests.current.delete(post.id);
            staleDetails.current.add(post.id);
            setDetailErrors((current) => {
              const copy = { ...current };
              delete copy[post.id];
              return copy;
            });
            setRevision((value) => value + 1);
          }}
        />
      ))}
      {loaded && !error && readyPosts.length === 0 && (
        <div className={styles.empty}>
          <Link2 size={28} aria-hidden="true" />
          <h2>Your insights start here</h2>
          <p>
            {posts.length || next
              ? "There are no analyzed posts on this page. Open Posts for saved and processing links, or browse the next page."
              : "Save a post to turn its ideas into your next project."}
          </p>
          <div className={styles.emptyActions}>
            <Button disabled={readOnly && !demo} onClick={onSave}>
              Save a link
            </Button>
            <Button variant="ghost" onClick={onPosts}>
              View saved posts
            </Button>
          </div>
        </div>
      )}
      <div ref={marker} className={styles.end} aria-busy={loading}>
        {error && (
          <ErrorState
            title="Posts unavailable"
            detail={error}
            onRetry={
              denied
                ? undefined
                : () => {
                    setLoading(true);
                    setError("");
                    void loadPage(next ?? undefined);
                  }
            }
            action={denied ? <a href={base}>Refresh access</a> : undefined}
          />
        )}
        {loading && <output>Loading more posts…</output>}
        {!loading && next && !denied && (
          <Button
            variant="outline"
            onClick={() => {
              consumedGesture.current = gesture.current;
              setLoading(true);
              setError("");
              void loadPage(next);
            }}
          >
            Load more posts
          </Button>
        )}
        {loaded && !next && readyPosts.length > 0 && (
          <span>
            You’re up to date. <a href="#main">Back to top</a>
          </span>
        )}
      </div>
    </section>
  );
}
