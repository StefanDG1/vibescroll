"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChoiceSelect } from "./choice-select";
import { ErrorState } from "./assistant-elements/error-state";
import {
  processingRecovery,
  productReadError,
  type ProcessingRecovery,
} from "../lib/processing-recovery";
import styles from "./prepared-analysis-control.module.css";

type Model = {
  id: string;
  name: string;
  efforts: string[];
  defaultEffort: string;
  creditMultiplier: number;
};
type Quote = {
  quoteHash: string;
  maximumCredits: number;
  preparationCredits: number;
  analysisCredits: number;
  reusedEvidenceId: string | null;
  cacheHit: boolean;
};
async function read(operation: string, args: unknown) {
  const response = await fetch("/api/product", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ operation, args }),
  });
  const body = await response.json();
  if (!response.ok) throw productReadError(body, response.status);
  return body.result;
}

// Keep the existing accessible Radix selector for this short catalogue. The
// assistant-ui standalone picker pattern does not require its chat runtime.
export function PreparedAnalysisControl({
  sourceId,
  ready,
  disabled,
  revision,
  call,
  onChange,
}: {
  sourceId: string;
  ready: boolean;
  disabled: boolean;
  revision: string;
  call: (operation: string, args: unknown) => Promise<any>;
  onChange: () => void;
}) {
  const [models, setModels] = useState<Model[]>();
  const [model, setModel] = useState("");
  const [effort, setEffort] = useState("");
  const [quoted, setQuoted] = useState<{
    key: string;
    value?: Quote;
    error?: ProcessingRecovery;
  }>();
  const [startError, setStartError] = useState<ProcessingRecovery>();
  const [refresh, setRefresh] = useState(0);
  const [optionsError, setOptionsError] = useState<ProcessingRecovery>();
  const [state, setState] = useState<
    "idle" | "starting" | "accepted" | "unknown"
  >("idle");
  const flight = useRef(false);
  useEffect(() => {
    let current = true;
    void read("preparedAnalysisOptions", { sourceId })
      .then((result) => {
        if (current) {
          setModels(result.models);
          setOptionsError(undefined);
        }
      })
      .catch((error) => {
        if (current) setOptionsError(processingRecovery(error, "quote"));
      });
    return () => {
      current = false;
    };
  }, [sourceId, revision, refresh]);
  const selected = models?.find((m) => m.id === model) ?? models?.[0];
  const selectedEffort = selected?.efforts.includes(effort)
    ? effort
    : selected?.defaultEffort;
  const quoteKey = selected
    ? JSON.stringify({
        revision,
        args: {
          sourceId,
          executor: "gateway",
          reanalyze: ready,
          model: selected.id,
          effort: selectedEffort,
        },
      })
    : "";
  const quote = quoted?.key === quoteKey ? quoted.value : undefined;
  const error = startError || (quoted?.key === quoteKey ? quoted.error : "");
  useEffect(() => {
    let current = true;
    if (quoteKey && state === "idle")
      void read("preparedAnalysisQuote", JSON.parse(quoteKey).args)
        .then((result) => {
          if (current) setQuoted({ key: quoteKey, value: result });
        })
        .catch((error) => {
          if (current)
            setQuoted({
              key: quoteKey,
              error: processingRecovery(error, "quote"),
            });
        });
    return () => {
      current = false;
    };
  }, [quoteKey, state, refresh]);
  function refreshQuote() {
    setStartError(undefined);
    setQuoted(undefined);
    setOptionsError(undefined);
    setRefresh(refresh + 1);
  }
  if (optionsError && state === "idle")
    return (
      <ErrorState
        title="Analysis settings unavailable"
        detail={optionsError.detail}
        action={
          <button type="button" onClick={refreshQuote}>
            Refresh analysis settings
          </button>
        }
      />
    );
  if (!models?.length || !selected) return null;
  const locked = disabled || state !== "idle";
  return (
    <section
      className={styles.control}
      aria-label="Credit-funded video analysis"
    >
      <h3>{ready ? "Analyze a new version" : "Analyze with credits"}</h3>
      <div className={styles.selectors}>
        <label>
          Model
          <ChoiceSelect
            aria-label="Analysis model"
            value={selected.id}
            disabled={locked}
            onValueChange={(value) => {
              setModel(value);
              setEffort("");
            }}
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} · {m.creditMultiplier}×
              </option>
            ))}
          </ChoiceSelect>
        </label>
        {selected.efforts.length > 1 && (
          <label>
            Reasoning
            <ChoiceSelect
              aria-label="Analysis reasoning"
              value={selectedEffort}
              disabled={locked}
              onValueChange={setEffort}
            >
              {selected.efforts.map((level) => (
                <option key={level} value={level}>
                  {level === "max"
                    ? "Maximum"
                    : level === "xhigh"
                      ? "Extra high"
                      : level[0].toUpperCase() + level.slice(1)}
                </option>
              ))}
            </ChoiceSelect>
          </label>
        )}
      </div>
      {state === "idle" && quote && !startError && (
        <>
          <p className="fine">
            {quote.reusedEvidenceId
              ? "Saved transcript and screenshots reused."
              : `Preparation: ${quote.preparationCredits} credit.`}{" "}
            Analysis: {quote.analysisCredits} credits.
            {ready ? " Your current result stays selected." : ""}
          </p>
          <button
            type="button"
            className="primary"
            disabled={disabled}
            onClick={async () => {
              if (state !== "idle" || flight.current) return;
              flight.current = true;
              setState("starting");
              setStartError(undefined);
              const request = {
                sourceId,
                executor: "gateway",
                reanalyze: ready,
                model: selected.id,
                effort: selectedEffort,
                key: crypto.randomUUID(),
                quoteHash: quote.quoteHash,
                maximumCredits: quote.maximumCredits,
              };
              try {
                await call("preparedAnalysisStart", request);
                setState("accepted");
                onChange();
              } catch (error) {
                const recovery = processingRecovery(error, "start");
                setStartError(recovery);
                if (recovery.confirmedRejection) {
                  flight.current = false;
                  setState("idle");
                } else setState("unknown");
              }
            }}
          >
            {ready ? "Analyze again" : "Analyze"} · up to {quote.maximumCredits}{" "}
            credits
          </button>
        </>
      )}
      {state === "idle" && !quote && !error && (
        <output>Getting credit quote…</output>
      )}
      {state === "starting" && <output>Starting analysis…</output>}
      {state === "accepted" && (
        <output>Analysis queued. Progress appears on this post.</output>
      )}
      {error && (
        <ErrorState
          title={error.title}
          detail={error.detail}
          action={
            state === "unknown" || error.action === "refresh_status" ? (
              <button type="button" onClick={() => onChange()}>
                Refresh post status
              </button>
            ) : error.action === "billing" ? (
              <Link prefetch={false} href="/app?view=billing&tier=pro">
                Review personal billing
              </Link>
            ) : error.action === "review_access" ? (
              <Link prefetch={false} href="/connect/agent">
                Review route setup
              </Link>
            ) : (
              <button type="button" onClick={refreshQuote}>
                Refresh quote
              </button>
            )
          }
        />
      )}
    </section>
  );
}
