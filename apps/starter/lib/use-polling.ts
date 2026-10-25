"use client";
import { useEffect, useEffectEvent } from "react";
import { startPolling } from "../../../packages/browser/polling";

export function usePolling(
  refresh: () => Promise<unknown>,
  interval: number | null,
  enabled: boolean,
  scope: string,
  immediate = true,
) {
  const poll = useEffectEvent(refresh);
  useEffect(() => {
    if (enabled) return startPolling(() => poll(), interval, immediate);
  }, [enabled, interval, scope, immediate]);
}
