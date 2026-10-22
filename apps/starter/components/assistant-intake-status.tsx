"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
export type Receipt = {
  status: string;
  processing_succeeded: boolean;
  generation: number;
  error?: string;
  balance: { available: number; total: number; reserved: number };
  credits: { state: string; actual_used: number | null; reserved: number };
  credit_offer: { max_credits: number } | null;
  follow_up: string | null;
  credit_route_note?: string | null;
  source_review_required?: boolean;
  review_url?: string | null;
};
export function AssistantIntakeStatus({
  sourceId,
  demo,
  call,
}: {
  sourceId: string;
  demo: boolean;
  call: (op: string, args: unknown) => Promise<any>;
}) {
  // A different source never inherits an old receipt or an in-flight action.
  return (
    <SourceIntakeStatus
      key={sourceId}
      sourceId={sourceId}
      demo={demo}
      call={call}
    />
  );
}
function SourceIntakeStatus({
  sourceId,
  demo,
  call,
}: {
  sourceId: string;
  demo: boolean;
  call: (op: string, args: unknown) => Promise<any>;
}) {
  const [receipt, setReceipt] = useState<Receipt | null>(null),
    [busy, setBusy] = useState(!demo),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    if (!demo)
      void fetch("/api/product", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          operation: "assistantIntakeStatus",
          args: { sourceId },
        }),
      })
        .then(async (r) => {
          if (!r.ok) throw Error();
          return r.json();
        })
        .then((r) => {
          if (active) setReceipt(r.result);
        })
        .catch(() => {
          if (active)
            setError("Status could not be checked. Try again when connected.");
        })
        .finally(() => {
          if (active) setBusy(false);
        });
    return () => {
      active = false;
    };
  }, [sourceId, demo]);
  async function act(mode: "credits" | "cancel") {
    if (!receipt) return;
    setBusy(true);
    setError("");
    try {
      const next = await call("assistantIntakeAction", {
        sourceId,
        mode,
        generation: receipt.generation,
        ...(mode === "credits"
          ? { maxCredits: receipt.credit_offer?.max_credits }
          : {}),
      });
      if (!next) throw Error();
      setReceipt(next);
    } catch {
      setReceipt(null);
      setError(
        "This source or credit quote changed. Refresh its status before trying again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function refresh() {
    setBusy(true);
    setError("");
    try {
      const r = await call("assistantIntakeStatus", { sourceId });
      if (!r) throw Error();
      setReceipt(r);
    } catch {
      // A failed authorization refresh must not leave private receipt data visible.
      setReceipt(null);
      setError("Status could not be checked. Try again when connected.");
    } finally {
      setBusy(false);
    }
  }
  if (demo || (!receipt && !busy && !error)) return null;
  if (!receipt)
    return (
      <IntakeStatusMessage busy={busy} error={error} onRefresh={refresh} />
    );
  return (
    <AssistantIntakeReceipt
      receipt={receipt}
      busy={busy}
      error={error}
      onAct={act}
      onRefresh={refresh}
    />
  );
}
export function IntakeStatusMessage({
  busy,
  error,
  onRefresh,
}: {
  busy: boolean;
  error: string;
  onRefresh: () => Promise<void>;
}) {
  return (
    <section
      className="panel form-grid"
      aria-label="Assistant submission status"
      aria-busy={busy}
    >
      <p role={error ? "alert" : "status"}>
        {error || "Checking your submission…"}
      </p>
      {error && (
        <button
          type="button"
          className="secondary"
          disabled={busy}
          onClick={() => void onRefresh()}
        >
          {busy ? "Checking…" : "Try again"}
        </button>
      )}
    </section>
  );
}
export function AssistantIntakeReceipt({
  receipt,
  busy,
  error,
  onAct,
  onRefresh,
}: {
  receipt: Receipt;
  busy: boolean;
  error: string;
  onAct: (mode: "credits" | "cancel") => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  return (
    <section
      className="panel form-grid"
      aria-labelledby="assistant-source-status"
    >
      <h3 id="assistant-source-status">
        {receipt.source_review_required
          ? "Review this saved source"
          : receipt.status === "waiting_for_computer"
            ? "Waiting for your computer"
            : receipt.processing_succeeded
              ? "Insights ready"
              : receipt.status === "processing_locally"
                ? "Analyzing on your computer"
                : "Assistant submission"}
      </h3>
      {receipt.source_review_required && receipt.review_url && (
        <p>
          This source uses a separate retrieval and analysis review. Saving its
          link does not queue media extraction.{" "}
          <Link href={receipt.review_url}>
            Review source evidence and options
          </Link>
          .
        </p>
      )}
      <p>
        You have {receipt.balance.available} / {receipt.balance.total} available
        processing credits.{" "}
        {receipt.balance.reserved > 0
          ? `${receipt.balance.reserved} credits are reserved.`
          : ""}
      </p>
      {receipt.credits.state === "settled" ? (
        <p>
          {receipt.processing_succeeded ? "Processing completed. " : ""}
          {receipt.credits.actual_used} credits used.{" "}
          {receipt.balance.available} credits left.
        </p>
      ) : receipt.credits.state === "reserved_or_reconciling" ? (
        <p>
          Usage is still reserved or being reconciled. The final credit charge
          is not available yet.
        </p>
      ) : null}
      {receipt.credit_route_note && <p>{receipt.credit_route_note}</p>}
      {receipt.error && <p role="alert">{receipt.error}</p>}
      {receipt.credit_offer && (
        <>
          <p>
            Your source stays queued until your computer connects. You can also
            choose cloud processing with the credit maximum below.
          </p>
          <div className="actions">
            <button
              type="button"
              disabled={
                busy ||
                receipt.balance.available < receipt.credit_offer.max_credits
              }
              onClick={() => void onAct("credits")}
            >
              Run now using up to {receipt.credit_offer.max_credits} credits
            </button>
          </div>
        </>
      )}
      {receipt.status === "waiting_for_computer" && (
        <button
          type="button"
          className="secondary"
          disabled={busy}
          onClick={() => void onAct("cancel")}
        >
          Cancel waiting analysis
        </button>
      )}
      {receipt.follow_up && (
        <p>
          {receipt.follow_up}
          {!receipt.source_review_required &&
            " You can ask your connected VibeScroll assistant."}
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <button
        type="button"
        className="secondary"
        disabled={busy}
        onClick={() => void onRefresh()}
      >
        {busy ? "Checking…" : "Refresh status"}
      </button>
    </section>
  );
}
