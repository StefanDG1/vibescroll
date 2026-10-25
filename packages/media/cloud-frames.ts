import { isCloudObservedMedia } from "../social/contracts";
// Pixels are stored separately from the immutable observed-media preparation.
export type CloudFrame = {
  frameId: string;
  assetId: string;
  sha256: string;
  timestampMs: number;
  size: number;
};
export function retainedCloudFrames(
  source: any,
  now = Date.now(),
): CloudFrame[] {
  const job = source.personalAnalysis;
  const media = job?.executor === "work_cloud" ? job.cloud?.media : null;
  const saved = source.personalMedia?.cloudFrames;
  if (
    source.state === "deleted" ||
    !source.rightsAttested ||
    !media ||
    !Number.isFinite(media.retainUntil) ||
    job.generation !== source.generation ||
    media.retainUntil <= now ||
    (source.sourceRetentionUntil !== undefined &&
      source.sourceRetentionUntil <= now) ||
    !saved ||
    saved.generation !== source.generation ||
    saved.preparationHash !== media.preparationHash ||
    !media.preparationHash ||
    !isCloudObservedMedia(source.orderedMedia?.post) ||
    !Array.isArray(source.orderedMedia.post.frames) ||
    !Array.isArray(saved.frames) ||
    saved.frames.length > 48
  )
    return [];
  return saved.frames
    .filter((frame: CloudFrame) =>
      source.orderedMedia.post.frames.some(
        (observed: any) =>
          observed.id === frame.frameId &&
          observed.sha256 === frame.sha256 &&
          observed.bytes === frame.size &&
          observed.timestampMs === frame.timestampMs,
      ),
    )
    .sort(
      (a: CloudFrame, b: CloudFrame) =>
        a.timestampMs - b.timestampMs || a.frameId.localeCompare(b.frameId),
    );
}
export function cloudFrameAssetCurrent(
  source: any,
  asset: any,
  now = Date.now(),
) {
  return (
    asset.kind === "work_cloud_frame" &&
    asset.state === "complete" &&
    asset.type === "image/jpeg" &&
    (asset.expiresAt === undefined || asset.expiresAt > now) &&
    asset.sourceId === source._id &&
    asset.organizationId === source.organizationId &&
    asset.sourceGeneration === source.generation &&
    retainedCloudFrames(source, now).some(
      (frame) => frame.assetId === asset._id && frame.size === asset.size,
    )
  );
}
export function sourceEvidenceFrames(source: any, now = Date.now()) {
  if (isCloudObservedMedia(source.orderedMedia?.post))
    return retainedCloudFrames(source, now).map((frame) => ({
      kind: "frame",
      id: frame.assetId,
      startMs: frame.timestampMs,
      endMs: frame.timestampMs,
    }));
  return (source.originalMediaEvidence ?? source.mediaEvidence ?? []).filter(
    (e: any) => e.kind === "frame",
  );
}
// Adapt only the view reference. Keep the canonical analysis and its IDs intact.
export function cloudCitationForDisplay(
  source: any,
  ref: any,
  now = Date.now(),
) {
  if (
    !isCloudObservedMedia(source.orderedMedia?.post) ||
    ref.kind !== "video_observation"
  )
    return ref;
  const observed = source.orderedMedia.evidence?.find(
    (e: any) =>
      e.id === ref.id &&
      e.kind === ref.kind &&
      e.startMs === ref.startMs &&
      e.endMs === ref.endMs,
  );
  if (!observed) return ref;
  if (observed.basis === "transcript") return { ...ref, kind: "transcript" };
  const frame = retainedCloudFrames(source, now).find(
    (f) => f.frameId === ref.id && f.timestampMs === ref.startMs,
  );
  return frame ? { ...ref, kind: "frame", id: frame.assetId } : ref;
}
