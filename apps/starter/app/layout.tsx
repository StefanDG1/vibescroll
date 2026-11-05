import type { Metadata } from "next";
import { company } from "@companynerve/company-config";
import { ConsentProvider } from "@/components/consent";
import { MotionPreference } from "@/components/motion-preference";
import "vanilla-cookieconsent/dist/cookieconsent.css";
import "react-loading-skeleton/dist/skeleton.css";
import "./globals.css";
import "./product.css";
import "./studio.css";
import "./atlas.css";
import "./quiet.css";
export const metadata: Metadata = {
  title: {
    default: company.product.name,
    template: `%s | ${company.product.name}`,
  },
  description: company.product.description,
  robots: { index: process.env.SEO_PUBLIC_INDEXING === "true", follow: true },
  metadataBase: new URL("https://scroll.companynerve.com"),
  openGraph: {
    title: "VibeScroll · Make scrolling useful",
    description: company.product.description,
    type: "website",
    locale: "en_US",
    siteName: "VibeScroll",
    images: [
      {
        url: "/social-card.png?v=vibescroll-20261007",
        width: 1200,
        height: 630,
        alt: "VibeScroll and Scroll: saved idea, evidence, project fit, reviewed plan, draft PR",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "VibeScroll · Make scrolling useful",
    description: company.product.description,
    images: ["/social-card.png?v=vibescroll-20261007"],
  },
};
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Public pages can be prerendered; private routes still perform their own auth.
  // The selected product recipe is stable across visitors.
  return (
    <html lang="en" className="dark" style={{ colorScheme: "dark" }}>
      <body>
        <ConsentProvider />
        <MotionPreference />
        <a className="skip" href="#main">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
