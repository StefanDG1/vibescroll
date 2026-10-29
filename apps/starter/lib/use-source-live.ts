"use client";
import { useEffect, useEffectEvent } from "react";
import { ConvexClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";

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
) {
  useMetadataLive(
    "many",
    JSON.stringify({
      organizationId,
      sourceIds: [...new Set(sourceIds)].slice(0, 20),
    }),
    enabled && sourceIds.length > 0,
    update,
  );
}

function useMetadataLive(
  mode: "one" | "many",
  scope: string,
  enabled: boolean,
  update: (value: any) => void,
) {
  const receive = useEffectEvent(update);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let client: ConvexClient | undefined;
    const session = async () => {
      const response = await fetch("/api/realtime/session", {
        method: "POST",
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) throw Error("Session unavailable");
      return (await response.json()) as { url: string; token: string };
    };
    void session()
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
          mode === "one"
            ? api.preparedAnalysis.live
            : api.preparedAnalysis.liveMany,
          JSON.parse(scope),
          (value) => {
            if (!controller.signal.aborted) receive(value);
          },
          () => {
            if (!controller.signal.aborted) receive(null);
          },
        );
      })
      .catch(() => {
        /* The existing authenticated refresh remains the fallback. */
      });
    return () => {
      controller.abort();
      void client?.close();
    };
  }, [mode, scope, enabled]);
}
