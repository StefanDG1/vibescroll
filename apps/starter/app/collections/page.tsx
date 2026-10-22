import Link from "next/link";
import { PublicPage } from "@/components/site";
import { PublicKnowledgePending } from "@/components/public-knowledge-pending";
import { PublicCollectionList } from "@/components/public-collection-list";
import { discoverPublic } from "@/lib/public-knowledge";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Public collections",
  description:
    "Read explicit public editions with their source evidence. Private workspace knowledge stays separate.",
  alternates: { canonical: "https://scroll.companynerve.com/collections" },
};
export default async function Collections({
  searchParams,
}: {
  searchParams: Promise<{ topic?: string; cursor?: string }>;
}) {
  const search = await searchParams;
  const topic = (search.topic ?? "").slice(0, 49);
  const result = await discoverPublic(topic, search.cursor ?? null);
  return (
    <PublicPage>
      <h1>Knowledge worth returning to.</h1>
      <p>
        Read current public editions without signing in. A collection contains
        deliberately published material, not somebody else's private library.
      </p>
      <form className="row" action="/collections">
        <label>
          Topic
          <input name="topic" maxLength={48} defaultValue={topic} />
        </label>
        <button type="submit">Find collections</button>
      </form>
      {result.state !== "ready" ? (
        <PublicKnowledgePending unavailable={result.state === "unavailable"} />
      ) : (
        <>
          <PublicCollectionList collections={result.data!.page} />
          {!result.data!.isDone && (
            <Link
              href={`/collections?${new URLSearchParams({ topic, cursor: result.data!.continueCursor })}`}
            >
              Next collections page
            </Link>
          )}
        </>
      )}
      <p>
        <Link href="/discover">Optional regional discovery</Link> ·{" "}
        <Link href="/example">Synthetic example</Link>
      </p>
    </PublicPage>
  );
}
