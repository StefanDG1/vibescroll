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
  readOnly: boolean;
  call: (operation: string, args: unknown) => Promise<any>;
  onSave: () => void;
  onPosts: () => void;
};

export function HomeFeed({
  organizationId,
  initialPage,
  demo = false,
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
  const requests = useRef(new Map<string, AbortController>());
  const pageFlight = useRef<AbortController | null>(null);
  const marker = useRef<HTMLDivElement>(null);
  const gesture = useRef(0);
  const consumedGesture = useRef(-1);
  const liveKeys = useRef(new Map<string, string>());
  const readyPosts = posts.filter((post) => post.state === "ready");
  const neighborKey = JSON.stringify(feedNeighbors(readyPosts, activeId));
  const neighbors: string[] = JSON.parse(neighborKey);
  const base = demo ? "/demo" : `/app/${organizationId}`;

  const clearAccess = useCallback(() => {
    try {
      if (bookmarkScope.current)
        sessionStorage.removeItem(bookmarkScope.current);
    } catch {
      /* Optional browser storage. */
    }
    for (const request of requests.current.values()) request.abort();
    requests.current.clear();
    setDetails({});
    setEngagement({});
    setPosts([]);
    setNext(null);
    setDenied(true);
    setError("Posts are unavailable. Refresh to check your access.");
  }, []);

  usePostsLive(
    organizationId,
    neighbors,
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
      setEngagement((current) =>
        Object.fromEntries(
          metadata
            .filter((source: any) => source.engagement)
            .map((source: any) => {
              const incoming: FeedEngagement = source.engagement;
              const old = current[source._id];
              return [
                source._id,
                old?.scopeKey === incoming.scopeKey &&
                old.revision > incoming.revision
                  ? { ...incoming, liked: old.liked, revision: old.revision }
                  : incoming,
              ];
            }),
        ),
      );
      const byId = new Map<string, any>(
        metadata.map((source: any) => [source._id, source]),
      );
      let changed = false;
      for (const id of neighbors) {
        const source = byId.get(id);
        const key = source ? sourceReadKey(source) : "unavailable";
        if (
          !source ||
          !liveKeys.current.has(id) ||
          liveKeys.current.get(id) !== key
        ) {
          requests.current.get(id)?.abort();
          requests.current.delete(id);
          setDetails((current) => {
            const copy = { ...current };
            delete copy[id];
            return copy;
          });
          changed = true;
        }
        liveKeys.current.set(id, key);
      }
      if (changed) setRevision((value) => value + 1);
      setPosts((current) =>
        current.flatMap((post) => {
          if (!neighbors.includes(post.id)) return [post];
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
    if (demo || denied) return;
    for (const [id, request] of requests.current) {
      if (!wanted.includes(id)) {
        request.abort();
        requests.current.delete(id);
      }
    }
    wantedIds.current = wanted;
    for (const id of wanted) {
      if (details[id] || requests.current.has(id) || detailErrors[id]) continue;
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
          if (!response.ok)
            throw Error(
              response.status === 404
                ? "This post is no longer available. Open Posts to check its status."
                : "The insights could not be loaded.",
            );
          const detail: FeedDetail = await response.json();
          if (!controller.signal.aborted)
            setDetails((current) =>
              Object.fromEntries(
                Object.entries({ ...current, [id]: detail }).filter(([key]) =>
                  wantedIds.current.includes(key),
                ),
              ),
            );
        })
        .catch((failure) => {
          if (!controller.signal.aborted)
            setDetailErrors((current) => ({
              ...current,
              [id]: failure.message,
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
  }, [organizationId, demo, denied, neighborKey, revision]);

  useEffect(() => {
    if (demo) return;
    const revalidate = () => {
      if (document.visibilityState !== "visible") return;
      for (const request of requests.current.values()) request.abort();
      requests.current.clear();
      setDetails({});
      setDetailErrors({});
      setRevision((value) => value + 1);
    };
    window.addEventListener("focus", revalidate);
    return () => window.removeEventListener("focus", revalidate);
  }, [demo]);

  useEffect(() => {
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
  }, []);
  useEffect(() => {
    if (
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
  }, [next, loading, error, denied, loadPage]);

  return (
    <section className={styles.feed} aria-label="Your analyzed posts">
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
        <output className={styles.initialLoading}>Loading your posts…</output>
      )}
      {readyPosts.map((post, index) => (
        <FeedPostCard
          key={post.id}
          post={post}
          detail={details[post.id]}
          engagement={engagement[post.id]}
          onReaction={(ack) =>
            setEngagement((current) => {
              const previous = current[post.id];
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
                  liked: ack.liked,
                  revision: ack.revision,
                },
              };
            })
          }
          active={neighbors.includes(post.id)}
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
            setDetailErrors((current) => {
              const copy = { ...current };
              delete copy[post.id];
              return copy;
            });
            setRevision((value) => value + 1);
          }}
          nextPost={readyPosts[index + 1]}
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
