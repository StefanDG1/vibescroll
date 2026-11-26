import Link from "next/link";
import { notFound } from "next/navigation";
import { PostOriginals } from "@/components/post-source-media";
import { FileText } from "lucide-react";
import { AccountPageFrame, AccountSection } from "@/components/account-layout";
import { backend, api } from "@/lib/backend";
import type { Id } from "../../../../../../../convex/_generated/dataModel";
import { revalidatePath } from "next/cache";
import styles from "./creator.module.css";
import { creatorRouteKey } from "../../../../../../../packages/sources/creator-route";
import { ActionForm, type FormState } from "@/components/action-form";
import { platformPostKey } from "../../../../../../../packages/sources/post-identity";

const postDate = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeZone: "UTC",
});

export default async function CreatorPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string; creator: string }>;
  searchParams: Promise<{ after?: string; sharedAfter?: string }>;
}) {
  const { org, creator: segment } = await params;
  const creator = creatorRouteKey(segment) ?? notFound();
  const { after, sharedAfter } = await searchParams;
  const organizationId = org as Id<"organizations">;
  const base = `/app/${encodeURIComponent(org)}`;
  const href = `${base}/creators/${encodeURIComponent(creator)}`;
  const result = await (
    await backend()
  )
    .query(api.creators.read, {
      organizationId,
      creatorKey: creator,
      cursor: after,
      sharedCursor: sharedAfter,
    })
    .catch(() => null);
  const first = result?.items[0];
  const firstShared = result?.sharedItems[0];
  const sharedKeys = new Set(
    result?.sharedItems
      .flatMap((item) => item.originals.map((url) => platformPostKey(url)))
      .filter(Boolean),
  );
  const seen = new Set<string>();
  const posts = result?.items.filter((item) => {
    if (item.originals.some((url) => sharedKeys.has(platformPostKey(url))))
      return false;
    if (item.originals.length < 2) return true;
    const key = JSON.stringify([...item.originals].sort());
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (!result || (!first && !firstShared && !result.sharedNext)) notFound();

  async function changeFollow(
    _state: FormState,
    form: FormData,
  ): Promise<FormState> {
    "use server";
    const following = form.get("following");
    if (following !== "yes" && following !== "no")
      return { error: "Choose Follow or Unfollow." };
    try {
      await (
        await backend()
      ).mutation(api.creators.setFollow, {
        organizationId,
        creatorKey: creator,
        following: following === "yes",
        sourceId: first?.id,
        familyId: first ? undefined : firstShared?.familyId,
      });
      revalidatePath(href);
      return {};
    } catch {
      return { error: "Following could not be updated. Try again." };
    }
  }

  async function changeSponsorship(
    _state: FormState,
    form: FormData,
  ): Promise<FormState> {
    "use server";
    const choice = form.get("sponsor");
    if (choice !== "yes" && choice !== "no")
      return { error: "Choose your contribution setting." };
    try {
      await (
        await backend()
      ).mutation(api.creators.setSponsorship, {
        organizationId,
        creatorKey: creator,
        sponsor: choice === "yes",
      });
      revalidatePath(href);
      return {};
    } catch {
      return { error: "Contributions could not be updated. Try again." };
    }
  }

  return (
    <AccountPageFrame
      title={result.name}
      description={result.handle ? `@${result.handle}` : undefined}
      back={{ href: `${base}/posts`, label: "Back to posts" }}
    >
      <div className={styles.profile}>
        <span aria-hidden="true">{result.name.slice(0, 1).toUpperCase()}</span>
        <div>
          <p>
            {result.platform === "instagram"
              ? "Instagram"
              : result.platform === "x"
                ? "X"
                : "TikTok"}
          </p>
          <p className={styles.note}>
            {result.monitoring
              ? result.monitoring.state === "ready"
                ? "Checking for new posts daily."
                : result.monitoring.state === "unavailable"
                  ? "The creator feed is temporarily unavailable."
                  : "Checking the creator feed."
              : "New-post checks are unavailable for this profile."}
          </p>
          {result.following && result.monitoring && (
            <p className={styles.note}>
              {result.monitoring.lastSuccessAt && (
                <>
                  Last checked{" "}
                  <time
                    dateTime={new Date(
                      result.monitoring.lastSuccessAt,
                    ).toISOString()}
                  >
                    {postDate.format(result.monitoring.lastSuccessAt)}
                  </time>
                  {". "}
                </>
              )}
              Next check{" "}
              <time
                dateTime={new Date(result.monitoring.nextCheckAt).toISOString()}
              >
                {postDate.format(result.monitoring.nextCheckAt)}
              </time>
            </p>
          )}
        </div>
        {(first || firstShared) && (
          <ActionForm
            action={changeFollow}
            label={result.following ? "Unfollow" : "Follow"}
            pendingLabel={result.following ? "Unfollowing…" : "Following…"}
          >
            <input
              type="hidden"
              name="following"
              value={result.following ? "no" : "yes"}
            />
          </ActionForm>
        )}
      </div>
      {result.pool && (
        <AccountSection
          title="Automatic analysis"
          description="Opt in to contribute up to 10% of your included credits each billing period. VibeScroll shares eligible results and charges one follower for each successful analysis."
        >
          <p className={styles.note}>
            {result.pool.used} of {result.pool.cap} credits used or reserved
            this period
          </p>
          <ActionForm
            action={changeSponsorship}
            label={
              result.pool.enabled ? "Stop contributing" : "Contribute credits"
            }
            pendingLabel="Updating…"
          >
            <input
              type="hidden"
              name="sponsor"
              value={result.pool.enabled ? "no" : "yes"}
            />
          </ActionForm>
        </AccountSection>
      )}
      {!!result.monitoring?.discoveries.length && (
        <AccountSection title="New posts" icon={FileText}>
          <ul className={styles.posts}>
            {result.monitoring.discoveries.map((post) => (
              <li key={post.url}>
                <Link href={`${base}?draft=${encodeURIComponent(post.url)}`}>
                  Save discovered post
                </Link>
                <PostOriginals urls={[post.url]} />
                <time dateTime={new Date(post.publishedAt).toISOString()}>
                  {postDate.format(post.publishedAt)}
                </time>
              </li>
            ))}
          </ul>
        </AccountSection>
      )}
      {(!!result.sharedItems.length || result.sharedNext) && (
        <AccountSection
          title="Analyzed posts"
          description="Shared analyses from this creator across VibeScroll."
          icon={FileText}
        >
          <ul className={styles.posts}>
            {result.sharedItems.map((post) => {
              const saved = result.items.find((item) =>
                item.originals.some(
                  (url) =>
                    platformPostKey(url) === platformPostKey(post.canonical),
                ),
              );
              return (
                <li key={post.familyId}>
                  <Link
                    href={
                      saved
                        ? `${base}/posts/${saved.id}`
                        : `${base}/catalog/${post.familyId}`
                    }
                    prefetch={false}
                  >
                    {post.title}
                  </Link>
                  <PostOriginals urls={post.originals} />
                  {post.publishedAt !== null && (
                    <time dateTime={new Date(post.publishedAt).toISOString()}>
                      {postDate.format(post.publishedAt)}
                    </time>
                  )}
                </li>
              );
            })}
          </ul>
          {!result.sharedItems.length && (
            <p className={styles.note}>
              No available posts on this page. Continue to older posts.
            </p>
          )}
          {result.sharedNext && (
            <Link
              href={`${href}?sharedAfter=${encodeURIComponent(result.sharedNext)}`}
              className="button"
              prefetch={false}
            >
              Older analyzed posts
            </Link>
          )}
        </AccountSection>
      )}
      {(!!posts?.length || result.next) && (
        <AccountSection
          title={
            result.sharedItems.length
              ? "Saved in this workspace"
              : "Analyzed posts"
          }
          icon={FileText}
        >
          <ul className={styles.posts}>
            {posts?.map((post) => (
              <li key={post.id}>
                <Link href={`${base}/posts/${post.id}`} prefetch={false}>
                  {post.title}
                </Link>
                <PostOriginals urls={post.originals} />
                {post.publishedAt !== null && (
                  <time dateTime={new Date(post.publishedAt).toISOString()}>
                    {postDate.format(post.publishedAt)}
                  </time>
                )}
              </li>
            ))}
          </ul>
          {result.next && (
            <Link
              href={`${href}?after=${encodeURIComponent(result.next)}`}
              className="button"
              prefetch={false}
            >
              Older posts
            </Link>
          )}
        </AccountSection>
      )}
    </AccountPageFrame>
  );
}
