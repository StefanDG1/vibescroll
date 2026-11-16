import Link from "next/link";
import { PublicIntro, PublicPage } from "@/components/site";
import { PublicCollectionDirectory } from "@/components/public-collection-directory";
import { discoverPublic } from "@/lib/public-knowledge";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Discover public knowledge",
  description: "Explore deliberate public collections by topic.",
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
  return (
    <PublicPage>
      <PublicIntro title="Discover public ideas">
        <p>
          Browse published collections and check the sources behind their
          insights.
        </p>
      </PublicIntro>
      <PublicCollectionDirectory
        path="/discover"
        topic={topic}
        result={result}
      />
      <p className="public-next">
        <Link href="/collections">All public collections</Link>
      </p>
    </PublicPage>
  );
}
