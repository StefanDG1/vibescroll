import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { notFound } from "next/navigation";
import { PublicPage } from "@/components/site";
import Link from "next/link";
import { PolicyDocument } from "@/components/policy-document";
import { publicPolicyDocuments as legal } from "../../../../packages/policy/public-documents";
import { PublicPricing } from "@/components/public-pricing";
const pages: Record<string, { title: string; body: string[] }> = {
  "how-it-works": {
    title: "From saved idea to reviewed change",
    body: [
      "Capture a supported URL, permitted upload or supplied transcript. Unavailable sources stay saved with an actionable state.",
      "Analysis distinguishes sampled audiovisual evidence from text-only or metadata coverage. AI output is labeled and may need verification.",
      "Select repositories and confirm each business profile. Useful matches become reviewable proposals. No fit and already implemented remain valid results.",
      "Accept a proposal, edit its plan, and separately approve its repository, base commit, files, executor, funding route and ceiling.",
      "An isolated worker returns a patch and test report. Review before the trusted publisher creates a draft PR. GitHub is authoritative for merge or closure.",
    ],
  },
  about: {
    title: "Why VibeScroll exists",
    body: [
      "I kept finding useful videos about coding, AI, marketing, and business. I saved them because I wanted to use the ideas. But I could watch ten videos faster than I could apply one. VibeScroll is the system I wanted between saving something and building something from it.",
      "V1 focuses on a private library, evidence, project relevance, reviewed plans and draft pull requests. The operator is EXPONENTIAL EDUCATION S.R.L. No provider affiliation or legal review is claimed.",
    ],
  },
  docs: {
    title: "Get started with your library",
    body: [
      "The task-based Help guides are the maintained instructions for saving a source, finding evidence and reviewing an idea for a project.",
      "For your own deployment or companion runtime, use the repository's setup and operations guides. Provider settings do not establish successful authentication or available processing.",
    ],
  },
  faq: {
    title: "Before you start",
    body: [
      "GitHub is optional. You can keep a library without creating a project or starting code work.",
      "Automatic analysis supports public Instagram Reels and video posts, TikTok videos, and public X posts. For private or blocked sources, use a permitted upload or supplied text when offered.",
      "Set up your VibeScroll connection and automatic analysis in ChatGPT once. Hosted analysis runs while your computer is off. If you choose local processing, keep your paired computer awake.",
      "ChatGPT has its own eligibility and usage limits. VibeScroll may charge preparation credits for a new analysis.",
      "No fit and already implemented are useful decisions. A plan, coding approval, patch approval, draft publication, merge and measured outcome remain separate.",
    ],
  },
  status: {
    title: "Service status",
    body: [
      "Your account shows the current availability of processing, connected providers and checkout before you start work.",
      "External platforms may restrict source retrieval. An unavailable source remains visible with its actual status; it does not receive an invented analysis.",
      "Contact contact@exponentialeducation.ro for support or a security report.",
    ],
  },
  contact: {
    title: "Talk to us",
    body: [
      "Support, rights requests and business enquiries: contact@exponentialeducation.ro.",
      "For a business pilot, include company, work email, team size, intended use and requirements. Do not send source media, credentials or financial details.",
      "No response SLA or enterprise functionality is promised during development.",
    ],
  },
};
export const dynamicParams = false;
export function generateStaticParams() {
  return [...Object.keys(pages), ...Object.keys(legal), "pricing"].map(
    (slug) => ({ slug }),
  );
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return {
    title:
      slug === "pricing"
        ? "VibeScroll Pro pricing"
        : (pages[slug]?.title ?? slug.replaceAll("-", " ")),
    robots: {
      index: process.env.SEO_PUBLIC_INDEXING === "true" && !legal[slug],
      follow: true,
    },
    alternates: { canonical: `https://scroll.companynerve.com/${slug}` },
  };
}
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (slug === "pricing") return <PublicPricing />;
  if (legal[slug]) {
    const text = await readFile(
      join(process.cwd(), "content/legal", `${legal[slug]}.md`),
      "utf8",
    );
    return (
      <PublicPage layout="reader">
        <PolicyDocument text={text} />
      </PublicPage>
    );
  }
  const p = pages[slug];
  if (!p) notFound();
  return (
    <PublicPage layout="reader">
      <article className="public-article">
        <h1>{p.title}</h1>
        {slug === "how-it-works" ? (
          <ol className="public-workflow-list">
            {[
              "Save the source",
              "Check the evidence",
              "Review a project match",
              "Review the proposal",
              "Inspect the result",
            ].map((title, index) => (
              <li key={title}>
                <h2>{title}</h2>
                <p>{p.body[index]}</p>
              </li>
            ))}
          </ol>
        ) : slug === "about" ? (
          <>
            <blockquote>{p.body[0]}</blockquote>
            <p>{p.body[1]}</p>
          </>
        ) : slug === "faq" ? (
          <div className="public-faq-list">
            {[
              "Do I need GitHub?",
              "What posts can I analyze?",
              "Do I need to leave my computer on?",
              "How does ChatGPT usage work?",
              "What happens after a project proposal?",
            ].map((title, index) => (
              <details key={title}>
                <summary>{title}</summary>
                <p>{p.body[index]}</p>
              </details>
            ))}
          </div>
        ) : (
          p.body.map((s) => <p key={s}>{s}</p>)
        )}
        {slug === "how-it-works" && (
          <div className="public-actions">
            <Link className="primary" href="/example">
              Open an example
            </Link>
            <Link className="secondary" href="/help">
              Find a how-to guide
            </Link>
          </div>
        )}
        {slug === "docs" && (
          <div className="row">
            <Link className="primary" href="/help/getting-started">
              Get started
            </Link>
            <a href="https://github.com/StefanDG1/vibescroll/blob/main/docs/PERSONAL-SETUP.md">
              Personal setup
            </a>
            <a href="https://github.com/StefanDG1/vibescroll/blob/main/docs/operations/assistant-local-runner.md">
              Companion setup
            </a>
          </div>
        )}
        {slug === "faq" && (
          <div className="public-support-links">
            <Link href="/docs/workflows/find-save#links-for-automatic-analysis">
              See supported post links
            </Link>
            <Link href="/help">Find help with your task</Link>
          </div>
        )}
        {slug === "contact" && (
          <a className="primary" href="mailto:contact@exponentialeducation.ro">
            Email support
          </a>
        )}
      </article>
    </PublicPage>
  );
}
