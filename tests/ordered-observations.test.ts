import { createHash } from "node:crypto";
import { expect, it, vi } from "vitest";
import { inspectOrderedMedia } from "../packages/social/preparation";
import { validateSocialAnalysis } from "../packages/social/analysis";
const data = Uint8Array.from([255, 216, 255, 0]);
const sha = createHash("sha256").update(data).digest("hex");
const image = {
  id: "slide",
  index: 0,
  kind: "image",
  bytes: 4,
  contentHash: sha,
  width: 100,
  height: 60,
  mime: "image/png",
  audio: null,
  representations: [
    {
      file: "asset-000-image.jpg",
      kind: "image",
      bytes: 4,
      sha256: sha,
      width: 100,
      height: 60,
    },
  ],
};
const video = {
  id: "clip",
  index: 2,
  kind: "video",
  bytes: 4,
  contentHash: sha,
  width: 100,
  height: 60,
  mime: "video/mp4",
  durationMs: 1000,
  audio: { file: "asset-002-audio.wav", bytes: 4, sha256: sha },
  representations: [
    {
      file: "asset-002-frame-000.jpg",
      kind: "video_frame",
      timestampMs: 200,
      bytes: 4,
      sha256: sha,
      width: 100,
      height: 60,
    },
  ],
};
function fixture() {
  return {
    manifest: {
      schemaVersion: "ordered-decoder-v1",
      assets: [structuredClone(image), structuredClone(video)],
      omitted: [{ id: "missing", index: 1, reason: "decode_unavailable" }],
      inputBytes: 12,
      videoDurationMs: 1000,
      representationBytes: 8,
      audioBytes: 4,
    },
    files: new Map(
      [
        image.representations[0].file,
        video.representations[0].file,
        video.audio.file,
      ].map((file) => [file, data]),
    ),
    metadata: {
      schemaVersion: "social-post-v1" as const,
      platform: "instagram" as const,
      creatorId: "creator",
      postId: "post",
      canonical: "https://www.instagram.com/p/example123/",
      publishedAt: null,
      observedAt: Date.now(),
      dateReliability: "unknown" as const,
      caption: "Synthetic supplied caption",
      expectedAssetCount: 3,
      providerEvidenceId: "synthetic-only",
    },
  };
}
it("assembles actual callback evidence with untimed image and exact sampled-video/transcript coordinates", async () => {
  const f = fixture(),
    observe = vi.fn(async () => [
      { text: "Synthetic observed label", basis: "visible", uncertainty: "" },
    ]);
  const prepared = await inspectOrderedMedia(f.manifest, f.files, f.metadata, {
    authorize: async () => {},
    observe,
    transcribe: async () => [
      {
        text: "Synthetic audio",
        startMs: 10,
        endMs: 900,
        uncertainty: "Automatic transcription",
      },
    ],
  });
  expect(observe).toHaveBeenCalledTimes(2);
  expect(prepared.post.coverage).toBe("partial");
  expect(prepared.post.assets.map((a) => a.index)).toEqual([0, 2]);
  expect(prepared.evidence[0]).not.toHaveProperty("startMs");
  expect(prepared.evidence[1]).toMatchObject({
    startMs: 200,
    endMs: 201,
    assetIndex: 2,
  });
  expect(prepared.evidence[2]).toMatchObject({
    startMs: 10,
    endMs: 900,
    basis: "transcript",
  });
  const { warnings, omissions, ...stored } = prepared;
  expect(warnings.length).toBeGreaterThan(0);
  expect(omissions).toHaveLength(1);
  const result = await validateSocialAnalysis(
    {
      schemaVersion: "3.0.0",
      sourceId: "source",
      processingRunId: "source:1",
      postRevisionHash: prepared.post.revisionHash,
      coverage: "ordered_media",
      summary: "Synthetic",
      warnings,
      insights: [
        {
          id: "idea1",
          kind: "idea",
          title: "Synthetic visible idea",
          claim: "Observed label",
          interpretation: "",
          categories: ["other"],
          evidence: [
            {
              kind: "image_observation",
              id: prepared.evidence[0].id,
              startMs: null,
              endMs: null,
            },
          ],
          confidence: "supported",
          verificationNeeds: [],
        },
      ],
    },
    stored,
    { sourceId: "source", generation: 1 },
  );
  expect(result.analysis.insights[0].evidence[0].startMs).toBeNull();
});
it("does not claim audio inspection when only image representations were observed", async () => {
  const f = fixture();
  const result = await inspectOrderedMedia(f.manifest, f.files, f.metadata, {
    authorize: async () => {},
    observe: async () => [],
  });
  expect(result.evidence).toEqual([]);
  expect(result.post.assets[1]).toMatchObject({
    inspected: true,
    audioInspected: false,
  });
  expect(result.warnings.join(" ")).toContain("not transcribed");
});
it("checks actual representation hash and metadata before model dispatch", async () => {
  const f = fixture(),
    observe = vi.fn();
  f.files.set(image.representations[0].file, Uint8Array.from([1, 2, 3, 4]));
  await expect(
    inspectOrderedMedia(f.manifest, f.files, f.metadata, {
      authorize: async () => {},
      observe,
    }),
  ).rejects.toThrow("REPRESENTATION_CHANGED");
  expect(observe).not.toHaveBeenCalled();
  await expect(
    inspectOrderedMedia(
      f.manifest,
      f.files,
      { ...f.metadata, canonical: "https://evil.invalid/post" },
      { authorize: async () => {}, observe },
    ),
  ).rejects.toThrow();
  expect(observe).not.toHaveBeenCalled();
});
it("stops after revoked authority and rejects a fabricated transcript interval", async () => {
  const f = fixture(),
    transcribe = vi.fn(async () => []);
  let active = true;
  await expect(
    inspectOrderedMedia(f.manifest, f.files, f.metadata, {
      authorize: async () => {
        if (!active) throw Error("REVOKED");
      },
      observe: async () => {
        active = false;
        return [];
      },
      transcribe,
    }),
  ).rejects.toThrow("REVOKED");
  expect(transcribe).not.toHaveBeenCalled();
  await expect(
    inspectOrderedMedia(f.manifest, f.files, f.metadata, {
      authorize: async () => {},
      observe: async () => [],
      transcribe: async () => [
        { text: "Invalid range", startMs: 0, endMs: 1001, uncertainty: "" },
      ],
    }),
  ).rejects.toThrow("TIMING");
});
