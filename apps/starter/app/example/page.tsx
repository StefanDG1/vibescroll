import Link from "next/link";
import { PublicPage } from "@/components/site";
export const metadata = {
  title: "Inspect a source and a project decision",
  description:
    "A synthetic, no-signup example with evidence, coverage and useful reasons to decline an idea.",
  alternates: { canonical: "https://scroll.companynerve.com/example" },
};
export default function Example() {
  return (
    <PublicPage>
      <h1>One source. A decision you can inspect.</h1>
      <p className="demo-label">
        Synthetic example. No real source, repository, processing or measured
        benefit.
      </p>
      <div className="example-trail">
        <section className="example-evidence" aria-labelledby="source-title">
          <h2 id="source-title">Show a useful example before setup</h2>
          <p>
            A fictional product walkthrough suggests showing an editable example
            before asking a new user to connect a project.
          </p>
          <h3>Insight</h3>
          <p>
            Let someone inspect a result before requesting optional
            configuration.
          </p>
          <a href="#sample-evidence">Inspect the supporting passage</a>
          <blockquote id="sample-evidence">
            <p>
              “Here is an example result. You can explore it, change your
              choices or start fresh before connecting a project.”
            </p>
            <footer>
              Authored synthetic passage, reference S1. No timestamp: this is
              supplied example text.
            </footer>
          </blockquote>
          <p>
            <strong>Coverage:</strong> one supplied paragraph. No audio, frames
            or repository files were analyzed.
          </p>
          <p>
            <strong>Uncertainty:</strong> this example demonstrates a review
            workflow. It cannot establish that this design improves activation.
          </p>
        </section>
        <section className="example-decisions" aria-labelledby="decision-title">
          <h2 id="decision-title">Does it belong in a project?</h2>
          <details open>
            <summary>Useful to investigate for Demo Planner</summary>
            <p>
              <strong>Current context:</strong> the fictional first-run screen
              is empty. A new user must connect a project before seeing a
              result. Context is synthetic revision 1, not a real code
              inspection.
            </p>
            <p>
              <strong>Reason:</strong> S1 suggests a reversible example that
              could explain the next decision.
            </p>
            <p>
              <strong>Private plan:</strong> show one clearly labelled example,
              keep Start fresh visible and ask for GitHub only when someone
              chooses project review. Check keyboard use, mobile layout and
              whether the example is understood.
            </p>
            <p>
              <strong>Alternative:</strong> a short illustrated explanation may
              be enough. Compare both with a person before investing in more UI.
            </p>
          </details>
          <details>
            <summary>Already implemented in Demo Gallery</summary>
            <p>
              The fictional gallery already opens with a labelled sample and a
              Start fresh control. Keep this source for reference. No new coding
              task is warranted.
            </p>
          </details>
          <details>
            <summary>No fit for Demo Records</summary>
            <p>
              The fictional records app must establish access before displaying
              sensitive material. A populated private-data example would
              conflict with that constraint. A separate synthetic public example
              might help, but the original suggestion does not justify changing
              access controls.
            </p>
          </details>
          <p>
            A retained plan approves no coding or publication. Review the exact
            executor, funding and maximum separately, then inspect the patch
            before approving a draft PR.
          </p>
        </section>
      </div>
      <div className="row">
        <Link className="primary" href="/demo?view=library">
          Explore the Library demo
        </Link>
        <Link className="secondary" href="/help/getting-started">
          Try your first source
        </Link>
      </div>
      <p>
        <a href="https://github.com/StefanDG1/vibescroll">
          Inspect the source on GitHub
        </a>
      </p>
    </PublicPage>
  );
}
