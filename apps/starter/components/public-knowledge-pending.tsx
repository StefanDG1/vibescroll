import Link from "next/link";
import { LibraryBig } from "lucide-react";
export function PublicKnowledgePending({
  unavailable = false,
  retryHref,
}: {
  unavailable?: boolean;
  retryHref?: string;
}) {
  return (
    <section className="public-state-card">
      <span className="public-state-icon">
        <LibraryBig size={22} aria-hidden="true" />
      </span>
      <h2>
        {unavailable
          ? "Public collections could not load"
          : "Public collections are currently unavailable"}
      </h2>
      <p>
        {unavailable
          ? "You can try the page again or explore how a source and its evidence are presented in the example."
          : "The example shows a saved source, its evidence and a project decision."}
      </p>
      <div className="public-actions">
        {unavailable && retryHref && (
          <a href={retryHref} className="secondary">
            Try again
          </a>
        )}
        <Link href="/example" className="primary">
          Explore the example
        </Link>
      </div>
    </section>
  );
}
