"use client";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { FunctionReturnType } from "convex/server";
import type { api } from "../../../convex/_generated/api";
import { useProposalLive } from "./use-source-live";
import {
  proposalDraftMemory,
  type PendingProposalRequest,
  type ProposalDraftStorage,
} from "./proposal-draft-memory";
import {
  confirmedProcessingRejection,
  processingRecovery,
  type ProcessingRecovery,
} from "./processing-recovery";

type Snapshot = FunctionReturnType<typeof api.proposalLoop.read>;
type Call = (operation: string, args: unknown) => Promise<any>;
export function useProposalWork(
  proposalId: string,
  enabled: boolean,
  call?: Call,
  transport: "web" | "mcp" = "web",
  draftStorage?: ProposalDraftStorage,
) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>();
  const [error, setError] = useState("");
  const [recovery, setRecovery] = useState<ProcessingRecovery>();
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const [quote, setQuote] = useState<any>();
  const [issuePreview, setIssuePreview] = useState<any>();
  const [older, setOlder] = useState<any[]>([]);
  const [olderCursor, setOlderCursor] = useState<string | null>();
  const flight = useRef(false);
  const liveRevision = useRef(0);
  const pending = useRef<PendingProposalRequest | null>(null);
  const draftKey = snapshot?.actorId
    ? `vibescroll:proposal-draft:${snapshot.actorId}:${proposalId}`
    : null;
  const storageKey = useRef<string | null>(null);
  const storage = () => draftStorage ?? localStorage;
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
        const volatile = proposalDraftMemory.read(key);
        const restore = (
          retained: PendingProposalRequest | null | undefined,
        ) => {
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
        };
        try {
          setDraft(storage().getItem(key) ?? volatile?.text ?? "");
          const retained = JSON.parse(
            storage().getItem(`${key}:request`) ?? "null",
          );
          restore(retained ?? volatile?.pending);
        } catch {
          setDraft(volatile?.text ?? "");
          restore(volatile?.pending);
        }
      }
    }
    setSnapshot(value);
    if (!value) {
      if (storageKey.current) proposalDraftMemory.clear(storageKey.current);
      try {
        if (storageKey.current) storage().removeItem(storageKey.current);
        storage().removeItem(`${storageKey.current}:request`);
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
  useProposalLive(
    proposalId,
    enabled && connected && transport === "web",
    (value) => {
      liveRevision.current++;
      receive(value);
    },
  );
  useEffect(() => {
    if (!enabled || !connected) return;
    let current = true;
    const revision = liveRevision.current;
    void invoke("proposalDiscussion", { proposalId })
      .then((value) => {
        if (current && liveRevision.current === revision) accept(value);
      })
      .catch(() => {
        if (current && liveRevision.current === revision)
          setError("Could not load this discussion. Your plan is still saved.");
      });
    return () => {
      current = false;
    };
  }, [proposalId, enabled, connected]);
  // MCP uses its existing OAuth tool transport. It never requests website cookies
  // or realtime credentials from inside the sandboxed host frame.
  const observe = useEffectEvent(async () => {
    return invoke("proposalDiscussion", { proposalId });
  });
  useEffect(() => {
    if (transport !== "mcp" || !enabled || !connected) return;
    let active = true,
      flight = false;
    let started = Date.now();
    const read = async (resume = false) => {
      if (!active || document.hidden || flight) return;
      if (resume) started = Date.now();
      if (Date.now() - started >= 300000) {
        clearInterval(timer);
        setError(
          "Live updates paused. Refresh this saved plan to check its current status.",
        );
        return;
      }
      flight = true;
      try {
        const value = await observe();
        if (active) {
          liveRevision.current++;
          accept(value);
        }
      } catch (failure) {
        if (active) {
          if (
            failure instanceof Error &&
            "code" in failure &&
            ["FORBIDDEN", "AUTH_REQUIRED", "PAYMENT_REQUIRED"].includes(
              String(failure.code),
            )
          )
            accept(null);
          else
            setError(
              "Updates paused. Refresh this saved plan to check its current status.",
            );
        }
      } finally {
        flight = false;
      }
    };
    const timer = setInterval(() => {
      void read();
    }, 5000);
    const resume = () => {
      if (!document.hidden) void read(true);
    };
    document.addEventListener("visibilitychange", resume);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [proposalId, transport, enabled, connected]);
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
      .catch((error) => {
        if (current) {
          const reason = processingRecovery(error, "quote");
          setQuote(undefined);
          setRecovery(reason);
          setError(reason.detail);
        }
      });
    return () => {
      current = false;
    };
  }, [autoQuote, quoteBinding, proposalId]);
  function updateDraft(text: string) {
    setDraft(text);
    if (draftKey) proposalDraftMemory.draft(draftKey, text);
    try {
      if (draftKey) {
        if (text) storage().setItem(draftKey, text);
        else storage().removeItem(draftKey);
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
    setRecovery(undefined);
    try {
      await fn();
    } catch (e) {
      if (
        e instanceof Error &&
        "code" in e &&
        e.code === "UI_DRAFT_STORAGE_FULL"
      ) {
        const detail =
          "Draft recovery storage is full. No request was sent. Keep this plan open while you resolve another pending action, then recover this same request.";
        setRecovery({
          title: "Keep this plan open",
          detail,
          action: "refresh_status",
          confirmedRejection: true,
        });
        setError(detail);
        return;
      }
      const reason = processingRecovery(e, pending.current ? "start" : "quote");
      setRecovery(reason);
      setError(reason.detail);
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
    const volatileSaved =
      !!draftKey && proposalDraftMemory.request(draftKey, pending.current);
    let persisted = false;
    try {
      if (draftKey) {
        storage().setItem(
          `${draftKey}:request`,
          JSON.stringify(pending.current),
        );
        persisted = true;
      }
    } catch {
      /* The current view retains the same key. */
    }
    if (!volatileSaved && !persisted) {
      setUncertain(true);
      throw Object.assign(new Error("Draft recovery storage is full."), {
        code: "UI_DRAFT_STORAGE_FULL",
      });
    }
    try {
      const result = await call(
        pending.current.operation,
        pending.current.args,
      );
      pending.current = null;
      if (draftKey) proposalDraftMemory.request(draftKey, null);
      setUncertain(false);
      try {
        if (draftKey) storage().removeItem(`${draftKey}:request`);
      } catch {
        /* Optional browser storage. */
      }
      return result;
    } catch (e) {
      if (confirmedProcessingRejection(e)) {
        pending.current = null;
        if (draftKey) proposalDraftMemory.request(draftKey, null);
        setUncertain(false);
        setQuote(undefined);
        try {
          if (draftKey) storage().removeItem(`${draftKey}:request`);
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
    recovery,
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
        setQuote(undefined);
        await refresh();
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
