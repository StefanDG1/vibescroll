import { createHash } from "node:crypto";
import { z } from "zod";
import { createJobSandbox } from "./sandbox";
import { hardenAcquisition } from "./acquisition-isolation";
import { hardenSandbox } from "./isolation";
import { acquisitionPolicy } from "../media/acquisition";
import { acquirer } from "../media/acquirer";
import { preparedAcquirer } from "../media/preparedAcquirer";
import { preparedDecoder } from "../media/preparedDecoder";
import { preparedExtraction } from "../media/preparedExtraction";
import { decoderManifest } from "../media/manifest";
import { jpegDimensions } from "../media/jpeg";
import { ensure } from "../policy";
import { readResponseBytes } from "./binary";

const downloader = {
  version: "2026.10.26",
  bytes: 3073072,
  sha256: "e51e69e89489f199530f13d32a4342da3ddb2cf34842f364603a066db05afbf3",
  url: "https://github.com/yt-dlp/yt-dlp/releases/download/2026.10.26/yt-dlp",
};
const nativeMetadata = z.object({
  title: z.string().max(160).optional(),
  authorName: z.string().max(160).optional(),
  durationSeconds: z.number().positive().max(600).optional(),
  publishedAt: z.number().optional(),
  resolvedCanonical: z.string().url().max(2048),
});
const parser = {
  url: "https://files.pythonhosted.org/packages/4f/43/6b89c84f5a6753b1dbc43b8d010443b8f2314a2b94f34e448975d115c962/pysubs2-1.9.0-py3-none-any.whl",
  sha256: "83f1979cb7e064294f0c8473ef672ca2e5c0a7172bbf8ae9b4337899d5cdf01f",
};

