import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { AppTheme } from "@/components/app-theme";

export default function AppNotFound() {
  return (
    <main id="main" className="app-route-recovery">
      <AppTheme />
      <section aria-labelledby="app-missing-title">
        <FileQuestion size={28} strokeWidth={1.65} aria-hidden="true" />
        <h1 id="app-missing-title">Page unavailable</h1>
        <p>The link may have changed, or the page may require access.</p>
        <div>
          <Link className="button primary" href="/app" prefetch={false}>Back to Home</Link>
        </div>
      </section>
    </main>
  );
}
