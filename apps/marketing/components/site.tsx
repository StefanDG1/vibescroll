import Link from "next/link";
import { company } from "@companynerve/company-config";
import { Button, BrandMark } from "@companynerve/ui";
import { recipes, getRecipe } from "@companynerve/design-recipes";
import {
  KeyRound,
  Users,
  ReceiptText,
  Palette,
  BookOpen,
  GitBranch,
} from "lucide-react";
export const repository = "https://github.com/StefanDG1/companynerve";
export function Mark() {
  return <BrandMark />;
}
export function Header() {
  return (
    <header className="topbar">
      <Link href="/" className="wordmark">
        <Mark />
        {company.product.name}
      </Link>
      <nav className="navlinks" aria-label="Main">
        <Link href="/#included">
          {company.website.kind === "template" ? "The template" : "The product"}
        </Link>
        {company.website.kind === "template" && (
          <>
            <Link href="/designs">Design options</Link>
            <Link href="/docs">Documentation</Link>
            <a href={repository}>GitHub</a>
          </>
        )}
        {company.website.kind === "product" && (
          <>
            <a href={company.website.appUrl + "/pricing"}>Pricing</a>
            <a href={company.website.appUrl + "/help"}>Help</a>
          </>
        )}
        <a href={company.website.appUrl + "/sign-in"}>Sign in</a>
      </nav>
    </header>
  );
}
export function Footer() {
  return (
    <footer className="footer">
      <p>
        <Link href="/" className="wordmark">
          <Mark />
          {company.product.name}
        </Link>
        {company.website.kind === "template"
          ? ". A foundation for your next product."
          : ""}
      </p>
      <div className="navlinks">
        {company.website.kind === "template" && <Link href="/docs">Docs</Link>}
        <a href={repository + "/blob/main/LICENSE"}>
          {company.website.kind === "template"
            ? "MIT license"
            : "Template source license"}
        </a>
        <Link href="/privacy">Privacy</Link>
        {company.website.kind === "template" && (
          <Link href="/terms">Terms</Link>
        )}
        {company.website.kind === "product" && (
          <>
            <a href={company.website.appUrl + "/docs"}>Docs</a>
            <a href={company.website.appUrl + "/terms"}>Terms</a>
          </>
        )}
        {company.website.operator && <Link href="/legal">Legal notice</Link>}
        <a href={"mailto:" + company.website.supportEmail}>Contact</a>
      </div>
    </footer>
  );
}
export function ProductPreview() {
  return (
    <figure
      className="preview"
      aria-label="Illustrative starter application preview"
    >
      <div className="preview-head">
        <strong>Your workspace</strong>
        <span>Starter example</span>
      </div>
      <div className="preview-body">
        <p className="muted" style={{ fontSize: ".8rem" }}>
          Projects
        </p>
        <h3>A place to begin.</h3>
        <p className="muted" style={{ fontSize: ".85rem" }}>
          Add your product's work here.
        </p>
        <div className="preview-row">
          <span>
            <span className="dot" />
            Customer research
          </span>
          <span className="badge">Project</span>
        </div>
        <div className="preview-row">
          <span>
            <span className="dot" />
            First release
          </span>
          <span className="badge">Project</span>
        </div>
        <div className="preview-row">
          <span>Workspace access</span>
          <small>Owner · Admin · Member</small>
        </div>
      </div>
      <figcaption
        style={{ padding: "0 28px 20px", fontSize: ".72rem" }}
        className="muted"
      >
        Illustrative content. No customer data.
      </figcaption>
    </figure>
  );
}
export function RecipeGallery() {
  return (
    <div className="recipe-grid">
      {recipes.map((r) => (
        <Link className="recipe-tile" href={"/designs/" + r.id} key={r.id}>
          <div className="swatch" style={{ background: r.bg }}>
            <div className="swatch-window">
              <div style={{ width: "40%", background: r.color, height: 10 }} />
              <div style={{ width: "80%", background: "#c6ccd3" }} />
              <div style={{ width: "62%", background: "#c6ccd3" }} />
              <div
                style={{
                  width: "32%",
                  background: r.color,
                  marginTop: 12,
                  height: 10,
                }}
              />
            </div>
          </div>
          <div className="recipe-meta">
            <strong>{r.name}</strong>
            {r.id === "cobalt" && (
              <span className="badge">CompanyNerve design</span>
            )}
            <span className="muted">{r.audience}</span>
          </div>
        </Link>
      ))}
    </div>
  );
}
export function Landing({
  recipe = "cobalt",
  concept = false,
}: {
  recipe?: string;
  concept?: boolean;
}) {
  const r = getRecipe(recipe);
  return (
    <div
      data-recipe={r.id}
      style={{
        background: "var(--background)",
        color: "var(--foreground)",
        minHeight: "100vh",
      }}
    >
      {concept && (
        <div className="notice">
          Design option: {r.name}.{" "}
          {r.id === "cobalt"
            ? "Selected for CompanyNerve."
            : "Available for your next product."}{" "}
          <Link href="/designs">Compare all five</Link>
        </div>
      )}
      <div className="container">
        <Header />
        <main id="main">
          <section className="hero">
            <div>
              <p className="intro">Free SaaS template · MIT licensed</p>
              <h1>{r.headline}</h1>
              <p>
                Accounts, organizations, subscriptions, and a clear starting
                point. CompanyNerve gives you the common pieces so you can focus
                on what makes your product useful.
              </p>
              <div className="actions">
                {company.website.kind === "template" && (
                  <Button asChild>
                    <a href={company.website.appUrl + "/sign-up"}>
                      Create a free account
                    </a>
                  </Button>
                )}
                <Button variant="outline" asChild>
                  <a href={repository}>Explore the free template</a>
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/docs">Read the setup guide</Link>
                </Button>
              </div>
              <p style={{ fontSize: ".78rem", marginTop: 18 }}>
                Early release. Bring your own provider accounts.
              </p>
            </div>
            <ProductPreview />
          </section>
          <section className="section" id="included">
            <div className="section-head">
              <h2>The everyday parts of a SaaS, in one place.</h2>
              <p className="muted">
                A small example application you can read, change, and make your
                own.
              </p>
            </div>
            <div className="feature-grid">
              {[
                {
                  Icon: KeyRound,
                  title: "A proper front door",
                  text: "WorkOS sign-in, verified accounts, and protected application routes.",
                },
                {
                  Icon: Users,
                  title: "A place for each team",
                  text: "Organizations, invitations, and permissions checked on the backend.",
                },
                {
                  Icon: ReceiptText,
                  title: "Billing with boundaries",
                  text: "Stripe test-mode checkout, subscription management, and server-enforced access.",
                },
                {
                  Icon: Palette,
                  title: "Your own visual identity",
                  text: "Five starting directions. Change the type, layout, density, and color to fit your product.",
                },
                {
                  Icon: BookOpen,
                  title: "Instructions that stay with you",
                  text: "Setup steps, architecture decisions, and coding guidance live alongside the code.",
                },
                {
                  Icon: GitBranch,
                  title: "Room for your next feature",
                  text: "A simple project example demonstrates where your own product logic belongs.",
                },
              ].map(({ Icon, title, text }) => (
                <article className="feature" key={title}>
                  <Icon size={24} />
                  <h3>{title}</h3>
                  <p>{text}</p>
                </article>
              ))}
            </div>
          </section>
          <section className="section" id="design">
            <div className="section-head">
              <h2>One foundation. Five different beginnings.</h2>
              <p className="muted">
                Choose a direction for your product. None of them requires you
                to keep the CompanyNerve identity.
              </p>
            </div>
            <RecipeGallery />
          </section>
          <section className="section split">
            <div>
              <h2>From this repository to your product.</h2>
              <p className="muted">
                The template is free. Your application runs in your own
                accounts, with your own data and deployment settings.
              </p>
              <Button variant="outline" asChild>
                <Link href="/docs">Open the documentation</Link>
              </Button>
            </div>
            <ol className="steps">
              <li>
                <div>
                  <strong>Create your copy</strong>
                  <p>
                    Export a clean starter with the code, docs, and
                    configuration it needs.
                  </p>
                </div>
              </li>
              <li>
                <div>
                  <strong>Connect your services</strong>
                  <p>
                    Configure Convex and WorkOS. Add Stripe when your product
                    needs subscriptions.
                  </p>
                </div>
              </li>
              <li>
                <div>
                  <strong>Build your first useful feature</strong>
                  <p>
                    Replace the sample projects with your product's work. Keep
                    the access checks.
                  </p>
                </div>
              </li>
            </ol>
          </section>
          <section className="section faq">
            <div className="section-head">
              <h2>A few things worth knowing.</h2>
            </div>
            <details>
              <summary>Is the template really free?</summary>
              <p>
                Yes. CompanyNerve's own source is MIT licensed. Your hosting and
                other providers may charge for usage. Included third-party
                material retains its own notices.
              </p>
            </details>
            <details>
              <summary>What do I need to run it?</summary>
              <p>
                Node.js 24 and pnpm for local development, plus Convex and
                WorkOS accounts for the authenticated app. Stripe is optional
                until you enable subscriptions. The marketing site runs
                independently.
              </p>
            </details>
            <details>
              <summary>Can each product look different?</summary>
              <p>
                Yes. The five recipes are starting points. Each exported product
                owns its design and can change it independently.
              </p>
            </details>
            <details>
              <summary>
                Does it include the planned CompanyNerve services?
              </summary>
              <p>
                No. Future services will be separate products, with their own
                releases and verification. The template works without them.
              </p>
            </details>
            <details>
              <summary>Is this a finished visual design?</summary>
              <p>
                CompanyNerve uses Cobalt workshop with basic shadcn-compatible
                styling. All five recipes remain available for your products,
                and you can refine the typography and layout as you build.
              </p>
            </details>
          </section>
          <section className="section">
            <h2>Your product can start here.</h2>
            <p className="muted">
              Read the code, follow the setup, and build something useful.
            </p>
            <Button asChild>
              <a href={repository}>Explore CompanyNerve on GitHub</a>
            </Button>
          </section>
        </main>
        <Footer />
      </div>
    </div>
  );
}
