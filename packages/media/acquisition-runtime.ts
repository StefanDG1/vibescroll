import { z } from "zod";
import { safeSourceUrl, ensure } from "./acquisition-policy.mjs";
import { containsSecret } from "../policy/secrets.mjs";
import release from "../../infra/downloader.json" with { type: "json" };

export const downloaderRelease = release;

// Only supported post identifiers enter the isolated downloader. A platform
// home page, arbitrary URL path, playlist or supplied CDN URL is not a job.
export function acquisitionPolicy(raw: string) {
  ensure(
    !/\/(?:\.|%2e)(?:\.|%2e)?(?:\/|%2f|$)/i.test(raw.split("?")[0]),
    "UNSUPPORTED_SOURCE",
    "Use a source identifier without path traversal.",
  );
  const url = new URL(safeSourceUrl(raw));
  const host = url.hostname.replace(/^www\./, "");
  let platform: "youtube" | "instagram" | "vimeo" | "tiktok";
  if (host === "youtube.com" || host === "youtu.be") {
    platform = "youtube";
    ensure(
      host === "youtu.be"
        ? /^\/[A-Za-z0-9_-]{11}\/?$/.test(url.pathname)
        : (url.pathname === "/watch" &&
            /^[A-Za-z0-9_-]{11}$/.test(url.searchParams.get("v") ?? "")) ||
            /^\/(shorts|embed)\/[A-Za-z0-9_-]{11}\/?$/.test(url.pathname),
      "UNSUPPORTED_SOURCE",
      "Use a single video link.",
    );
  } else if (host === "instagram.com") {
    platform = "instagram";
    ensure(
      /^\/(p|reel|reels)\/[A-Za-z0-9_-]{5,30}\/?$/.test(url.pathname),
      "UNSUPPORTED_SOURCE",
      "Use an Instagram post or reel link.",
    );
  } else if (host === "vimeo.com") {
    platform = "vimeo";
    ensure(
      /^\/[0-9]{5,15}\/?$/.test(url.pathname),
      "UNSUPPORTED_SOURCE",
      "Use a public single-video link.",
    );
  } else {
    platform = "tiktok";
    ensure(
      host === "vm.tiktok.com"
        ? /^\/[A-Za-z0-9]{5,30}\/?$/.test(url.pathname)
        : host === "tiktok.com" &&
            /^\/@[A-Za-z0-9_.]{1,40}\/video\/[0-9]{10,25}\/?$/.test(
              url.pathname,
            ),
      "UNSUPPORTED_SOURCE",
      "Use a single supported post link.",
    );
  }
  const domains = {
    youtube: [
      "youtube.com",
      "*.youtube.com",
      "youtu.be",
      "*.googlevideo.com",
      "*.ytimg.com",
    ],
    instagram: [
      "instagram.com",
      "*.instagram.com",
      "*.cdninstagram.com",
      "*.fbcdn.net",
    ],
    vimeo: ["vimeo.com", "*.vimeo.com", "*.vimeocdn.com"],
    tiktok: [
      "tiktok.com",
      "*.tiktok.com",
      "*.tiktokcdn.com",
      "*.tiktokcdn-us.com",
      "*.tiktokcdn-eu.com",
      "*.byteoversea.com",
      "*.ibytedtos.com",
      "*.muscdn.com",
    ],
  }[platform];
  return { url: url.toString(), platform, domains };
}

export const acquisitionManifest = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    status: z.enum([
      "acquired",
      "downloaded",
      "needs_auth",
      "rate_limited",
      "unavailable",
      "unsupported",
      "over_limit",
      "failed",
    ]),
    title: z.string().max(160),
    description: z.string().max(6000),
    publishedAt: z.number().int().min(1).max(4102444800000).optional(),
    durationSeconds: z.number().min(0).max(600).optional(),
    byteLength: z.number().int().min(1).max(250000000).optional(),
    extractor: z.string().max(80),
    downloaderVersion: z.literal(downloaderRelease.version),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (containsSecret(value.title) || containsSecret(value.description))
      ctx.addIssue({
        code: "custom",
        message: "Source metadata contains a credential.",
      });
    if (
      value.status === "acquired" &&
      (!value.byteLength || !value.durationSeconds)
    )
      ctx.addIssue({
        code: "custom",
        message: "Acquired media needs verified bounds.",
      });
    if (value.status === "downloaded" && !value.byteLength)
      ctx.addIssue({
        code: "custom",
        message: "Downloaded media needs a bounded byte count.",
      });
  });

export function acquisitionMessage(status: string) {
  return (
    {
      needs_auth:
        "This platform requires sign-in to retrieve this post. No login or access restriction was bypassed. Keep the link or attach permitted media.",
      rate_limited:
        "The platform temporarily blocked link retrieval with a rate limit. Your link is saved. Retry later or attach permitted media; no sign-in restriction was bypassed.",
      unavailable:
        "This post could not be retrieved. It may be private, removed, or blocked by the platform. The saved link is still available.",
      unsupported:
        "This post's format is not supported by the link downloader. Keep the link or attach permitted media.",
      over_limit: "This post exceeds the 250 MB or 10-minute processing limit.",
      failed:
        "Link retrieval did not finish. Review its status before retrying; no alternate AI provider was used.",
      downloaded:
        "The video was retrieved, but media preparation did not finish. Review its status before retrying.",
    }[status] ?? "Link retrieval did not complete."
  );
}
