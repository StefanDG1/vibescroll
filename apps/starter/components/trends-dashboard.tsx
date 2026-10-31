"use client";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { ArrowUpRight, Heart, Share2, Video } from "lucide-react";
import type { FunctionReturnType } from "convex/server";
import type { api } from "../../../convex/_generated/api";
import { ErrorState } from "./assistant-elements/error-state";
import { useTrendsLive } from "@/lib/use-source-live";
import styles from "./trends-dashboard.module.css";
type Trends = FunctionReturnType<typeof api.postTrends.read>;

export function TrendsDashboard({
  organizationId,
  call,
  demo = false,
}: {
  organizationId: string;
  call: (operation: string, args: unknown) => Promise<any>;
  demo?: boolean;
}) {
  const [days, setDays] = useState<7 | 30>(7);
  const [dayUTC, setDayUTC] = useState(
    () => Math.floor(Date.now() / 86400000) * 86400000,
  );
  const [revision, setRevision] = useState(0);
  const scope = `${organizationId}:${days}:${dayUTC}:${revision}`;
  const liveScope = useRef<string | null>(null);
  useEffect(() => {
    if (demo) return;
    const update = () =>
      setDayUTC(Math.floor(Date.now() / 86400000) * 86400000);
    const timer = setInterval(update, 60000);
    window.addEventListener("focus", update);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", update);
    };
  }, [demo]);
  const [snapshot, setSnapshot] = useState<{
    scope: string;
    data: Trends | null;
    failed: boolean;
  } | null>(null);
  const data: Trends | null = demo
    ? {
        enabled: true,
        windowEnd: 0,
        dayUTC: 0,
        windowStart: 0,
        windowDays: days,
        scope: "recent_requested_workspace_posts",
        sample: {
          posts: 0,
          maximumPosts: 12,
          moreAvailable: false,
          maximumWindowRowsPerPostAndSignal: 100,
        },
        totals: { windowLikes: 0, windowSaves: 0, limited: false },
        posts: [],
        creators: [],
        categories: [],
        interpretation:
          "Synthetic empty-state preview. No measured activity is shown.",
        creditsSpent: 0,
        analysisStarted: false,
      }
    : snapshot?.scope === scope
      ? snapshot.data
      : null;
  const error = snapshot?.scope === scope && snapshot.failed;
  const receive = (value: Trends | null) => {
    setSnapshot({ scope, data: value ?? null, failed: !value });
  };
  useTrendsLive(organizationId, days, dayUTC, !demo, (value) => {
    // A live denial is authoritative too. An older HTTP read must not restore it.
    liveScope.current = scope;
    receive(value);
  });
  const load = useEffectEvent(async (active: () => boolean) => {
    if (demo) return;
    try {
      const value = await call("postTrends", {
        organizationId,
        windowDays: days,
        dayUTC,
      });
      if (active() && liveScope.current !== scope) receive(value);
    } catch {
      if (active() && liveScope.current !== scope) receive(null);
    }
  });
  useEffect(() => {
    let active = true;
    // oxlint-disable-next-line react/set-state-in-effect -- Synchronize a scoped external read, including a rejected session; loading is derived from the scope key.
    void load(() => active);
    return () => {
      active = false;
    };
  }, [organizationId, days, dayUTC, revision, demo]);
  if (error)
    return (
      <ErrorState
        title="Trends unavailable"
        detail="Check your current workspace access."
        onRetry={() => setRevision((n) => n + 1)}
      />
    );
  const count = (n: number, limited = false) =>
    `${n.toLocaleString()}${limited ? "+" : ""}`;
  function groups(title: string, items: Trends["creators"]) {
    const max = Math.max(1, ...items.map((item) => item.activity));
    return (
      <section className={styles.group}>
        <h2>{title}</h2>
        {!items.length ? (
          <p className={styles.muted}>More activity needed</p>
        ) : (
          items.map((item) => (
            <div className={styles.groupRow} key={item.name}>
              <div>
                <span>{item.name.replaceAll("_", " ")}</span>
                <strong>{count(item.activity, item.limited)}</strong>
              </div>
              <div className={styles.bar} aria-hidden="true">
                <span style={{ width: `${(100 * item.activity) / max}%` }} />
              </div>
              <small>
                {item.posts} sampled {item.posts === 1 ? "post" : "posts"}
              </small>
            </div>
          ))
        )}
      </section>
    );
  }
  return (
    <section className={styles.dashboard} aria-label="Workspace Trends">
      <div className={styles.heading}>
        <div>
          <h2>Post activity</h2>
        </div>
        <label>
          <span className="sr-only">Activity window</span>
          <select
            aria-label="Activity window"
            value={days}
            onChange={(event) => setDays(Number(event.target.value) as 7 | 30)}
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
          </select>
        </label>
      </div>
      {!data ? (
        <output className={styles.loading}>Loading activity…</output>
      ) : (
        <>
          <div className={styles.metrics}>
            <div>
              <Video size={18} aria-hidden="true" />
              <strong>{data.sample.posts}</strong>
              <span>Sampled posts</span>
            </div>
            <div>
              <Heart size={18} aria-hidden="true" />
              <strong>
                {count(data.totals.windowLikes, data.totals.limited)}
              </strong>
              <span>Current likes in window</span>
            </div>
            <div>
              <Share2 size={18} aria-hidden="true" />
              <strong>
                {count(data.totals.windowSaves, data.totals.limited)}
              </strong>
              <span>Recorded saves in window</span>
            </div>
          </div>
          {data.totals.windowLikes + data.totals.windowSaves === 0 && (
            <p className={styles.empty}>
              No recorded activity in this sample yet. Likes and Saves begin
              counting from tracking.
            </p>
          )}
          <div className={styles.groups}>
            {groups("Creator labels", data.creators)}
            {groups("Topics", data.categories)}
          </div>
          <section className={styles.posts}>
            <h2>Posts in this sample</h2>
            {data.posts.length ? (
              data.posts.map((post) => (
                <a
                  key={post.id}
                  href={`/app/${organizationId}/posts/${post.id}`}
                >
                  <div>
                    <strong>{post.title}</strong>
                    {post.creator && <small>{post.creator}</small>}
                  </div>
                  <span>
                    <Heart size={14} aria-hidden="true" />
                    {count(post.windowLikes, post.limited)}
                    <Share2 size={14} aria-hidden="true" />
                    {count(post.windowSaves, post.limited)}
                    <ArrowUpRight size={16} aria-hidden="true" />
                  </span>
                </a>
              ))
            ) : (
              <p className={styles.muted}>
                Save and analyze a post to start your sample.
              </p>
            )}
          </section>
          <details className={styles.method}>
            <summary>About these numbers</summary>
            <p>{data.interpretation}</p>
            <p>
              Up to {data.sample.maximumPosts} recent requested posts;{" "}
              {data.sample.posts} readable now
              {data.sample.moreAvailable
                ? ", more posts are outside this sample"
                : ""}
              . Each post/signal window is capped at100; + means a lower bound.
              Totals are from this sample, not your whole library. Historical
              activity is not backfilled. Creator labels are reported names, not
              verified identities.
            </p>
            <p>
              {demo
                ? "Empty-state preview"
                : `Calendar window through ${new Date(data.windowEnd - 1).toLocaleDateString(undefined, { timeZone: "UTC" })} UTC`}
              , including today. Likes are current preferences, not an immutable
              event count. No model or credits are used for this view.
            </p>
          </details>
        </>
      )}
    </section>
  );
}
