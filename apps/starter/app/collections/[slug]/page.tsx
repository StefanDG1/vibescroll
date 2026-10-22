import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicPage } from "@/components/site";
import { PublicKnowledgePending } from "@/components/public-knowledge-pending";
import { readPublicCollection } from "@/lib/public-knowledge";
import { publicSlug } from "@/lib/public-knowledge-display";
export const dynamic = "force-dynamic";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!publicSlug(slug)) notFound();
  return {
    title: "Public collection",
    alternates: {
      canonical: `https://scroll.companynerve.com/collections/${slug}`,
    },
  };
}
export default async function Collection({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const result = await readPublicCollection(slug);
  if (result.state === "missing") notFound();
  return (
    <PublicPage>
      <Link href="/collections">All public collections</Link>
      {result.state !== "ready" ? (
        <PublicKnowledgePending unavailable={result.state === "unavailable"} />
      ) : (
        <>
          <h1>{result.data!.title}</h1>
          <p>{result.data!.description}</p>
          <p>Topic: {result.data!.topic}</p>
          <p>
            These edition summaries are AI-generated and may contain errors.
            Open an edition to review its source references before relying on
            it.
          </p>
          <div className="help-index">
            {result.data!.editions.map((edition) => (
              <article key={edition.slug}>
                <h2>
                  <Link href={`/editions/${edition.slug}`}>
                    {edition.title}
                  </Link>
                </h2>
                <p>{edition.summary}</p>
                <p>
                  Edition {edition.version}, published by {edition.publisher}
                </p>
              </article>
            ))}
          </div>
          <p>
            Only current permitted editions appear. A withdrawn or changed
            source can make a previously linked edition unavailable.
          </p>
        </>
      )}
    </PublicPage>
  );
}
