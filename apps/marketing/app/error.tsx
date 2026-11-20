"use client";
import { Button } from "@companynerve/ui";
import Link from "next/link";
import { useTransition } from "react";
export default function ErrorPage({ reset }: { reset: () => void }) {
  const [retrying, startTransition] = useTransition();
  return (
    <main className="container marketing-status" id="main">
      <h1>This page could not load</h1>
      <p className="muted">Try the page again or return to the website.</p>
      <div className="actions">
        <Button disabled={retrying} onClick={() => startTransition(reset)}>
          {retrying ? "Trying again…" : "Try again"}
        </Button>
        <Button variant="outline" asChild>
          <Link href="/">Return home</Link>
        </Button>
      </div>
    </main>
  );
}
