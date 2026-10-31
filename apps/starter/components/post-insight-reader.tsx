import type { ReactNode } from "react";

/** Presentation only. Route adapters supply authorized media, evidence and actions. */
export function PostInsightReader({
  sourcePreview,
  children,
}: {
  sourcePreview?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={`post-insight-reader${sourcePreview ? " has-source" : ""}`}>
      {sourcePreview && (
        <aside className="post-reader-source" aria-label="Original post">
          {sourcePreview}
          <a
            className="button post-reader-project"
            href="#source-analysis-actions"
          >
            Apply to a project
          </a>
        </aside>
      )}
      <div className="post-reader-insights">{children}</div>
    </div>
  );
}
