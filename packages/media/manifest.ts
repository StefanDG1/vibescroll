import { z } from "zod";
const manifestSchema = z
  .object({
    durationSeconds: z.number().finite().positive().max(600),
    audio: z.enum(["audio.mp3", "audio.wav"]).optional(),
    coverage: z.enum(["full_sampled", "audio_only", "visual_only"]),
    frames: z
      .array(
        z
          .object({
            id: z.string().regex(/^frame-\d{3}\.jpg$/),
            timestampMs: z.number().int().min(0).max(600000),
            selectionReason: z.enum([
              "periodic sample",
              "visible change within sampled frames",
            ]),
          })
          .strict(),
      )
      .max(48),
  })
  .strict();
export function decoderManifest(value: unknown, normalizedPcm = false) {
  const manifest = manifestSchema.parse(value);
  const coverage = manifest.audio
    ? manifest.frames.length
      ? "full_sampled"
      : "audio_only"
    : "visual_only";
  if (
    (!manifest.audio && !manifest.frames.length) ||
    manifest.coverage !== coverage ||
    (manifest.audio &&
      manifest.audio !== (normalizedPcm ? "audio.wav" : "audio.mp3")) ||
    new Set(manifest.frames.map((frame) => frame.id)).size !==
      manifest.frames.length ||
    manifest.frames.some(
      (frame) =>
        frame.timestampMs >= Math.ceil(manifest.durationSeconds * 1000),
    )
  )
    throw new Error("INVALID_MEDIA_MANIFEST");
  return manifest;
}

const orderedFile = z
  .string()
  .regex(/^asset-\d{3}-(?:image\.jpg|frame-\d{3}\.jpg|audio\.wav)$/);
const orderedHash = z.string().regex(/^[a-f0-9]{64}$/);
const representationBase = {
  file: orderedFile,
  bytes: z.number().int().positive().max(1_000_000),
  width: z.number().int().positive().max(960),
  height: z.number().int().positive().max(960),
  sha256: orderedHash,
};
const representation = z.discriminatedUnion("kind", [
  z.strictObject({ ...representationBase, kind: z.literal("image") }),
  z.strictObject({
    ...representationBase,
    kind: z.literal("video_frame"),
    timestampMs: z.number().int().nonnegative().max(600000),
  }),
]);
const orderedDecodedBase = {
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
  index: z.number().int().min(0).max(34),
  bytes: z.number().int().positive().max(250_000_000),
  contentHash: orderedHash,
  width: z.number().int().positive().max(4096),
  height: z.number().int().positive().max(4096),
  representations: z.array(representation).min(1).max(48),
};
const orderedDecodedAsset = z.discriminatedUnion("kind", [
  z.strictObject({
    ...orderedDecodedBase,
    kind: z.literal("image"),
    mime: z.enum(["image/jpeg", "image/png", "image/webp"]),
    audio: z.null(),
  }),
  z.strictObject({
    ...orderedDecodedBase,
    kind: z.literal("video"),
    mime: z.enum(["video/mp4", "video/webm"]),
    durationMs: z.number().int().positive().max(600000),
    audio: z
      .strictObject({
        file: orderedFile,
        bytes: z.number().int().positive().max(19_500_000),
        sha256: orderedHash,
      })
      .nullable(),
  }),
]);
export const orderedDecoderSchema = z.strictObject({
  schemaVersion: z.literal("ordered-decoder-v1"),
  assets: z.array(orderedDecodedAsset).min(1).max(35),
  omitted: z
    .array(
      z.strictObject({
        id: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
        index: z.number().int().min(0).max(34),
        reason: z.literal("decode_unavailable"),
      }),
    )
    .max(35),
  inputBytes: z.number().int().positive().max(250_000_000),
  videoDurationMs: z.number().int().nonnegative().max(600000),
  representationBytes: z.number().int().positive().max(12_000_000),
  audioBytes: z.number().int().nonnegative().max(19_500_000),
});
export function orderedDecoderManifest(value: unknown) {
  const result = orderedDecoderSchema.parse(value);
  const children = [...result.assets, ...result.omitted];
  const files = result.assets.flatMap((asset) => [
    ...asset.representations.map((r) => r.file),
    ...(asset.audio ? [asset.audio.file] : []),
  ]);
  if (
    children.length > 35 ||
    new Set(children.map((a) => a.id)).size !== children.length ||
    new Set(children.map((a) => a.index)).size !== children.length ||
    new Set(files).size !== files.length ||
    result.assets.some(
      (a, i) => i > 0 && result.assets[i - 1].index >= a.index,
    ) ||
    result.assets.flatMap((a) => a.representations).length > 48 ||
    result.assets.reduce((n, a) => n + a.bytes, 0) > result.inputBytes ||
    result.assets.reduce(
      (n, a) => n + (a.kind === "video" ? a.durationMs : 0),
      0,
    ) !== result.videoDurationMs ||
    result.assets.reduce(
      (n, a) => n + a.representations.reduce((m, r) => m + r.bytes, 0),
      0,
    ) !== result.representationBytes ||
    result.assets.reduce((n, a) => n + (a.audio?.bytes ?? 0), 0) !==
      result.audioBytes
  )
    throw Error("INVALID_ORDERED_DECODER_MANIFEST");
  for (const asset of result.assets) {
    const prefix = `asset-${String(asset.index).padStart(3, "0")}-`;
    if (
      asset.representations.some(
        (r) =>
          !r.file.startsWith(prefix) ||
          (asset.kind === "image"
            ? r.kind !== "image" || r.file !== prefix + "image.jpg"
            : r.kind !== "video_frame" || r.timestampMs >= asset.durationMs),
      ) ||
      (asset.kind === "image" && asset.representations.length !== 1) ||
      (asset.audio && asset.audio.file !== prefix + "audio.wav")
    )
      throw Error("INVALID_ORDERED_DECODER_BINDING");
  }
  return result;
}
