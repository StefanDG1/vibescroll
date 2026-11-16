import Link from "next/link";
import { company } from "@companynerve/company-config";
import { Header, Footer } from "./site";

export function LegalPage({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="container">
      <Header />
      <main id="main" className="doc marketing-doc marketing-policy">
        <h1>{title}</h1>
        <p className="muted">Last updated September 11, 2026.</p>
        <nav aria-label="Legal information" className="navlinks">
          <Link
            href="/privacy"
            aria-current={title === "Privacy policy" ? "page" : undefined}
          >
            Privacy policy
          </Link>
          {company.website.kind === "template" && (
            <Link href="/terms">Terms of use</Link>
          )}
          {company.website.operator && (
            <Link
              href="/legal"
              aria-current={title === "Legal notice" ? "page" : undefined}
            >
              Legal notice
            </Link>
          )}
        </nav>
        {children}
      </main>
      <Footer />
    </div>
  );
}

export function LegalContact() {
  return (
    <a href={"mailto:" + company.website.supportEmail}>
      {company.website.supportEmail}
    </a>
  );
}
