import { LibrarySkeleton } from "@/components/library-skeleton";

export default function Loading() {
  return (
    <main id="main" className="app-route-placeholder" aria-busy="true">
      <div className="app-loading-title" aria-hidden="true" />
      <LibrarySkeleton kind="page" rows={3} />
    </main>
  );
}
