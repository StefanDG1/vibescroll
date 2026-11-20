import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicIntro, PublicPage } from "@/components/site";
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
      <PublicIntro
        title={result.data?.title ?? "Public collection"}
        back={{ href: "/collections", label: "All public collections" }}
      >
        {result.data?.description && <p>{result.data.description}</p>}
      </PublicIntro>
      {result.state !== "ready" ? (
        <PublicKnowledgePending
          unavailable={result.state === "unavailable"}
          retryHref={`/collections/${slug}`}
        />
      ) : (
        <>
          <p className="public-meta">Topic · {result.data!.topic}</p>
          <p>
            These edition summaries are AI-generated and may contain errors.
            Open an edition to review its source references before relying on
            it.
          </p>
          <div className="public-card-grid">
            {result.data!.editions.map((edition) => (
              <Link
                className="public-list-card"
                href={`/editions/${edition.slug}`}
                key={edition.slug}
              >
                <h2>{edition.title}</h2>
                <p>{edition.summary}</p>
                <p>
                  Edition {edition.version}, published by {edition.publisher}
                </p>
              </Link>
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
