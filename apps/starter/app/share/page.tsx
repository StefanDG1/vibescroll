import { PublicPage } from "@/components/site";
import Link from "next/link";
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
    <PublicPage>
      <h1>Review your shared link</h1>
      <p>
        This draft has not been imported. Sign in and confirm it in your
        workspace.
      </p>
      <pre>{(q.url ?? q.text ?? "").slice(0, 2048)}</pre>
      <Link
        prefetch={false}
        className="primary"
        href={`/sign-in?returnTo=${encodeURIComponent(returnTo)}`}
      >
        Open your inbox
      </Link>
    </PublicPage>
  );
}
