import Link from "next/link";
import Image from "next/image";
import { CookieSettings } from "./consent";
import { AppTheme } from "./app-theme";
import { ScrollShowNavigation } from "./scrollshow-navigation";
import "../app/public.css";
import "../app/public-experience.css";
import "../app/public-consent.css";

const footerSections = [
  {
    title: "Product",
    links: [
      ["How it works", "/how-it-works"],
      ["Example", "/example"],
      ["Pricing", "/pricing"],
      ["Discover", "/discover"],
      ["About", "/about"],
    ],
  },
  {
    title: "Resources",
    links: [
      ["Help", "/help"],
      ["Documentation", "/docs"],
      ["FAQ", "/faq"],
      ["Open source", "/open-source"],
      ["Status", "/status"],
      ["Contact", "/contact"],
    ],
  },
  {
    title: "Legal",
    links: [
      ["Privacy", "/privacy"],
      ["Terms", "/terms"],
      ["Cookies", "/cookies"],
      ["Refunds", "/refunds"],
      ["Acceptable use", "/acceptable-use"],
      ["Copyright", "/copyright"],
      ["Legal notice", "/legal"],
      ["Subprocessors", "/subprocessors"],
      ["Data processing agreement", "/dpa"],
    ],
  },
];
export function Brand({ href = "/" }: { href?: string }) {
  return (
    <Link
      href={href}
      prefetch={href.startsWith("/app") ? false : undefined}
      className="brand"
    >
      <span className="brand-icon" aria-hidden="true">
        <Image src="/icon.svg" alt="" width={30} height={30} />
      </span>
      VibeScroll
    </Link>
  );
}
export function SiteHeader() {
  return (
    <header className="site-header">
      <Brand />
      <ScrollShowNavigation />
    </header>
  );
}
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="public-footer-body">
        <div className="public-footer-brand">
          <Brand />
          <p>Make scrolling useful.</p>
        </div>
        {footerSections.map(({ title, links }) => (
          <nav key={title} aria-label={title}>
            <h2>{title}</h2>
            <ul>
              {links.map(([label, href]) => (
                <li key={href}>
                  <Link href={href}>{label}</Link>
                </li>
              ))}
              {title === "Resources" && (
                <li>
                  <a href="https://github.com/StefanDG1/vibescroll">
                    MIT source
                  </a>
                </li>
              )}
            </ul>
          </nav>
        ))}
      </div>
      <div className="public-footer-settings">
        <small>EXPONENTIAL EDUCATION S.R.L.</small>
        <div>
          <AppTheme control />
          <CookieSettings />
        </div>
      </div>
    </footer>
  );
}
export function PublicPage({
  children,
  layout = "standard",
}: {
  children: React.ReactNode;
  layout?: "standard" | "home" | "reader" | "form";
}) {
  return (
    <div className="public-site">
      <AppTheme />
      <SiteHeader />
      <main id="main" className={`public-content public-content-${layout}`}>
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}

export function PublicIntro({
  title,
  children,
  back,
}: {
  title: string;
  children?: React.ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <header className="public-intro">
      {back && (
        <Link className="public-back" href={back.href}>
          <span aria-hidden="true">‹</span> {back.label}
        </Link>
      )}
      <h1>{title}</h1>
      {children && <div className="public-intro-copy">{children}</div>}
    </header>
  );
}
