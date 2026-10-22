import Link from "next/link";
import Image from "next/image";
import { CookieSettings } from "./consent";
import { AppTheme } from "./app-theme";
import "../app/public.css";
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
      <nav aria-label="Website">
        <Link href="/how-it-works">How it works</Link>
        <Link href="/pricing">Pricing</Link>
        <Link href="/help">Help</Link>
        <Link href="/open-source">Open source</Link>
        <a href="https://github.com/StefanDG1/vibescroll">GitHub</a>
        <Link className="primary" href="/app" prefetch={false}>
          Start your library
        </Link>
      </nav>
    </header>
  );
}
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <Brand />
      <p>Make scrolling useful.</p>
      <AppTheme control />
      <nav aria-label="Footer">
        {[
          "about",
          "contact",
          "status",
          "faq",
          "help",
          "open-source",
          "privacy",
          "terms",
          "cookies",
          "refunds",
          "acceptable-use",
          "copyright",
          "legal",
          "subprocessors",
          "dpa",
        ].map((p) => (
          <Link key={p} href={`/${p}`}>
            {p.replaceAll("-", " ")}
          </Link>
        ))}
        <a href="https://github.com/StefanDG1/vibescroll">MIT source</a>
        <CookieSettings />
      </nav>
      <small>
        EXPONENTIAL EDUCATION S.R.L. · Processing availability and checkout
        follow the current account and release settings.
      </small>
    </footer>
  );
}
export function PublicPage({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppTheme />
      <SiteHeader />
      <main id="main" className="public-content">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
