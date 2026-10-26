import { useEffect, useId, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ThumbsUp } from "lucide-react";
import { Action, Failure, Loading, ProtectedLink } from "./components";
import { useHost } from "./host";
import {
  feedbackState,
  feedbackRequest,
  confirmedFeedback,
  verifyFeedbackContext,
  type FeedbackRequest,
  type FeedbackState,
} from "../../../packages/widget/feedback";

const choices = [
  ["useful", "Useful"],
  ["not_relevant", "Not relevant"],
  ["already_implemented", "Already implemented"],
  ["unsafe_unsupported", "Unsupported"],
  ["later", "Later"],
] as const;
type Props = {
  profileId: string;
  grantVersion: number;
  sourceId: string;
  generation: number;
  revision: number;
  reviewUrl: string;
  compact: boolean;
  notify: (message: string) => void;
};
export function SourceReview({
  profileId,
  grantVersion,
  sourceId,
  generation,
  revision,
  reviewUrl,
  compact,
  notify,
}: Props) {
  const host = useHost();
  const cache = useQueryClient();
  const noteId = useId();
  const active = useRef(true);
  const authorityId = useRef("");
  const [revealed, setRevealed] = useState(false);
  const [draftNote, setNote] = useState<string | null>(null);
  const [request, setRequest] = useState<FeedbackRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [retryAllowed, setRetryAllowed] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [savedVersion, setSavedVersion] = useState<number | null>(null);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const context = { profileId, grantVersion, sourceId, generation, revision };
  const queryKey = [
    "data",
    `${profileId}:${grantVersion}`,
    "source-feedback",
    sourceId,
    generation,
    revision,
  ];
  const read = async (key?: string) => {
    try {
      const result = feedbackState.parse(
        await host.call("widget_feedback_state", {
          ...context,
          ...(key ? { key } : {}),
        }),
      );
      verifyFeedbackContext(result, { ...context, ...(key ? { key } : {}) });
      if (authorityId.current && authorityId.current !== result.authority_id)
        throw new Error(
          "The connection identity changed. Reload this widget before reviewing a judgment.",
        );
      authorityId.current = result.authority_id;
      if (active.current) setBlocked(false);
      return result;
    } catch (reason) {
      if (active.current) setBlocked(true);
      throw reason;
    }
  };
  const state = useQuery({
    queryKey,
    queryFn: () => read(),
    enabled: !compact || revealed,
    retry: false,
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
  const feedback = state.data?.feedback;
  const note = draftNote ?? feedback?.note ?? "";
  const locked =
    busy || request !== null || blocked || !state.data?.lookup_complete;
  const finish = (result: FeedbackState) => {
    if (!active.current) return;
    cache.setQueryData(queryKey, result);
    setRequest(null);
    setRetryAllowed(false);
    setNote(null);
    setError("");
    setSavedVersion(result.feedback!.version);
    notify("Your judgment was recorded. It is not a measured benefit.");
  };
  const submit = async (
    action: FeedbackRequest["action"],
    previous?: FeedbackRequest,
  ) => {
    const input =
      previous ??
      feedbackRequest.parse({
        ...context,
        action,
        note,
        key: feedback?.key ?? state.data!.request_key,
        expectedVersion: feedback?.version ?? 0,
        explicitlyRequested: true,
      });
    setBusy(true);
    setError("");
    setMessage("");
    setRetryAllowed(false);
    setRequest(input);
    try {
      // Recheck the exact connection before submitting a draft from this view.
      const before = await read(input.key);
      if (confirmedFeedback(before, input)) {
        finish(before);
        return;
      }
      const ack = await host.call("record_feedback", input);
      const result = await read(input.key);
      if (!confirmedFeedback(result, input, ack))
        throw new Error("A different judgment is current.");
      finish(result);
    } catch {
      if (active.current)
        setError(
          "The judgment is not confirmed. Check its saved result before retrying.",
        );
    } finally {
      if (active.current) setBusy(false);
    }
  };
  const check = async () => {
    if (!request) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await read(request.key);
      if (confirmedFeedback(result, request)) finish(result);
      else if (active.current) {
        const changed =
          result.feedback && result.feedback.version > request.expectedVersion;
        setRetryAllowed(!changed);
        setMessage(
          changed
            ? "This judgment changed after the attempt. Review its current version before making a correction."
            : "No matching saved judgment is confirmed yet. Retry keeps the same request and version.",
        );
      }
    } catch {
      if (active.current)
        setError(
          "The saved result is unavailable. Check again or review your connection.",
        );
    } finally {
      if (active.current) setBusy(false);
    }
  };
  const review = async () => {
    setBusy(true);
    setError("");
    try {
      const current = await read();
      if (active.current) {
        cache.setQueryData(queryKey, current);
        setRequest(null);
        setRetryAllowed(false);
        setNote(null);
        setSavedVersion(null);
        setMessage(
          "Current judgment loaded. Review it before making a correction.",
        );
      }
    } catch {
      if (active.current)
        setError(
          "Current judgment access could not be confirmed. Reload this widget or review Connections.",
        );
    } finally {
      if (active.current) setBusy(false);
    }
  };
  const body = (
    <section className="feedback-area">
      <h3>How useful is this source?</h3>
      <p className="muted small">
        This connection's judgment applies to this exact source version.
      </p>
      {state.isPending ? (
        <Loading label="Loading your source judgment" />
      ) : state.error || blocked ? (
        <>
          <Failure
            error={
              state.error ??
              new Error("Current judgment access must be refreshed.")
            }
          />
          <Action secondary disabled={busy} onClick={() => void review()}>
            Reload judgment
          </Action>
        </>
      ) : !state.data?.lookup_complete ? (
        <>
          <p>
            Your older judgment could not be confirmed within this bounded
            lookup.
          </p>
          <ProtectedLink url={reviewUrl}>
            Review this source in VibeScroll
          </ProtectedLink>
        </>
      ) : (
        <>
          {feedback && (
            <p className="small">
              Your saved judgment:{" "}
              {choices.find(([value]) => value === feedback.action)?.[1]} ·
              Version {feedback.version}
            </p>
          )}
          <fieldset disabled={locked}>
            <legend className="sr-only">Choose a source judgment</legend>
            <div className="feedback-buttons">
              {choices.map(([action, label]) => (
                <button
                  key={action}
                  type="button"
                  aria-pressed={feedback?.action === action}
                  disabled={
                    locked ||
                    (feedback?.action === action &&
                      feedback.note === note.trim())
                  }
                  className={feedback?.action === action ? "chosen" : ""}
                  onClick={() => void submit(action)}
                >
                  {action === "useful" && <ThumbsUp size={13} />}
                  {label}
                </button>
              ))}
            </div>
            <label className="note-label" htmlFor={noteId}>
              Optional note
            </label>
            <textarea
              id={noteId}
              className="feedback-note"
              maxLength={2000}
              value={note}
              disabled={locked}
              onChange={(event) => setNote(event.target.value)}
              rows={2}
              placeholder="What should be kept in mind?"
            />
            <p className="muted small">
              Choose a judgment to save the note with it.
            </p>
          </fieldset>
          {savedVersion !== null && (
            <output className="success">
              Judgment saved · Version {savedVersion}
            </output>
          )}
        </>
      )}
      {busy && <Loading label="Confirming your judgment" />}
      {error && <p role="alert">{error}</p>}
      {message && <output>{message}</output>}
      {request && (
        <div className="review-recovery">
          <Action secondary disabled={busy} onClick={() => void check()}>
            Check saved judgment
          </Action>
          {retryAllowed && !blocked && (
            <Action
              secondary
              disabled={busy}
              onClick={() => void submit(request.action, request)}
            >
              Retry same judgment
            </Action>
          )}
        </div>
      )}
      {(request || error) && (
        <Action secondary disabled={busy} onClick={() => void review()}>
          Review current judgment
        </Action>
      )}
    </section>
  );
  return compact ? (
    <details
      className="source-review"
      onToggle={(event) => {
        if (event.currentTarget.open) {
          if (revealed) void state.refetch();
          else setRevealed(true);
        }
      }}
    >
      <summary>Review this source</summary>
      {revealed && body}
    </details>
  ) : (
    body
  );
}
