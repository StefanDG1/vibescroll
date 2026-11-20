"use client";
import { useEffect, useEffectEvent } from "react";
import { ConvexClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";
import { workspaceAccessLost } from "./workspace-access";

export function useSourceLive(
  sourceId: string,
  enabled: boolean,
  update: (value: any) => void,
) {
  useMetadataLive("one", JSON.stringify({ sourceId }), enabled, update);
}

export function usePostsLive(
  organizationId: string,
  sourceIds: string[],
  enabled: boolean,
  update: (value: any) => void,
  withEngagement = false,
  withFeedHead = false,
) {
  useMetadataLive(
    withFeedHead ? "feed" : "many",
    JSON.stringify({
      organizationId,
      sourceIds: [...new Set(sourceIds)].slice(0, 20),
      ...(withEngagement ? { withEngagement: true } : {}),
    }),
    enabled && (withFeedHead || sourceIds.length > 0),
    update,
  );
}

export function useProposalLive(
  proposalId: string,
  enabled: boolean,
  update: (value: any) => void,
) {
  useMetadataLive("proposal", JSON.stringify({ proposalId }), enabled, update);
}
export function useTrendsLive(
  organizationId: string,
  windowDays: 7 | 30,
  dayUTC: number,
  enabled: boolean,
  update: (value: any) => void,
) {
  useMetadataLive(
    "trends",
    JSON.stringify({ organizationId, windowDays, dayUTC }),
    enabled,
    update,
  );
}

function useMetadataLive(
  mode: "one" | "many" | "proposal" | "feed" | "trends",
  scope: string,
  enabled: boolean,
  update: (value: any) => void,
) {
  const receive = useEffectEvent(update);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let client: ConvexClient | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const session = async () => {
      const response = await fetch("/api/realtime/session", {
        method: "POST",
        cache: "no-store",
        signal: controller.signal,
      });
      if (response.status === 401 && !controller.signal.aborted) receive(null);
      if (!response.ok)
        throw Object.assign(Error("Session unavailable"), { status: response.status });
      return (await response.json()) as { url: string; token: string };
    };
    const connect = (retryAllowed: boolean) => void session()
      .then((initial) => {
        if (controller.signal.aborted) return;
        client = new ConvexClient(initial.url, {
          unsavedChangesWarning: false,
          logger: false,
        });
        let first = true;
        client.setAuth(async () => {
          if (first) {
            first = false;
            return initial.token;
          }
          try {
            return (await session()).token;
          } catch {
            return null;
          }
        });
        client.onUpdate(
          mode === "trends"
            ? api.postTrends.read
            : mode === "feed"
              ? api.preparedAnalysis.feedLive
              : mode === "proposal"
                ? api.proposalLoop.read
                : mode === "one"
                  ? api.preparedAnalysis.live
                  : api.preparedAnalysis.liveMany,
          JSON.parse(scope),
          (value) => {
            if (!controller.signal.aborted) receive(value);
          },
          (error) => {
            if (controller.signal.aborted) return;
            // Connection and query failures do not stand in for a deleted record.
            // Still withdraw data on explicit authorization or retention errors.
            if (workspaceAccessLost(error) ||
                /\b(?:FORBIDDEN|SOURCE_UNAVAILABLE):/.test(error?.message ?? ""))
              receive(null);
          },
        );
      })
      .catch((error) => {
        const transient = error instanceof TypeError ||
          (typeof error?.status === "number" && error.status >= 500);
        if (transient && retryAllowed && !controller.signal.aborted)
          retry = setTimeout(() => connect(false), 2000);
      });
    connect(true);
    return () => {
      controller.abort();
      clearTimeout(retry);
      void client?.close();
    };
  }, [mode, scope, enabled]);
}
