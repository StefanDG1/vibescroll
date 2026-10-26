"use client";
import { useState } from "react";
import Link from "next/link";
import { PublicEditionContent } from "./public-edition-content";
import type { PublicPayload } from "@/lib/public-knowledge-display";

type Call = (operation: string, args: Record<string, unknown>) => Promise<any>;
export type PublishableSource = {
  _id: string;
  generation: number;
  updatedAt: number;
  title: string;
  state: string;
  publicImportId?: string;
  analysis?: { insights: { id: string; title: string }[] };
};
type Own = {
  enabled: boolean;
  editions: any[];
  collections: any[];
  geography: any[];
};
export function PublicKnowledgePanel(props: {
  organizationId: string;
  source?: PublishableSource;
  call: Call;
  readOnly?: boolean;
  enabled?: boolean;
}) {
  return (
    <Panel
      key={`${props.organizationId}:${props.source?._id ?? "all"}:${props.source?.updatedAt ?? 0}`}
      {...props}
    />
  );
}
function Panel({
  organizationId,
  source,
  call,
  readOnly = false,
  enabled = false,
}: {
  organizationId: string;
  source?: PublishableSource;
  call: Call;
  readOnly?: boolean;
  enabled?: boolean;
}) {
  const [own, setOwn] = useState<Own | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [preview, setPreview] = useState<{
    id: string;
    version: number;
    hash: string;
    payload: PublicPayload;
  } | null>(null);
  const [approved, setApproved] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [collectionEditions, setCollectionEditions] = useState<string[]>([]);
  const [collectionPreview, setCollectionPreview] = useState<{
    id: string;
    version: number;
    hash: string;
    title: string;
    description: string;
    topic: string;
    editions: string[];
  } | null>(null);
  const [collectionApproved, setCollectionApproved] = useState(false);
  async function act(operation: string, args: Record<string, unknown>) {
    if (!enabled || readOnly || busy) return null;
    const createsPublicAuthority = [
      "prepareEdition",
      "publishEdition",
      "saveCollection",
      "publishCollection",
    ].includes(operation);
    if (createsPublicAuthority && own?.enabled !== true) {
      setError(
        "Public publication is unavailable. Load current status before preparing a new edition or opting into discovery. Withdrawal remains available.",
      );
      return null;
    }
    setBusy(true);
    setError("");
    try {
      const result = await call(operation, args);
      if (!result)
        throw Error(
          "The action was not accepted. Check current permissions and release availability.",
        );
      return result;
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "The action could not be completed. Review the current source and try again.",
      );
      return null;
    } finally {
      setBusy(false);
    }
  }
  async function refresh() {
    const result = await act("publicOwn", { organizationId });
    if (result) setOwn(result);
  }
  if (!enabled)
    return (
      <section className="panel">
        <h2>Public knowledge</h2>
        <p>
          Publication and voluntary discovery are awaiting release review. Your
          source stays private.
        </p>
        <Link href="/example" target="_blank" rel="noopener noreferrer">
          Inspect the synthetic public example
        </Link>
      </section>
    );
  if (readOnly)
    return (
      <section className="panel">
        <h2>Public knowledge</h2>
        <p>
          Public publication controls require the appropriate owner or
          administrator role. Private reading grants do not authorize
          publication.
        </p>
      </section>
    );
  const originalReady =
    source?.state === "ready" &&
    !source.publicImportId &&
    !!source.analysis?.insights.length;
  const canPublish = own?.enabled === true;
  return (
    <section className="panel public-management">
      <h2>Publish deliberately</h2>
      <p>
        Publish only a reviewed source-level edition. Private notes, goals,
        project context and decisions do not belong in it. Public indexing is
        separate from team or assistant sharing.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {!canPublish && (
        <p>
          Load your publication status to check availability. A closed
          publication gate prevents new public editions and collections; you can
          still withdraw existing sharing.
        </p>
      )}
      {originalReady && canPublish && !preview && (
        <form
          className="form-grid"
          onSubmit={async (event) => {
            event.preventDefault();
            const fields = new FormData(event.currentTarget);
            const result = await act("prepareEdition", {
              sourceId: source._id,
              generation: source.generation,
              revision: source.updatedAt,
              slug: fields.get("slug"),
              publisher: fields.get("publisher"),
              insightIds: selected,
              reuseAllowed: fields.get("reuse") === "on",
              rightsBasis: fields.get("rightsBasis"),
              permissionReference: fields.get("permissionReference"),
              permissionExpiresAt: new Date(
                String(fields.get("expires")),
              ).getTime(),
            });
            if (result) {
              setPreview(result);
              setApproved(false);
            }
          }}
        >
          <h3>Prepare a public edition of {source.title}</h3>
          <label>
            Public URL name
            <input
              name="slug"
              required
              pattern="[a-z0-9][a-z0-9-]{2,79}"
              minLength={3}
              maxLength={80}
              placeholder="my-permitted-source"
            />
          </label>
          <label>
            Publisher name shown publicly
            <input name="publisher" required maxLength={100} />
          </label>
          <fieldset>
            <legend>Source insights to include</legend>
            {source.analysis!.insights.slice(0, 20).map((insight) => (
              <label className="check" key={insight.id}>
                <input
                  type="checkbox"
                  checked={selected.includes(insight.id)}
                  onChange={(event) =>
                    setSelected((current) =>
                      event.target.checked
                        ? [...current, insight.id]
                        : current.filter((id) => id !== insight.id),
                    )
                  }
                />
                {insight.title}
              </label>
            ))}
          </fieldset>
          <label>
            Permission basis
            <select name="rightsBasis" defaultValue="" required>
              <option value="" disabled>
                Choose the verified permission basis
              </option>
              <option value="owner_created">
                I created this material and hold the required rights
              </option>
              <option value="licensed">
                A licence permits this publication
              </option>
              <option value="public_domain">
                Verified public-domain material
              </option>
            </select>
          </label>
          <label>
            Permission record, without private credentials
            <input name="permissionReference" required maxLength={500} />
          </label>
          <label>
            Review permission by
            <input name="expires" type="date" required />
          </label>
          <label className="check">
            <input name="reuse" type="checkbox" />
            Allow compatible derived-artifact reuse
          </label>
          <p className="fine">
            Reuse needs verified pipeline provenance. Older extractions can be
            refused for reuse. Preparing this edition does not run new analysis,
            publish media or grant redistribution rights for the original.
          </p>
          <button
            type="submit"
            className="primary"
            disabled={busy || !selected.length}
          >
            Prepare exact public preview
          </button>
        </form>
      )}
      {source && !originalReady && (
        <p>
          Choose a current original ready source with cited insights to prepare
          an edition. A saved public artifact cannot be republished as your
          original extraction.
        </p>
      )}
      {preview && (
        <section aria-label="Exact publication preview">
          <PublicEditionContent edition={preview.payload} />
          <p className="fine">
            Version {preview.version}. Exact content hash:{" "}
            <code>{preview.hash}</code>
          </p>
          <label className="check">
            <input
              type="checkbox"
              checked={approved}
              onChange={(event) => setApproved(event.target.checked)}
            />
            I reviewed this exact content and its public disclosure.
          </label>
          <div className="row">
            <button
              className="primary"
              disabled={busy || !approved || !canPublish}
              onClick={async () => {
                const result = await act("publishEdition", {
                  id: preview.id,
                  version: preview.version,
                  hash: preview.hash,
                  explicitlyApproved: true,
                });
                if (result) {
                  setPreview(null);
                  setOwn(null);
                  setApproved(false);
                }
              }}
            >
              Publish reviewed edition
            </button>
            <button
              disabled={busy}
              onClick={() => {
                setPreview(null);
                setApproved(false);
              }}
            >
              Change the selection
            </button>
          </div>
        </section>
      )}
      <button disabled={busy} onClick={() => void refresh()}>
        Load my editions and collections
      </button>
      {own && (
        <>
          <h3>Own editions</h3>
          <ul>
            {own.editions.map((edition) => (
              <li key={edition._id}>
                <strong>{edition.payload.title}</strong>{" "}
                <span>
                  {edition.state}, version {edition.version}
                </span>{" "}
                {edition.state === "published" && (
                  <Link
                    href={`/editions/${edition.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open public edition
                  </Link>
                )}{" "}
                {!["withdrawn", "removed"].includes(edition.state) && (
                  <button
                    disabled={busy}
                    onClick={async () => {
                      if (
                        await act("withdrawEdition", {
                          id: edition._id,
                          version: edition.version,
                        })
                      )
                        await refresh();
                    }}
                  >
                    Withdraw edition
                  </button>
                )}
              </li>
            ))}
          </ul>
          {!own.editions.length && <p>No editions in this bounded page.</p>}
          <h3>Own collections</h3>
          <ul>
            {own.collections.map((collection) => (
              <li key={collection._id}>
                {collection.title}, {collection.state}, version{" "}
                {collection.version}{" "}
                {collection.state === "published" && (
                  <Link href={`/collections/${collection.slug}`}>
                    Open collection
                  </Link>
                )}{" "}
                {!["withdrawn", "removed"].includes(collection.state) && (
                  <button
                    disabled={busy}
                    onClick={async () => {
                      if (
                        await act("withdrawCollection", {
                          id: collection._id,
                          version: collection.version,
                        })
                      )
                        await refresh();
                    }}
                  >
                    Withdraw collection
                  </button>
                )}
              </li>
            ))}
          </ul>
          <p className="fine">
            Up to 30 editions and 30 collections are loaded. These are not
            whole-account totals. Withdrawal removes current access; recipients
            may retain previously disclosed material.
          </p>
          {canPublish && !collectionPreview && (
            <form
              className="form-grid"
              onSubmit={async (event) => {
                event.preventDefault();
                const fields = new FormData(event.currentTarget);
                const input = {
                  organizationId,
                  expectedVersion: 0,
                  slug: String(fields.get("slug")),
                  title: String(fields.get("title")),
                  description: String(fields.get("description")),
                  topic: String(fields.get("topic")),
                  editions: collectionEditions,
                };
                const result = await act("saveCollection", input);
                if (result) {
                  setCollectionPreview({ ...result, ...input });
                  setCollectionApproved(false);
                }
              }}
            >
              <h3>Prepare a collection</h3>
              <label>
                Public URL name
                <input
                  name="slug"
                  required
                  pattern="[a-z0-9][a-z0-9-]{2,79}"
                  maxLength={80}
                />
              </label>
              <label>
                Title
                <input name="title" required maxLength={160} />
              </label>
              <label>
                Description
                <textarea name="description" required maxLength={1500} />
              </label>
              <label>
                Topic
                <input name="topic" required maxLength={48} />
              </label>
              <fieldset>
                <legend>Published editions</legend>
                {own.editions
                  .filter((edition) => edition.state === "published")
                  .map((edition) => (
                    <label className="check" key={edition._id}>
                      <input
                        type="checkbox"
                        checked={collectionEditions.includes(edition._id)}
                        onChange={(event) =>
                          setCollectionEditions((current) =>
                            event.target.checked
                              ? [...current, edition._id]
                              : current.filter((id) => id !== edition._id),
                          )
                        }
                      />
                      {edition.payload.title}
                    </label>
                  ))}
              </fieldset>
              <button
                type="submit"
                disabled={
                  busy ||
                  !collectionEditions.length ||
                  collectionEditions.length > 25
                }
              >
                Prepare collection preview
              </button>
            </form>
          )}
          {collectionPreview && (
            <section>
              <h3>{collectionPreview.title}</h3>
              <p>{collectionPreview.description}</p>
              <p>Topic: {collectionPreview.topic}</p>
              <ul>
                {collectionPreview.editions.map((id) => (
                  <li key={id}>
                    {own.editions.find((edition) => edition._id === id)?.payload
                      .title ?? "Edition unavailable"}
                  </li>
                ))}
              </ul>
              <p className="fine">
                Version {collectionPreview.version}. Exact hash:{" "}
                <code>{collectionPreview.hash}</code>
              </p>
              <label className="check">
                <input
                  type="checkbox"
                  checked={collectionApproved}
                  onChange={(event) =>
                    setCollectionApproved(event.target.checked)
                  }
                />
                I reviewed the collection and its selected public editions.
              </label>
              <button
                disabled={busy || !collectionApproved || !canPublish}
                onClick={async () => {
                  if (
                    await act("publishCollection", {
                      id: collectionPreview.id,
                      version: collectionPreview.version,
                      hash: collectionPreview.hash,
                      explicitlyApproved: true,
                    })
                  ) {
                    setCollectionPreview(null);
                    await refresh();
                  }
                }}
              >
                Publish reviewed collection
              </button>
              <button
                disabled={busy}
                onClick={() => setCollectionPreview(null)}
              >
                Change collection
              </button>
            </section>
          )}
        </>
      )}
      <h3>Previous region sharing</h3>
      <p>
        Region sharing has been retired. You can withdraw any region you
        previously shared.
      </p>
      <button
        disabled={busy}
        onClick={async () => {
          if (
            await act("setGeography", {
              organizationId,
              cell: null,
              explicitlyOptedIn: false,
            })
          ) {
            setOwn(null);
          }
        }}
      >
        Stop sharing my region
      </button>
      <p>
        <Link
          href="/help/actions-and-publication"
          target="_blank"
          rel="noopener noreferrer"
        >
          Publication and permission help
        </Link>
      </p>
    </section>
  );
}
