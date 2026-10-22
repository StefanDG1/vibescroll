"use client";
import { useState } from "react";
export function PublicReportForm({ slug }: { slug: string }) {
  const [reason, setReason] = useState("inaccuracy"),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [key] = useState(() => crypto.randomUUID());
  return (
    <details>
      <summary>Report this edition</summary>
      <form
        className="form-grid"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setMessage("");
          try {
            const response = await fetch("/api/public-knowledge/report", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ slug, key, reason }),
              cache: "no-store",
            });
            if (!response.ok) throw Error();
            setMessage(
              "Report received for review. Removal is a separate moderation decision.",
            );
          } catch {
            setMessage(
              "The report could not be submitted. Try later or use Contact to request a private exchange.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Reason
          <select
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          >
            <option value="inaccuracy">Inaccurate or incomplete</option>
            <option value="copyright">Copyright or source rights</option>
            <option value="privacy">Privacy</option>
            <option value="abuse">Abuse</option>
          </select>
        </label>
        <p>No private transcript or account information is needed.</p>
        <button disabled={busy} type="submit">
          Send report
        </button>
        <output>{message}</output>
      </form>
    </details>
  );
}
