import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AppTheme } from "./app-theme";
import type { ReactNode } from "react";

export function WorkspaceSubpage({
  org,
  title,
  backTo = "account",
  children,
}: {
  org: string;
  title: string;
  backTo?: "account" | "projects" | "billing" | "posts" | "catalog";
  children: ReactNode;
}) {
  const backLabel = {
    account: "Account",
    projects: "Projects",
    billing: "Billing",
    posts: "Posts",
    catalog: "Shared library",
  }[backTo];
  return (
    <div className="workspace-subpage">
      <AppTheme />
      <main id="main" className="workspace-subpage-content">
        <Link className="workspace-subpage-back" href={`/app/${org}/${backTo}`}>
          <ArrowLeft size={17} aria-hidden="true" /> {backLabel}
        </Link>
        <h1>{title}</h1>
        {children}
      </main>
    </div>
  );
}
