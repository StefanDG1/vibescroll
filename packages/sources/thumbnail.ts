import { sourceEvidenceFrames } from "../media/cloud-frames";
import { isCloudObservedMedia } from "../social/contracts";

// References only. Pixels still pass through the authenticated evidence route.
export function postThumbnailCandidates(
  source: any,
  now = Date.now(),
): string[] {
  if (
    source.state === "deleted" ||
    !source.rightsAttested ||
    (source.sourceRetentionUntil !== undefined &&
      source.sourceRetentionUntil <= now)
  )
    return [];
  const candidates = [
    source.linkPreview?.assetId,
    sourceEvidenceFrames(source, now)[0]?.id,
    !isCloudObservedMedia(source.orderedMedia?.post)
      ? source.personalMedia?.frames?.[0]?.assetId
      : undefined,
  ];
  return [
    ...new Set(
      candidates.filter(
        (id): id is string => typeof id === "string" && id.length > 0,
      ),
    ),
  ].slice(0, 3);
}
