"use client";
import { useState } from "react";
import Image from "next/image";
import { FileText, Link2, Video } from "lucide-react";

export function PostThumbnail({
  candidates,
  kind,
  demo = false,
}: {
  candidates: string[];
  kind: string;
  demo?: boolean;
}) {
  const [failed, setFailed] = useState<string[]>([]);
  const [loadedId, setLoadedId] = useState<string>();
  const frameId = candidates.find((id) => !failed.includes(id));
  const loaded = frameId !== undefined && loadedId === frameId;
  return (
    <span className="source-thumb" aria-hidden="true">
      {!demo && frameId && (
        <Image
          className={loaded ? "source-preview ready" : "source-preview"}
          src={`/api/evidence/${encodeURIComponent(frameId)}?inline=true`}
          width={60}
          height={76}
          alt=""
          unoptimized
          loading="lazy"
          onLoad={() => setLoadedId(frameId)}
          onError={() => setFailed((current) => [...current, frameId])}
        />
      )}
      {!loaded &&
        (kind === "text" ? (
          <FileText size={24} strokeWidth={1.5} />
        ) : kind === "upload" ? (
          <Video size={24} strokeWidth={1.5} />
        ) : (
          <Link2 size={24} strokeWidth={1.5} />
        ))}
    </span>
  );
}
