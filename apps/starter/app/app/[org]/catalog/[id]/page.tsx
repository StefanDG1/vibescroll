import { backend, api } from "@/lib/backend";
import { localSnapshotRequest } from "@/lib/local-snapshot-request";
import type { Id } from "../../../../../../../convex/_generated/dataModel";
import { ArrowUpRight, FileQuestion } from "lucide-react";
import { WorkspaceSubpage } from "@/components/workspace-subpage";
import { neutralCloudAnalysis } from "../../../../../../../packages/contracts/cloud-catalog";
import Link from "next/link";
import {
  OriginalCaption,
  PostMediaCarousel,
  PostOriginals,
} from "@/components/post-source-media";
import type { PostSlide } from "@/lib/home-feed";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{ org: string; id: string }>;
}) {
  const { org, id } = await params;
  const post = (await localSnapshotRequest())
    ? null
    : await (
        await backend()
      )
        .mutation(api.catalogBrowse.detail, {
          organizationId: org as Id<"organizations">,
          familyId: id as Id<"catalogFamilies">,
        })
        .catch(() => null);
  if (!post)
    return (
      <WorkspaceSubpage org={org} title="Post unavailable" backTo="catalog">
        <section className="shared-empty">
          <FileQuestion size={23} strokeWidth={1.65} aria-hidden="true" />
          <p>
            This post may have been removed or your access may have changed.
          </p>
        </section>
      </WorkspaceSubpage>
    );
  const analysis = neutralCloudAnalysis.parse(post.analysis);
  const media = new Map<number, PostSlide>();
  for (const [index, frame] of post.frames.entries()) {
    const assetIndex = frame.assetIndex ?? index;
    if (!media.has(assetIndex))
      media.set(assetIndex, {
        id: frame.reference,
        index: assetIndex,
        kind: frame.mediaKind,
        portrait: frame.height > frame.width,
      });
  }
  return (
    <WorkspaceSubpage org={org} title={post.title} backTo="catalog">
      <div className="catalog-post-meta">
        {post.creator ? (
          <Link
            href={`/app/${org}/creators/${encodeURIComponent(post.creator.key)}`}
            prefetch={false}
          >
            {post.authorName || `@${post.creator.handle}`}
          </Link>
        ) : (
          post.authorName && <span>{post.authorName}</span>
        )}
        <PostOriginals urls={post.originals} />
        <a href={post.canonical} target="_blank" rel="noreferrer">
          Original post <ArrowUpRight size={15} aria-hidden="true" />
        </a>
      </div>
      <PostMediaCarousel
        slides={[...media.values()]}
        original={post.canonical}
      />
      <OriginalCaption caption={post.caption} />
      <p className="catalog-post-summary">{analysis.summary}</p>
      {analysis.warnings.length > 0 && (
        <ul className="catalog-warnings">
          {analysis.warnings.map((warning, index) => (
            <li key={index}>{warning}</li>
          ))}
        </ul>
      )}
      <section
        className="shared-reader"
        aria-labelledby="catalog-insight-heading"
      >
        <h2 id="catalog-insight-heading">Insights</h2>
        <ul>
          {analysis.insights.map((insight) => (
            <li key={insight.id}>
              <h3>{insight.title}</h3>
              <p>{insight.claim}</p>
              {insight.interpretation && <p>{insight.interpretation}</p>}
              {insight.evidence.length > 0 && (
                <p className="fine">
                  Evidence ·{" "}
                  {insight.evidence
                    .map((ref) =>
                      ref.startMs === null
                        ? ref.id
                        : `${(ref.startMs / 1000).toFixed(1)}s`,
                    )
                    .join(", ")}
                </p>
              )}
            </li>
          ))}
        </ul>
      </section>
    </WorkspaceSubpage>
  );
}
