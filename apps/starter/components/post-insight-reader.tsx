import type { ReactNode } from "react";

/** Presentation only. Route adapters supply authorized media, evidence and actions. */
export function PostInsightReader({
  sourcePreview,
  sourceAction,
  children,
}: {
  sourcePreview?: ReactNode;
  sourceAction?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={`post-insight-reader${sourcePreview ? " has-source" : ""}`}>
      {sourcePreview && (
        <aside className="post-reader-source" aria-label="Original post">
          {sourcePreview}
          {sourceAction === undefined ? (
            <a
              className="button post-reader-project"
              href="#source-analysis-actions"
            >
              Apply to a project
            </a>
          ) : (
            sourceAction
          )}
        </aside>
      )}
      <div className="post-reader-insights">{children}</div>
    </div>
  );
}
