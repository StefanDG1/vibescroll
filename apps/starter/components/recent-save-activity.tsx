import Link from "next/link";
import { Bookmark, CalendarDays } from "lucide-react";
import type { FeedPage } from "../lib/home-feed";

const dateLabel = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

export function RecentSaveActivity({
  organizationId,
  recent,
  onSave,
}: {
  organizationId: string;
  recent?: FeedPage;
  onSave: () => void;
}) {
  const posts = recent?.items ?? [];
  const days = new Map<string, { timestamp: number; count: number }>();
  for (const post of posts) {
    const key = new Date(post.createdAt).toISOString().slice(0, 10);
    const previous = days.get(key);
    days.set(key, { timestamp: post.createdAt, count: (previous?.count ?? 0) + 1 });
  }
  const observations = [...days.values()]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 7)
    .reverse();
  const max = Math.max(1, ...observations.map((day) => day.count));

  return (
    <section className="recent-save-activity" aria-labelledby="recent-save-title">
      <header>
        <h2 id="recent-save-title">Recent saves</h2>
        {posts.length > 0 && (
          <p>Last {posts.length} saved {posts.length === 1 ? "post" : "posts"}</p>
        )}
      </header>
      {posts.length ? (
        <div className="recent-save-grid">
          <section aria-labelledby="recent-save-days">
            <h3 id="recent-save-days"><CalendarDays size={17} aria-hidden="true" /> Posts by day</h3>
            <dl className="recent-save-chart">
              {observations.map((day) => (
                <div key={day.timestamp}>
                  <dt>{dateLabel.format(day.timestamp)}</dt>
                  <dd>
                    <span aria-hidden="true"><i style={{ width: `${(100 * day.count) / max}%` }} /></span>
                    <strong aria-label={`${day.count} saved ${day.count === 1 ? "post" : "posts"}`}>{day.count}</strong>
                  </dd>
                </div>
              ))}
            </dl>
          </section>
          <section aria-labelledby="recent-save-posts">
            <h3 id="recent-save-posts"><Bookmark size={17} aria-hidden="true" /> Latest posts</h3>
            <ul className="recent-save-posts">
              {posts.slice(0, 5).map((post) => (
                <li key={post.id}>
                  <Link href={`/app/${organizationId}/posts/${post.id}`} prefetch={false}>
                    {post.title}
                  </Link>
                  <time dateTime={new Date(post.createdAt).toISOString()}>
                    {dateLabel.format(post.createdAt)}
                  </time>
                </li>
              ))}
            </ul>
          </section>
        </div>
      ) : (
        <div className="recent-save-empty">
          <p>Save a post to see it here.</p>
          <button type="button" className="button primary" onClick={onSave}>Save a post</button>
        </div>
      )}
    </section>
  );
}
