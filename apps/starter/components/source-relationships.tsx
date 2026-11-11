"use client";
import { useEffect, useRef, useState } from "react";
export function SourceRelationships({
  sourceId,
  sources,
  loadSources,
  call,
  readOnly,
}: {
  sourceId: string;
  sources: { _id?: string; id?: string; title: string }[];
  loadSources?: () => Promise<{ _id?: string; id?: string; title: string }[]>;
  call: (operation: string, args: any) => Promise<any>;
  readOnly: boolean;
}) {
  const [items, setItems] = useState<
    { id: string; sourceId: string; title: string; kind: string }[] | null
  >(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [choices, setChoices] = useState<typeof sources | null>(null);
  const [choicesBusy, setChoicesBusy] = useState(false);
  const alive = useRef(true);
  const loadingChoices = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  async function chooseSources() {
    if (!loadSources || choices || loadingChoices.current) return;
    loadingChoices.current = true;
    setChoicesBusy(true);
    try {
      const result = await loadSources();
      if (alive.current) setChoices(result);
    } catch {
      if (alive.current)
        setError(
          "Source choices are unavailable. Reopen this panel to try again.",
        );
    } finally {
      loadingChoices.current = false;
      if (alive.current) setChoicesBusy(false);
    }
  }
  async function load() {
    const value = await call("sourceRelationships", { id: sourceId });
    if (!value) throw Error("Relationships are unavailable.");
    setItems(value);
  }
  async function perform(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch {
      setError(
        "Relationships could not be updated. Check current access and source status.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <details
      className="panel"
      onToggle={(event) => {
        if (event.currentTarget.open && !readOnly) void chooseSources();
      }}
    >
      <summary>Related sources</summary>
      <p>
        Keep an announcement and its repository separate. A relationship can
        indicate repeated claims; it does not establish independent confirmation
        or authorize processing.
      </p>
      <button
        type="button"
        className="secondary"
        disabled={busy}
        onClick={() => void perform(load)}
      >
        Load current relationships
      </button>
      {items && (
        <ul>
          {items.map((item) => (
            <li key={item.id}>
              {item.title} ·{" "}
              {item.kind === "announcement_repository"
                ? "Announcement and repository"
                : "Related source"}{" "}
              <button
                type="button"
                disabled={busy || readOnly}
                onClick={() =>
                  void perform(async () => {
                    await call("removeSourceRelationship", { id: item.id });
                    await load();
                  })
                }
              >
                Remove relationship
              </button>
            </li>
          ))}
        </ul>
      )}
      {!readOnly && (
        <form
          className="form-grid"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            void perform(async () => {
              await call("saveSourceRelationship", {
                id: sourceId,
                relatedSourceId: String(data.get("source")),
                kind: String(data.get("kind")),
                explicitlyConfirmed: true,
              });
              await load();
            });
          }}
        >
          {choicesBusy && (
            <output aria-live="polite">Loading sources...</output>
          )}
          <label>
            Another saved source
            <select name="source" required disabled={busy || choicesBusy}>
              <option value="">Choose a source from this loaded page</option>
              {(choices ?? sources)
                .filter((source) => (source._id ?? source.id) !== sourceId)
                .map((source) => (
                  <option
                    key={source._id ?? source.id}
                    value={source._id ?? source.id}
                  >
                    {source.title}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Relationship
            <select name="kind" disabled={busy}>
              <option value="related">Related source</option>
              <option value="announcement_repository">
                Announcement and repository
              </option>
            </select>
          </label>
          <button className="secondary" disabled={busy}>
            Confirm relationship
          </button>
          <p>
            Only sources already loaded in this workspace appear here. Saving a
            relationship starts no retrieval, inference or project evaluation.
          </p>
        </form>
      )}
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
