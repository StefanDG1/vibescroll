import { ProductMedia } from "@/components/product-media";
import Link from "next/link";
import { PublicPage } from "@/components/site";
export const metadata = {
  title: "Make scrolling useful",
  description: "Review saved ideas and approve changes worth building.",
  alternates: { canonical: "https://scroll.companynerve.com" },
};
export default function Home() {
  return (
    <PublicPage>
      <section className="hero">
        <div>
          <h1>Make scrolling useful.</h1>
          <p className="hero-copy">
            Save a post. Keep the idea. Put it to use. Find cited insights in
            your library and review what fits the projects you care about.
          </p>
          <div className="row">
            <Link prefetch={false} className="primary" href="/app">
              Try one post
            </Link>
            <Link className="secondary" href="/example">
              Inspect a cited example
            </Link>
          </div>
          <p className="fine">
            Capture in your browser. Review the evidence, plan and funding
            before any coding task.
          </p>
        </div>
        <div className="workflow-preview">
          <p className="demo-label">Illustrative example · Synthetic data</p>
          <div className="preview-source">
            <span className="source-art">▶</span>
            <div>
              <small>Saved idea</small>
              <h3>Show a useful example before setup</h3>
              <p>
                A populated first screen helps someone understand what they can
                do next.
              </p>
            </div>
          </div>
          <div className="trace-line">↓</div>
          <div className="preview-match">
            <span className="status">Relevant to Demo Planner</span>
            <h3>The first-run view is empty.</h3>
            <p>Try a reversible example, with a clear way to start fresh.</p>
            <small>
              Expected benefit is a hypothesis. You decide whether to test it.
            </small>
          </div>
          <div className="trace-line">↓</div>
          <div className="preview-pr">
            <span>⑂</span>
            <div>
              <strong>A reviewed plan becomes a draft PR</strong>
              <p>Merge status and measured benefit stay separate.</p>
            </div>
          </div>
        </div>
      </section>
      <section className="section">
        <h2>A shorter path from save to use.</h2>
        <div className="steps">
          {[
            [
              "Capture",
              "Share a supported link, upload permitted media, or supply a transcript.",
            ],
            [
              "Understand",
              "Review the summary, main points, evidence and uncertainty.",
            ],
            [
              "Match",
              "See why an idea fits a selected project, or why it does not.",
            ],
            [
              "Review",
              "Edit the plan. Approve its repository, files, executor and budget.",
            ],
            [
              "Build",
              "Review the patch and track its draft PR through merge or closure.",
            ],
          ].map(([t, p], i) => (
            <article key={t}>
              <span className="step-number">{i + 1}</span>
              <h3>{t}</h3>
              <p>{p}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="section split">
        <div>
          <h2>Some ideas belong in your library, not your code.</h2>
          <p>
            No useful match, already implemented, and unsupported claims are
            useful results. Keep the reason visible.
          </p>
          <Link href="/how-it-works">Read about evidence and approvals</Link>
        </div>
        <div>
          <h2>Private sources. Deliberate permissions.</h2>
          <p>
            Your workspace owns its library. Providers may process data needed
            for your task. Temporary originals expire, and private evidence
            stays behind access checks.
          </p>
          <Link href="/privacy">Read the privacy policy</Link>
        </div>
      </section>
      <section className="section">
        <h2>Choose an allowance, not an unlimited promise.</h2>
        <div className="price-preview">
          <article>
            <h3>Starter</h3>
            <p className="price">
              €19 <small>/ month</small>
            </p>
            <p>250 monthly credits · 3 repositories</p>
          </article>
          <article>
            <h3>Pro</h3>
            <p className="price">
              €39 <small>/ month</small>
            </p>
            <p>600 monthly credits · 15 repositories</p>
          </article>
        </div>
        <p>
          Weekly, monthly and annual choices are available in your account.
          Checkout confirms the total, currency and applicable tax before
          payment.
        </p>
        <Link href="/pricing">Compare the catalogue</Link>
      </section>
      <section className="section faq">
        <h2>Before you start</h2>
        {[
          [
            "Do I need a desktop application?",
            "No. Saving, reading, project review and approvals work in your browser. Personal processing needs an eligible paired computer; an enabled managed route needs no companion.",
          ],
          [
            "Can every saved Instagram video be imported?",
            "Automatic sync is not guaranteed. Unsupported, private or blocked links need a permitted upload or supplied transcript.",
          ],
          [
            "Can I use my ChatGPT subscription?",
            "Eligible local open-source tools can request your permission to use your ChatGPT plan. Hosted VibeScroll support is awaiting commercial access. API funding remains separate; your ChatGPT allowance is not unlimited and does not cover transcription or cloud compute.",
          ],
          [
            "Does merging mean the idea helped?",
            "No. Record an outcome with a measurement window and evidence after the change.",
          ],
        ].map(([q, a]) => (
          <details key={q}>
            <summary>{q}</summary>
            <p>{a}</p>
          </details>
        ))}
      </section>
      <ProductMedia variant="overview" idPrefix="home-media" />
    </PublicPage>
  );
}
