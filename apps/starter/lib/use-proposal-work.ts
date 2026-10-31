"use client";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { FunctionReturnType } from "convex/server";
import type { api } from "../../../convex/_generated/api";
import { useProposalLive } from "./use-source-live";

type Snapshot = FunctionReturnType<typeof api.proposalLoop.read>;
type Call = (operation: string, args: unknown) => Promise<any>;
export function useProposalWork(
  proposalId: string,
  enabled: boolean,
  call?: Call,
) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const [quote, setQuote] = useState<any>();
  const [issuePreview, setIssuePreview] = useState<any>();
  const [older, setOlder] = useState<any[]>([]);
  const [olderCursor, setOlderCursor] = useState<string | null>();
  const flight = useRef(false);
  const pending = useRef<{
    operation: string;
    args: Record<string, unknown>;
  } | null>(null);
  const draftKey = snapshot?.actorId
    ? `vibescroll:proposal-draft:${snapshot.actorId}:${proposalId}`
    : null;
  const storageKey = useRef<string | null>(null);
  const invoke = useEffectEvent((operation: string, args: unknown) =>
    call!(operation, args),
  );
  function receive(value: Snapshot | null) {
    if (value) {
      const key = `vibescroll:proposal-draft:${value.actorId}:${proposalId}`;
      if (storageKey.current !== key) {
        pending.current = null;
        setUncertain(false);
        setDraft("");
        storageKey.current = key;
        try {
          setDraft(localStorage.getItem(key) ?? "");
          const retained = JSON.parse(
            localStorage.getItem(`${key}:request`) ?? "null",
          );
          if (
            retained &&
            [
              "proposalComment",
              "proposalReply",
              "proposalPlanStart",
              "proposalIssueApprove",
            ].includes(retained.operation) &&
            retained.args?.proposalId === proposalId &&
            typeof retained.args.key === "string"
          ) {
            pending.current = retained;
            setUncertain(true);
          }
        } catch {
          /* Browser storage is optional. */
        }
      }
    }
    setSnapshot(value);
    if (!value) {
      try {
        if (storageKey.current) localStorage.removeItem(storageKey.current);
        localStorage.removeItem(`${storageKey.current}:request`);
      } catch {
        /* Storage may be unavailable. */
      }
      setDraft("");
      setOlder([]);
      setOlderCursor(undefined);
      pending.current = null;
      setUncertain(false);
      setQuote(undefined);
      setIssuePreview(undefined);
      setError("Your access changed. Reopen this plan after signing in.");
    }
  }
  const accept = useEffectEvent(receive);
  const connected = !!call;
  useProposalLive(proposalId, enabled && connected, receive);
  useEffect(() => {
    if (!enabled || !connected) return;
    let current = true;
    void invoke("proposalDiscussion", { proposalId })
      .then((value) => {
        if (current) accept(value);
      })
      .catch(() => {
        if (current)
          setError("Could not load this discussion. Your plan is still saved.");
      });
    return () => {
      current = false;
    };
  }, [proposalId, enabled, connected]);
  const quoteBinding = snapshot
    ? `${snapshot.version}:${snapshot.discussionRevision}`
    : "";
  const autoQuote =
    enabled &&
    !!snapshot?.generatedVersion &&
    !!snapshot.current &&
    !["queued", "running", "unknown"].includes(snapshot.operation?.state ?? "");
  useEffect(() => {
    if (!autoQuote) return;
    let current = true;
    void invoke("proposalPlanQuote", { proposalId })
      .then((value) => {
        if (current) setQuote(value);
      })
      .catch(() => {
        if (current) setQuote(undefined);
      });
    return () => {
      current = false;
    };
  }, [autoQuote, quoteBinding, proposalId]);
  function updateDraft(text: string) {
    setDraft(text);
    try {
      if (draftKey) {
        if (text) localStorage.setItem(draftKey, text);
        else localStorage.removeItem(draftKey);
      }
    } catch {
      /* Keep the in-memory draft. */
    }
  }
  async function refresh() {
    if (call) receive(await call("proposalDiscussion", { proposalId }));
  }
  async function run(fn: () => Promise<void>) {
    if (flight.current || !call) return;
    flight.current = true;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not confirm this action. Check its status before retrying.",
      );
    } finally {
      flight.current = false;
      setBusy(false);
    }
  }
  async function mutate(operation: string, args: Record<string, unknown>) {
    if (!call) return;
    // An unknown HTTP reply retries the identical operation and key. A status
    // read or a different click cannot silently turn it into another charge.
    if (pending.current && pending.current.operation !== operation)
      throw Error("Check or retry the previous action first.");
    pending.current ??= { operation, args };
    try {
      if (draftKey)
        localStorage.setItem(
          `${draftKey}:request`,
          JSON.stringify(pending.current),
        );
    } catch {
      /* The current view retains the same key. */
    }
    try {
      const result = await call(
        pending.current.operation,
        pending.current.args,
      );
      pending.current = null;
      setUncertain(false);
      try {
        if (draftKey) localStorage.removeItem(`${draftKey}:request`);
      } catch {
        /* Optional browser storage. */
      }
      return result;
    } catch (e) {
      if (
        e &&
        typeof e === "object" &&
        "outcome" in e &&
        e.outcome === "rejected"
      ) {
        pending.current = null;
        setUncertain(false);
        try {
          if (draftKey) localStorage.removeItem(`${draftKey}:request`);
        } catch {
          /* Optional browser storage. */
        }
      } else setUncertain(true);
      throw e;
    }
  }
  return {
    snapshot,
    error,
    busy,
    draft,
    updateDraft,
    quote,
    issuePreview,
    uncertain,
    retryPending: () =>
      run(async () => {
        const previous = pending.current;
        if (!previous) return;
        await mutate(previous.operation, previous.args);
        if (
          ["proposalComment", "proposalReply"].includes(previous.operation) &&
          previous.args.text === draft.trim()
        )
          updateDraft("");
        await refresh();
      }),
    hasOlder: !!snapshot && !snapshot.messages.isDone && olderCursor !== null,
    messages: [
      ...new Map(
        [...older, ...(snapshot?.messages.page ?? [])].map((m) => [m.id, m]),
      ).values(),
    ].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id)),
    refresh: () => run(refresh),
    send: () =>
      run(async () => {
        if (!snapshot || !draft.trim()) return;
        const sent = pending.current?.args.text ?? draft.trim();
        const paidReply = !!snapshot.generatedVersion;
        if (paidReply && !quote)
          throw Error("Wait for the current reply quote or refresh this plan.");
        await mutate(paidReply ? "proposalReply" : "proposalComment", {
          proposalId,
          expectedVersion: snapshot.version,
          key: crypto.randomUUID(),
          text: draft.trim(),
          ...(paidReply
            ? { quoteId: quote.quoteId, maximumCredits: quote.maximumCredits }
            : {}),
        });
        if (sent === draft.trim()) updateDraft("");
        await refresh();
        setQuote(undefined);
      }),
    loadOlder: () =>
      run(async () => {
        if (
          !call ||
          !snapshot ||
          snapshot.messages.isDone ||
          olderCursor === null
        )
          return;
        const cursor = olderCursor ?? snapshot.messages.continueCursor;
        const r = await call("proposalDiscussion", { proposalId, cursor });
        setOlder((previous) => {
          const merged = [
            ...new Map(
              [...previous, ...r.messages.page].map((m: any) => [m.id, m]),
            ).values(),
          ] as any[];
          return merged;
        });
        setOlderCursor(r.messages.isDone ? null : r.messages.continueCursor);
      }),
    getQuote: () =>
      run(async () => {
        if (call) setQuote(await call("proposalPlanQuote", { proposalId }));
      }),
    generate: () =>
      run(async () => {
        if (!quote) return;
        await mutate("proposalPlanStart", {
          proposalId,
          expectedVersion: quote.version,
          quoteId: quote.quoteId,
          maximumCredits: quote.maximumCredits,
          key: crypto.randomUUID(),
        });
        setQuote(undefined);
        await refresh();
      }),
    previewIssue: () =>
      run(async () => {
        if (call)
          setIssuePreview(await call("proposalIssuePreview", { proposalId }));
      }),
    approve: () =>
      run(async () => {
        if (!issuePreview) return;
        await mutate("proposalIssueApprove", {
          proposalId,
          expectedVersion: issuePreview.version,
          contextHash: issuePreview.contextHash,
          visibility: issuePreview.visibility,
          key: crypto.randomUUID(),
          acknowledged: true,
        });
        setIssuePreview(undefined);
        await refresh();
      }),
    retryIssue: () =>
      run(async () => {
        if (!snapshot?.issueOperation || !call) return;
        await call("proposalIssueRetry", {
          proposalId,
          operationId: snapshot.issueOperation.id,
        });
        await refresh();
      }),
  };
}
