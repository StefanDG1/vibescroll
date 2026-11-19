import Link from "next/link";
import {
  ArrowRight,
  BookmarkPlus,
  FileSearch,
  FolderGit2,
  ListChecks,
} from "lucide-react";
import { ProductMedia } from "@/components/product-media";
import { PublicPage } from "@/components/site";
import { ScrollShowScenes } from "@/components/scrollshow-scenes";
import { LandingInsightPreview } from "@/components/landing-insight-preview";
import { PublicCta } from "@/components/public-cta";

export const metadata = {
  title: "Make scrolling useful",
  description:
    "Save a post, inspect cited ideas and review what fits your product.",
  alternates: { canonical: "https://scroll.companynerve.com" },
};

const workflow = [
  {
    title: "Save a post",
    description: "Add a supported link to your own library.",
    Icon: BookmarkPlus,
  },
  {
    title: "Check the insight",
    description: "Open the source evidence and see what supports the idea.",
    Icon: FileSearch,
  },
  {
    title: "Find a project",
    description: "Use authorized GitHub context to see where the idea fits.",
    Icon: FolderGit2,
  },
  {
    title: "Review a proposal",
    description: "Review a plan and choose what happens next.",
    Icon: ListChecks,
  },
];

const questions = [
  [
    "Which posts can I analyze?",
    "Automatic analysis supports public Instagram Reels and video posts, TikTok videos, and public X posts. Results depend on source access, format and your processing setup.",
  ],
  [
    "Do I need to connect GitHub?",
    "GitHub is optional. You can save posts and read insights first. Connect a project when you want to check an idea against its code.",
  ],
  [
    "Does connecting a project approve code changes?",
    "Connecting a project provides authorized context. You review and approve implementation and publication separately.",
  ],
  [
    "Do I need to keep my computer running?",
    "Hosted analysis can run while your computer is off once an eligible route is set up. Your paired computer needs to stay available if you choose local processing.",
  ],
];

export default function Home() {
  return (
    <PublicPage layout="home">
      <div className="scrollshow-home">
        <section className="ss-hero" aria-labelledby="home-title">
          <div className="ss-hero-copy">
            <h1 id="home-title">Put your saved posts to work.</h1>
            <p className="ss-lead">
              Find the useful ideas in posts you save, check their evidence, and
              decide what fits your project.
            </p>
            <div className="ss-actions">
              <PublicCta
                className="primary"
                href="/onboarding?example=1"
                cta="try_example"
                page="home"
              >
                Try a real example <ArrowRight size={17} aria-hidden="true" />
              </PublicCta>
              <PublicCta
                className="secondary"
                href="/onboarding"
                cta="start_setup"
                page="home"
              >
                Get started
              </PublicCta>
            </div>
            <p className="ss-note">
              Open an insight, see the source behind it, and decide if it’s
              useful for your project.
            </p>
          </div>
          <LandingInsightPreview />
        </section>
        <section
          className="ss-section"
          id="product-demo"
          aria-labelledby="workflow-title"
        >
          <div className="ss-heading">
            <h2 id="workflow-title">From saved post to project proposal</h2>
          </div>
          <ol className="ss-workflow">
            {workflow.map(({ title, description, Icon }) => (
              <li key={title}>
                <Icon size={23} aria-hidden="true" />
                <h3>{title}</h3>
                <p>{description}</p>
              </li>
            ))}
          </ol>
        </section>
        <section
          id="insight-library"
          className="ss-section"
          aria-labelledby="library-title"
        >
          <div className="ss-heading">
            <h2 id="library-title">See the workflow in VibeScroll</h2>
            <p>
              Browse a saved source, open an insight, then see how a project
              proposal comes together.
            </p>
          </div>
          <ScrollShowScenes />
          <details className="ss-recording">
            <summary>Watch the captioned walkthrough</summary>
            <ProductMedia variant="overview" idPrefix="home-media" />
          </details>
        </section>
        <section
          className="ss-section ss-pricing"
          aria-labelledby="pricing-title"
        >
          <div>
            <h2 id="pricing-title">VibeScroll Pro</h2>
            <p>
              Compare monthly, yearly and weekly renewal terms and included
              credits.
            </p>
          </div>
          <PublicCta
            className="primary"
            href="/pricing"
            cta="see_pricing"
            page="home"
          >
            View pricing
          </PublicCta>
        </section>
        <section className="ss-section ss-faq" aria-labelledby="faq-title">
          <h2 id="faq-title">Before you start</h2>
          {questions.map(([question, answer]) => (
            <details key={question}>
              <summary>{question}</summary>
              <p>{answer}</p>
            </details>
          ))}
          <Link href="/help">Find help with a specific task</Link>
        </section>
        <section
          className="ss-section ss-closing"
          aria-labelledby="closing-title"
        >
          <h2 id="closing-title">Start with one saved post</h2>
          <div className="ss-actions">
            <PublicCta
              className="primary"
              href="/onboarding"
              cta="start_setup"
              page="home"
            >
              Get started
            </PublicCta>
            <PublicCta
              className="secondary"
              href="/onboarding?example=1"
              cta="try_example"
              page="home"
            >
              Try a real example
            </PublicCta>
          </div>
        </section>
      </div>
    </PublicPage>
  );
}
