import type { NextConfig } from "next";
import { buildVersion } from "../../scripts/version.mjs";
const config: NextConfig = {
  outputFileTracingIncludes: {
    "/help/[slug]": ["../../docs/help/**/*.md"],
  },
  transpilePackages: [
    "@companynerve/ui",
    "@companynerve/company-config",
    "@companynerve/design-recipes",
  ],
  poweredByHeader: false,
  env: {
    NEXT_PUBLIC_APP_VERSION: buildVersion().version,
    NEXT_PUBLIC_APP_COMMIT: buildVersion().commit,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "no-referrer" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value:
              "object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
          },
        ],
      },
      {
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
      {
        source: "/app/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
    ];
  },
};
export default config;
