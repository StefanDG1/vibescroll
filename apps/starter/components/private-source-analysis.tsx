"use client";
import { useEffect, useId, useRef, useState } from "react";
import { z } from "zod";
import {
  insightOutput,
  sourceInsightOutput,
} from "../../../packages/contracts";
import type {
  EvidenceRecord,
  SourceRevision,
} from "../../../packages/sources/types";
import { OwnPlanTaskControls } from "./own-plan-task-controls";
import { TypedSourceEvidence } from "./typed-source-evidence";
import { downloadText } from "@/lib/download";

type Output = {
  sourceId: string;
  processingRunId: string;
  schemaVersion: string;
  summary: string;
  warnings: string[];
  insights: {
    id: string;
    title: string;
    claim: string;
    interpretation: string;
    confidence: string;
    verificationNeeds: string[];
    evidence: { id: string; kind: string }[];
  }[];
};
const resultSchema = z.strictObject({
  available: z.boolean(),
  readUntil: z.number().finite().max(8_640_000_000_000_000).nullable(),
  version: z.number().int().positive().nullable(),
  output: z.unknown(),
  provenance: z
    .strictObject({
      runId: z.string().min(1),
      model: z.string().min(1),
      effort: z.string().min(1),
      inputKind: z.enum(["supplied_text", "retained_text"]),
      completedAt: z.number().finite().positive().max(8_640_000_000_000_000),
      outputHash: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .nullable(),
});
type Result = {
  readScope: string;
  readUntil: number | null;
  version: number;
  output: Output;
  provenance: NonNullable<z.infer<typeof resultSchema>["provenance"]>;
};
export type PrivateSourceAnalysisProps = {
  privateLibrary?: boolean;
  organizationId: string;
  sourceId: string;
  title: string;
  generation: number;
  sourceUpdatedAt: number;
  rightsAttested: boolean;
  sourceRetentionUntil?: number;
  currentRevisionId?: string;
  analysisHash?: string;
  eligibility: {
    available: boolean;
    inputKind: "supplied_text" | "retained_text" | null;
    currentPrivateVersion: number;
    pendingRunId: string | null;
    reason: "ready" | "unsupported" | "busy" | "unavailable";
  };
  evidenceRegistry?: readonly EvidenceRecord[];
  sourceRevision?: SourceRevision | null;
  call: (operation: string, args: Record<string, unknown>) => Promise<any>;
  disabled?: boolean;
  onComplete?: () => unknown | Promise<unknown>;
  onOpenOriginal?: () => void;
};
function readScope(props: PrivateSourceAnalysisProps) {
  return JSON.stringify([
    props.organizationId,
    props.sourceId,
    props.generation,
    props.eligibility.currentPrivateVersion,
    props.sourceUpdatedAt,
    props.rightsAttested,
    props.sourceRetentionUntil,
    props.currentRevisionId,
    props.analysisHash,
    props.sourceRevision?.contentHash,
    props.sourceRevision?.rightsBasis,
    props.sourceRevision?.observedAt,
    props.sourceRevision?.retention,
  ]);
}
function readDeadline(props: PrivateSourceAnalysisProps) {
  const limits = [
    props.sourceRetentionUntil,
    props.sourceRevision?.retention?.retainUntil,
  ].filter((value): value is number => value !== undefined);
  return limits.length ? Math.min(...limits) : undefined;
}
function readCurrent(props: PrivateSourceAnalysisProps, now = Date.now()) {
  const deadline = readDeadline(props);
  return (
    props.privateLibrary === true &&
    props.rightsAttested === true &&
    Number.isFinite(props.sourceUpdatedAt) &&
    (deadline === undefined || (Number.isFinite(deadline) && deadline > now))
  );
}
export function PrivateSourceAnalysis(props: PrivateSourceAnalysisProps) {
  if (props.privateLibrary !== true) return null;
  return <PrivateSourceAnalysisPanel key={readScope(props)} {...props} />;
}
export function PrivateSourceAnalysisPanel(props: PrivateSourceAnalysisProps) {
  const id = useId();
  const [storedResult, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [observedAt, setObservedAt] = useState(Date.now);
  const alive = useRef(true),
    request = useRef(0);
  const scope = readScope(props);
  const result =
    readCurrent(props, observedAt) &&
    storedResult?.readScope === scope &&
    (storedResult.readUntil === null || storedResult.readUntil > observedAt)
      ? storedResult
      : null;
  const parentDeadline = readDeadline(props);
  const deadline =
    storedResult?.readUntil != null
      ? Math.min(parentDeadline ?? Infinity, storedResult.readUntil)
      : parentDeadline;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      request.current += 1;
    };
  }, []);
  useEffect(() => {
    if (!result || deadline === undefined) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    function checkExpiry() {
      if (!active) return;
      const remaining = deadline! - Date.now();
      if (remaining > 0) {
        timer = setTimeout(checkExpiry, Math.min(remaining, 2_147_483_647));
        return;
      }
      request.current += 1;
      setObservedAt(Date.now());
      setResult(null);
      setBusy(false);
      setError("Reload the private result to check its current availability.");
    }
    checkExpiry();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [result, deadline]);
  async function load(runId?: string) {
    setObservedAt(Date.now());
    if (!readCurrent(props)) {
      setResult(null);
      setError("Use your own private Library to review this result.");
      return;
    }
    const ticket = ++request.current;
    const requestedScope = readScope(props);
    setBusy(true);
    setError("");
    try {
      const value = resultSchema.parse(
        await props.call("privateSourceAnalysisDetail", {
          sourceId: props.sourceId,
          ...(runId ? { runId } : {}),
        }),
      );
      if (
        !alive.current ||
        ticket !== request.current ||
        requestedScope !== readScope(props) ||
        !readCurrent(props)
      )
        return;
      if (!value.available) {
        setResult(null);
        setError(
          "This private result is unavailable. The original source analysis is unchanged.",
        );
        return;
      }
      if (
        !value.version ||
        !value.provenance ||
        (runId && value.provenance.runId !== runId) ||
        (value.readUntil !== null && value.readUntil <= Date.now())
      )
        throw Error("Private result could not be verified. Load it again.");
      const output = (
        value.provenance.inputKind === "retained_text"
          ? sourceInsightOutput
          : insightOutput
      ).parse(value.output) as Output;
      if (output.sourceId !== props.sourceId)
        throw Error("Private result belongs to a different source.");
      if (output.processingRunId !== value.provenance.runId)
        throw Error("Private result belongs to a different processing run.");
      setResult({
        readScope: requestedScope,
        readUntil: value.readUntil,
        version: value.version,
        provenance: value.provenance,
        output,
      });
    } catch {
      if (alive.current && ticket === request.current) {
        setResult(null);
        setError(
          "Private result could not be loaded. Review your current workspace access and try again.",
        );
      }
    } finally {
      if (alive.current && ticket === request.current) setBusy(false);
    }
  }
  const cited = new Set(
    result?.output.insights.flatMap((item) =>
      item.evidence.map((citation) => citation.id),
    ) ?? [],
  );
  const evidence = (props.evidenceRegistry ?? []).filter((item) =>
    cited.has(item.id),
  );
  const evidencePrefix = `private-evidence-${id}`;
  return (
    <section className="panel" aria-label="Private text reanalysis">
      <h2>Private text reanalysis</h2>
      <p>
        Review supplied or retained text with your own subscription. The source
        analysis and shared catalog stay unchanged. No media inspection or
        project evaluation is included.
      </p>
      <button
        className="secondary"
        type="button"
        disabled={busy || !readCurrent(props, observedAt)}
        onClick={() => void load()}
      >
        Load private text result
      </button>
      {props.eligibility.pendingRunId && (
        <p>
          A private text request is pending. A previous completed result can
          still be reviewed.
        </p>
      )}
      {busy && <output>Loading private result…</output>}
      {error && <p role="alert">{error}</p>}
      {result && (
        <section aria-label="Completed private text result">
          <h3>Private result version {result.version}</h3>
          <p>
            AI-generated analysis may contain errors. Check the cited text
            before relying on it.
          </p>
          <p>
            {result.provenance.model}, {result.provenance.effort}.{" "}
            {result.provenance.inputKind === "retained_text"
              ? "Retained text evidence"
              : "User-supplied text"}
            . Completed {new Date(result.provenance.completedAt).toISOString()}.
          </p>
          <p>{result.output.summary}</p>
          {result.output.warnings.length > 0 && (
            <ul aria-label="Private result warnings">
              {result.output.warnings.map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
          )}
          {result.output.insights.map((item) => (
            <article key={item.id}>
              <h4>{item.title}</h4>
              <p>{item.claim}</p>
              <p>Private interpretation: {item.interpretation}</p>
              <p>Confidence: {item.confidence}.</p>
              <ul>
                {item.verificationNeeds.map((need, index) => (
                  <li key={index}>{need}</li>
                ))}
              </ul>
              <ul aria-label={`Text evidence for ${item.title}`}>
                {item.evidence.map((citation, index) => (
                  <li key={`${citation.id}:${index}`}>
                    {result.provenance.inputKind === "supplied_text" ? (
                      <a
                        href="#source-transcript"
                        onClick={props.onOpenOriginal}
                      >
                        Inspect supplied text
                      </a>
                    ) : evidence.some((record) => record.id === citation.id) ? (
                      <a href={`#${evidencePrefix}-${citation.id}`}>
                        Inspect retained text evidence
                      </a>
                    ) : (
                      "Cited text is not available in this view."
                    )}
                  </li>
                ))}
              </ul>
            </article>
          ))}
          {result.provenance.inputKind === "retained_text" && (
            <TypedSourceEvidence
              evidenceRegistry={evidence}
              sourceRevision={props.sourceRevision}
              idPrefix={evidencePrefix}
            />
          )}
          <button
            className="secondary"
            type="button"
            onClick={() =>
              alive.current &&
              readCurrent(props) &&
              (result.readUntil === null || result.readUntil > Date.now()) &&
              result.readScope === readScope(props) &&
              downloadText(
                `private-source-analysis-v${result.version}.json`,
                JSON.stringify(
                  {
                    version: result.version,
                    readUntil: result.readUntil,
                    output: result.output,
                    provenance: result.provenance,
                  },
                  null,
                  2,
                ),
                "application/json",
              )
            }
          >
            Export private result JSON
          </button>
        </section>
      )}
      {props.eligibility.reason === "unsupported" && (
        <p>
          This source does not have supported text evidence for private
          reanalysis.
        </p>
      )}
      <OwnPlanTaskControls
        organizationId={props.organizationId}
        call={props.call}
        source={{ id: props.sourceId, title: props.title }}
        repositories={[]}
        privateLibrary={props.privateLibrary === true}
        sourceReanalysis={{
          available: props.eligibility.available,
          expectedPrivateVersion: props.eligibility.currentPrivateVersion,
          pendingRunId: props.eligibility.pendingRunId,
        }}
        disabled={props.disabled || !readCurrent(props, observedAt)}
        onComplete={props.onComplete}
        onViewPrivateResult={(runId) => void load(runId)}
      />
    </section>
  );
}
