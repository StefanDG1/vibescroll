"use client";
import Image from "next/image";
import type { ComponentProps } from "react";
import { PostThumbnail } from "./post-thumbnail";
import { ProposalArtifact } from "./assistant-elements/proposal-artifact";
import { FeedPostCardCore } from "./home-feed-post-core";
export type { FeedCardPost } from "./home-feed-post-core";

/** Keep website image delivery separate from the shared source/insight/plan scene. */
export function FeedPostCard(props: ComponentProps<typeof FeedPostCardCore>) {
  return (
    <FeedPostCardCore
      {...props}
      renderThumbnail={(value) => <PostThumbnail {...value} />}
      renderImage={(value) => <Image {...value} />}
      renderProposal={(value) => <ProposalArtifact {...value} />}
    />
  );
}
