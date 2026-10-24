"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChoiceSelect } from "./choice-select";

export type CreatorCall = (
  operation: string,
  args: Record<string, unknown>,
) => Promise<any>;
export type CreatorFollow = {
  _id: string;
  version: number;
  canonical: string;
  platform: string;
  state: string;
  operational: boolean;
  cutoff: number;
  mode: string;
  maxAssets: number;
  maxVideoMs: number;
  route: string;
  timezone: string;
  digestHour: number;
  discovery: null | { lastCheckedAt: number | null; incomplete: boolean };
};
type FollowPage = {
  items: CreatorFollow[];
  next: string | null;
  providerAvailable: boolean;
  explanation: string;
};
type Quote = {
  hash: string;
  posts: {
    postId: string;
    canonical: string;
    publishedAt: number | null;
    assetCount: number | null;
  }[];
  assets: number;
  videoMs: number;
  needsReview: number;
  overLimit: number;
  incomplete: boolean;
  processingStarted: false;
};
export function creatorDate(value: number | null) {
  return value === null ? "Not recorded" : new Date(value).toISOString();
}
export function creatorLink(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      [
        "www.instagram.com",
        "instagram.com",
        "www.tiktok.com",
        "tiktok.com",
      ].includes(url.hostname)
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}
export function CreatorFollowing(
  props: Parameters<typeof CreatorFollowingPanel>[0],
) {
  return <CreatorFollowingPanel key={props.organizationId} {...props} />;
}
export function CreatorFollowingPanel({
  organizationId,
  call,
  disabled = false,
}: {
  organizationId: string;
  call: CreatorCall;
  onOpenSource?: (id: string) => void;
  disabled?: boolean;
}) {
  const current = useRef(true);
  const caller = useRef(call);
  useEffect(() => {
    caller.current = call;
  }, [call]);
  const [loaded, setLoaded] = useState<{
    organizationId: string;
    page: FollowPage;
  } | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [mode, setMode] = useState("future"),
    [route, setRoute] = useState("save_only");
  const [storedQuote, setQuote] = useState<{
    organizationId: string;
    id: string;
    version: number;
    value: Quote;
  } | null>(null);
  const [acceptIncomplete, setAcceptIncomplete] = useState(false);
  const page = loaded?.organizationId === organizationId ? loaded.page : null;
  const quote =
    storedQuote?.organizationId === organizationId ? storedQuote : null;
  const load = useCallback(
    async (cursor: string | null = null) => {
      const org = organizationId;
      setBusy(true);
      setError("");
      try {
        const result: FollowPage = await caller.current("creatorFollowing", {
          organizationId: org,
          cursor,
        });
        if (!current.current) return;
        setLoaded((old) => ({
          organizationId: org,
          page: {
            ...result,
            items:
              cursor && old?.organizationId === org
                ? [
                    ...new Map(
                      [...old.page.items, ...result.items].map((item) => [
                        item._id,
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
              : "Following could not be loaded.",
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

  async function act(operation: string, args: Record<string, unknown>) {
    if (busy || disabled) return;
    setBusy(true);
    setError("");
    try {
      const result = await call(operation, args);
      if (!current.current) return;
      setQuote(null);
      await load();
      return result;
    } catch (failure) {
      if (current.current)
        setError(
          failure instanceof Error
            ? failure.message
            : "The change was not confirmed. Refresh before retrying.",
        );
    } finally {
      if (current.current) setBusy(false);
    }
  }
  return (
    <section className="panel" aria-label="Following">
      <h2>Following</h2>
      <p>
        Keep creator posts in your Library. Discovery needs approved provider
        access. A processing route records your preference; rights, a budget and
        your processing approval are still required.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <output>
        {page
          ? page.providerAvailable
            ? page.explanation
            : `Pending provider access. ${page.explanation}`
          : error
            ? "Follow preferences are unavailable. Refresh to try again."
            : "Loading your follow preferences…"}
      </output>
      <button className="secondary" disabled={busy} onClick={() => void load()}>
        Refresh following
      </button>
      <form
        className="form-grid"
        onSubmit={(event) => {
          event.preventDefault();
          if (busy || disabled) return;
          const data = new FormData(event.currentTarget);
          if (data.get("rights") !== "on") {
            setError(
              "Confirm your permission to follow this creator before saving.",
            );
            return;
          }
          void act("creatorFollow", {
            organizationId,
            profileUrl: String(data.get("profileUrl") ?? ""),
            mode,
            route,
            maxAssets: Number(data.get("maxAssets")),
            maxVideoMs: Number(data.get("videoMinutes")) * 60000,
            timezone: String(data.get("timezone") ?? ""),
            digestHour: Number(data.get("digestHour")),
            rightsAttested: true,
          });
        }}
      >
        <label>
          Instagram or TikTok creator profile URL
          <input
            name="profileUrl"
            type="url"
            required
            maxLength={2048}
            disabled={disabled || busy}
          />
        </label>
        <label htmlFor="creator-follow-mode">
          Posts to consider
          <ChoiceSelect
            id="creator-follow-mode"
            value={mode}
            onValueChange={setMode}
            disabled={disabled || busy}
          >
            <option value="future">Future posts</option>
            <option value="latest10">Latest ten, after separate review</option>
          </ChoiceSelect>
        </label>
        <label htmlFor="creator-follow-route">
          Processing preference
          <ChoiceSelect
            id="creator-follow-route"
            value={route}
            onValueChange={setRoute}
            disabled={disabled || busy}
          >
            <option value="save_only">Save only</option>
            <option value="own_subscription">My own subscription</option>
            <option value="managed_api">Managed API, when approved</option>
          </ChoiceSelect>
        </label>
        <label>
          Maximum assets per day
          <input
            name="maxAssets"
            type="number"
            min={1}
            max={350}
            defaultValue={30}
            required
            disabled={disabled || busy}
          />
        </label>
        <label>
          Maximum video minutes per day
          <input
            name="videoMinutes"
            type="number"
            min={0}
            max={100}
            defaultValue={10}
            required
            disabled={disabled || busy}
          />
        </label>
        <label>
          Digest timezone
          <input
            name="timezone"
            defaultValue="UTC"
            required
            maxLength={80}
            disabled={disabled || busy}
          />
        </label>
        <label>
          Digest hour (0–23)
          <input
            name="digestHour"
            type="number"
            min={0}
            max={23}
            defaultValue={9}
            required
            disabled={disabled || busy}
          />
        </label>
        <label>
          <input
            name="rights"
            type="checkbox"
            required
            disabled={disabled || busy}
          />
          I have permission to collect these posts for this use. This does not
          establish platform or provider approval.
        </label>
        {mode === "latest10" && (
          <p>
            Save this preference first. Review an exact observed-post quote
            before adding past posts. Missing or undated posts may make coverage
            incomplete.
          </p>
        )}
        <button className="primary" disabled={disabled || busy}>
          Save follow preference
        </button>
      </form>
      {page && page.items.length === 0 && (
        <p>No creator follow preferences saved.</p>
      )}
      {page?.items.map((item) => (
        <article className="panel" key={item._id}>
          <h3>
            {creatorLink(item.canonical) ? (
              <a
                href={creatorLink(item.canonical)}
                target="_blank"
                rel="noreferrer"
              >
                {item.canonical}
              </a>
            ) : (
              item.canonical
            )}
          </h3>
          <p>
            {item.operational
              ? "Discovery active"
              : "Pending; discovery is not active"}
            . State: {item.state}. Mode: {item.mode}. Processing preference:{" "}
            {item.route}.
          </p>
          <p>
            Daily limits: {item.maxAssets} assets, {item.maxVideoMs / 60000}{" "}
            video minutes. Digest: {item.digestHour}:00 ({item.timezone}).
            Future-post cutoff: {creatorDate(item.cutoff)}.
          </p>
          <p>
            Last discovery check:{" "}
            {creatorDate(item.discovery?.lastCheckedAt ?? null)}.{" "}
            {item.discovery?.incomplete
              ? "Coverage is incomplete; missing posts are possible."
              : "A missing check does not mean there were no new posts."}
          </p>
          <div className="actions">
            {["pause", "resume", "unfollow"].map((action) => (
              <button
                className="secondary"
                key={action}
                disabled={
                  busy ||
                  disabled ||
                  item.state === "unfollowed" ||
                  item.state === "quarantined" ||
                  (action === "pause" && item.state === "paused") ||
                  (action === "resume" && item.state === "active")
                }
                onClick={() =>
                  void act("creatorFollowChange", {
                    id: item._id,
                    expectedVersion: item.version,
                    action,
                  })
                }
              >
                {action === "pause"
                  ? "Pause"
                  : action === "resume"
                    ? "Resume"
                    : "Unfollow"}
              </button>
            ))}
          </div>
          <p>
            Unfollowing stops future additions and preserves sources already
            saved in your Library.
          </p>
          {item.state === "active" && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const value = new FormData(event.currentTarget).get("since");
                if (typeof value === "string" && value)
                  void act("creatorFollowChange", {
                    id: item._id,
                    expectedVersion: item.version,
                    action: "catch_up",
                    catchUpSince: new Date(value).getTime(),
                  });
              }}
            >
              <label>
                Catch up from a date within the past 30 days
                <input
                  name="since"
                  type="datetime-local"
                  required
                  disabled={busy || disabled}
                />
              </label>
              <button className="secondary" disabled={busy || disabled}>
                Request bounded catch-up
              </button>
            </form>
          )}
          {item.mode === "latest10" && (
            <button
              className="secondary"
              disabled={busy || disabled}
              onClick={async () => {
                const org = organizationId;
                setBusy(true);
                setError("");
                try {
                  const value = await call("creatorPreviewBackfill", {
                    id: item._id,
                  });
                  if (current.current) {
                    setQuote({
                      organizationId: org,
                      id: item._id,
                      version: item.version,
                      value,
                    });
                    setAcceptIncomplete(false);
                  }
                } catch (failure) {
                  if (current.current)
                    setError(
                      failure instanceof Error
                        ? failure.message
                        : "The quote is unavailable.",
                    );
                } finally {
                  if (current.current) setBusy(false);
                }
              }}
            >
              Review observed latest-ten posts
            </button>
          )}
        </article>
      ))}
      {quote && (
        <section className="panel" aria-label="Past-post review">
          <h3>Review observed past posts</h3>
          <p>
            {quote.value.posts.length} observed posts; {quote.value.assets}{" "}
            assets; {quote.value.videoMs / 60000} video minutes. Processing has
            not started.
          </p>
          {quote.value.needsReview > 0 && (
            <p>
              {quote.value.needsReview} other observed posts need metadata
              review and are excluded from this list.
            </p>
          )}
          <ul>
            {quote.value.posts.map((post) => (
              <li key={post.postId}>
                {post.canonical} · Published: {creatorDate(post.publishedAt)} ·
                Assets: {post.assetCount ?? "Unknown"}
              </li>
            ))}
          </ul>
          {quote.value.incomplete && (
            <label>
              <input
                type="checkbox"
                checked={acceptIncomplete}
                onChange={(event) => setAcceptIncomplete(event.target.checked)}
              />
              I accept that this observed list is incomplete.
            </label>
          )}
          {quote.value.overLimit > 0 && (
            <p>
              {quote.value.overLimit} other observed posts exceed the remaining
              daily limits and are excluded. Approval adds only the shown
              subset.
            </p>
          )}
          <button
            className="primary"
            disabled={
              busy ||
              disabled ||
              !quote.value.posts.length ||
              (quote.value.incomplete && !acceptIncomplete)
            }
            onClick={() =>
              void act("creatorApproveBackfill", {
                id: quote.id,
                expectedVersion: quote.version,
                quoteHash: quote.value.hash,
                acceptIncomplete,
              })
            }
          >
            Approve these metadata additions
          </button>
          <p>Adding metadata does not approve analysis or start inference.</p>
        </section>
      )}
      {page?.next && (
        <button
          className="secondary"
          disabled={busy}
          onClick={() => void load(page.next)}
        >
          Load more follows
        </button>
      )}
    </section>
  );
}
