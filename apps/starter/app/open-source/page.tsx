import Link from "next/link";
import { PublicPage } from "@/components/site";
export const metadata = {
  title: "Open source, one maintained core",
  description:
    "Inspect VibeScroll's MIT source, try a synthetic demo and understand self-hosting requirements.",
  alternates: { canonical: "https://scroll.companynerve.com/open-source" },
};
export default function OpenSource() {
  return (
    <PublicPage>
      <section className="help-intro">
        <h1>Your library. Inspectable software.</h1>
        <p>
          VibeScroll's V1 code is MIT, with CompanyNerve and third-party notices
          preserved. The hosted service supplies managed operation,
          organization, storage within quota and its stated processing
          allowance.
        </p>
        <div className="row">
          <a className="primary" href="https://github.com/StefanDG1/vibescroll">
            View the repository
          </a>
          <Link className="secondary" href="/example">
            Inspect an example
          </Link>
        </div>
      </section>
      <h2>Choose a starting path</h2>
      <div className="public-table">
        <table>
          <caption>Hosted use and running your own copy</caption>
          <thead>
            <tr>
              <th scope="col">Path</th>
              <th scope="col">Requirements</th>
              <th scope="col">Limits</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Hosted library</th>
              <td>Browser and your signed-in account.</td>
              <td>
                Processing availability, storage, selected funding and account
                quotas apply.
              </td>
            </tr>
            <tr>
              <th scope="row">Synthetic local demo</th>
              <td>Node 24, pnpm 12.3.4 and repository packages.</td>
              <td>
                Illustrative fixtures. No provider account or real analysis
                needed.
              </td>
            </tr>
            <tr>
              <th scope="row">Your own deployment</th>
              <td>
                Your Convex and WorkOS environments; private storage for
                uploads; GitHub and provider accounts for optional routes.
              </td>
              <td>
                You operate credentials, costs, backups, deletion and recovery.
                This is not self-contained offline software.
              </td>
            </tr>
            <tr>
              <th scope="row">Personal analysis</th>
              <td>
                Supported paired Windows computer, isolated runtime, offline
                transcription and eligible own-account official-client
                connection.
              </td>
              <td>
                Text and sampled frames can reach the model provider.
                Independent setup and commercial hosted subscription access
                remain separate gates.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <h2>Try the synthetic demo</h2>
      <pre>
        <code>
          {
            "pnpm install --frozen-lockfile\nnode scripts/setup-preflight.mjs --demo\npnpm dev"
          }
        </code>
      </pre>
      <p>
        Open localhost:3001/demo. Real provider setup is separate. Third-party
        software and hosted services keep their own terms; MIT does not grant
        access to another person's content or provider account.
      </p>
      <h2>Contribute a useful improvement</h2>
      <p>
        Start with the{" "}
        <a href="https://github.com/StefanDG1/vibescroll/blob/main/CONTRIBUTING.md">
          contributor guide
        </a>{" "}
        and{" "}
        <a href="https://github.com/StefanDG1/vibescroll/blob/main/SECURITY.md">
          private security instructions
        </a>
        . Include a synthetic reproduction and the version. Never put
        credentials or private transcripts in an issue.
      </p>
      <p>
        <Link href="/help">Get help with a task</Link> ·{" "}
        <Link href="/pricing">Understand the hosted allowance</Link>
      </p>
    </PublicPage>
  );
}
