import { PublicIntro, PublicPage } from "@/components/site";
import Link from "next/link";
import { Link2 } from "lucide-react";
export const metadata = {
  title: "Review shared content",
  robots: { index: false, follow: false },
};
export default async function Share({
  searchParams,
}: {
  searchParams: Promise<{ url?: string; text?: string }>;
}) {
  const q = await searchParams;
  const draft = (q.url ?? q.text ?? "").slice(0, 2048);
  const returnTo = `/app?draft=${encodeURIComponent(draft)}`;
  return (
    <PublicPage layout="form">
      <PublicIntro title="Review a shared post">
        <p>
          Sign in to review the draft in your workspace and choose whether to
          save it.
        </p>
      </PublicIntro>
      <section className="public-state-card">
        <span className="public-state-icon">
          <Link2 size={22} aria-hidden="true" />
        </span>
        {draft.trim() ? (
          <>
            <h2>Shared draft</h2>
            <p className="public-share-draft">{draft}</p>
            <Link
              prefetch={false}
              className="primary"
              href={`/sign-in?returnTo=${encodeURIComponent(returnTo)}`}
            >
              Sign in to review
            </Link>
          </>
        ) : (
          <>
            <h2>No shared post yet</h2>
            <p>
              Share a link from a supported app or paste it in your workspace.
            </p>
            <div className="public-actions">
              <Link className="primary" href="/app" prefetch={false}>
                Open workspace
              </Link>
              <Link className="secondary" href="/help/share-a-post">
                Sharing guide
              </Link>
            </div>
          </>
        )}
      </section>
    </PublicPage>
  );
}
