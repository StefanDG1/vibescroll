"use client";

import { useEffect, useRef, useState } from "react";
import {
  serviceCatalogPage,
  type ServiceCatalogCard,
  type ServiceCatalogPage,
} from "../../../packages/social/catalog";
import type { SharedOrderedAnalysis } from "@/lib/shared-ordered-analysis-display";
import { publicCitationUrl } from "@/lib/public-knowledge-display";
import { SharedOrderedAnalysisContent } from "./shared-ordered-analysis-content";

function observedTime() {
  return Date.now();
}

export type ServiceCatalogProps = {
  organizationId: string;
  call: (operation: string, args: Record<string, unknown>) => Promise<any>;
  disabled?: boolean;
  entitlementKey?: string;
};

export function ServiceCatalog(props: ServiceCatalogProps) {
  return (
    <ServiceCatalogPanel
      key={JSON.stringify([
        props.organizationId,
        props.entitlementKey,
        Boolean(props.disabled),
      ])}
      {...props}
    />
  );
}

/** Requests belong to this mounted workspace/entitlement scope only. */
export function ServiceCatalogPanel({
  organizationId,
  call,
  disabled = false,
}: ServiceCatalogProps) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<ServiceCatalogPage | null>(null);
  const [selected, setSelected] = useState<ServiceCatalogCard | null>(null);
  const [detail, setDetail] = useState<SharedOrderedAnalysis | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [now, setNow] = useState(() => observedTime());
  const alive = useRef(true);
  const generation = useRef(0);
  const pending = useRef(false);
  const opened = useRef(false);
  const selection = useRef("");

  useEffect(() => {
    alive.current = true;
    const lifetime = alive;
    const requests = generation;
    return () => {
      lifetime.current = false;
      requests.current++;
    };
  }, []);
  useEffect(() => {
    if (!open || !page) return;
    const next = Math.min(
      ...page.page
        .filter((card) => card.availableUntil > now)
        .map((card) => card.availableUntil),
    );
    if (!Number.isFinite(next)) return;
    const timer = setTimeout(
      () => setNow(observedTime()),
      Math.min(2147483647, Math.max(0, next - observedTime())),
    );
    return () => clearTimeout(timer);
  }, [open, page, now]);

  const current = (ticket: number) =>
    alive.current && generation.current === ticket;
  function begin() {
    pending.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    return ++generation.current;
  }
  function finish(ticket: number) {
    if (!current(ticket)) return;
    pending.current = false;
    setBusy(false);
  }
  function fail(ticket: number) {
    if (!current(ticket)) return;
    setPage(null);
    setSelected(null);
    setDetail(null);
    selection.current = "";
    setError(
      "Catalog access could not be confirmed. Check your current Pro access and try again. Your own Library and previously saved copies are separate.",
    );
  }
  function close() {
    generation.current++;
    pending.current = false;
    opened.current = false;
    selection.current = "";
    setOpen(false);
    setPage(null);
    setSelected(null);
    setDetail(null);
    setError("");
    setNotice("");
    setBusy(false);
  }
  async function browse(cursor: string | null) {
    if (!alive.current || disabled || pending.current) return;
    opened.current = true;
    setOpen(true);
    const ticket = begin();
    setPage(null);
    setSelected(null);
    setDetail(null);
    selection.current = "";
    try {
      const result = serviceCatalogPage.parse(
        await call("serviceArtifactBrowse", { organizationId, cursor }),
      );
      if (!current(ticket)) return;
      setNow(observedTime());
      setPage(result);
    } catch {
      fail(ticket);
    } finally {
      finish(ticket);
    }
  }
  async function preview(card: ServiceCatalogCard) {
    if (
      !alive.current ||
      !opened.current ||
      disabled ||
      pending.current ||
      card.availableUntil <= observedTime()
    ) {
      setNow(observedTime());
      return;
    }
    const ticket = begin();
    selection.current = card.artifactId;
    setSelected(card);
    setDetail(null);
    try {
      const result: SharedOrderedAnalysis | null = await call(
        "serviceArtifactPreview",
        {
          organizationId,
          artifactId: card.artifactId,
          expectedCompatibilityKey: card.compatibilityKey,
        },
      );
      if (!current(ticket)) return;
      if (
        !result ||
        result.sourceUrl !== card.sourceUrl ||
        card.availableUntil <= observedTime()
      )
        throw Error("Unavailable analysis");
      setDetail(result);
      setNow(observedTime());
    } catch {
      fail(ticket);
    } finally {
      finish(ticket);
    }
  }
  function dismissDetail() {
    generation.current++;
    pending.current = false;
    selection.current = "";
    setBusy(false);
    setSelected(null);
    setDetail(null);
    setNotice("");
  }
  async function save() {
    if (
      !selected ||
      !detail ||
      !alive.current ||
      !opened.current ||
      selection.current !== selected.artifactId ||
      disabled ||
      pending.current ||
      selected.availableUntil <= observedTime()
    ) {
      setNow(observedTime());
      return;
    }
    const ticket = begin();
    try {
      const result = await call("serviceArtifactSave", {
        organizationId,
        artifactId: selected.artifactId,
        expectedCompatibilityKey: selected.compatibilityKey,
      });
      if (!current(ticket)) return;
      if (
        !result ||
        typeof result.sourceId !== "string" ||
        result.chargedCredits !== 0 ||
        result.processingStarted !== false
      )
        throw Error("Save not confirmed");
      setNotice(
        "Private copy saved to your Library. This save started no analysis.",
      );
    } catch {
      fail(ticket);
    } finally {
      finish(ticket);
    }
  }

  return (
    <section
      className="panel"
      aria-label="Pro insight catalog"
      aria-busy={busy}
    >
      <h2>Pro insight catalog</h2>
      <p>
        Browse eligible shared analyses with current verified Pro access.
        Contributing does not unlock the catalog. Opening this panel starts no
        processing; the server checks access for each request.
      </p>
      <p>
        Already saved private copies and notes remain readable after Pro ends,
        subject to rights, retention and required removals. New catalog access,
        saves and updates require Pro.
      </p>
      {!open ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => void browse(null)}
        >
          Browse catalog
        </button>
      ) : (
        <>
          <div className="row">
            <button
              type="button"
              disabled={disabled || busy}
              onClick={() => void browse(null)}
            >
              Refresh catalog
            </button>
            <button type="button" className="secondary" onClick={close}>
              Close catalog
            </button>
          </div>
          {busy && <output>Checking current catalog access…</output>}
          {error && <p role="alert">{error}</p>}
          {notice && <output>{notice}</output>}
          {page?.availability === "unavailable" && (
            <output>
              The catalog is unavailable. You can keep using your own Library
              and return here later.
            </output>
          )}
          {page?.availability === "ready" && (
            <>
              {page.page.length === 0 && (
                <p>
                  {page.isDone
                    ? "No eligible analyses are available on this catalog page."
                    : "No current analyses were returned in this batch. Another catalog page is available."}
                </p>
              )}
              {page.page.length > 0 && (
                <ul className="form-grid" aria-label="Current catalog analyses">
                  {page.page.map((card) => {
                    const source = publicCitationUrl(card.sourceUrl);
                    const expired = card.availableUntil <= now;
                    return (
                      <li key={card.artifactId}>
                        <article>
                          <h3>{card.title}</h3>
                          <p>{card.summary}</p>
                          {card.summaryTruncated && (
                            <p>
                              Summary shortened. Inspect the analysis for more
                              detail.
                            </p>
                          )}
                          <p>
                            {card.platform === "instagram"
                              ? "Instagram"
                              : "TikTok"}{" "}
                            · {card.language} · {card.insightCount} insights
                          </p>
                          {source && (
                            <a href={source} rel="noreferrer">
                              Open source post
                            </a>
                          )}
                          <p>
                            {expired
                              ? "This catalog entry has expired. Refresh to check current availability."
                              : "Access is rechecked when you inspect or save this analysis."}
                          </p>
                          <button
                            type="button"
                            disabled={disabled || busy || expired}
                            onClick={() => void preview(card)}
                          >
                            Inspect {card.title}
                          </button>
                        </article>
                      </li>
                    );
                  })}
                </ul>
              )}
              {!page.isDone && (
                <button
                  type="button"
                  className="secondary"
                  disabled={disabled || busy}
                  onClick={() => void browse(page.continueCursor)}
                >
                  Next catalog page
                </button>
              )}
              <p className="fine">
                This is a bounded catalog page, not a count of every available
                source.
              </p>
            </>
          )}
          {selected && (
            <section aria-label="Selected catalog analysis">
              <button
                type="button"
                className="secondary"
                onClick={dismissDetail}
              >
                Close analysis
              </button>
              {selected.availableUntil <= now ? (
                <p>
                  This entry has expired. Refresh the catalog before continuing.
                </p>
              ) : (
                detail && (
                  <>
                    <SharedOrderedAnalysisContent analysis={detail} />
                    <button
                      type="button"
                      disabled={disabled || busy}
                      onClick={() => void save()}
                    >
                      Save private copy
                    </button>
                  </>
                )
              )}
            </section>
          )}
        </>
      )}
    </section>
  );
}
