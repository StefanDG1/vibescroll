"use client";
import { useState } from "react";
import { Check, Heart, MoreVertical, Share2 } from "lucide-react";
import styles from "./post-engagement.module.css";

/** Count adapters are optional until durable engagement is available. Unknown totals stay unknown. */
export function PostEngagement({
  title,
  url,
  likes,
  shares,
  liked = false,
  onLike,
  onSettings,
}: {
  title: string;
  url: string;
  likes?: number;
  shares?: number;
  liked?: boolean;
  onLike?: () => void;
  onSettings: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  async function share() {
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        setAnnouncement("Shared.");
      } else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setAnnouncement("Post link copied.");
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError"))
        setAnnouncement(
          "Could not share. Open post settings to copy its link.",
        );
    }
  }
  return (
    <div className={styles.row} data-slot="post-engagement">
      <span
        className={styles.reaction}
        title={onLike ? "Like this post" : "Likes are not connected yet"}
      >
        <button
          type="button"
          aria-label={liked ? "Unlike post" : "Like post"}
          aria-pressed={liked}
          disabled={!onLike}
          onClick={onLike}
        >
          <Heart
            size={25}
            fill={liked ? "currentColor" : "none"}
            className={liked ? styles.liked : undefined}
            aria-hidden="true"
          />
          <span
            aria-label={
              likes === undefined ? "Like total unavailable" : `${likes} likes`
            }
          >
            {likes ?? "—"}
          </span>
        </button>
      </span>
      <span className={styles.separator} aria-hidden="true" />
      <button
        type="button"
        onClick={() => {
          void share();
        }}
        aria-label="Share post"
        title="Share this post"
      >
        {copied ? (
          <Check size={24} aria-hidden="true" />
        ) : (
          <Share2 size={24} aria-hidden="true" />
        )}
        <span
          title="Shares to VibeScroll"
          aria-label={
            shares === undefined
              ? "Share total unavailable"
              : `${shares} shares to VibeScroll`
          }
        >
          {shares ?? "—"}
        </span>
      </button>
      <button
        type="button"
        onClick={onSettings}
        className={styles.more}
        aria-label="Post settings"
      >
        <MoreVertical size={22} aria-hidden="true" />
      </button>
      <output className="sr-only" aria-live="polite">
        {announcement}
      </output>
    </div>
  );
}
