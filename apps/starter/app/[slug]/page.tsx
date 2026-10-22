import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { notFound } from "next/navigation";
import { PublicPage } from "@/components/site";
import Link from "next/link";
import { PolicyDocument } from "@/components/policy-document";
import { publicPolicyDocuments as legal } from "../../../../packages/policy/public-documents";
import pricing from "../../../../contracts/pricing.json";
import { policyRelease } from "../../../../packages/policy/publication";
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
      "A saved link is metadata until an enabled route processes permitted evidence. Private and blocked sources can need a permitted upload or supplied text.",
      "Browser library use needs no installed companion. Personal analysis needs an eligible paired computer and your connected official account. Managed processing uses its separately reviewed credit route.",
      "A ChatGPT subscription has its own eligibility and quota. It does not include transcription, VibeScroll hosting or cloud compute. General hosted commercial subscription-funded access remains gated.",
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
        <h1>A clear allowance for the work you choose.</h1>
        <p>
          EUR prices. Checkout confirms your total and applicable taxes.
          Supported local currencies may include the disclosed conversion fee;
          EUR remains an option.
        </p>
        <div className="price-grid">
          {Object.entries(pricing.tiers).map(([tier, p]) => (
            <article className="panel" key={tier}>
              <h2>{tier === "pro" ? "Pro" : "Starter"}</h2>
              <p className="price">
                €{p.monthly_price_eur}
                <small> billed monthly</small>
              </p>
              <p>€{p.weekly_price_eur} every 7 days</p>
              <p>
                €{p.annual_price_eur} billed once per year, equivalent to €
                {(p.annual_price_eur / 12).toFixed(2)} per month
              </p>
              <ul>
                <li>
                  {p.weekly_credits} weekly or {p.monthly_credits} monthly
                  credits
                </li>
                <li>
                  {pricing.limits[tier as "starter" | "pro"].repositories}{" "}
                  repositories
                </li>
                <li>
                  {
                    pricing.limits[tier as "starter" | "pro"]
                      .retained_storage_gb
                  }{" "}
                  GB retained storage
                </li>
                <li>Proposals, plans and draft PR workflow</li>
                <li>
                  Optional local execution and separately metered cloud
                  execution, when verified
                </li>
              </ul>
              <Link
                prefetch={false}
                className="primary"
                href={`/app?view=billing&tier=${tier}`}
              >
                View {tier === "pro" ? "Pro" : "Starter"} plans
              </Link>
            </article>
          ))}
        </div>
        <h2>Before payment</h2>
        <p>
          Annual credits replenish monthly. Included credits expire at the
          period boundary. Purchased credits are separate. Optional top-ups are
          €10 for 200 credits or €25 for 550 credits. No automatic top-ups or
          silent API fallback.
        </p>
        <p>
          The preview has 30 credits and up to 3 sources, with no automatic paid
          conversion. Provider inference and runtime costs are quoted before
          work.
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
        {slug !== "publication-checklist" && (
          <p className="notice">
            Effective {policyRelease.effectiveDate} · {policyRelease.id}
          </p>
        )}
        <p>
          VibeScroll was previously called VibeScroller. This published policy
          retains its original name and version.
        </p>
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
        {slug === "faq" && <Link href="/help">Find help with your task</Link>}
        {slug === "contact" && (
          <a className="primary" href="mailto:contact@exponentialeducation.ro">
            Email support
          </a>
        )}
      </article>
    </PublicPage>
  );
}
