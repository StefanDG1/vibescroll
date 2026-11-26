"use client";

import { useRef, useState } from "react";
import {
  ArrowUpRight,
  Camera,
  ChevronLeft,
  ChevronRight,
  Globe,
  Music2,
  Play,
  SquarePlay,
} from "lucide-react";
import type { PostSlide } from "../lib/home-feed";
import styles from "./post-source-media.module.css";

const platformIcons = {
  Instagram: Camera,
  TikTok: Music2,
  YouTube: SquarePlay,
  X: null,
  Facebook: null,
  Vimeo: null,
  Web: Globe,
};

function originalPlatform(url: URL) {
  const host = url.hostname.replace(/^www\./, "");
  if (host === "instagram.com") return "Instagram";
  if (host === "tiktok.com" || host.endsWith(".tiktok.com")) return "TikTok";
  if (["youtube.com", "youtu.be"].includes(host)) return "YouTube";
  if (["x.com", "twitter.com", "mobile.twitter.com"].includes(host)) return "X";
  if (["vimeo.com", "player.vimeo.com"].includes(host)) return "Vimeo";
  if (["facebook.com", "fb.watch", "m.facebook.com"].includes(host))
    return "Facebook";
  return "Web";
}

export function PostOriginals({ urls }: { urls: string[] }) {
  const originals = [...new Set(urls)].flatMap((href) => {
    try {
      const url = new URL(href);
      if (url.protocol === "https:" && !url.username && !url.password)
        return [url];
    } catch {
      // Legacy entries may lack a browser-safe original URL.
    }
    return [];
  });
  if (!originals.length) return null;
  return (
    <span className={styles.originals}>
      {originals.map((url) => {
        const platform = originalPlatform(url);
        const Icon = platformIcons[platform];
        return (
          <a
            key={url.href}
            className={styles.original}
            href={url.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open original on ${platform}`}
            title={`Open original on ${platform}`}
          >
            {Icon ? (
              <Icon size={16} aria-hidden="true" />
            ) : (
              <span aria-hidden="true">
                {platform === "Facebook"
                  ? "f"
                  : platform === "Vimeo"
                    ? "v"
                    : "𝕏"}
              </span>
            )}
          </a>
        );
      })}
    </span>
  );
}

export function PostMediaCarousel({
  slides,
  original,
}: {
  slides: PostSlide[];
  original?: string | null;
}) {
  const [visible, setVisible] = useState(0);
  const gesture = useRef<{ x: number; y: number } | null>(null);
  const position = Math.min(visible, slides.length - 1);
  const slide = slides[position];
  if (!slide) return null;
  const step = (delta: number) =>
    setVisible((current) =>
      Math.max(0, Math.min(slides.length - 1, current + delta)),
    );
  return (
    <div
      className={styles.carousel}
      data-post-carousel
      data-portrait={slides[0]?.portrait || undefined}
      onPointerDown={(event) => {
        if (
          event.pointerType !== "touch" ||
          !event.isPrimary ||
          (event.target as Element).closest("button,a")
        )
          return;
        gesture.current = { x: event.clientX, y: event.clientY };
      }}
      onPointerUp={(event) => {
        const start = gesture.current;
        gesture.current = null;
        if (!start) return;
        const dx = event.clientX - start.x;
        const dy = event.clientY - start.y;
        if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.5)
          step(dx < 0 ? 1 : -1);
      }}
      onPointerCancel={() => {
        gesture.current = null;
      }}
    >
      {/* The authorization-checked evidence endpoint must receive the browser's credentials. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        draggable={false}
        src={`/api/evidence/${encodeURIComponent(slide.id)}?inline=true`}
        alt={
          slide.kind === "image"
            ? `Original image ${slide.index + 1}`
            : `Video preview ${slide.index + 1}`
        }
      />
      {slide.kind === "video" && original && (
        <a
          className={styles.originalVideo}
          href={original}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Play size={15} aria-hidden="true" /> Play original{" "}
          <ArrowUpRight size={14} aria-hidden="true" />
        </a>
      )}
      {slides.length > 1 && (
        <div className={styles.controls}>
          <button
            type="button"
            aria-label="Previous slide"
            disabled={position === 0}
            onClick={() => step(-1)}
          >
            <ChevronLeft size={20} aria-hidden="true" />
          </button>
          <output aria-live="polite">
            {position + 1} / {slides.length}
          </output>
          <button
            type="button"
            aria-label="Next slide"
            disabled={position === slides.length - 1}
            onClick={() => step(1)}
          >
            <ChevronRight size={20} aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}

export function OriginalCaption({ caption }: { caption: string }) {
  if (!caption) return null;
  return caption.length <= 180 ? (
    <p className={styles.caption}>{caption}</p>
  ) : (
    <details className={styles.caption}>
      <summary>Original caption</summary>
      <p>{caption}</p>
    </details>
  );
}
