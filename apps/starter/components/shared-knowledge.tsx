"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { BookOpen, FileText, Share2 } from "lucide-react";
import { ErrorState } from "./assistant-elements/error-state";
import { sharedEvidenceLabel } from "../lib/shared-evidence-label";
export function SharedKnowledge({
  organizationId,
  initial,
  initialDetail,
  initialError,
}: {
  organizationId: string;
  initial?: { items: any[]; next: string | null };
  initialDetail?: any;
  initialError?: string;
}) {
  const [items, setItems] = useState(initial?.items ?? []),
    [next, setNext] = useState(initial?.next ?? null),
    [detail, setDetail] = useState<any>(initialDetail),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(initialError ?? "");
  const request = useRef(0);
  async function read(operation: string, args: any) {
    const response = await fetch("/api/product", {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operation, args }),
    });
    if (
      !response.ok ||
      response.redirected ||
      !response.headers.get("content-type")?.includes("application/json")
    )
      throw new Error(
        "Shared knowledge is unavailable or changed. Reload to check current access.",
      );
    return (await response.json()).result;
  }
  async function page() {
    const generation = ++request.current;
    setBusy(true);
    setError("");
    setDetail(undefined);
    try {
      const value = await read("sharedKnowledge", {
        organizationId,
        cursor: next,
      });
      if (generation === request.current) {
        setItems(value.items);
        setNext(value.next);
      }
    } catch (e) {
      if (generation === request.current) {
        setItems([]);
        setNext(null);
        setError(
          e instanceof Error ? e.message : "Shared knowledge unavailable.",
        );
      }
    } finally {
      if (generation === request.current) setBusy(false);
    }
  }
  return (
    <section className="shared-library" aria-label="Shared posts">
      {error && (
        <ErrorState
          title="Shared post unavailable"
          detail={error}
          action={<Link href={`/app/${organizationId}/shared`} prefetch={false}>Return to shared posts</Link>}
        />
      )}
      {busy && <output className="shared-status">Checking access…</output>}
      {!busy && !error && !items.length && (
        <div className="shared-empty">
          <Share2 size={22} strokeWidth={1.7} aria-hidden="true" />
          <h2>No shared posts yet</h2>
          <p>Posts appear here when someone shares them with this workspace.</p>
          <Link className="button secondary" href={`/app/${organizationId}/posts`} prefetch={false}>
            Browse your posts
          </Link>
        </div>
      )}
      <ul className="shared-posts">
        {items.map((item) => (
          <li key={`${item.grantId}:${item.sourceId}`}>
            <Link
              href={`/app/${organizationId}/shared?grant=${encodeURIComponent(item.grantId)}&source=${encodeURIComponent(item.sourceId)}`}
              prefetch={false}
              aria-current={detail?.sourceId === item.sourceId ? "page" : undefined}
            >
              {item.state === "ready" ? <BookOpen size={18} aria-hidden="true" /> : <FileText size={18} aria-hidden="true" />}
              <strong>{item.title}</strong>
              <small>{item.state === "ready" ? "With insights" : "Saved post"}</small>
            </Link>
          </li>
        ))}
      </ul>
      {next && (
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => {
            void page();
          }}
        >
          Next sharing grant
        </button>
      )}
      {detail && (
        <section className="shared-reader" aria-label="Shared post insights">
          <h2>{detail.title}</h2>
          {detail.insights.length ? (
            <ul>
              {detail.insights.map((insight: any) => (
                <li key={insight.id}>
                  <h3>{insight.title}</h3>
                  <p>{insight.claim}</p>
                  {!!insight.evidence.length && (
                    <p className="fine">{insight.evidence.map(sharedEvidenceLabel).join(" · ")}</p>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p>No cited analysis in this shared source version.</p>
          )}
          <details>
            <summary>Shared version details</summary>
            <p className="fine">
              Source generation {detail.generation} · Grant version {detail.grantVersion} ·{" "}
              {detail.coverage.replaceAll("_", " ")}
            </p>
          </details>
          <button
            className="button secondary"
            onClick={() => setDetail(undefined)}
          >
            Close source
          </button>
        </section>
      )}
    </section>
  );
}
