"use client";
import { useState } from "react";
import { Heart, MoreVertical, Users } from "lucide-react";
import { Tooltip } from "@companynerve/ui";
import styles from "./post-engagement.module.css";

/** Distinct people submitting a link, including cache hits, not outbound shares. */
export function PostEngagement({
  likes,
  requests,
  liked = false,
  onLike,
  onSettings,
  busy = false,
  notice = "",
}: {
  likes?: number;
  requests?: number;
  liked?: boolean;
  onLike?: () => void;
  onSettings: () => void;
  busy?: boolean;
  notice?: string;
}) {
  const [requestHelpOpen, setRequestHelpOpen] = useState(false);
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
            disabled={!onLike || busy}
            aria-busy={busy}
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
        <Tooltip.Provider delayDuration={200}>
          <Tooltip.Root
            open={requestHelpOpen}
            onOpenChange={setRequestHelpOpen}
          >
            <Tooltip.Trigger asChild>
              <button
                type="button"
                onClick={() => setRequestHelpOpen(true)}
                aria-label={
                  requests === undefined
                    ? "Post request count unavailable"
                    : `${requests} ${requests === 1 ? "person has" : "people have"} requested this post`
                }
              >
                <Users size={24} aria-hidden="true" />
                <span>{requests ?? "—"}</span>
              </button>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content
                className={styles.tooltip}
                side="top"
                sideOffset={8}
                collisionPadding={16}
              >
                People who sent this link to VibeScroll, including cached
                results. Each person counts once, since tracking began.
                <Tooltip.Arrow className={styles.tooltipArrow} />
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
        </Tooltip.Provider>
        <button
          type="button"
          onClick={onSettings}
          className={styles.more}
          aria-label="Post settings"
        >
          <MoreVertical size={22} aria-hidden="true" />
        </button>
      </div>
      {notice && (
        <p role="alert" className={styles.notice}>
          {notice}
        </p>
      )}
    </>
  );
}
