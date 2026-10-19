"use client";
import { useEffect, useState } from "react";
type Receipt = {
  status: string;
  processing_succeeded: boolean;
  generation: number;
  error?: string;
  balance: { available: number; total: number; reserved: number };
  credits: { state: string; actual_used: number | null; reserved: number };
  credit_offer: { max_credits: number } | null;
  follow_up: string | null;
  credit_route_note?: string | null;
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
  const [receipt, setReceipt] = useState<Receipt | null>(null),
    [busy, setBusy] = useState(false),
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
        .catch(() => {});
    return () => {
      active = false;
    };
  }, [sourceId, demo]);
  async function act(mode: "credits" | "cancel") {
    if (!receipt) return;
    setBusy(true);
    setError("");
    try {
      setReceipt(
        await call("assistantIntakeAction", {
          sourceId,
          mode,
          generation: receipt.generation,
          ...(mode === "credits"
            ? { maxCredits: receipt.credit_offer?.max_credits }
            : {}),
        }),
      );
    } catch {
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
      setError("Status could not be checked. Try again when connected.");
    } finally {
      setBusy(false);
    }
  }
  if (!receipt) return null;
  return (
    <section
      className="panel form-grid"
      aria-labelledby="assistant-source-status"
    >
      <h3 id="assistant-source-status">
        {receipt.status === "waiting_for_computer"
          ? "Waiting for your computer"
          : receipt.processing_succeeded
            ? "Insights ready"
            : receipt.status === "processing_locally"
              ? "Analyzing on your computer"
              : "Assistant submission"}
      </h3>
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
              onClick={() => void act("credits")}
            >
              Run now using up to {receipt.credit_offer.max_credits} credits
            </button>
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => void act("cancel")}
            >
              Cancel waiting analysis
            </button>
          </div>
        </>
      )}
      {receipt.follow_up && (
        <p>
          {receipt.follow_up} You can ask your connected VibeScroll assistant.
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
        onClick={() => void refresh()}
      >
        {busy ? "Checking…" : "Refresh status"}
      </button>
    </section>
  );
}
