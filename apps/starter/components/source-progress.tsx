import { sourceProgress } from "../../../packages/sources/progress";

export function SourceProgressPanel({
  source,
  now,
  organizationId,
}: {
  source: Parameters<typeof sourceProgress>[0];
  now: number;
  organizationId: string;
}) {
  const progress = sourceProgress(source, now);
  if (!progress) return null;
  return (
    <section
      className="panel source-progress"
      aria-label="Analysis progress"
      aria-live="polite"
      aria-atomic="true"
    >
      <h2>{progress.title}</h2>
      {progress.busy && <progress aria-label={progress.title} />}
      <p>{progress.description}</p>
      {progress.action && (
        <a
          href={
            progress.action === "setup"
              ? `/app/${organizationId}/connections`
              : "#source-analysis-actions"
          }
        >
          {progress.action === "setup"
            ? "Open Cloud setup"
            : "Review analysis options"}
        </a>
      )}
    </section>
  );
}
