import type { Metadata } from "next";
import { company } from "@companynerve/company-config";
import "./globals.css";
export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || company.website.url,
  ),
  title: {
    default:
      company.website.kind === "template"
        ? "CompanyNerve | A free foundation for your next SaaS"
        : company.product.name,
    template: `%s | ${company.product.name}`,
  },
  description: company.product.description,
  robots:
    process.env.VERCEL_ENV === "preview"
      ? { index: false, follow: false }
      : undefined,
  verification: { google: process.env.GOOGLE_SITE_VERIFICATION },
  openGraph: {
    type: "website",
    siteName: company.product.name,
    title: company.product.name,
    description: company.product.description,
  },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebSite",
              name: company.product.name,
              url: process.env.NEXT_PUBLIC_SITE_URL || company.website.url,
              description: company.product.description,
            }).replace(/</g, "\\u003c"),
          }}
        />
        <a href="#main" className="skip">
          Skip to content
        </a>
        <div
          className="marketing-site"
          data-website-kind={company.website.kind}
        >
          {children}
        </div>
      </body>
    </html>
  );
}
