import { useEffect, useId, useRef, useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { Action, Failure, Loading } from "./components";
import { useHost } from "./host";
import { widgetOutputs } from "../../../packages/widget/outputs";
import {
  filingInput,
  filingState,
  filingResult,
  filingOutcome,
  sameFilingReference,
  verifiedFilingReceipt,
  type FilingInput,
} from "../../../packages/widget/evidence-filing";

type Props = {
  profileId: string;
  grantVersion: number;
  reference: FilingInput["reference"];
  notify: (message: string) => void;
};
export function EvidenceFiling({
  profileId,
  grantVersion,
  reference,
  notify,
}: Props) {
  const host = useHost();
  const cache = useQueryClient();
  const prefix = useId();
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const [revealed, setRevealed] = useState(false);
  const [selectedMember, setSelectedMember] = useState("");
  const [destinationId, setDestination] = useState("");
  const [busy, setBusy] = useState(false);
  const [request, setRequest] = useState<FilingInput | null>(null);
  const [retryAllowed, setRetryAllowed] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const authority = `${profileId}:${grantVersion}`;
  const current = (value: { profile_id: string; grant_version: number }) => {
    if (value.profile_id !== profileId || value.grant_version !== grantVersion)
      throw new Error(
        "The result does not match this connection. Refresh access.",
      );
  };
  const filings = useInfiniteQuery({
    queryKey: [
      "data",
      authority,
      "idea-filing",
      reference.sourceId,
      reference.generation,
      reference.revision,
      reference.insightId,
    ],
    enabled: revealed,
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const data = filingState.parse(
        await host.call("widget_evidence_state", {
          profileId,
          grantVersion,
          reference,
          cursor: pageParam,
        }),
      );
      current(data);
      if (!sameFilingReference(data.reference, reference))
        throw new Error("These filings belong to different evidence.");
      return data;
    },
    getNextPageParam: (page) => page.next_cursor ?? undefined,
    maxPages: 20,
  });
  const topics = useInfiniteQuery({
    queryKey: ["data", authority, "filing-destinations"],
    enabled: revealed,
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const data = widgetOutputs.widget_browse.parse(
        await host.call("widget_browse", {
          profileId,
          kind: "topics",
          cursor: pageParam,
        }),
      );
      current(data);
      return data;
    },
    getNextPageParam: (page) => page.next_cursor ?? undefined,
    maxPages: 20,
  });
  const rows = filings.data?.pages.flatMap((page) => page.items) ?? [];
  const origin =
    rows.find((row) => row.member_id === selectedMember) ??
    rows.find((row) => !row.excluded) ??
    rows[0];
  const destinations =
    topics.data?.pages
      .flatMap((page) => page.items)
      .filter((row) => "name" in row)
      .filter((row) => row.id !== origin?.topic_id) ?? [];
  const target = destinations.find((row) => row.id === destinationId);
  const locked = busy || request !== null;
  const finish = async (input: FilingInput, value: unknown) => {
    const receipt = verifiedFilingReceipt(value, input);
    if (!active.current) return;
    await cache.invalidateQueries({ queryKey: ["data", authority] });
    if (!active.current) return;
    setSelectedMember(
      receipt.destination?.member_id ?? receipt.origin_member_id,
    );
    setDestination("");
    setRequest(null);
    setRetryAllowed(false);
    notify(
      input.change.kind === "move"
        ? "Idea moved. Its previous topic filing can be restored."
        : input.change.kind === "restore"
          ? "Idea restored to this topic."
          : "Idea removed from this topic. The saved source is unchanged.",
    );
  };
  const submit = async (
    change: FilingInput["change"],
    previous?: FilingInput,
  ) => {
    if (!origin && !previous) return;
    let input: FilingInput;
    try {
      input =
        previous ??
        filingInput.parse({
          profileId,
          grantVersion,
          reference,
          origin: {
            topicId: origin!.topic_id,
            memberId: origin!.member_id,
            version: origin!.version,
            excluded: origin!.excluded,
          },
          key: crypto.randomUUID(),
          explicitlyRequested: true,
          change,
        });
    } catch {
      setError("Review the current idea and topic selection.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    setRetryAllowed(false);
    setRequest(input);
    try {
      const result = filingResult.parse(
        await host.call("widget_evidence_edit", input),
      );
      if ("status" in result) {
        current(result);
        if (
          result.request_key !== input.key ||
          !sameFilingReference(result.reference, input.reference)
        )
          throw new Error("The rejection belongs to another filing.");
        if (active.current) {
          setRequest(null);
          setError(result.message);
        }
      } else await finish(input, result);
    } catch {
      if (active.current)
        setError(
          "The filing change is not confirmed. Check its result before retrying.",
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
      const result = filingOutcome.parse(
        await host.call("widget_evidence_receipt", {
          profileId,
          grantVersion,
          reference,
          key: request.key,
        }),
      );
      current(result);
      if (!sameFilingReference(result.reference, reference))
        throw new Error("The result belongs to different evidence.");
      if (result.receipt) await finish(request, result.receipt);
      else if (active.current) {
        setRetryAllowed(true);
        setMessage(
          "No receipt is confirmed yet. Retry sends the same filing and request key.",
        );
      }
    } catch {
      if (active.current)
        setError(
          "The result is still unavailable. Check again or review Connections.",
        );
    } finally {
      if (active.current) setBusy(false);
    }
  };
  const review = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await filings.refetch();
      const choices = await topics.refetch();
      if (result.error || choices.error)
        throw new Error("Current access unavailable");
      if (active.current) {
        setRequest(null);
        setRetryAllowed(false);
        setMessage(
          "Current filings loaded. Review them before making a new change.",
        );
      }
    } catch {
      if (active.current)
        setError(
          "Current filing access could not be confirmed. Review Connections.",
        );
    } finally {
      if (active.current) setBusy(false);
    }
  };
  return (
    <details
      className="idea-filing"
      onToggle={(event) => {
        if (event.currentTarget.open) setRevealed(true);
      }}
    >
      <summary>File this idea</summary>
      {revealed && (
        <div className="idea-filing-body">
          <p className="muted">
            Move this cited idea between topics, or remove a filing. Your saved
            source and access stay the same. No analysis starts.
          </p>
          {filings.isPending ? (
            <Loading label="Loading current idea filings" />
          ) : filings.error ? (
            <Failure
              error={filings.error}
              retry={() => void filings.refetch()}
            />
          ) : !origin ? (
            <p>
              {filings.hasNextPage
                ? "No current filings are shown on these loaded pages. Load more idea filings to check the next page."
                : "No current filings are shown on these pages. Review the full library to add or find a filing."}
            </p>
          ) : (
            <>
              <fieldset disabled={locked}>
                <label htmlFor={`${prefix}-origin`}>Current topic filing</label>
                <select
                  id={`${prefix}-origin`}
                  value={origin.member_id}
                  onChange={(event) => {
                    setSelectedMember(event.target.value);
                    setDestination("");
                  }}
                >
                  {rows.map((row) => (
                    <option key={row.member_id} value={row.member_id}>
                      {row.name}
                      {row.excluded ? " · Removed" : ""}
                    </option>
                  ))}
                </select>
                {origin.excluded ? (
                  <Action
                    secondary
                    onClick={() => void submit({ kind: "restore" })}
                  >
                    Restore to this topic
                  </Action>
                ) : (
                  <>
                    <label htmlFor={`${prefix}-destination`}>
                      Move to topic
                    </label>
                    <select
                      id={`${prefix}-destination`}
                      value={target?.id ?? ""}
                      onChange={(event) => setDestination(event.target.value)}
                    >
                      <option value="">Choose a loaded topic</option>
                      {destinations.map((row) => (
                        <option key={row.id} value={row.id}>
                          {"name" in row ? row.name : ""}
                        </option>
                      ))}
                    </select>
                    <p className="muted small">
                      Choices include loaded permitted topics. Load more to see
                      other topics.
                    </p>
                    {topics.error && (
                      <Failure
                        error={topics.error}
                        retry={() => void topics.refetch()}
                      />
                    )}
                    <div className="filing-actions">
                      <Action
                        secondary
                        disabled={!target || topics.isFetching}
                        onClick={() => {
                          if (target)
                            void submit({
                              kind: "move",
                              destination: {
                                topicId: target.id,
                                version: target.version,
                              },
                            });
                        }}
                      >
                        Move idea
                      </Action>
                      <Action
                        secondary
                        onClick={() => void submit({ kind: "exclude" })}
                      >
                        Remove from this topic
                      </Action>
                    </div>
                  </>
                )}
              </fieldset>
              {!origin.excluded && topics.hasNextPage && (
                <Action
                  secondary
                  disabled={locked || topics.isFetchingNextPage}
                  onClick={() => void topics.fetchNextPage()}
                >
                  Load more destination topics
                </Action>
              )}
            </>
          )}
          {filings.hasNextPage && !filings.error && (
            <Action
              secondary
              disabled={locked || filings.isFetchingNextPage}
              onClick={() => void filings.fetchNextPage()}
            >
              Load more idea filings
            </Action>
          )}
          {busy && (
            <Loading
              label={
                request ? "Confirming idea filing" : "Loading current filings"
              }
            />
          )}
          {error && <p role="alert">{error}</p>}
          {message && <output>{message}</output>}
          {request && (
            <div className="filing-actions">
              <Action secondary disabled={busy} onClick={() => void check()}>
                Check filing result
              </Action>
              {retryAllowed && (
                <Action
                  secondary
                  disabled={busy}
                  onClick={() => void submit(request.change, request)}
                >
                  Retry same filing
                </Action>
              )}
            </div>
          )}
          {(request || error) && (
            <Action secondary disabled={busy} onClick={() => void review()}>
              Review current filings
            </Action>
          )}
        </div>
      )}
    </details>
  );
}
