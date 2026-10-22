import type { AdapterContext } from "./types";

export const sourceLimits = {
  github: {
    files: 20,
    fileBytes: 65536,
    totalBytes: 524288,
    requests: 30,
    listing: 1000,
  },
  reddit: { comments: 50, depth: 3, totalBytes: 262144, requests: 10 },
  deadlineMs: 60000,
  textCharacters: 60000,
} as const;
export class SourceAdapterError extends Error {
  constructor(
    public code: "unavailable" | "rate_limited" | "needs_supplied_text",
    public reason: string,
    public retryAt?: number,
  ) {
    super(reason);
  }
}
// Persist this state atomically at service scope, never once per source/workspace.
// scope is an opaque scheduler key. No URL, source ID or content belongs here.
export type ProviderQuotaState = {
  remaining: number;
  resetAt: number;
  blockedUntil: number;
  lastScope?: string;
  consecutive: number;
};
export function reserveProviderRequest(
  state: ProviderQuotaState,
  scope: string,
  now: number,
  otherScopeWaiting = false,
) {
  if (
    !/^[A-Za-z0-9_-]{1,100}$/.test(scope) ||
    !Number.isSafeInteger(state.remaining) ||
    state.remaining < 0 ||
    !Number.isSafeInteger(state.resetAt) ||
    !Number.isSafeInteger(state.blockedUntil) ||
    !Number.isSafeInteger(state.consecutive) ||
    state.consecutive < 0
  )
    throw Error("INVALID_PROVIDER_QUOTA");
  if (state.blockedUntil > now || state.remaining === 0 || state.resetAt <= now)
    return {
      allowed: false as const,
      state,
      reason: "provider_budget",
      retryAt: Math.max(state.blockedUntil, state.resetAt),
    };
  if (otherScopeWaiting && state.lastScope === scope && state.consecutive >= 3)
    return { allowed: false as const, state, reason: "fairness" };
  return {
    allowed: true as const,
    state: {
      ...state,
      remaining: state.remaining - 1,
      lastScope: scope,
      consecutive: state.lastScope === scope ? state.consecutive + 1 : 1,
    },
  };
}
export function providerRetryAt(
  headers: Record<string, string | undefined>,
  now: number,
) {
  const retry = headers["retry-after"];
  const seconds = retry && /^\d{1,6}$/.test(retry) ? Number(retry) : NaN;
  const date = retry && !Number.isFinite(seconds) ? Date.parse(retry) : NaN;
  const reset = headers["x-ratelimit-reset"];
  const resetAt =
    reset && /^\d{1,12}$/.test(reset) ? Number(reset) * 1000 : NaN;
  const candidate = Number.isFinite(seconds)
    ? now + seconds * 1000
    : Number.isFinite(date)
      ? date
      : resetAt;
  return Number.isSafeInteger(candidate) &&
    candidate > now &&
    candidate <= now + 86400000
    ? candidate
    : undefined;
}
export class SourceRequestBudget {
  private requests = 0;
  private bytes = 0;
  readonly startedAt: number;
  readonly signal = AbortSignal.timeout(sourceLimits.deadlineMs);
  constructor(
    private context: AdapterContext,
    private provider: "github" | "reddit",
  ) {
    this.startedAt = this.now();
  }
  now() {
    return this.context.now?.() ?? Date.now();
  }
  async json(url: string, maximum: number): Promise<unknown> {
    const caps = sourceLimits[this.provider];
    if (
      this.signal.aborted ||
      this.now() - this.startedAt >= sourceLimits.deadlineMs ||
      this.requests >= caps.requests
    )
      throw new SourceAdapterError("unavailable", "retrieval_limit");
    const claim = await this.context.claimProviderRequest?.(
      this.provider,
      this.now(),
    );
    if (claim && !claim.allowed)
      throw new SourceAdapterError(
        "rate_limited",
        "shared_provider_budget",
        claim.retryAt,
      );
    this.requests++;
    const response = await this.context.transport({
      provider: this.provider,
      url,
      signal: this.signal,
    });
    await this.context.observeProviderResponse?.(
      this.provider,
      response.headers,
      this.now(),
    );
    if (
      response.status === 429 ||
      (response.status === 403 &&
        response.headers["x-ratelimit-remaining"] === "0")
    )
      throw new SourceAdapterError(
        "rate_limited",
        "provider_rate_limit",
        providerRetryAt(response.headers, this.now()),
      );
    if (response.status !== 200)
      throw new SourceAdapterError(
        this.provider === "reddit" ? "needs_supplied_text" : "unavailable",
        `provider_http_${response.status >= 100 && response.status <= 599 ? response.status : "invalid"}`,
      );
    const contentType = response.headers["content-type"] ?? "";
    if (
      !/^application\/(?:[\w.+-]*\+)?json(?:;|$)/i.test(contentType) ||
      (response.headers["content-encoding"] &&
        response.headers["content-encoding"] !== "identity")
    )
      throw new SourceAdapterError("unavailable", "invalid_provider_response");
    const declared = response.headers["content-length"];
    if (declared && (!/^\d+$/.test(declared) || Number(declared) > maximum))
      throw new SourceAdapterError("unavailable", "response_byte_limit");
    let length = 0;
    const chunks: Uint8Array[] = [];
    try {
      for await (const chunk of response.body) {
        length += chunk.byteLength;
        this.bytes += chunk.byteLength;
        if (
          length > maximum ||
          this.bytes > caps.totalBytes ||
          this.signal.aborted ||
          this.now() - this.startedAt >= sourceLimits.deadlineMs
        )
          throw new SourceAdapterError("unavailable", "response_byte_limit");
        chunks.push(chunk);
      }
    } finally {
      if (length)
        await this.context.recordResponseBytes?.(this.provider, length);
    }
    const buffer = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      buffer.set(chunk, offset);
      offset += chunk.length;
    }
    try {
      return JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(buffer),
      );
    } catch {
      throw new SourceAdapterError("unavailable", "malformed_provider_json");
    }
  }
}

export function acquisitionFailure(error: unknown) {
  return error instanceof SourceAdapterError
    ? {
        status: error.code,
        reason: error.reason,
        ...(error.retryAt ? { retryAt: error.retryAt } : {}),
      }
    : {
        status: "unavailable" as const,
        reason: "invalid_or_unavailable_source",
      };
}
