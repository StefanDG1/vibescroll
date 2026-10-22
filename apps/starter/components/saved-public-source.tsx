"use client";
import { useState } from "react";
import { PublicEditionContent } from "./public-edition-content";
import type { PublicEdition } from "@/lib/public-knowledge-display";
type Detail = {
  available: boolean;
  edition: PublicEdition | null;
  privateNote: string;
  corrections: { insightId: string; text: string }[];
  updatedAt: number;
  canEdit: boolean;
};
type Props = {
  sourceId: string;
  call: (operation: string, args: Record<string, unknown>) => Promise<any>;
  readOnly?: boolean;
  enabled?: boolean;
};
export function SavedPublicSource(props: Props) {
  return <Saved key={props.sourceId} {...props} />;
}
function Saved({ sourceId, call, readOnly = false, enabled = false }: Props) {
  const [detail, setDetail] = useState<Detail | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [note, setNote] = useState(""),
    [corrections, setCorrections] = useState<Record<string, string>>({}),
    [saved, setSaved] = useState(false);
  async function load() {
    if (!enabled || busy) return;
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      const result = await call("savedPublicDetail", { sourceId });
      if (!result) throw Error("This saved public reference is unavailable.");
      setDetail(result);
      setNote(result.privateNote);
      setCorrections(
        Object.fromEntries(
          result.corrections.map(
            (item: { insightId: string; text: string }) => [
              item.insightId,
              item.text,
            ],
          ),
        ),
      );
    } catch (failure) {
      setDetail(null);
      setError(
        failure instanceof Error
          ? failure.message
          : "Public reference could not be loaded.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (!enabled)
    return (
      <section className="panel">
        <h2>Saved public reference</h2>
        <p>
          Public-artifact reading is awaiting release review. No previous
          private or public output is displayed as current.
        </p>
      </section>
    );
  return (
    <section className="panel">
      <h2>Public evidence, your private interpretation</h2>
      <p>
        The source-level artifact is checked when opened. Your notes and
        corrections stay in your private layer; they are not published or shared
        through reuse.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <button disabled={busy} onClick={() => void load()}>
        {detail
          ? "Check the current public reference"
          : "Open current public reference"}
      </button>
      {detail && (
        <>
          {detail.available && detail.edition ? (
            <>
              <p>
                Public edition version {detail.edition.version}. Original public
                date: {detail.edition.publishedDate ?? "Not recorded"}. This is
                reused evidence, not a new analysis.
              </p>
              <PublicEditionContent edition={detail.edition} />
            </>
          ) : (
            <output>
              The original public edition has changed, expired or been
              withdrawn. Its evidence is unavailable. Your saved private notes
              are retained.
            </output>
          )}
          <form
            className="form-grid"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!detail.available || readOnly || !detail.canEdit || busy)
                return;
              setBusy(true);
              setError("");
              setSaved(false);
              try {
                const result = await call("savePersonalLayer", {
                  sourceId,
                  expectedUpdatedAt: detail.updatedAt,
                  note,
                  corrections: Object.entries(corrections)
                    .filter(([, text]) => text.trim())
                    .map(([insightId, text]) => ({ insightId, text })),
                });
                if (!result)
                  throw Error(
                    "The private layer changed. Reload before saving again.",
                  );
                setDetail(null);
                setSaved(true);
              } catch (failure) {
                setError(
                  failure instanceof Error
                    ? failure.message
                    : "Your changes were not saved. Check current permissions.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Your private note
              <textarea
                maxLength={4000}
                value={note}
                readOnly={readOnly || !detail.canEdit || !detail.available}
                onChange={(event) => setNote(event.target.value)}
              />
            </label>
            {detail.available &&
              detail.edition?.insights.map((insight) => (
                <label key={insight.id}>
                  Your correction to “{insight.title}”
                  <textarea
                    maxLength={2000}
                    value={corrections[insight.id] ?? ""}
                    readOnly={readOnly || !detail.canEdit}
                    onChange={(event) =>
                      setCorrections((current) => ({
                        ...current,
                        [insight.id]: event.target.value,
                      }))
                    }
                  />
                </label>
              ))}
            {detail.canEdit ? (
              <button
                type="submit"
                disabled={busy || readOnly || !detail.available}
              >
                Save my private notes and corrections
              </button>
            ) : (
              <p>
                This private interpretation belongs to another user and is not
                available for editing.
              </p>
            )}
          </form>
        </>
      )}
      {saved && (
        <output>
          Private notes saved. Reopen the reference to review its current
          version.
        </output>
      )}
    </section>
  );
}
