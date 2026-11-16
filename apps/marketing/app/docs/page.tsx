import { Header, Footer, repository } from "@/components/site";
import { company } from "@companynerve/company-config";
export const metadata = {
  title: "Setup and documentation",
  alternates: { canonical: "/docs" },
};
export default function Page() {
  if (company.website.kind === "product")
    return (
      <div className="container">
        <Header />
        <main id="main" className="doc marketing-doc">
          <h1>VibeScroll documentation</h1>
          <p className="muted">
            Find help using the app, connecting an assistant, or running your
            own copy.
          </p>
          <div className="marketing-guide-list">
            {[
              [
                "Help guides",
                "/help",
                "Save a post, inspect an insight and use it in a project.",
              ],
              [
                "Developer documentation",
                "/docs",
                "Browse the assistant integration, tool contracts and setup guides.",
              ],
              [
                "Open-source setup",
                "/open-source",
                "Review the requirements for hosting your own VibeScroll deployment.",
              ],
            ].map(([label, route, copy]) => (
              <a href={company.website.appUrl + route} key={route}>
                <strong>{label}</strong>
                <span>{copy}</span>
              </a>
            ))}
          </div>
        </main>
        <Footer />
      </div>
    );
  return (
    <div className="container">
      <Header />
      <main id="main" className="doc">
        <h1>Start with a clean copy.</h1>
        <p className="muted">
          CompanyNerve is an early-release template. Read the repository's
          current verification record before deploying a product with real
          customers.
        </p>
        <h2>Get the source</h2>
        <pre>
          <code>{`git clone https://github.com/StefanDG1/companynerve.git
cd companynerve
pnpm install`}</code>
        </pre>
        <p>Use Node.js 24 and the pnpm version pinned in package.json.</p>
        <h2>Explore the site</h2>
        <pre>
          <code>pnpm dev:marketing</code>
        </pre>
        <p>
          Open localhost:3000. Marketing and the design gallery do not need
          provider credentials.
        </p>
        <h2>Set up the application</h2>
        <p>
          Follow the repository's{" "}
          <a href={repository + "/blob/main/docs/local-development.md"}>
            local development guide
          </a>{" "}
          to connect Convex and WorkOS. Add Stripe test-mode settings when you
          want to exercise subscriptions. Keep production credentials separate.
        </p>
        <h2>Create your product</h2>
        <pre>
          <code>
            pnpm template:export -- --name my-product --out ../my-product
          </code>
        </pre>
        <p>
          The export includes the marketing site, application, and backend, but
          omits all local environment values. Edit your company configuration,
          select a recipe, and follow the setup guide in the new directory.
        </p>
        <h2>Understand the boundaries</h2>
        <ul>
          <li>
            <a href={repository + "/blob/main/docs/architecture.md"}>
              Architecture and project structure
            </a>
          </li>
          <li>
            <a href={repository + "/blob/main/docs/security/threat-model.md"}>
              Permissions and threat model
            </a>
          </li>
          <li>
            <a href={repository + "/blob/main/docs/acceptance.md"}>
              Acceptance criteria
            </a>
          </li>
          <li>
            <a href={repository + "/blob/main/docs/status.md"}>
              Current implementation and verification status
            </a>
          </li>
          <li>
            <a href={repository + "/blob/main/docs/operations/deployment.md"}>
              Deployment guide
            </a>
          </li>
        </ul>
        <h2>Free code, independent services</h2>
        <p>
          CompanyNerve's own code uses the MIT license. Vendors have their own
          terms and usage limits. Paid CompanyNerve services are a future
          direction, not a dependency of the template.
        </p>
      </main>
      <Footer />
    </div>
  );
}
