"use client";
import Link from "next/link";
import { useTransition } from "react";
import { PublicIntro, PublicPage } from "@/components/site";
export default function ErrorPage({ reset }: { reset: () => void }) {
  const [retrying, startTransition] = useTransition();
  return (
    <PublicPage layout="form">
      <PublicIntro title="This page could not load">
        <p>Try again, return to the website or check for a guide in Help.</p>
      </PublicIntro>
      <div className="public-actions">
        <button
          type="button"
          className="primary"
          disabled={retrying}
          onClick={() => startTransition(reset)}
        >
          {retrying ? "Trying again…" : "Try again"}
        </button>
        <Link className="secondary" href="/">
          Return home
        </Link>
      </div>
    </PublicPage>
  );
}
