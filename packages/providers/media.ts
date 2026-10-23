import { createJobSandbox } from "./sandbox";
import { hardenSandbox } from "./isolation";
import { signedObject } from "./storage";
import { ensure } from "../policy";
import { decoderManifest } from "../media/manifest";
import { createHash } from "node:crypto";
import { exactArrayBuffer } from "./binary";
import {
  acquisitionManifest,
  acquisitionPolicy,
  acquisitionMessage,
} from "../media/acquisition";
import { acquirer } from "../media/acquirer";
import { hardenAcquisition } from "./acquisition-isolation";
import type { z } from "zod";
import type { PreparationRuntime } from "./preparation-runtime";
type Acquisition = z.infer<typeof acquisitionManifest>;
export class MediaPreparationError extends Error {
  constructor(
    public readonly computeSeconds: number | undefined,
    public readonly acquisition?: Acquisition,
  ) {
    super(
      acquisition && acquisition.status !== "acquired"
        ? acquisitionMessage(acquisition.status)
        : "Media preparation did not complete.",
    );
  }
}
export async function prepareMedia(
  input: string | { url: string },
  decoder: string,
  normalizedPcm = false,
  options: { expectedRuntime?: PreparationRuntime } = {},
) {
  const link =
    typeof input === "string" ? undefined : acquisitionPolicy(input.url);
  ensure(
    process.env.MEDIA_VERIFIED === "true",
    "MEDIA_UNAVAILABLE",
    "Verify the pinned isolated media image before processing.",
  );
  if (link)
    ensure(
      process.env.ACQUISITION_VERIFIED === "true",
      "MEDIA_UNAVAILABLE",
      "The isolated link downloader has not been verified.",
    );
  const started = Date.now();
  let killed = false;
  let acquisition: Acquisition | undefined;
  const sandbox = await createJobSandbox(
    link ? "acquisition" : "media",
    300,
    link?.domains,
    options,
  );
  try {
    if (link) {
      await hardenAcquisition(sandbox);
      await sandbox.commands.run("mkdir -p /home/user/media", {
        user: "user",
        timeoutMs: 10000,
      });
      await sandbox.files.write(
        "/home/user/media/request.json",
        JSON.stringify({ url: link.url }),
        { user: "user" },
      );
      await sandbox.files.write("/home/user/media/acquire.py", acquirer, {
        user: "user",
      });
      await sandbox.commands.run("python3 /home/user/media/acquire.py", {
        user: "user",
        timeoutMs: 120000,
      });
      const raw = await sandbox.files.read("/home/user/media/acquisition.json");
      ensure(
        raw.length <= 15000,
        "INVALID_MEDIA_MANIFEST",
        "Source metadata exceeded its limit.",
      );
      acquisition = acquisitionManifest.parse(JSON.parse(raw));
      ensure(
        acquisition.status === "acquired" ||
          acquisition.status === "downloaded",
        "SOURCE_UNAVAILABLE",
        acquisitionMessage(acquisition.status),
      );
      // No source-network access is needed by FFmpeg or any subsequent decoder.
      await sandbox.lockdown();
    }
    await hardenSandbox(sandbox);
    if (!link) {
      const res = await fetch(signedObject(input as string, "GET", 300), {
        signal: AbortSignal.timeout(60000),
      });
      ensure(
        res.ok && Number(res.headers.get("content-length")) <= 250000000,
        "SOURCE_UNAVAILABLE",
        "Source object is unavailable or exceeds the limit.",
      );
      let bytes = 0;
      const stream = res.body!.pipeThrough(
        new TransformStream<Uint8Array, Uint8Array>({
          transform(chunk, controller) {
            bytes += chunk.byteLength;
            ensure(
              bytes <= 250000000,
              "SOURCE_UNAVAILABLE",
              "Source exceeds its byte limit.",
            );
            controller.enqueue(chunk);
          },
        }),
      );
      await sandbox.commands.run("mkdir -p /home/user/media", {
        user: "user",
        timeoutMs: 10000,
      });
      await sandbox.files.write("/home/user/media/input", stream, {
        user: "user",
      });
    }
    await sandbox.files.write("/home/user/media/decode.py", decoder, {
      user: "user",
    });
    await sandbox.commands.run("python3 /home/user/media/decode.py", {
      user: "user",
      timeoutMs: link ? 160000 : 240000,
    });
    const rawManifest = await sandbox.files.read(
      "/home/user/media/manifest.json",
    );
    ensure(
      rawManifest.length <= 20000,
      "INVALID_MEDIA_MANIFEST",
      "Media manifest exceeded its limit.",
    );
    const manifest = decoderManifest(JSON.parse(rawManifest), normalizedPcm);
    if (acquisition)
      acquisition = acquisitionManifest.parse({
        ...acquisition,
        status: "acquired",
        durationSeconds: manifest.durationSeconds,
      });
    const audio = manifest.audio
      ? await sandbox.files.read(`/home/user/media/${manifest.audio}`, {
          format: "bytes",
        })
      : undefined;
    ensure(
      !audio || audio.byteLength <= 19500000,
      "INVALID_MEDIA_MANIFEST",
      "Normalized audio exceeded its limit.",
    );
    const frames = [];
    let frameBytes = 0;
    for (const f of manifest.frames) {
      const data = await sandbox.files.read(`/home/user/media/${f.id}`, {
        format: "bytes",
      });
      frameBytes += data.byteLength;
      ensure(
        data.byteLength <= 1000000 &&
          frameBytes <= 12000000 &&
          data[0] === 255 &&
          data[1] === 216 &&
          data[2] === 255,
        "INVALID_MEDIA_MANIFEST",
        "Frame data exceeded its safe bounds.",
      );
      frames.push({
        ...f,
        sha256: createHash("sha256").update(data).digest("hex"),
        data: Buffer.from(data).toString("base64"),
      });
    }
    await sandbox.kill();
    killed = true;
    return {
      manifest,
      audio,
      frames,
      ...(acquisition ? { acquisition } : {}),
      computeSeconds: Math.ceil((Date.now() - started) / 1000),
      ...(sandbox.creationProvenance
        ? { creationProvenance: sandbox.creationProvenance }
        : {}),
    };
  } catch {
    try {
      if (!killed) await sandbox.kill();
      killed = true;
    } catch {
      /* Retain the reservation when termination cannot be confirmed. */
    }
    throw new MediaPreparationError(
      killed
        ? Math.min(300, Math.ceil((Date.now() - started) / 1000))
        : undefined,
      acquisition,
    );
  } finally {
    if (!killed) {
      try {
        await sandbox.kill();
      } catch {
        /* The caller receives an uncertain compute result. */
      }
    }
  }
}
export async function transcribe(audio: Uint8Array, key: string) {
  const form = new FormData();
  form.append(
    "file",
    new Blob([exactArrayBuffer(audio)], { type: "audio/mpeg" }),
    "audio.mp3",
  );
  form.append(
    "model",
    process.env.OPENAI_TRANSCRIPTION_MODEL ?? "gpt-4o-mini-transcribe",
  );
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
    signal: AbortSignal.timeout(120000),
  });
  ensure(
    res.ok,
    "PROVIDER_ERROR",
    "Transcription failed. Do not invent speech or silently change providers.",
  );
  return res.json();
}
