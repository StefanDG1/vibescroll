import Link from "next/link";
import { notFound } from "next/navigation";
import { PostOriginals } from "@/components/post-source-media";
import { FileText } from "lucide-react";
import { AccountPageFrame, AccountSection } from "@/components/account-layout";
import { backend, api } from "@/lib/backend";
import type { Id } from "../../../../../../../convex/_generated/dataModel";
import { revalidatePath } from "next/cache";
import styles from "./creator.module.css";

const postDate = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeZone: "UTC",
});

export default async function CreatorPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string; creator: string }>;
  searchParams: Promise<{ after?: string }>;
}) {
  const { org, creator } = await params;
  const { after } = await searchParams;
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
    })
    .catch(() => null);
  const first = result?.items[0];
  const seen = new Set<string>();
  const posts = result?.items.filter((item) => {
    if (item.originals.length < 2) return true;
    const key = JSON.stringify([...item.originals].sort());
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (!result || !first) notFound();

  async function changeFollow(form: FormData) {
    "use server";
    const following = form.get("following");
    if (following !== "yes" && following !== "no") return;
    await (
      await backend()
    ).mutation(api.creators.setFollow, {
      organizationId,
      creatorKey: creator,
      following: following === "yes",
      sourceId: first!.id,
    });
    revalidatePath(href);
  }

  async function changeSponsorship(form: FormData) {
    "use server";
    const choice = form.get("sponsor");
    if (choice !== "yes" && choice !== "no") return;
    await (
      await backend()
    ).mutation(api.creators.setSponsorship, {
      organizationId,
      creatorKey: creator,
      sponsor: choice === "yes",
    });
    revalidatePath(href);
  }

  return (
    <AccountPageFrame
      title={result.name}
      description={`@${result.handle}`}
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
                ? result.platform === "tiktok"
                  ? "Checking for new videos daily."
                  : "Checking for new posts daily."
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
        <form action={changeFollow}>
          <button
            name="following"
            value={result.following ? "no" : "yes"}
            className={result.following ? "secondary" : "primary"}
          >
            {result.following ? "Unfollow" : "Follow"}
          </button>
        </form>
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
          <form action={changeSponsorship}>
            <button
              name="sponsor"
              value={result.pool.enabled ? "no" : "yes"}
              className={result.pool.enabled ? "secondary" : "primary"}
            >
              {result.pool.enabled ? "Stop contributing" : "Contribute credits"}
            </button>
          </form>
        </AccountSection>
      )}
      {!!result.monitoring?.discoveries.length && (
        <AccountSection
          title={result.platform === "tiktok" ? "New videos" : "New posts"}
          icon={FileText}
        >
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
      <AccountSection title="Analyzed posts" icon={FileText}>
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
    </AccountPageFrame>
  );
}
