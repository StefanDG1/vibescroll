import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { notFound } from "next/navigation";
import { PublicPage } from "@/components/site";
import Link from "next/link";
import { PolicyDocument } from "@/components/policy-document";
import { publicPolicyDocuments as legal } from "../../../../packages/policy/public-documents";
import { ProOfferSummary } from "@/components/pro-offer-summary";
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
    title: pages[slug]?.title ?? slug.replaceAll("-", " "),
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
  if (slug === "pricing")
    return (
      <PublicPage>
        <h1>One Pro plan. Choose your renewal.</h1>
        <p>
          EUR prices. The launch offer is being prepared; checkout confirms
          availability and the total before payment.
        </p>
        <article className="panel">
          <ProOfferSummary />
          <Link
            prefetch={false}
            className="primary"
            href="/app?view=billing&tier=pro"
          >
            View Pro availability
          </Link>
        </article>
        <h2>How credits work</h2>
        <p>
          See the credit estimate before starting paid work. Preparation and
          analysis are quoted separately; model and video length affect usage.
          Annual credits replenish monthly. Included credits expire at the
          period boundary; purchased credits stay separate.
        </p>
        <p>
          The open-source edition is self-hosted. Hosted catalogue data is
          separate, and full-catalog browsing is an additional entitlement.
        </p>
        <p>
          <Link href="/refunds">Refund and withdrawal policy</Link> ·{" "}
          <Link href="/terms">Terms</Link> ·{" "}
          <Link href="/contact">Business enquiry</Link>
        </p>
      </PublicPage>
    );
  if (legal[slug]) {
    const text = await readFile(
      join(process.cwd(), "content/legal", `${legal[slug]}.md`),
      "utf8",
    );
    return (
      <PublicPage>
        <PolicyDocument text={text} />
      </PublicPage>
    );
  }
  const p = pages[slug];
  if (!p) notFound();
  return (
    <PublicPage>
      <article className="prose">
        <h1>{p.title}</h1>
        {p.body.map((s) => (
          <p key={s}>{s}</p>
        ))}
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
          <ul>
            <li>
              <Link href="/docs/workflows/find-save#links-for-automatic-analysis">
                See supported post links
              </Link>
            </li>
            <li>
              <Link href="/help">Find help with your task</Link>
            </li>
          </ul>
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
