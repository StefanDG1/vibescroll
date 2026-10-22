import Link from "next/link";
import { PublicPage } from "@/components/site";
import { PublicKnowledgePending } from "@/components/public-knowledge-pending";
import { PublicCollectionList } from "@/components/public-collection-list";
import { CommunityDiscovery } from "@/components/community-discovery";
import { discoverPublic, publicGeography } from "@/lib/public-knowledge";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Discover public knowledge",
  description:
    "Explore deliberate public collections by topic, with optional voluntary regional aggregates.",
  alternates: { canonical: "https://scroll.companynerve.com/discover" },
};
export default async function Discover({
  searchParams,
}: {
  searchParams: Promise<{ topic?: string; cursor?: string }>;
}) {
  const search = await searchParams;
  const topic = (search.topic ?? "").slice(0, 49);
  const result = await discoverPublic(topic, search.cursor ?? null);
  const geography =
    result.state === "ready"
      ? await publicGeography()
      : { available: false, regions: [] };
  return (
    <PublicPage>
      <h1>Find a useful collection.</h1>
      <p>
        Topics and lists work without a globe. Only current explicitly published
        material appears here.
      </p>
      <form className="row" action="/discover">
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
              href={`/discover?${new URLSearchParams({ topic, cursor: result.data!.continueCursor })}`}
            >
              Next collections page
            </Link>
          )}
          <CommunityDiscovery
            regions={geography.regions}
            available={geography.available}
          />
        </>
      )}
      <p>
        <Link href="/collections">Read public collections</Link> ·{" "}
        <Link href="/example">Inspect a labelled synthetic example</Link>
      </p>
    </PublicPage>
  );
}
