import { backend, api } from "@/lib/backend";
import { localSnapshotRequest } from "@/lib/local-snapshot-request";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import Link from "next/link";
import { BookOpen } from "lucide-react";
import { PostThumbnail } from "@/components/post-thumbnail";
import { WorkspaceSubpage } from "@/components/workspace-subpage";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ cursor?: string }>;
}) {
  const { org } = await params;
  const scope = { organizationId: org as Id<"organizations"> };
  const cursor = (await searchParams).cursor;
  const page = await (async () => {
    if (await localSnapshotRequest()) return null;
    const client = await backend();
    const status = await client.query(api.catalogAccess.status, scope);
    return status.enabled && status.available
      ? client.query(api.catalogBrowse.list, { ...scope, cursor })
      : null;
  })();
  return (
    <WorkspaceSubpage org={org} title="Shared library" backTo="posts">
      {!page ? (
        <section className="shared-empty">
          <BookOpen size={23} strokeWidth={1.65} aria-hidden="true" />
          <h2>Full-library browsing is unavailable</h2>
          <p>Check the shared library setting for this workspace.</p>
          <Link className="button secondary" href={`/app/${org}/settings`} prefetch={false}>
            Open settings
          </Link>
        </section>
      ) : (
        <>
          <p className="muted">You can browse without saving posts or using analysis credits.</p>
          <ul className="catalog-posts">
            {page.items.map((post) => (
              <li key={post.familyId}>
                <Link href={`/app/${org}/catalog/${post.familyId}`} prefetch={false}>
                  <PostThumbnail
                    kind="url"
                    candidates={post.thumbnailReference ? [post.thumbnailReference] : []}
                  />
                  <span className="catalog-post-copy">
                    <strong>{post.title}</strong>
                    {post.authorName && <span>{post.authorName}</span>}
                    <small>
                      {post.insightCount} {post.insightCount === 1 ? "insight" : "insights"}
                      {post.durationSeconds === null ? "" : ` · ${Math.round(post.durationSeconds)} sec`}
                    </small>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {!page.items.length && <p className="muted">No available posts in this part of the library.</p>}
          {page.next && (
            <Link className="button secondary" href={`/app/${org}/catalog?cursor=${encodeURIComponent(page.next)}`} prefetch={false}>
              Next page
            </Link>
          )}
        </>
      )}
    </WorkspaceSubpage>
  );
}
