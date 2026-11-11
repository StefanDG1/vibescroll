import { backend, api } from "@/lib/backend";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { Header } from "@/components/header";
import { PostThumbnail } from "@/components/post-thumbnail";
import { Card } from "@companynerve/ui";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ cursor?: string }>;
}) {
  const { org } = await params;
  const client = await backend();
  const scope = { organizationId: org as Id<"organizations"> };
  const status = await client.query(api.catalogAccess.status, scope);
  const page =
    status.enabled && status.available
      ? await client.query(api.catalogBrowse.list, {
          ...scope,
          cursor: (await searchParams).cursor,
        })
      : null;
  return (
    <div className="account-page">
      <Header />
      <main id="main">
        <a href={`/app/${org}/posts`}>Your posts</a>
        <h1>Shared library</h1>
        <p className="muted">
          Browsing does not add posts to your account or use analysis credits.
        </p>
        {!page ? (
          <p>
            Full-library browsing is unavailable.{" "}
            <a href={`/app/${org}/settings`}>Open settings</a>
          </p>
        ) : (
          <>
            <div className="stack">
              {page.items.map((post) => (
                <Card key={post.familyId}>
                  <a href={`/app/${org}/catalog/${post.familyId}`}>
                    <PostThumbnail
                      kind="url"
                      candidates={
                        post.thumbnailReference ? [post.thumbnailReference] : []
                      }
                    />
                    <h2>{post.title}</h2>
                  </a>
                  {post.authorName && <p>{post.authorName}</p>}
                  <p className="muted">
                    {post.insightCount} insights
                    {post.durationSeconds === null
                      ? ""
                      : ` · ${Math.round(post.durationSeconds)} seconds`}
                  </p>
                </Card>
              ))}
            </div>
            {!page.items.length && <p>No available posts on this page.</p>}
            {page.next && (
              <a
                href={`/app/${org}/catalog?cursor=${encodeURIComponent(page.next)}`}
              >
                Load more posts
              </a>
            )}
          </>
        )}
      </main>
    </div>
  );
}
