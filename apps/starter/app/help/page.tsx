import Link from "next/link";
import { PublicIntro, PublicPage } from "@/components/site";
import { HelpDirectory } from "@/components/help-directory";
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
      <PublicIntro title="How can we help?">
        <p>
          Find a guide to saving posts, checking evidence or reviewing a project
          idea.
        </p>
      </PublicIntro>
      <HelpDirectory
        articles={helpArticles.map(({ slug, title, summary }) => ({
          slug,
          title,
          summary,
        }))}
      />
      <div className="public-support-links">
        <Link href="/example">Explore an example</Link>
        <Link href="/docs/mcp">Assistant documentation</Link>
        <Link href="/contact">Contact support</Link>
      </div>
    </PublicPage>
  );
}
