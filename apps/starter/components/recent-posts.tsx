"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@companynerve/ui";
import type { FunctionReturnType } from "convex/server";
import type { api } from "../../../convex/_generated/api";
import { PostThumbnail } from "./post-thumbnail";
import { usePostsLive } from "@/lib/use-source-live";
import { sourceProgress } from "../../../packages/sources/progress";

type Page = FunctionReturnType<typeof api.posts.recent>;
type Post = Page["items"][number] & {
  progressTitle?: string;
  preparationStage?: string;
};

export function RecentPosts({
  organizationId,
  initialPage,
}: {
  organizationId: string;
  initialPage: Page;
}) {
  const [items, setItems] = useState<Post[]>(initialPage.items);
  const [next, setNext] = useState<string | null>(initialPage.next);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const marker = useRef<HTMLDivElement>(null);
  const flight = useRef<AbortController | null>(null);
  const visibleIds = items.slice(0, 20).map((post) => post.id);
  usePostsLive(organizationId, visibleIds, true, (metadata) => {
    if (!metadata) {
      setItems([]);
      setError("Posts are unavailable. Refresh to check access.");
      return;
    }
    const byId = new Map<string, any>(
      metadata.map((source: any) => [source._id, source]),
    );
    setItems((current) =>
      current.flatMap<Post>((post) => {
        const source = byId.get(post.id);
        if (!source) return visibleIds.includes(post.id) ? [] : [post];
        return [
          {
            ...post,
            title: source.title,
            authorName: source.linkPreview?.authorName ?? post.authorName,
            state: source.state,
            generation: source.generation,
            thumbnailAssetIds: [
              ...new Set([
                ...(source.thumbnailAssetIds ?? []),
                ...post.thumbnailAssetIds,
              ]),
            ].slice(0, 3),
            progressTitle: sourceProgress(source, Date.now())?.title,
            preparationStage: source.personalMedia?.stage,
          },
        ];
      }),
    );
  });
  const load = useCallback(
    async (cursor?: string) => {
      if (flight.current) return;
      const controller = new AbortController();
      flight.current = controller;
      try {
        const query = cursor ? `?${new URLSearchParams({ cursor })}` : "";
        const response = await fetch(
          `/api/posts/${encodeURIComponent(organizationId)}${query}`,
          {
            cache: "no-store",
            credentials: "same-origin",
            signal: controller.signal,
          },
        );
        if (!response.ok) throw Error("Posts could not be loaded.");
        const page: Page = await response.json();
        if (controller.signal.aborted) return;
        setError("");
        setItems((current) => {
          const merged = new Map(
            (cursor ? current : []).map((item) => [item.id, item]),
          );
          for (const item of page.items) merged.set(item.id, item);
          return [...merged.values()];
        });
        setNext(page.next);
      } catch {
        if (!controller.signal.aborted)
          setError("Posts could not be loaded. Try again.");
      } finally {
        if (flight.current === controller) {
          flight.current = null;
          setLoading(false);
        }
      }
    },
    [organizationId],
  );
  useEffect(() => {
    return () => {
      flight.current?.abort();
      flight.current = null;
    };
  }, []);
  useEffect(() => {
    if (
      !next ||
      loading ||
      error ||
      !marker.current ||
      typeof IntersectionObserver === "undefined"
    )
      return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setLoading(true);
          setError("");
          void load(next);
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(marker.current);
    return () => observer.disconnect();
  }, [next, loading, error, load]);

  return (
    <section aria-label="Recent posts" aria-busy={loading}>
      <p>
        Newest saved posts. Open a post for its insights and analysis options.
      </p>
      {items.length > 0 && (
        <ul className="studio-list">
          {items.map((post) => (
            <li key={post.id} data-preparation-stage={post.preparationStage}>
              <Link
                href={`/app/${organizationId}/posts/${post.id}`}
                prefetch={false}
              >
                <PostThumbnail
                  candidates={post.thumbnailAssetIds}
                  kind={post.kind}
                />
                <span>
                  <strong>{post.title}</strong>
                  <small>
                    {[
                      post.authorName,
                      post.progressTitle ??
                        (post.state === "ready"
                          ? "Insights ready"
                          : post.state.replaceAll("_", " ")),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </small>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {!loading && !error && items.length === 0 && !next && (
        <p>No saved posts yet. Save a link to get started.</p>
      )}
      {error && <p role="alert">{error}</p>}
      {loading && <output>Loading posts…</output>}
      <div ref={marker} />
      {!loading && (next || error) && (
        <Button
          onClick={() => {
            setLoading(true);
            setError("");
            void load(next ?? undefined);
          }}
        >
          {error ? "Try again" : "Load more posts"}
        </Button>
      )}
    </section>
  );
}
