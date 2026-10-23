import { z } from "zod";
import { orderedDecoderManifest } from "../media/manifest";
import {
  socialHash,
  socialRevisionHash,
  socialPostSchema,
  validateSocialEvidence,
  type SocialEvidence,
} from "./contracts";

const observations = z
  .array(
    z.strictObject({
      text: z.string().min(1).max(6000),
      basis: z.enum(["visible", "ocr"]),
      uncertainty: z.string().max(500),
    }),
  )
  .max(20);
const transcript = z
  .array(
    z.strictObject({
      text: z.string().min(1).max(6000),
      startMs: z.number().int().nonnegative(),
      endMs: z.number().int().positive(),
      uncertainty: z.string().max(500),
    }),
  )
  .max(200);
type Decoded = ReturnType<typeof orderedDecoderManifest>;
type Asset = Decoded["assets"][number];
type Representation = Asset["representations"][number];
type Metadata = Omit<
  z.input<typeof socialPostSchema>,
  "assets" | "captionHash" | "revisionHash" | "coverage"
>;

/** One bounded observation pipeline for both routes. Callbacks must perform the
 * actual authorized model/ASR operation; this helper never invents observations. */
export async function inspectOrderedMedia(
  decoded: unknown,
  files: ReadonlyMap<string, Uint8Array>,
  metadata: Metadata,
  operations: {
    authorize: () => Promise<void>;
    observe: (input: {
      asset: Asset;
      representation: Representation;
      bytes: Uint8Array;
      signal?: AbortSignal;
    }) => Promise<unknown>;
    transcribe?: (input: {
      asset: Extract<Asset, { kind: "video" }>;
      bytes: Uint8Array;
      signal?: AbortSignal;
    }) => Promise<unknown>;
    signal?: AbortSignal;
  },
) {
  const manifest = orderedDecoderManifest(decoded);
  const authorize = async () => {
    operations.signal?.throwIfAborted();
    await operations.authorize();
    operations.signal?.throwIfAborted();
  };
  const bytes = async (item: {
    file: string;
    sha256: string;
    bytes: number;
  }) => {
    const value = files.get(item.file);
    if (
      !value ||
      value.byteLength !== item.bytes ||
      Array.from(
        new Uint8Array(
          await crypto.subtle.digest(
            "SHA-256",
            value as Uint8Array<ArrayBuffer>,
          ),
        ),
        (b) => b.toString(16).padStart(2, "0"),
      ).join("") !== item.sha256
    )
      throw Error("ORDERED_REPRESENTATION_CHANGED");
    return value;
  };
  const assets = manifest.assets.map(
    ({ representations: _representations, audio: _audio, ...asset }) => ({
      ...asset,
      inspected: false,
      ...(asset.kind === "video" ? { audioInspected: false } : {}),
    }),
  );
  const postWithoutRevision = {
    ...metadata,
    schemaVersion: "social-post-v1" as const,
    assets,
    captionHash: await socialHash(metadata.caption),
    coverage: manifest.omitted.length
      ? ("partial" as const)
      : metadata.expectedAssetCount === assets.length &&
          assets.every((a, i) => a.index === i)
        ? ("complete_manifest" as const)
        : ("unknown" as const),
  };
  // Validate untrusted metadata and aggregate media bounds before any model call.
  const post = socialPostSchema.parse({
    ...postWithoutRevision,
    revisionHash: await socialRevisionHash(
      postWithoutRevision as Parameters<typeof socialRevisionHash>[0],
    ),
  });
  const evidence: SocialEvidence[] = [];
  let characters = 0;
  const add = async (entry: Omit<SocialEvidence, "id" | "textHash">) => {
    characters += entry.text.length;
    if (evidence.length >= 200 || characters > 60_000)
      throw Error("ORDERED_OBSERVATION_LIMIT");
    evidence.push({
      ...entry,
      id: `observation_${evidence.length}`,
      textHash: await socialHash(entry.text),
    } as SocialEvidence);
  };
  for (const asset of manifest.assets) {
    const current = post.assets.find(
      (a) => a.id === asset.id && a.index === asset.index,
    )!;
    for (const representation of asset.representations) {
      const data = await bytes(representation);
      await authorize();
      const observed = observations.parse(
        await operations.observe({
          asset,
          representation,
          bytes: data,
          signal: operations.signal,
        }),
      );
      await authorize();
      current.inspected = true;
      for (const observation of observed) {
        const base = {
          postRevisionHash: post.revisionHash,
          assetId: asset.id,
          assetIndex: asset.index,
          ...observation,
        };
        if (asset.kind === "image" && representation.kind === "image")
          await add({ ...base, kind: "image_observation" });
        else if (
          asset.kind === "video" &&
          representation.kind === "video_frame"
        )
          await add({
            ...base,
            kind: "video_observation",
            startMs: representation.timestampMs,
            endMs: Math.min(asset.durationMs, representation.timestampMs + 1),
          } as Omit<SocialEvidence, "id" | "textHash">);
        else throw Error("ORDERED_REPRESENTATION_BINDING_CHANGED");
      }
    }
    if (asset.kind === "video" && asset.audio && operations.transcribe) {
      const data = await bytes(asset.audio);
      await authorize();
      const segments = transcript.parse(
        await operations.transcribe({
          asset,
          bytes: data,
          signal: operations.signal,
        }),
      );
      await authorize();
      if (current.kind !== "video")
        throw Error("ORDERED_ASSET_BINDING_CHANGED");
      current.audioInspected = true;
      for (const segment of segments) {
        if (
          segment.startMs >= segment.endMs ||
          segment.endMs > asset.durationMs
        )
          throw Error("ORDERED_TRANSCRIPT_TIMING_INVALID");
        await add({
          ...segment,
          kind: "video_observation",
          basis: "transcript",
          postRevisionHash: post.revisionHash,
          assetId: asset.id,
          assetIndex: asset.index,
        } as Omit<SocialEvidence, "id" | "textHash">);
      }
    }
  }
  await authorize();
  return {
    schemaVersion: "ordered-media-v1" as const,
    ...(await validateSocialEvidence(post, evidence)),
    omissions: manifest.omitted,
    warnings: [
      ...(manifest.omitted.length
        ? [
            "Some ordered children could not be decoded; their original positions remain omitted.",
          ]
        : []),
      ...(manifest.assets.some((a) => a.kind === "video")
        ? [
            "Video evidence covers only supplied sampled frames and any explicitly transcribed audio.",
          ]
        : []),
      ...(manifest.assets.some((a) => a.kind === "video" && a.audio) &&
      !operations.transcribe
        ? ["Audio was prepared but not transcribed or inspected."]
        : []),
    ],
  };
}
