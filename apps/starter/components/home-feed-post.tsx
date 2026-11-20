"use client";
import Image from "next/image";
import { useState, type ComponentProps } from "react";
import { PostThumbnail } from "./post-thumbnail";
import { EvidenceViewer } from "./evidence-viewer";
import { ProposalArtifact } from "./assistant-elements/proposal-artifact";
import { FeedPostCardCore } from "./home-feed-post-core";
import type { FeedInsight } from "../lib/home-feed";
import { track } from "@/lib/analytics";
export type { FeedCardPost } from "./home-feed-post-core";

/** Keep website image delivery separate from the shared source/insight/plan scene. */
export function FeedPostCard(props: ComponentProps<typeof FeedPostCardCore>) {
  const [frame, setFrame] = useState<FeedInsight["frame"]>();
  return (
    <>
      <FeedPostCardCore
        {...props}
        renderThumbnail={(value) => <PostThumbnail {...value} />}
        renderImage={(value) => <Image {...value} />}
        renderProposal={(value) => <ProposalArtifact {...value} />}
        onViewFrame={(item) => {
          if (!props.demo && !props.preview)
            track("citation_inspected", { kind: "frame" });
          setFrame(item);
        }}
      />
      {frame && (
        <EvidenceViewer
          frames={[{ id: frame.id, startMs: frame.timeMs }]}
          initialId={frame.id}
          onClose={() => setFrame(undefined)}
        />
      )}
    </>
  );
}