export async function prepareHostedEvidence(
  url: string,
  callbacks: {
    stage: (stage: string) => Promise<void>;
    metadata: (metadata: z.infer<typeof nativeMetadata>) => Promise<void>;
    failed?: (receipt: Record<string, unknown>) => Promise<void>;
  },
) {
  const policy = acquisitionPolicy(url),
    times: Record<string, number> = {};
  const startedAt = Date.now();
  // The trusted controller verifies the pinned public tool before sending it to an isolated job.
  const toolResponse = await fetch(downloader.url, {
    signal: AbortSignal.timeout(15000),
  });
  ensure(
    toolResponse.ok,
    "SETUP_REQUIRED",
    "The pinned downloader could not be obtained.",
  );
  const tool = await readResponseBytes(toolResponse, downloader.bytes);
  ensure(
    tool.byteLength === downloader.bytes &&
      createHash("sha256").update(tool).digest("hex") === downloader.sha256,
    "POLICY_BLOCKED",
    "The pinned downloader bytes changed.",
  );
  times.toolReady = Date.now();
  const parserResponse = await fetch(parser.url, {
    signal: AbortSignal.timeout(10000),
    redirect: "error",
  });
  ensure(
    parserResponse.ok,
    "SETUP_REQUIRED",
    "The pinned caption parser is unavailable.",
  );
  const parserBytes = await readResponseBytes(parserResponse, 4 * 1024 * 1024);
  ensure(
    createHash("sha256").update(parserBytes).digest("hex") === parser.sha256,
    "POLICY_BLOCKED",
    "Caption parser bytes changed.",
  );
  times.toolsReady = Date.now();
  const sandbox = await createJobSandbox("acquisition", 120, policy.domains);
  times.created = Date.now();
  let stopped = false;
  let succeeded = false;
  const command = async (script: string, timeoutMs: number) => {
    const result = await sandbox.commands.run(script, {
      user: "user",
      cwd: "/home/user/media",
      timeoutMs,
    });
    ensure(
      result.exitCode === 0,
      "SOURCE_UNAVAILABLE",
      "The bounded media stage failed. No automatic retry was made.",
    );
  };
  try {
    await sandbox.files.write([
      {
        path: "/home/user/media/request.json",
        data: JSON.stringify({ url: policy.url }),
      },
      { path: "/home/user/media/acquire.py", data: acquirer },
      { path: "/home/user/media/acquire-prepared.py", data: preparedAcquirer },
      {
        path: "/home/user/media/cloud_extraction.py",
        data: preparedExtraction,
      },
      { path: "/home/user/media/decode-prepared.py", data: preparedDecoder },
      { path: "/home/user/tools/yt-dlp", data: tool },
      { path: "/home/user/tools/pysubs2.zip", data: parserBytes },
    ]);
    const permissions = await sandbox.commands.run(
      "chmod 700 /home/user/tools/yt-dlp",
      { user: "root", timeoutMs: 5000 },
    );
    ensure(
      permissions.exitCode === 0,
      "POLICY_BLOCKED",
      "Downloader permissions could not be established.",
    );
    await hardenAcquisition(sandbox);
    times.isolated = Date.now();
    await callbacks.stage("metadata");
    await command(
      "python3 /home/user/media/acquire-prepared.py inspect",
      30000,
    );
    const metadataBytes = await sandbox.files.read(
      "/home/user/media/metadata.json",
    );
    ensure(
      metadataBytes.length <= 5000,
      "INVALID_EVIDENCE",
      "Source metadata exceeded its bound.",
    );
    const metadata = nativeMetadata.parse(JSON.parse(metadataBytes));
    times.metadata = Date.now();
    await callbacks.metadata(metadata);
    await callbacks.stage("downloading");
    await command(
      "python3 /home/user/media/acquire-prepared.py download",
      60000,
    );
    times.downloaded = Date.now();
    await hardenSandbox(sandbox);
    await callbacks.stage("preparing");
    await command("python3 /home/user/media/decode-prepared.py", 65000);
    times.decoded = Date.now();
    const raw = await sandbox.files.read("/home/user/media/manifest.json");
    ensure(
      raw.length <= 20000,
      "INVALID_EVIDENCE",
      "Media manifest exceeded its bound.",
    );
    const manifest = decoderManifest(JSON.parse(raw), true);
    ensure(
      manifest.frames.length >= 1 && manifest.frames.length <= 8,
      "INVALID_EVIDENCE",
      "Prepared frame count is invalid.",
    );
    const receiptRaw = await sandbox.files.read(
      "/home/user/media/source-receipt.json",
    );
    ensure(
      receiptRaw.length <= 2000,
      "INVALID_EVIDENCE",
      "Source receipt exceeded its bound.",
    );
    const sourceReceipt = z
      .object({
        sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
        sourceBytes: z
          .number()
          .int()
          .positive()
          .max(50 * 1024 * 1024),
        width: z.number().int().positive().max(4096),
        height: z.number().int().positive().max(4096),
        ffmpegVersion: z.string().max(250),
        ffprobeVersion: z.string().max(250),
        pythonVersion: z.string().max(30),
      })
      .parse(JSON.parse(receiptRaw));
    const audio = manifest.audio
      ? await sandbox.files.read("/home/user/media/audio.wav", {
          format: "bytes",
        })
      : undefined;
    ensure(
      !audio || audio.byteLength <= 19500000,
      "INVALID_EVIDENCE",
      "Audio exceeded its bound.",
    );
    const frames = await Promise.all(
      manifest.frames.map(async (frame) => {
        const bytes = await sandbox.files.read(`/home/user/media/${frame.id}`, {
          format: "bytes",
        });
        ensure(
          bytes.byteLength > 0 && bytes.byteLength <= 150000,
          "INVALID_EVIDENCE",
          "Source JPEG exceeded its bound.",
        );
        return {
          id: frame.id.replace(".jpg", ""),
          timestampMs: frame.timestampMs,
          bytes,
          sha256: createHash("sha256").update(bytes).digest("hex"),
          ...jpegDimensions(bytes),
        };
      }),
    );
    let transcript: unknown;
    if (!audio) {
      const result = await sandbox.commands.run(
        "test -f /home/user/media/transcript.json",
        { user: "user", timeoutMs: 3000 },
      );
      if (result.exitCode === 0) {
        const native = await sandbox.files.read(
          "/home/user/media/transcript.json",
        );
        ensure(
          native.length <= 250000,
          "INVALID_EVIDENCE",
          "Native captions exceeded their bound.",
        );
        transcript = JSON.parse(native);
      }
    }
    times.transferred = Date.now();
    await sandbox.kill();
    stopped = true;
    times.stopped = Date.now();
    succeeded = true;
    return {
      metadata,
      manifest,
      sourceReceipt,
      frames,
      audio,
      transcript,
      times,
      startedAt,
      downloaderVersion: downloader.version,
      preparationRecipeHash: createHash("sha256")
        .update(
          JSON.stringify({
            version: "hosted-preparation-v1",
            downloader,
            parser,
            acquirer: createHash("sha256")
              .update(preparedAcquirer)
              .digest("hex"),
            decoder: createHash("sha256").update(preparedDecoder).digest("hex"),
            extraction: createHash("sha256")
              .update(preparedExtraction)
              .digest("hex"),
            ffmpeg: sourceReceipt.ffmpegVersion,
            ffprobe: sourceReceipt.ffprobeVersion,
            python: sourceReceipt.pythonVersion,
          }),
        )
        .digest("hex"),
      sandboxId: sandbox.sandboxId,
      stopped: true as const,
    };
  } finally {
    if (!stopped) {
      await sandbox.kill();
      stopped = true;
    }
    if (!succeeded)
      await callbacks.failed?.({
        startedAt,
        completedAt: Date.now(),
        sandboxId: sandbox.sandboxId,
        stopAcknowledged: stopped,
        providerDeletionVerified: false,
        times,
      });
  }
}
