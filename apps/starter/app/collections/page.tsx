import Link from "next/link";
import { PublicIntro, PublicPage } from "@/components/site";
import { PublicCollectionDirectory } from "@/components/public-collection-directory";
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
      <PublicIntro title="Public collections">
        <p>
          Published editions and their evidence are available without signing
          in.
        </p>
      </PublicIntro>
      <PublicCollectionDirectory
        path="/collections"
        topic={topic}
        result={result}
      />
      <p className="public-next">
        <Link href="/discover">Go to Discover</Link>
      </p>
    </PublicPage>
  );
}
