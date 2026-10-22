import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicPage } from "@/components/site";
import { PublicKnowledgePending } from "@/components/public-knowledge-pending";
import { PublicEditionContent } from "@/components/public-edition-content";
import { PublicReportForm } from "@/components/public-report-form";
import { readPublicEdition } from "@/lib/public-knowledge";
import { publicSaveHref, publicSlug } from "@/lib/public-knowledge-display";
export const dynamic = "force-dynamic";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!publicSlug(slug)) notFound();
  return {
    title: "Public source edition",
    alternates: {
      canonical: `https://scroll.companynerve.com/editions/${slug}`,
    },
  };
}
export default async function Edition({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const result = await readPublicEdition(slug);
  if (result.state === "missing") notFound();
  const edition = result.data;
  return (
    <PublicPage>
      <Link href="/collections">Public collections</Link>
      <h1>Public source edition</h1>
      {result.state !== "ready" || !edition ? (
        <PublicKnowledgePending unavailable={result.state === "unavailable"} />
      ) : (
        <>
          <p>
            Version {edition.version}. Published{" "}
            {edition.publishedDate ?? "date unavailable"}. This is an existing
            extraction, not a fresh analysis.
          </p>
          <PublicEditionContent edition={edition} />
          {edition.corrections.length > 0 && (
            <section>
              <h2>Publisher corrections</h2>
              <ul>
                {edition.corrections.map((correction, index) => (
                  <li key={index}>
                    Version {correction.version}: {correction.note}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {edition.reuseAllowed &&
          publicSaveHref(edition.slug, edition.version) ? (
            <>
              <Link
                className="primary"
                href={publicSaveHref(edition.slug, edition.version)!}
              >
                Review saving this version to my library
              </Link>
              <p>
                Sign in, choose a workspace and confirm the exact edition
                version before saving. Opening this link does not import or run
                inference. Your private notes stay separate.
              </p>
            </>
          ) : (
            <p>
              This edition is readable publicly but does not permit
              derived-artifact reuse. Keep its public link for reference.
            </p>
          )}
          <PublicReportForm slug={edition.slug} />
          <p>
            <Link href="/contact">
              Request a private rights or support exchange
            </Link>
          </p>
        </>
      )}
    </PublicPage>
  );
}
