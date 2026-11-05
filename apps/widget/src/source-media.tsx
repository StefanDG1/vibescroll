import { useEffect, useRef, useState } from "react";
import { postContextPageOutput } from "../../../packages/contracts/post-context";
import type { ToolRecord } from "../../../packages/widget/contracts";
import type { Source } from "./data";

export type SourceMedia = {
  key: string;
  sourceId: string;
  analysisVersionId: string;
  authorName: string | null;
  durationMs: number | null;
  summary: string;
  image: string | null;
  frameId: string | null;
};
/** One bounded context page and at most one retained JPEG per current version. */
export function useSourceMedia(
  source: Source | null,
  profileId: string,
  grantVersion: number,
  call: (name: string, args: ToolRecord) => Promise<ToolRecord>,
  readImage: (name: string, args: ToolRecord) => Promise<string>,
) {
  const [media, setMedia] = useState<SourceMedia | null>(null);
  const cache = useRef(new Map<string, Promise<SourceMedia>>());
  const key =
    source?.state === "ready" && source.analysisVersionId
      ? JSON.stringify([
          profileId,
          grantVersion,
          source.id,
          source.generation,
          source.revision,
          source.analysisVersionId,
          source.sharedGrantId,
          source.sharedGrantVersion,
        ])
      : "";
  useEffect(() => {
    if (!key || !source) return;
    let active = true;
    let pending = cache.current.get(key);
    if (!pending) {
      pending = (async () => {
        const sharing = source.sharedGrantId
          ? {
              sharedGrantId: source.sharedGrantId,
              sharedGrantVersion: source.sharedGrantVersion,
            }
          : {};
        const page = postContextPageOutput.parse(
          await call("fetch", {
            profileId,
            id: `${source.id}@${source.analysisVersionId}`,
            format: "post_context_v1",
            ...sharing,
          }),
        );
        if (
          page.profile_id !== profileId ||
          page.grant_version !== grantVersion ||
          page.context.sourceId !== source.id ||
          page.context.analysisVersionId !== source.analysisVersionId
        )
          throw Error("Retained media scope changed.");
        const frame = page.context.frames[0];
        let image: string | null = null;
        if (frame) {
          try {
            image = await readImage("read_post_frame", {
              profileId,
              sourceId: source.id,
              analysisVersionId: page.context.analysisVersionId,
              frameId: frame.frameId,
              expectedEvidenceHash: page.context.evidenceHash,
              ...sharing,
            });
          } catch {
            /* Retain real metadata when this individual native frame is unavailable. */
          }
        }
        return {
          key,
          sourceId: source.id,
          analysisVersionId: page.context.analysisVersionId,
          authorName: page.context.authorName,
          durationMs: page.context.durationMs,
          summary: page.context.summary,
          image,
          frameId: image && frame ? frame.frameId : null,
        };
      })();
      cache.current.set(key, pending);
      if (cache.current.size > 3)
        cache.current.delete(cache.current.keys().next().value!);
    }
    void pending
      .then((value) => {
        if (active) setMedia(value);
      })
      .catch(() => {
        cache.current.delete(key);
        if (active) setMedia(null);
      });
    return () => {
      active = false;
    };
    // Scope identity binds these transport callbacks; host theme changes do not refetch JPEGs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return media?.key === key ? media : null;
}
