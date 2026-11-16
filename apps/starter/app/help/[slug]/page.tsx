import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicPage } from "@/components/site";
import { HelpDocument } from "@/components/help-document";
import { helpArticles, helpArticle, readHelpArticle } from "@/lib/help-content";

export const dynamicParams = false;
export function generateStaticParams() {
  return helpArticles.map(({ slug }) => ({ slug }));
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = helpArticle(slug);
  if (!article) notFound();
  return {
    title: article.title,
    description: article.summary,
    alternates: { canonical: `https://scroll.companynerve.com/help/${slug}` },
  };
}
export default async function Article({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const result = await readHelpArticle(slug);
  if (!result) notFound();
  return (
    <PublicPage layout="reader">
      <nav aria-label="Help">
        <Link className="public-back" href="/help">
          <span aria-hidden="true">‹</span> All help
        </Link>
      </nav>
      <HelpDocument text={result.content} assets={result.article.assets} />
      <aside className="help-related" aria-label="Related guides">
        <h2>Related guides</h2>
        <ul>
          {result.article.related.map((related) => {
            const article = helpArticle(related);
            return article ? (
              <li key={related}>
                <Link href={`/help/${related}`}>{article.title}</Link>
              </li>
            ) : null;
          })}
        </ul>
      </aside>
    </PublicPage>
  );
}
