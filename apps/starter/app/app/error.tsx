"use client";

import Link from "next/link";
import { useTransition } from "react";
import { CircleAlert, RefreshCw } from "lucide-react";
import { AppTheme } from "@/components/app-theme";

export default function AppError({ reset }: { reset: () => void }) {
  const [retrying, startTransition] = useTransition();
  return (
    <main id="main" className="app-route-recovery" aria-busy={retrying}>
      <AppTheme />
      <section aria-labelledby="app-error-title">
        <CircleAlert size={28} strokeWidth={1.65} aria-hidden="true" />
        <h1 id="app-error-title">This page could not load</h1>
        <p>Try again, or return to Home and open the page from there.</p>
        <div>
          <button
            type="button"
            className="button primary"
            disabled={retrying}
            onClick={() => startTransition(reset)}
          >
            <RefreshCw size={17} className={retrying ? "spinner" : undefined} aria-hidden="true" />
            {retrying ? "Retrying…" : "Try again"}
          </button>
          <Link className="button secondary" href="/app" prefetch={false}>Back to Home</Link>
        </div>
      </section>
    </main>
  );
}
