import type { readAuthorizedInstagramPost } from "../social/creator-feed";
import { createHash } from "node:crypto";
import { z } from "zod";
import { acquisitionPolicy } from "../media/acquisition";
import {
  preparedPostCanonicalMatches,
  preparedPostEvidence,
  preparedPostSourceIdentity,
} from "../social/prepared-post";
import { socialPublicPost } from "../media/socialPublicPost";
import { isInstagramSharePath, socialPostUrl } from "../social/identity.mjs";
import { xPostWorker } from "../media/xPostWorker";
import { cloudDependencySetup } from "../media/cloudDependencySetup";
import tools from "../media/x-gallery.lock.json";
import { createJobSandbox } from "./sandbox";
import { hardenAcquisition } from "./acquisition-isolation";
import { hardenSandbox } from "./isolation";
import { readResponseBytes } from "./binary";
import { jpegDimensions } from "../media/jpeg";
import { ensure, PolicyError } from "../policy";
import { acquirer } from "../media/acquirer";
import { preparedAcquirer } from "../media/preparedAcquirer";
import { preparedExtraction } from "../media/preparedExtraction";
import {
  preparedDownloader,
  readPreparedDownloader,
} from "./prepared-downloader";

const hash = (bytes: string | Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const frame = z.strictObject({
  id: z.string().regex(/^asset-[1-9][0-9]?-frame-\d{3}\.jpg$/),
  timestampMs: z.number().int().nonnegative(),
  assetId: z.string(),
  assetIndex: z.number().int().nonnegative(),
});
const outputSchema = z.strictObject({
  post: preparedPostEvidence,
  durationMs: z.number().int().min(0).max(600000),
  frames: z.array(frame).max(48),
  audios: z
    .array(
      z.strictObject({
        file: z.string().regex(/^asset-[1-9][0-9]?\.wav$/),
        assetId: z.string(),
        assetIndex: z.number().int().min(0).max(34),
        durationMs: z.number().int().positive().max(600000),
      }),
    )
    .max(35),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  sourceBytes: z
    .number()
    .int()
    .min(0)
    .max(50 * 1024 * 1024),
  ffmpegVersion: z.string().max(250),
  ffprobeVersion: z.string().max(250),
  pythonVersion: z.string().max(30),
});

export async function prepareHostedXPost(
  url: string,
  callbacks: {
    stage: (stage: string) => Promise<void>;
    metadata: (metadata: {
      title?: string;
      authorName?: string;
      resolvedCanonical: string;
      durationSeconds?: number;
      publishedAt?: number;
    }) => Promise<void>;
    failed?: (receipt: Record<string, unknown>) => Promise<void>;
    maximumDurationMs?: number;
    authorizedInstagram?: Awaited<
      ReturnType<typeof readAuthorizedInstagramPost>
    >;
  },
) {
  const policy = acquisitionPolicy(url);
  ensure(
    ["x", "instagram", "tiktok"].includes(policy.platform),
    "UNSUPPORTED_SOURCE",
    "Use a selected social post.",
  );
  const x = policy.platform === "x";
  const instagramEmbed =
    policy.platform === "instagram" &&
    process.env.VIBESCROLL_INSTAGRAM_PUBLIC_EMBED_ENABLED === "true";
  const maximumDurationMs = callbacks.maximumDurationMs ?? 600000;
  ensure(
    Number.isSafeInteger(maximumDurationMs) &&
      maximumDurationMs > 0 &&
      maximumDurationMs <= 600000,
    "INVALID_INPUT",
    "Use a bounded post preparation.",
  );
  const startedAt = Date.now(),
    times: Record<string, number> = {};
  // Only these hash-pinned pure wheels enter the VM. No install hooks execute.
  const wheels = await Promise.all(
    (x ? tools.wheels : []).map(async (wheel) => {
      const response = await fetch(wheel.url, {
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      });
      ensure(
        response.ok,
        "SETUP_REQUIRED",
        "The pinned X retrieval tool is unavailable.",
      );
      const bytes = await readResponseBytes(response, 4 * 1024 * 1024);
      ensure(
        hash(bytes) === wheel.sha256,
        "POLICY_BLOCKED",
        "X retrieval tool bytes changed.",
      );
      return bytes;
    }),
  );
  times.toolsReady = Date.now();
  const sandbox = await createJobSandbox("acquisition", 240, policy.domains);
  let stopped = false,
    phase = "setup";
  let failure: Record<string, unknown> | null = null;
  const run = async (script: string, timeoutMs: number) => {
    const result = await sandbox.commands.run(script, {
      user: "user",
      cwd: "/home/user/media",
      timeoutMs,
    });
    ensure(
      result.exitCode === 0,
      "SOURCE_UNAVAILABLE",
      "The source post could not be completely retrieved.",
    );
  };
  const command = (stage: string, timeoutMs: number) =>
    run(`python3 /home/user/media/x-post-worker.py ${stage}`, timeoutMs);
  try {
    await sandbox.files.write([
      {
        path: "/home/user/media/request.json",
        data: JSON.stringify({
          url: policy.url,
          platform: policy.platform,
          maximumDurationMs,
          ...(instagramEmbed ? { instagramEmbed } : {}),
          ...(callbacks.authorizedInstagram
            ? { authorizedInstagram: callbacks.authorizedInstagram }
            : {}),
        }),
      },
      {
        path: "/home/user/media/x-dependencies.json",
        data: JSON.stringify(tools.wheels),
      },
      { path: "/home/user/media/x-post-worker.py", data: xPostWorker },
      {
        path: "/home/user/media/prepare_cloud_dependencies.py",
        data: cloudDependencySetup,
      },
      ...(x
        ? []
        : [
            {
              path: "/home/user/media/social_public_post.py",
              data: socialPublicPost,
            },
          ]),
      ...wheels.map((data, i) => ({
        path: `/home/user/tools/wheel-${i}.zip`,
        data,
      })),
    ]);
    await hardenAcquisition(sandbox);
    if (x) await command("setup", 15000);
    phase = "metadata";
    await callbacks.stage(phase);
    await command("inspect", 45000);
    const metadata = z
      .object({
        title: z.string().max(160),
        authorName: z.string().max(160),
        resolvedCanonical: x ? z.literal(policy.url) : z.url().max(2048),
        publishedAt: z.number().int().positive().optional(),
        singleTikTokVideo: z.boolean().optional(),
      })
      .parse(
        JSON.parse(await sandbox.files.read("/home/user/media/metadata.json")),
      );
    await callbacks.metadata(metadata);
    times.metadata = Date.now();
    phase = "downloading";
    await callbacks.stage(phase);
    const verifiedTikTokVideo = metadata.singleTikTokVideo === true;
    if (verifiedTikTokVideo) {
      const canonical = socialPostUrl(metadata.resolvedCanonical);
      ensure(
        policy.platform === "tiktok" &&
          canonical.platform === "tiktok" &&
          canonical.canonical === metadata.resolvedCanonical &&
          new URL(canonical.canonical).pathname.includes("/video/") &&
          sourceReferenceMatches(policy.url, canonical.postKey),
        "INVALID_EVIDENCE",
        "The verified TikTok video identity changed before retrieval.",
      );
      await sandbox.files.write([
        {
          path: "/home/user/media/request.json",
          data: JSON.stringify({ url: canonical.canonical, maximumDurationMs }),
        },
        { path: "/home/user/media/acquire.py", data: acquirer },
        {
          path: "/home/user/media/acquire-prepared.py",
          data: preparedAcquirer,
        },
        {
          path: "/home/user/media/cloud_extraction.py",
          data: preparedExtraction,
        },
        {
          path: "/home/user/tools/yt-dlp",
          data: await readPreparedDownloader(),
        },
      ]);
      const permissions = await sandbox.commands.run(
        "chmod 700 /home/user/tools/yt-dlp",
        {
          user: "root",
          timeoutMs: 5000,
        },
      );
      ensure(
        permissions.exitCode === 0,
        "POLICY_BLOCKED",
        "Downloader permissions could not be established.",
      );
      await run("python3 /home/user/media/acquire-prepared.py inspect", 30000);
      await run(
        "python3 /home/user/media/acquire-prepared.py download-media",
        60000,
      );
    } else {
      await command("download", 60000);
    }
    times.downloaded = Date.now();
    await hardenSandbox(sandbox);
    phase = "preparing";
    await callbacks.stage(phase);
    if (verifiedTikTokVideo) await command("adopt-tiktok-video", 40000);
    await command("decode", 90000);
    const rawBytes = await sandbox.files.read(
      "/home/user/media/x-result.json",
      { format: "bytes" },
    );
    ensure(
      rawBytes.byteLength <= 240000,
      "INVALID_EVIDENCE",
      "The X post exceeds the preparation payload limit.",
    );
    const output = outputSchema.parse(
      JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(rawBytes)),
    );
    const videos = output.post.assets.filter((a) => a.kind === "video");
    const speech = videos.filter((a) => a.audioStatus === "prepared");
    ensure(
      preparedPostCanonicalMatches(metadata.resolvedCanonical, output.post) &&
        (output.post.version === "x-post-evidence-v1"
          ? x
          : !x &&
            output.post.platform === policy.platform &&
            sourceReferenceMatches(policy.url, output.post.postId) &&
            output.post.publishedAt === (metadata.publishedAt ?? null) &&
            (output.post.provider !== "instagram_embed" || instagramEmbed) &&
            (!verifiedTikTokVideo ||
              (output.post.assets.length === 1 && videos.length === 1))) &&
        output.post.textHash === hash(output.post.text) &&
        output.sourceHash ===
          hash(
            preparedPostSourceIdentity(metadata.resolvedCanonical, output.post),
          ) &&
        output.sourceBytes ===
          output.post.assets.reduce((n, a) => n + a.bytes, 0) &&
        output.durationMs === videos.reduce((n, a) => n + a.durationMs, 0) &&
        output.audios.length === speech.length &&
        speech.every(
          (a) =>
            output.audios.filter(
              (part) =>
                part.assetId === a.id &&
                part.assetIndex === a.index &&
                part.file === `${a.id}.wav` &&
                part.durationMs === a.durationMs,
            ).length === 1,
        ) &&
        new Set(output.frames.map((f) => f.id)).size === output.frames.length &&
        output.post.assets.every((a) =>
          output.frames.some(
            (f) => f.assetId === a.id && f.assetIndex === a.index,
          ),
        ) &&
        output.frames.every((f) =>
          output.post.assets.some(
            (a) =>
              a.id === f.assetId &&
              a.index === f.assetIndex &&
              f.id.startsWith(a.id + "-frame-") &&
              (a.kind === "image"
                ? f.timestampMs === 0
                : f.timestampMs < a.durationMs),
          ),
        ),
      "INVALID_EVIDENCE",
      "The post identity or attachment coverage changed.",
    );
    ensure(
      output.durationMs <= maximumDurationMs,
      "QUOTE_CHANGED",
      "The post exceeds the reviewed total video duration.",
    );
    const frames = await Promise.all(
      output.frames.map(async (f) => {
        const bytes = await sandbox.files.read(`/home/user/media/${f.id}`, {
          format: "bytes",
        });
        ensure(
          bytes.byteLength <= 150000,
          "INVALID_EVIDENCE",
          "An attachment image exceeded its bound.",
        );
        return {
          ...f,
          id: f.id.replace(".jpg", ""),
          bytes,
          sha256: hash(bytes),
          ...jpegDimensions(bytes),
        };
      }),
    );
    const audioParts = await Promise.all(
      output.audios.map(async (a) => {
        const bytes = await sandbox.files.read(`/home/user/media/${a.file}`, {
          format: "bytes",
        });
        return {
          assetId: a.assetId,
          assetIndex: a.assetIndex,
          durationMs: a.durationMs,
          bytes,
        };
      }),
    );
    ensure(
      audioParts.reduce((n, a) => n + a.bytes.byteLength, 0) <= 19500000,
      "INVALID_EVIDENCE",
      "The post audio exceeded its aggregate bound.",
    );
    times.transferred = Date.now();
    await sandbox.kill();
    stopped = true;
    times.stopped = Date.now();
    const {
      sourceHash,
      sourceBytes,
      ffmpegVersion,
      ffprobeVersion,
      pythonVersion,
    } = output;
    return {
      metadata,
      post: output.post,
      audioParts,
      audio: undefined,
      transcript: undefined,
      manifest: {
        durationSeconds: output.durationMs / 1000,
        frames: output.frames,
      },
      sourceReceipt: {
        sourceHash,
        sourceBytes,
        width: output.post.assets[0]?.width ?? 0,
        height: output.post.assets[0]?.height ?? 0,
        ffmpegVersion,
        ffprobeVersion,
        pythonVersion,
      },
      frames,
      times,
      startedAt,
      downloaderVersion:
        output.post.provider === "instagram_graph"
          ? "instagram-graph-v27"
          : output.post.provider === "instagram_embed"
            ? "instagram-public-embed-v1"
            : output.post.provider === "public_page"
              ? verifiedTikTokVideo
                ? `public-post-page-v1+yt-dlp/${preparedDownloader.version}`
                : "public-post-page-v1"
              : output.post.provider === "gallery-dl"
                ? `gallery-dl/${tools.wheels[0].version}`
                : `fxtwitter/v2+gdl-${tools.wheels[0].version}`,
      preparationRecipeHash: hash(
        JSON.stringify({
          ...(x ? { tools } : { publicPageParser: hash(socialPublicPost) }),
          ...(verifiedTikTokVideo
            ? {
                preparedDownloader,
                reader: hash(acquirer),
                videoAcquirer: hash(preparedAcquirer),
                extraction: hash(preparedExtraction),
              }
            : {}),
          worker: hash(xPostWorker),
          dependencySetup: hash(cloudDependencySetup),
          ffmpegVersion,
          ffprobeVersion,
          pythonVersion,
        }),
      ),
      sandboxId: sandbox.sandboxId,
      stopped: true as const,
    };
  } catch (error) {
    failure = {
      phase,
      code:
        error instanceof PolicyError ? error.code : "POST_PREPARATION_FAILED",
    };
    throw error;
  } finally {
    if (!stopped) {
      await sandbox.kill();
      stopped = true;
      times.stopped = Date.now();
    }
    if (failure)
      await callbacks.failed?.({
        ...failure,
        sandboxId: sandbox.sandboxId,
        startedAt,
        times,
        completedAt: Date.now(),
        stopAcknowledged: stopped,
        providerDeletionVerified: false,
      });
  }
}

function sourceReferenceMatches(raw: string, postId: string) {
  const url = new URL(raw);
  if (
    ["www.instagram.com", "instagram.com"].includes(url.hostname) &&
    isInstagramSharePath(url.pathname)
  )
    return true;
  if (
    (url.hostname === "vm.tiktok.com" || url.hostname === "vt.tiktok.com") &&
    /^\/[A-Za-z0-9]{5,30}\/?$/.test(url.pathname)
  )
    return true;
  if (
    ["www.tiktok.com", "tiktok.com"].includes(url.hostname) &&
    /^\/t\/[A-Za-z0-9]{5,30}\/?$/.test(url.pathname)
  )
    return true;
  return socialPostUrl(url.href).postKey === postId;
}
