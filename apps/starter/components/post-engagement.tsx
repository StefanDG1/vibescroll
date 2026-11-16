"use client";
import { Heart, MoreVertical, Users } from "lucide-react";
import styles from "./post-engagement.module.css";

/** Distinct people submitting a link, including cache hits, not outbound shares. */
export function PostEngagement({
  likes,
  requests,
  liked = false,
  onLike,
  onSettings,
  notice = "",
}: {
  likes?: number;
  requests?: number;
  liked?: boolean;
  onLike?: () => void;
  onSettings?: () => void;
  notice?: string;
}) {
  return (
    <>
      <div className={styles.row} data-slot="post-engagement">
        <span
          className={styles.reaction}
          title={onLike ? "Like this post" : "Likes unavailable"}
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
                likes === undefined
                  ? "Like total unavailable"
                  : `${likes} likes`
              }
            >
              {likes ?? "—"}
            </span>
          </button>
        </span>
        <span className={styles.separator} aria-hidden="true" />
        <span className={styles.requests}>
          <Users size={24} aria-hidden="true" />
          <span className="sr-only">
            {requests === undefined
              ? "Post request count unavailable"
              : requests === 1
                ? "1 person has requested this post"
                : requests + " people have requested this post"}
          </span>
          <span aria-hidden="true">{requests ?? "—"}</span>
        </span>
        {onSettings && (
          <button
            type="button"
            onClick={onSettings}
            className={styles.more}
            aria-label="Post settings"
          >
            <MoreVertical size={22} aria-hidden="true" />
          </button>
        )}
      </div>
      {notice && (
        <p role="alert" className={styles.notice}>
          {notice}
        </p>
      )}
    </>
  );
}
