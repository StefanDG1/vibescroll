import { RootProvider } from "fumadocs-ui/provider/next";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { developerTree } from "@/lib/developer-docs";
import "./docs.css";

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
        <DocsLayout
          tree={developerTree}
          nav={{ title: "VibeScroll / Docs", url: "/docs" }}
          githubUrl="https://github.com/StefanDG1/vibescroll"
          links={[
            { text: "Open app", url: "/app" },
            { text: "Help", url: "/help" },
          ]}
          themeSwitch={{ enabled: false }}
        >
          {children}
        </DocsLayout>
      </div>
    </RootProvider>
  );
}
