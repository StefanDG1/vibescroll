import { RootProvider } from "fumadocs-ui/provider/next";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { developerTree } from "@/lib/developer-docs";
import { AppTheme } from "@/components/app-theme";
import "./docs.css";
import "../public-consent.css";

export default function DocumentationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RootProvider
      theme={{ enabled: false }}
      search={{ options: { api: "/api/docs-search" } }}
    >
      <div className="developer-docs">
        <AppTheme />
        <DocsLayout
          tree={developerTree}
          nav={{ title: "VibeScroll Docs", url: "/docs" }}
          githubUrl="https://github.com/StefanDG1/vibescroll"
          links={[
            { text: "Open app", url: "/app" },
            { text: "Help", url: "/help" },
            { text: "Website", url: "/" },
          ]}
          sidebar={{
            footer: (
              <div className="docs-appearance">
                <AppTheme control />
              </div>
            ),
          }}
          themeSwitch={{ enabled: false }}
        >
          {children}
        </DocsLayout>
      </div>
    </RootProvider>
  );
}
