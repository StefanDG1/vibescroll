import { createHash } from "node:crypto";
import { z } from "zod";
import { acquisitionPolicy } from "../media/acquisition";
import { xPostEvidence } from "../social/x-post";
import { canonicalJson } from "../contracts/canonical-json.mjs";
import { xPostUrl } from "../media/x-identity.mjs";
import { xPostWorker } from "../media/xPostWorker";
import { cloudDependencySetup } from "../media/cloudDependencySetup";
import tools from "../media/x-gallery.lock.json";
import { createJobSandbox } from "./sandbox";
import { hardenAcquisition } from "./acquisition-isolation";
import { hardenSandbox } from "./isolation";
import { readResponseBytes } from "./binary";
import { jpegDimensions } from "../media/jpeg";
import { ensure, PolicyError } from "../policy";

const hash = (bytes: string | Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const frame = z.strictObject({
  id: z.string().regex(/^asset-[1-9][0-9]?-frame-\d{3}\.jpg$/),
  timestampMs: z.number().int().nonnegative(),
  assetId: z.string(),
  assetIndex: z.number().int().nonnegative(),
});
const outputSchema = z.strictObject({
  post: xPostEvidence,
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
    }) => Promise<void>;
    failed?: (receipt: Record<string, unknown>) => Promise<void>;
    maximumDurationMs?: number;
  },
) {
  const policy = acquisitionPolicy(url);
  ensure(
    policy.platform === "x",
    "UNSUPPORTED_SOURCE",
    "Use a selected X post.",
  );
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
    tools.wheels.map(async (wheel) => {
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
  const command = async (stage: string, timeoutMs: number) => {
    const result = await sandbox.commands.run(
      `python3 /home/user/media/x-post-worker.py ${stage}`,
      { user: "user", cwd: "/home/user/media", timeoutMs },
    );
    ensure(
      result.exitCode === 0,
      "SOURCE_UNAVAILABLE",
      "The X post could not be completely retrieved. No access restriction was bypassed.",
    );
  };
  try {
    await sandbox.files.write([
      {
        path: "/home/user/media/request.json",
        data: JSON.stringify({ url: policy.url, maximumDurationMs }),
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
      ...wheels.map((data, i) => ({
        path: `/home/user/tools/wheel-${i}.zip`,
        data,
      })),
    ]);
    await command("setup", 15000);
    await hardenAcquisition(sandbox);
    phase = "metadata";
    await callbacks.stage(phase);
    await command("inspect", 45000);
    const metadata = z
      .object({
        title: z.string().max(160),
        authorName: z.string().max(160),
        resolvedCanonical: z.literal(policy.url),
      })
      .parse(
        JSON.parse(await sandbox.files.read("/home/user/media/metadata.json")),
      );
    await callbacks.metadata(metadata);
    times.metadata = Date.now();
    phase = "downloading";
    await callbacks.stage(phase);
    await command("download", 60000);
    times.downloaded = Date.now();
    await hardenSandbox(sandbox);
    phase = "preparing";
    await callbacks.stage(phase);
    await command("decode", 90000);
    const raw = await sandbox.files.read("/home/user/media/x-result.json");
    ensure(
      new TextEncoder().encode(raw).byteLength <= 240000,
      "INVALID_EVIDENCE",
      "The X post exceeds the preparation payload limit.",
    );
    const output = outputSchema.parse(JSON.parse(raw));
    const videos = output.post.assets.filter((a) => a.kind === "video");
    const speech = videos.filter((a) => a.audioStatus === "prepared");
    ensure(
      output.post.postId === xPostUrl(policy.url).postId &&
        output.post.textHash === hash(output.post.text) &&
        output.sourceHash ===
          hash(
            canonicalJson({
              canonical: policy.url,
              text: output.post.text,
              assets: output.post.assets,
            }),
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
      "The complete X post identity or attachment coverage changed.",
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
        output.post.provider === "gallery-dl"
          ? `gallery-dl/${tools.wheels[0].version}`
          : `fxtwitter/v2+gdl-${tools.wheels[0].version}`,
      preparationRecipeHash: hash(
        JSON.stringify({
          tools,
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
    if (callbacks.failed)
      await callbacks.failed({
        phase,
        code:
          error instanceof PolicyError ? error.code : "X_PREPARATION_FAILED",
        sandboxId: sandbox.sandboxId,
        startedAt,
        times,
      });
    throw error;
  } finally {
    if (!stopped) await sandbox.kill();
  }
}
