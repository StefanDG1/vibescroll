import Link from "next/link";
import { PublicPage } from "@/components/site";
import { helpArticles } from "@/lib/help-content";

export const metadata = {
  title: "Help with your next task",
  description:
    "Save a permitted source, inspect cited insights and decide what belongs in a project.",
  alternates: { canonical: "https://scroll.companynerve.com/help" },
};
export default function Help() {
  return (
    <PublicPage>
      <section className="help-intro">
        <h1>One useful task at a time.</h1>
        <p>
          Start with your library. Connect a project when you have an idea to
          review.
        </p>
        <p>
          <Link href="/example">Inspect an example without signing in</Link>
        </p>
      </section>
      <div className="help-index">
        {helpArticles.map((article) => (
          <article key={article.slug}>
            <h2>
              <Link href={`/help/${article.slug}`}>{article.title}</Link>
            </h2>
            <p>{article.summary}</p>
          </article>
        ))}
      </div>
      <p>
        Need a hand? <Link href="/contact">Contact support</Link>. Include the
        app version and a safe error code. Keep private content and credentials
        out of your message.
      </p>
    </PublicPage>
  );
}
