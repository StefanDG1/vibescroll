"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  creatorDate,
  creatorLink,
  type CreatorCall,
} from "./creator-following";
export type CreatorDelivery = {
  id: string;
  state: string;
  sourceId: string | null;
  canonical: string;
  caption: string;
  publishedAt: number | null;
  observedAt: number;
  mediaKinds: string[];
  assetCount: number | null;
  revisionKey: string;
  timezone: string;
  day: string;
  incomplete: boolean;
  reason: string | null;
};
type Page = { items: CreatorDelivery[]; next: string | null };
export function CreatorDigest(props: Parameters<typeof CreatorDigestPanel>[0]) {
  return <CreatorDigestPanel key={props.organizationId} {...props} />;
}
export function CreatorDigestPanel({
  organizationId,
  call,
  onOpenSource,
  disabled = false,
}: {
  organizationId: string;
  call: CreatorCall;
  onOpenSource: (id: string) => void;
  disabled?: boolean;
}) {
  const current = useRef(true);
  const caller = useRef(call);
  useEffect(() => {
    caller.current = call;
  }, [call]);
  const [loaded, setLoaded] = useState<{
    organizationId: string;
    page: Page;
  } | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const page = loaded?.organizationId === organizationId ? loaded.page : null;
  const load = useCallback(
    async (cursor: string | null = null) => {
      const org = organizationId;
      setBusy(true);
      setError("");
      try {
        const result: Page = await caller.current("creatorDigest", {
          organizationId: org,
          cursor,
        });
        if (current.current)
          setLoaded((old) => ({
            organizationId: org,
            page: {
              ...result,
              items:
                cursor && old?.organizationId === org
                  ? [
                      ...new Map(
                        [...old.page.items, ...result.items].map((item) => [
                          item.id,
                          item,
                        ]),
                      ).values(),
                    ]
                  : result.items,
            },
          }));
      } catch (failure) {
        if (current.current)
          setError(
            failure instanceof Error
              ? failure.message
              : "The digest could not be loaded.",
          );
      } finally {
        if (current.current) setBusy(false);
      }
    },
    [organizationId],
  );
  useEffect(() => {
    let cancelled = false;
    current.current = true;
    void Promise.resolve().then(() => {
      if (!cancelled) void load();
    });
    return () => {
      cancelled = true;
      current.current = false;
    };
  }, [load]);

  async function change(
    item: CreatorDelivery,
    operation: "creatorSavePost" | "creatorSuppress",
  ) {
    if (busy || disabled) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await call(operation, { id: item.id });
      if (!current.current) return;
      setNotice(
        operation === "creatorSavePost"
          ? "Post metadata saved to your Library. Analysis has not started."
          : "This post is excluded from future additions for you.",
      );
      if (
        operation === "creatorSavePost" &&
        (typeof result?.sourceId !== "string" ||
          result.processingStarted !== false)
      )
        throw Error(
          "The saved source was not confirmed. Refresh before retrying.",
        );
      await load();
    } catch (failure) {
      if (current.current) {
        setNotice("");
        setError(
          failure instanceof Error
            ? failure.message
            : "The change was not confirmed.",
        );
      }
    } finally {
      if (current.current) setBusy(false);
    }
  }
  return (
    <section className="panel" aria-label="Creator digest">
      <h2>Creator digest</h2>
      <p>
        Review observed posts before saving. Discovery can be incomplete. A
        digest date groups additions in your chosen timezone; it is not the
        publication date.
      </p>
      <button className="secondary" disabled={busy} onClick={() => void load()}>
        Refresh creator digest
      </button>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {notice && <output>{notice}</output>}
      {!page && (
        <p>
          {error
            ? "Creator digest unavailable. Refresh to try again."
            : "Loading your creator digest…"}
        </p>
      )}
      {page?.items.length === 0 && (
        <p>
          No eligible creator posts are available in this digest. This does not
          confirm that creators have posted nothing new.
        </p>
      )}
      {page?.items.map((item) => (
        <article className="panel" key={item.id}>
          <h3>{item.caption || "Post without a supplied caption"}</h3>
          {creatorLink(item.canonical) && (
            <a
              href={creatorLink(item.canonical)}
              target="_blank"
              rel="noreferrer"
            >
              Open original post
            </a>
          )}
          <p>
            Published: {creatorDate(item.publishedAt)}. Observed:{" "}
            {creatorDate(item.observedAt)}.
          </p>
          <p>
            Digest: {item.day} ({item.timezone}). Media:{" "}
            {item.mediaKinds.length ? item.mediaKinds.join(", ") : "Unknown"}.
            Assets: {item.assetCount ?? "Unknown"}. State: {item.state}.
          </p>
          {item.incomplete && (
            <p>Incomplete coverage. Some posts or assets may be missing.</p>
          )}
          {item.state === "needs_review" && (
            <p>
              Changed or incomplete metadata needs review before this post can
              be saved.
            </p>
          )}
          {item.sourceId ? (
            <button
              className="secondary"
              disabled={disabled}
              onClick={() => onOpenSource(item.sourceId!)}
            >
              Open saved source
            </button>
          ) : (
            <button
              className="primary"
              disabled={busy || disabled || item.state === "needs_review"}
              onClick={() => void change(item, "creatorSavePost")}
            >
              Save post metadata
            </button>
          )}
          <button
            className="secondary"
            disabled={busy || disabled}
            onClick={() => void change(item, "creatorSuppress")}
          >
            Don’t add this post again
          </button>
        </article>
      ))}
      {page?.next && (
        <button
          className="secondary"
          disabled={busy}
          onClick={() => void load(page.next)}
        >
          Load more digest posts
        </button>
      )}
    </section>
  );
}
