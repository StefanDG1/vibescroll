import Link from "next/link";
import { ProductMedia } from "@/components/product-media";
import { PublicPage } from "@/components/site";
import { ScrollShowScenes } from "@/components/scrollshow-scenes";
import { ScrollShowPrompts } from "@/components/scrollshow-prompts";

export const metadata = {
  title: "Make scrolling useful",
  description:
    "Save a post, inspect cited ideas and review what fits your product.",
  alternates: { canonical: "https://scroll.companynerve.com" },
};

export default function Home() {
  return (
    <PublicPage>
      <div className="scrollshow-home">
        <section className="ss-hero" aria-labelledby="home-title">
          <div className="ss-stack ss-stack-left" aria-hidden="true">
            <span />
            <span />
            <span>
              <i />
              <i />
              <i />
            </span>
          </div>
          <div className="ss-stack ss-stack-right" aria-hidden="true">
            <span />
            <span />
            <span>
              <i />
              <i />
              <i />
            </span>
          </div>
          <p className="ss-motto">Make scrolling useful.</p>
          <h1 id="home-title">
            Find the ideas worth applying to your product.
          </h1>
          <p className="ss-lead">
            Save a post. Inspect the cited idea. Connect your GitHub project
            when you want to review what fits, then decide what to build.
          </p>
          <div className="ss-actions">
            <Link className="primary" href="/app" prefetch={false}>
              Try one post
            </Link>
            <a className="secondary" href="#product-demo">
              See how it works
            </a>
          </div>
          <p className="ss-note">
            General source analysis does not require GitHub. Processing needs an
            eligible, ready route. Connect GitHub for project context.
          </p>
          <Link className="ss-example-link" href="/example">
            View an example without signing in
          </Link>
          <ScrollShowPrompts />
        </section>
        <section
          id="product-demo"
          className="ss-section ss-demo"
          aria-labelledby="demo-title"
        >
          <div className="ss-heading">
            <h2 id="demo-title">See what happens after you save.</h2>
            <p>
              Open the source, inspect the useful idea, and review how it
              relates to a product. You choose the next step.
            </p>
          </div>
          <ScrollShowScenes kind="demo" />
          <details className="ss-recording">
            <summary>Watch the captioned interface walkthrough</summary>
            <ProductMedia variant="overview" idPrefix="home-media" />
          </details>
        </section>
        <section
          id="insight-library"
          className="ss-section ss-explanation"
          aria-labelledby="library-title"
        >
          <div className="ss-heading">
            <h2 id="library-title">
              Keep the idea and the reason you saved it.
            </h2>
            <p className="ss-explanation-text">
              A useful idea needs its source. A product decision needs context.
              Keep the evidence beside the insight, then review the next step in
              your private workspace.
            </p>
          </div>
          <ol
            className="ss-evidence-trail"
            aria-label="Illustrative source-to-project trail"
          >
            <li>
              <span>Source post</span>
              <div className="ss-source-art" aria-hidden="true">
                <i />
                <i />
                <i />
              </div>
              <h3>Show an example first</h3>
              <p>Supplied text for this synthetic demonstration.</p>
            </li>
            <li>
              <span>Cited insight</span>
              <div className="ss-citation-art" aria-hidden="true">
                “<i />
                <i />
              </div>
              <h3>Make the first screen useful</h3>
              <p>Inspect the explanation and its evidence before deciding.</p>
            </li>
            <li>
              <span>Private product review</span>
              <div className="ss-project-art" aria-hidden="true">
                <i />
                <i />
                <i />
              </div>
              <h3>Does this fit my product?</h3>
              <p>Review relevance, existing behavior and limitations.</p>
            </li>
          </ol>
          <p className="ss-note">
            Illustrative example. No live source retrieval, catalog access or
            repository analysis is shown.
          </p>
          <div className="ss-library-notes">
            <div>
              <h3>Your library comes first.</h3>
              <p>
                Save supported links, keep your notes and return to your own
                results. A saved link and a completed analysis have separate
                states.
              </p>
            </div>
            <div>
              <h3>Shared catalog access is separate.</h3>
              <p>
                The planned shared insight catalog requires Pro. Its release
                checks are still pending. Approved examples are available to
                inspect now.
              </p>
            </div>
          </div>
          <Link href="/example">View an approved example</Link>
        </section>
        <section className="ss-section" aria-labelledby="workflow-title">
          <div className="ss-heading">
            <h2 id="workflow-title">
              From a useful post to a better-informed product decision.
            </h2>
          </div>
          <ol className="ss-workflow">
            {[
              [
                "Find an idea",
                "Save a supported post and inspect its evidence. An unavailable source stays clearly labeled.",
              ],
              [
                "Connect your product",
                "Choose the GitHub project you want to improve and authorize the context VibeScroll can use.",
              ],
              [
                "Review the fit",
                "Inspect a proposed improvement, an existing solution or a reason the idea does not fit.",
              ],
              [
                "Choose the next step",
                "Review and edit a plan. Implementation, spending and publication need separate approval.",
              ],
            ].map(([title, text], index) => (
              <li key={title}>
                <span className="ss-step">0{index + 1}</span>
                <h3>{title}</h3>
                <p>{text}</p>
              </li>
            ))}
          </ol>
          <p className="ss-note">
            You can use your library without connecting a project.
          </p>
        </section>
        <section className="ss-section" aria-labelledby="features-title">
          <div className="ss-heading">
            <h2 id="features-title">Keep the evidence beside the decision.</h2>
            <p>
              Move between the source, the insight and your project's context
              without losing the reason you saved it.
            </p>
          </div>
          <ScrollShowScenes kind="features" />
        </section>
        <section
          className="ss-section ss-options"
          aria-label="Processing and source options"
        >
          <div>
            <h2>Know what can run before you approve it.</h2>
            <p>
              Processing depends on the source, your account and the route
              available in your workspace. Review current readiness, coverage
              and maximum cost before starting.
            </p>
            <Link href="/help/processing-and-recovery">
              Check processing options
            </Link>
          </div>
          <div>
            <h2>Bring the posts you choose.</h2>
            <p>
              Paste a supported link or preview a Saved-links import. Private,
              blocked or unsupported sources may need a permitted upload or
              supplied text. Automatic creator following is awaiting release
              acceptance.
            </p>
            <Link href="/help/share-a-post">
              Read the source and sharing guide
            </Link>
          </div>
        </section>
        <section className="ss-section" aria-labelledby="example-title">
          <div className="ss-heading">
            <h2 id="example-title">
              Sometimes the right next step is to leave the code alone.
            </h2>
            <p>
              An idea can be useful for one product, already implemented in
              another and unsuitable for a third.
            </p>
          </div>
          <div className="ss-decisions">
            {[
              [
                "DemoPlanner",
                "Useful to investigate",
                "Show a labeled example before asking people to configure an empty screen. Review a small first-screen change.",
              ],
              [
                "DemoGallery",
                "Already implemented",
                "The product already offers a labeled sample and a fresh start. Keep the current behavior.",
              ],
              [
                "DemoRecords",
                "Not a fit",
                "Access is required before private records can be shown. Consider a separate synthetic example instead.",
              ],
            ].map(([project, label, text]) => (
              <article key={project}>
                <p className="ss-decision-label">{label}</p>
                <h3>{project}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
          <p className="ss-note">
            Synthetic example with supplied-text evidence. It explains the
            workflow and does not report a customer result.
          </p>
          <Link href="/example">Open the complete example</Link>
        </section>
        <section
          className="ss-section ss-pricing"
          aria-labelledby="pricing-title"
        >
          <div>
            <h2 id="pricing-title">Choose an allowance that fits your work.</h2>
            <p>
              Compare the current Starter and Pro plans, billing intervals and
              processing limits. Checkout confirms the total and applicable tax
              before payment.
            </p>
          </div>
          <Link className="primary" href="/pricing">
            Compare current plans
          </Link>
        </section>
        <section className="ss-section ss-faq" aria-labelledby="faq-title">
          <h2 id="faq-title">Before you start</h2>
          {[
            [
              "Do I need GitHub to get started?",
              "No. You can save posts, analyze supported sources through an eligible, ready processing route, read your own results and view approved examples without GitHub. Connect GitHub when you want to review an idea against an authorized project's context. Source rights and processing readiness still apply.",
            ],
            [
              "Will every saved idea lead to a code change?",
              "Some ideas fit, some are already implemented and some are not useful for your project. Review the explanation and choose what happens next.",
            ],
            [
              "Does connecting GitHub approve changes to my code?",
              "Connecting a project provides authorized context. You review the plan and approve implementation separately. A connection does not approve spending, publication, merging or deployment.",
            ],
            [
              "Do I need to keep my computer running?",
              "The personal local route needs an eligible paired computer that is awake. Managed processing has separate funding and availability checks. Check the current route in your workspace; computer-free own-account Cloud support is still awaiting acceptance.",
            ],
            [
              "Can every Instagram or TikTok post be analyzed?",
              "Support depends on source access, media format, rights and the available processing route. Results identify incomplete evidence. A saved URL is not permission to retrieve its media.",
            ],
            [
              "Does merging mean the idea helped?",
              "No. A merged pull request and a useful outcome are separate facts. Record the outcome with a measurement window and evidence.",
            ],
          ].map(([question, answer]) => (
            <details key={question}>
              <summary>{question}</summary>
              <p>{answer}</p>
            </details>
          ))}
          <Link href="/faq">Read all frequently asked questions</Link>
        </section>
        <section
          className="ss-section ss-closing"
          aria-labelledby="closing-title"
        >
          <h2 id="closing-title">Put one useful idea to work.</h2>
          <p>
            Start with a post or an approved example. Connect your product when
            you are ready to review what fits.
          </p>
          <div className="ss-actions">
            <Link className="primary" href="/app" prefetch={false}>
              Try one post
            </Link>
            <Link className="secondary" href="/example">
              View the example
            </Link>
          </div>
        </section>
      </div>
    </PublicPage>
  );
}
