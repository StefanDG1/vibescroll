import { useId, useState, type ReactNode } from "react";
import { Button } from "@openai/apps-sdk-ui/components/Button";
import {
  ArrowRight,
  ExternalLink,
  FileText,
  LoaderCircle,
  MessageSquare,
  Play,
  ThumbsUp,
} from "lucide-react";
import { useHost } from "./host";
import {
  evidenceLabel,
  sourceContext,
  reauthorizeSources,
  type Source,
  type Insight,
} from "./data";
import type { ToolRecord } from "../../../packages/widget/contracts";

export function Action({
  children,
  onClick,
  disabled = false,
  secondary = false,
  busy = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  secondary?: boolean;
  busy?: boolean;
}) {
  return (
    <Button
      className="widget-action"
      color="secondary"
      variant={secondary ? "outline" : "solid"}
      pill={false}
      size="2xl"
      disabled={disabled || busy}
      onClick={onClick}
    >
      {busy && <LoaderCircle size={15} className="spin" />}
      {children}
    </Button>
  );
}
export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <FileText size={26} aria-hidden="true" />
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}
export function Loading({
  label = "Loading your current view",
}: {
  label?: string;
}) {
  return (
    <output className="loading">
      <LoaderCircle size={19} className="spin" />
      {label}
    </output>
  );
}
export function Failure({
  error,
  retry,
}: {
  error: unknown;
  retry?: () => void;
}) {
  return (
    <div className="error-state" role="alert">
      <h2>This view needs attention</h2>
      <p>
        {error instanceof Error
          ? error.message
          : "The current data could not be retrieved. Review your connection and try again."}
      </p>
      {retry && (
        <Action secondary onClick={retry}>
          Try again
        </Action>
      )}
    </div>
  );
}
export function ProtectedLink({
  url,
  children,
}: {
  url?: string;
  children: ReactNode;
}) {
  const host = useHost();
  const [error, setError] = useState("");
  return (
    <>
      <button
        className="text-link"
        disabled={!url}
        onClick={() => {
          if (url) void host.open(url).catch((e) => setError(e.message));
        }}
      >
        {children}
        <ExternalLink size={13} />
      </button>
      {error && (
        <p className="inline-error" role="alert">
          {error} {url}
        </p>
      )}
    </>
  );
}
export function InsightDetail({
  source,
  insight,
  profileId,
  grantVersion,
  allowFeedback,
  compact = false,
  notify,
}: {
  source: Source;
  insight: Insight;
  profileId: string;
  grantVersion: number;
  allowFeedback: boolean;
  compact?: boolean;
  notify: (text: string) => void;
}) {
  const host = useHost();
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [version, setVersion] = useState(0);
  const [key] = useState(() => crypto.randomUUID());
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const evidenceId = useId();
  const [expandedEvidenceId, setExpandedEvidenceId] = useState<string | null>(
    null,
  );
  const evidenceExpanded = expandedEvidenceId === insight.id;
  const visibleEvidence =
    compact && !evidenceExpanded
      ? insight.evidence.slice(0, 2)
      : insight.evidence;
  const submit = async (action: string) => {
    if (!insight.reference) return;
    setPending(true);
    setError("");
    try {
      const data = await host.call("record_feedback", {
        profileId,
        sourceId: insight.reference.sourceId,
        generation: insight.reference.generation,
        revision: insight.reference.revision,
        grantVersion,
        key,
        expectedVersion: version,
        explicitlyRequested: true,
        action,
        note,
      });
      setVersion(Number(data.version ?? data.feedback_version));
      setFeedback(action);
      notify("Your judgment was recorded. It is not a measured benefit.");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Feedback could not be recorded. Keep this view open to retry the same request.",
      );
    } finally {
      setPending(false);
    }
  };
  const attach = async () => {
    try {
      await reauthorizeSources(host.call, profileId, [source]);
      await host.attach(sourceContext(source, [insight]), {
        references: [insight.reference],
      });
      notify("Selected insight and citation attached to the conversation.");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <article className="insight-detail">
      <div className="detail-meta">
        <span>
          {source.coverage === "ordered_media"
            ? "Timestamped media evidence"
            : String(source.coverage ?? "Coverage unavailable").replaceAll(
                "_",
                " ",
              )}
        </span>
      </div>
      <h2>{insight.title}</h2>
      <p className="insight-claim">
        {insight.claim || "Open the protected source to inspect this result."}
      </p>
      <h3>Source evidence</h3>
      {insight.evidence.length ? (
        <div className="evidence-list" id={evidenceId}>
          {visibleEvidence.map((evidence, index) => (
            <div
              className="evidence-row"
              key={`${evidenceLabel(evidence)}-${index}`}
            >
              <span className="evidence-mark">
                {typeof evidence.startMs === "number" ? (
                  <Play size={14} />
                ) : (
                  <FileText size={14} />
                )}
                {evidenceLabel(evidence)}
              </span>
              <span>{source.title}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted">
          This preview contains the claim. Open the source for its current
          detailed evidence.
        </p>
      )}
      {compact && insight.evidence.length > 2 && (
        <button
          type="button"
          className="evidence-toggle"
          aria-expanded={evidenceExpanded}
          aria-controls={evidenceId}
          onClick={() =>
            setExpandedEvidenceId(evidenceExpanded ? null : insight.id)
          }
        >
          {evidenceExpanded
            ? "Show fewer references"
            : `Show ${insight.evidence.length - 2} more references`}
        </button>
      )}
      <ProtectedLink url={source.url}>Open source evidence</ProtectedLink>
      <div className="detail-buttons">
        <Action
          secondary
          disabled={!host.canContext}
          onClick={() => void attach()}
        >
          <MessageSquare size={15} />
          Add to conversation
        </Action>
      </div>
      {!host.canContext && (
        <p className="muted small">
          This host does not support attaching widget context. The protected
          citation remains available above.
        </p>
      )}
      {allowFeedback && insight.reference && (
        <section className="feedback-area">
          <h3>How useful is this source?</h3>
          <p className="muted small">
            Your judgment applies to this exact source version.
          </p>
          <div className="feedback-buttons">
            {[
              ["useful", "Useful"],
              ["not_relevant", "Not relevant"],
              ["already_implemented", "Already implemented"],
              ["unsafe_unsupported", "Unsupported"],
              ["later", "Later"],
            ].map(([action, label]) => (
              <button
                aria-pressed={feedback === action}
                disabled={pending}
                className={feedback === action ? "chosen" : ""}
                key={action}
                onClick={() => void submit(action)}
              >
                {action === "useful" && <ThumbsUp size={13} />}
                {label}
              </button>
            ))}
          </div>
          <label className="note-label">
            Optional note
            <textarea
              maxLength={2000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="What should be kept in mind?"
            />
          </label>
          {feedback && (
            <output className="success">
              Judgment saved · Version {version}
            </output>
          )}
        </section>
      )}
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
    </article>
  );
}
export function SourceCard({
  source,
  onOpen,
}: {
  source: Source;
  onOpen: (id: string) => void;
}) {
  return (
    <article className="source-card">
      <div className="source-card-top">
        <span className="source-icon">
          <Play size={17} />
        </span>
        <span className="status-badge">
          {source.state === "ready"
            ? "Insights ready"
            : source.state.replaceAll("_", " ")}
        </span>
      </div>
      <h3>{source.title}</h3>
      <p>
        {source.insights[0]?.claim ||
          "This source is saved. Open it to inspect the current state."}
      </p>
      <button className="text-link" onClick={() => onOpen(source.id)}>
        Open source
        <ArrowRight size={14} />
      </button>
    </article>
  );
}
export function JobCard({
  snapshot,
  title,
  onOpen,
}: {
  snapshot: ToolRecord;
  title?: string;
  onOpen: () => void;
}) {
  const processing = snapshot.processing as ToolRecord | undefined;
  return (
    <article className="job-card">
      <div>
        <CloudIcon />
        <span className="status-badge">
          {String(processing?.state ?? snapshot.status ?? "saved").replaceAll(
            "_",
            " ",
          )}
        </span>
      </div>
      <h3>{title ?? String(snapshot.title ?? "Saved source")}</h3>
      {!!processing?.stage && (
        <p>{String(processing.stage).replaceAll("_", " ")}</p>
      )}
      <button className="text-link" onClick={onOpen}>
        Open current result
        <ArrowRight size={14} />
      </button>
    </article>
  );
}
function CloudIcon() {
  return <span className="muted small">Work status</span>;
}
