"use client";
import { useState } from "react";

type Call = (operation: string, args: unknown) => Promise<unknown>;
type Preview = {
  consent: { retainUntil: number };
  transcriptSegments: number;
  frameCount: number;
  insightCount: number;
};
type Receipt = { contributionId: string; state: string };
export function CloudCatalogContribution({
  sourceId,
  versionId,
  disabled,
  call,
}: {
  sourceId: string;
  versionId: string;
  disabled: boolean;
  call: Call;
}) {
  const [preview, setPreview] = useState<Preview>();
  const [approved, setApproved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [key] = useState(() => crypto.randomUUID());
  const [receipt, setReceipt] = useState<Receipt>();
  const act = async (operation: string, args: unknown) => {
    setBusy(true);
    setError("");
    try {
      return await call(operation, args);
    } catch {
      setError(
        "The change was not confirmed. Check your access and review this version before trying again.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <details className="panel">
      <summary>Contribute this version to shared knowledge</summary>
      <p>
        Share only the transcript, sampled screenshots and neutral insights.
        Your account, notes, projects and Cloud task stay private. Each post
        also needs reviewed reuse permission.
      </p>
      {!preview && (
        <button
          className="secondary"
          disabled={disabled || busy}
          onClick={async () => {
            const result = await act("cloudCatalogPreview", {
              sourceId,
              versionId,
            });
            if (result) {
              setPreview(result as Preview);
              const previous = (
                result as {
                  contributions?: { contributionId: string; state: string }[];
                }
              ).contributions?.[0];
              if (previous) setReceipt(previous);
            }
          }}
        >
          Review this contribution
        </button>
      )}
      {preview && !receipt && (
        <>
          <p>
            {preview.transcriptSegments} transcript segments,{" "}
            {preview.frameCount} screenshots and {preview.insightCount}{" "}
            insights. Sharing makes a separate catalog copy until{" "}
            {new Date(preview.consent.retainUntil).toLocaleString()}. Deleting
            your personal save keeps that copy. You can withdraw this
            contribution.
          </p>
          <label className="check-row">
            <input
              type="checkbox"
              checked={approved}
              onChange={(event) => setApproved(event.target.checked)}
            />
            I authorize reuse of this exact version by catalog subscribers for
            the stated period.
          </label>
          <button
            className="primary"
            disabled={disabled || busy || !approved}
            onClick={async () => {
              const result = await act("cloudCatalogContribute", {
                sourceId,
                versionId,
                key,
                consent: preview.consent,
              });
              if (result) setReceipt(result as Receipt);
            }}
          >
            Contribute this version
          </button>
        </>
      )}
      {receipt && (
        <>
          <output>
            {receipt.state === "published"
              ? "The neutral copy is ready for catalog review. It does not replace the current recommendation."
              : receipt.state === "withdrawn"
                ? "Contribution withdrawn."
                : "Copy outcome is unresolved. This version was not confirmed as available for reuse."}
          </output>
          {receipt.state !== "withdrawn" && (
            <button
              className="secondary"
              disabled={disabled || busy}
              onClick={async () => {
                const result = await act("cloudCatalogWithdraw", {
                  contributionId: receipt.contributionId,
                });
                if (result !== undefined)
                  setReceipt({ ...receipt, state: "withdrawn" });
              }}
            >
              Withdraw contribution
            </button>
          )}
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </details>
  );
}

export function SharedAnalysisNotes({
  sourceId,
  versionId,
  note,
  corrections,
  updatedAt,
  disabled,
  call,
  onChange,
}: {
  sourceId: string;
  versionId: string;
  note: string;
  corrections: { insightId: string; text: string }[];
  updatedAt: number;
  disabled: boolean;
  call: Call;
  onChange: () => void;
}) {
  const [text, setText] = useState(note),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <form
      className="panel"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError("");
        try {
          await call("cloudCatalogNotes", {
            sourceId,
            versionId,
            expectedUpdatedAt: updatedAt,
            privateNote: text,
            corrections,
          });
          onChange();
        } catch {
          setError(
            "Your note was not confirmed. Refresh this version before editing again.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <label>
        Your note for this analysis version
        <textarea
          value={text}
          maxLength={6000}
          onChange={(event) => setText(event.target.value)}
        />
      </label>
      <p className="fine">
        This note stays in your library. Choosing another analysis preserves it
        with this version.
      </p>
      <button className="secondary" disabled={disabled || busy}>
        Save personal note
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}

export function CloudCatalogReceipts({
  organizationId,
  disabled,
  call,
}: {
  organizationId: string;
  disabled: boolean;
  call: Call;
}) {
  const [result, setResult] = useState<{
    page: {
      id: string;
      canonical: string | null;
      state: string;
      createdAt: number;
    }[];
    continueCursor: string;
    isDone: boolean;
  }>();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const load = async (cursor: string | null = null) => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/product", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation: "cloudCatalogOwn",
          args: { organizationId, paginationOpts: { numItems: 20, cursor } },
        }),
        cache: "no-store",
      });
      if (
        !response.ok ||
        !response.headers.get("content-type")?.includes("application/json")
      )
        throw Error("Unavailable");
      setResult((await response.json()).result);
    } catch {
      setResult(undefined);
      setError(
        "Contribution receipts are unavailable. Check your current account and access.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <details
      className="panel"
      onToggle={(event) => {
        if (event.currentTarget.open && !result && !busy) void load();
      }}
    >
      <summary>Manage shared contributions</summary>
      <p>
        Review contributions you explicitly authorized. You can withdraw one
        after deleting its personal saved post. Account deletion withdraws its
        remaining contribution authority.
      </p>
      {busy && <output>Loading contribution receipts...</output>}
      {result?.page.length === 0 && <p>No contributions on this page.</p>}
      {result?.page.map((row) => (
        <article key={row.id}>
          <p>
            {row.canonical ? (
              <a href={row.canonical} target="_blank" rel="noopener noreferrer">
                Original post
              </a>
            ) : (
              "Removed post"
            )}{" "}
            · {new Date(row.createdAt).toLocaleString()} · {row.state}
          </p>
          <button
            className="secondary"
            disabled={disabled || busy || row.state === "withdrawn"}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await call("cloudCatalogWithdraw", { contributionId: row.id });
                await load();
              } catch {
                setError(
                  "Withdrawal was not confirmed. Refresh these receipts before trying again.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            Withdraw contribution
          </button>
        </article>
      ))}
      {result && !result.isDone && (
        <button
          className="secondary"
          disabled={busy}
          onClick={() => load(result.continueCursor)}
        >
          Older contributions
        </button>
      )}
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
