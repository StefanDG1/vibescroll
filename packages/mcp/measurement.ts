export type AssistantObservation = {
  boundary: "backend_forward" | "tool_presentation";
  operation: string;
  durationMs: number;
  responseBytes: number;
  nativeImageBytes: number;
  outcome: "ok" | "denied" | "error" | "unknown";
};
export type AssistantObserver = (
  event: AssistantObservation,
) => void | Promise<void>;

function emit(
  observer: AssistantObserver | undefined,
  event: AssistantObservation,
) {
  try {
    const pending = observer?.(event);
    if (pending) void pending.catch(() => {});
  } catch {
    /* Diagnostics cannot fail user work. */
  }
}

export function sampledAssistantObserver(
  env: Record<string, string | undefined> = process.env,
  random: () => number = Math.random,
  log: (event: AssistantObservation) => void = (event) =>
    console.info("assistant_transport", event),
): AssistantObserver | undefined {
  const rate = Number(env.MCP_MEASUREMENT_SAMPLE_RATE ?? 0);
  if (!Number.isFinite(rate) || rate <= 0 || rate > 1 || random() >= rate)
    return undefined;
  return (event) => {
    // Copy only known scalar fields even if a caller supplies extra properties.
    if (
      !/^(?:[a-z][a-z_]{0,63}|events\/(?:subscribe|unsubscribe))$/.test(
        event.operation,
      )
    )
      return;
    if (
      ![event.durationMs, event.responseBytes, event.nativeImageBytes].every(
        (value) =>
          typeof value === "number" && Number.isFinite(value) && value >= 0,
      )
    )
      return;
    if (
      !["backend_forward", "tool_presentation"].includes(event.boundary) ||
      !["ok", "denied", "error", "unknown"].includes(event.outcome)
    )
      return;
    emit(log, {
      boundary: event.boundary,
      operation: event.operation,
      durationMs: event.durationMs,
      responseBytes: event.responseBytes,
      nativeImageBytes: event.nativeImageBytes,
      outcome: event.outcome,
    });
  };
}

function imageBytes(result: unknown): number {
  if (
    !result ||
    typeof result !== "object" ||
    !("content" in result) ||
    !Array.isArray(result.content)
  )
    return 0;
  return result.content.reduce((sum: number, item: unknown) => {
    if (
      !item ||
      typeof item !== "object" ||
      !("type" in item) ||
      item.type !== "image" ||
      !("data" in item) ||
      typeof item.data !== "string"
    )
      return sum;
    const padding = item.data.endsWith("==")
      ? 2
      : item.data.endsWith("=")
        ? 1
        : 0;
    return sum + Math.max(0, Math.floor((item.data.length * 3) / 4) - padding);
  }, 0);
}

// Bytes are the exact serialized tool result, excluding JSON-RPC/HTTP framing.
export async function measureToolPresentation<T>(
  operation: string,
  observer: AssistantObserver | undefined,
  run: () => Promise<T>,
): Promise<T> {
  if (!observer) return run();
  const started = performance.now();
  try {
    const result = await run();
    const isError =
      !!result &&
      typeof result === "object" &&
      "isError" in result &&
      result.isError === true;
    emit(observer, {
      boundary: "tool_presentation",
      operation,
      durationMs: performance.now() - started,
      responseBytes: new TextEncoder().encode(JSON.stringify(result))
        .byteLength,
      nativeImageBytes: imageBytes(result),
      outcome: isError ? "error" : "ok",
    });
    return result;
  } catch (error) {
    emit(observer, {
      boundary: "tool_presentation",
      operation,
      durationMs: performance.now() - started,
      responseBytes: 0,
      nativeImageBytes: 0,
      outcome: "unknown",
    });
    throw error;
  }
}

// Bytes are the actual backend response body, excluding HTTP framing and DB traffic.
export async function measureBackendForward(
  operation: string,
  observer: AssistantObserver | undefined,
  run: () => Promise<Response>,
  maximumResponseBytes = 262144,
): Promise<Response> {
  if (!observer) return run();
  const started = performance.now();
  try {
    const response = await run();
    let responseBytes = 0;
    let complete = false;
    const reader = response.clone().body?.getReader();
    try {
      if (reader)
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) {
            complete = true;
            break;
          }
          responseBytes += chunk.value.byteLength;
          if (responseBytes > maximumResponseBytes) break;
        }
    } catch {
      /* Preserve response decoding behavior. */
    } finally {
      // A tee cancellation can wait for the original body. Never block decoding it.
      if (reader) void reader.cancel().catch(() => {});
    }
    emit(observer, {
      boundary: "backend_forward",
      operation,
      durationMs: performance.now() - started,
      responseBytes,
      nativeImageBytes: 0,
      outcome: !complete
        ? "unknown"
        : response.ok
          ? "ok"
          : [401, 403].includes(response.status)
            ? "denied"
            : "error",
    });
    return response;
  } catch (error) {
    emit(observer, {
      boundary: "backend_forward",
      operation,
      durationMs: performance.now() - started,
      responseBytes: 0,
      nativeImageBytes: 0,
      outcome: "unknown",
    });
    throw error;
  }
}
