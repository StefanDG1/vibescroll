import { expect, it } from "vitest";
import {
  sourceEvidenceFrames,
  retainedCloudFrames,
  cloudFrameAssetCurrent,
  cloudCitationForDisplay,
} from "../packages/media/cloud-frames";
import { jpegDimensions } from "../packages/media/jpeg";
const now = 100000;
function source() {
  return {
    _id: "source",
    organizationId: "org",
    state: "ready",
    generation: 2,
    rightsAttested: true,
    sourceRetentionUntil: now + 1000,
    originalMediaEvidence: [{ kind: "frame", id: "old-frame" }],
    personalAnalysis: {
      executor: "work_cloud",
      generation: 2,
      cloud: { media: { preparationHash: "hash", retainUntil: now + 1000 } },
    },
    personalMedia: {
      cloudFrames: {
        generation: 2,
        preparationHash: "hash",
        frames: [
          {
            frameId: "f",
            assetId: "asset",
            sha256: "bytes",
            timestampMs: 100,
            size: 10,
          },
        ],
      },
    },
    orderedMedia: {
      post: {
        schemaVersion: "work-cloud-observed-media-v1",
        frames: [{ id: "f", sha256: "bytes", timestampMs: 100, bytes: 10 }],
      },
    },
  };
}
it("uses retained Cloud screenshots and never substitutes older local evidence when Cloud pixels are absent", () => {
  const s = source();
  expect(sourceEvidenceFrames(s, now)).toEqual([
    { kind: "frame", id: "asset", startMs: 100, endMs: 100 },
  ]);
  s.personalMedia.cloudFrames.frames = [];
  expect(sourceEvidenceFrames(s, now)).toEqual([]);
});
it.each([
  "generation",
  "preparation",
  "rights",
  "expiry",
  "frame-hash",
  "timestamp",
])("hides pixels after Cloud %s changes", (kind) => {
  const s = source();
  if (kind === "generation") s.generation++;
  if (kind === "preparation")
    s.personalAnalysis.cloud.media.preparationHash = "changed";
  if (kind === "rights") s.rightsAttested = false;
  if (kind === "expiry") s.sourceRetentionUntil = now;
  if (kind === "frame-hash") s.orderedMedia.post.frames[0].sha256 = "changed";
  if (kind === "timestamp") s.orderedMedia.post.frames[0].timestampMs++;
  expect(retainedCloudFrames(s, now)).toEqual([]);
  expect(
    cloudFrameAssetCurrent(
      s,
      {
        _id: "asset",
        kind: "work_cloud_frame",
        sourceId: "source",
        organizationId: "org",
        sourceGeneration: 2,
        size: 10,
      },
      now,
    ),
  ).toBe(false);
});
it("bounds JPEG dimensions before decoding pixels", () => {
  const bytes = new Uint8Array([
    255, 216, 255, 192, 0, 11, 8, 0, 1, 0, 1, 1, 1, 17, 0, 255, 218, 0, 2, 0,
    255, 217,
  ]);
  expect(jpegDimensions(bytes)).toEqual({ width: 1, height: 1 });
  bytes[9] = 255;
  expect(() => jpegDimensions(bytes)).toThrow("INVALID_JPEG");
  expect(() =>
    jpegDimensions(new Uint8Array([255, 216, 255, 224, 255, 255, 255, 217])),
  ).toThrow("INVALID_JPEG");
});
it("opens exact Cloud visual/speech evidence without changing the canonical refs or fabricating missing pixels", () => {
  const s: any = source();
  const visual = {
    kind: "video_observation",
    id: "f",
    startMs: 100,
    endMs: 101,
  };
  const speech = {
    kind: "video_observation",
    id: "speech",
    startMs: 0,
    endMs: 50,
  };
  s.orderedMedia.evidence = [
    { ...visual, basis: "visible" },
    { ...speech, basis: "transcript" },
  ];
  expect(cloudCitationForDisplay(s, visual, now)).toEqual({
    ...visual,
    kind: "frame",
    id: "asset",
  });
  expect(cloudCitationForDisplay(s, speech, now)).toEqual({
    ...speech,
    kind: "transcript",
  });
  expect(visual).toEqual({
    kind: "video_observation",
    id: "f",
    startMs: 100,
    endMs: 101,
  });
  s.personalMedia.cloudFrames.frames = [];
  expect(cloudCitationForDisplay(s, visual, now)).toBe(visual);
  expect(cloudCitationForDisplay(s, { ...speech, startMs: 1 }, now).kind).toBe(
    "video_observation",
  );
});
