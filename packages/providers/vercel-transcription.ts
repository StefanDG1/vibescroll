import { createHash } from "node:crypto";
import { ensure } from "../policy";
import { readResponseBytes } from "./binary";
import {
  apiTranscriptResponse,
  transcriptDiagnostics,
} from "../contracts/transcription";

export const preparedAsrModel = "microsoft/mai-transcribe-2" as const;

export function normalizedApiTranscript(value: unknown, durationMs: number) {
  const result = apiTranscriptResponse.parse(value);
  const segments = result.segments.map((s, i) => ({
    id: `speech-${i + 1}`,
    text: s.text.trim(),
    startMs: Math.round(s.startSecond * 1000),
    endMs: Math.round(s.endSecond * 1000),
  }));
  ensure(
    Number.isSafeInteger(durationMs) &&
      durationMs > 0 &&
      durationMs <= 600000 &&
      (!result.text.trim() || segments.length > 0) &&
      (!result.durationInSeconds ||
        Math.abs(result.durationInSeconds * 1000 - durationMs) <= 1000) &&
      segments.every(
        (s, i) =>
          s.text.length > 0 &&
          s.text.length <= 6000 &&
          s.startMs >= 0 &&
          s.startMs < s.endMs &&
          s.endMs <= durationMs &&
          (i === 0 || segments[i - 1].startMs <= s.startMs),
      ),
    "INVALID_EVIDENCE",
    "Transcription timing or speech coverage is invalid.",
  );
  return { segments, language: result.language ?? "und" };
}

export async function transcribePreparedAudio(
  audio: Uint8Array,
  durationMs: number,
  maximumUsd: number,
  options: {
    apiKey: string;
    fetch?: typeof fetch;
    onReceipt?: (receipt: Record<string, unknown>) => Promise<void>;
    onTranscript?: (response: unknown) => Promise<void>;
  },
) {
  ensure(
    audio.byteLength > 44 &&
      audio.byteLength <= 19500000 &&
      options.apiKey.length > 10,
    "SETUP_REQUIRED",
    "Use bounded prepared audio and a configured Gateway credential.",
  );
  const costCeilingUsd = (durationMs / 1000) * 0.00002778;
  ensure(
    maximumUsd >= costCeilingUsd && maximumUsd <= 0.1,
    "BUDGET_EXCEEDED",
    "Reserve the bounded transcription cost before dispatch.",
  );
  const transport = options.fetch ?? fetch;
  const catalog = await transport("https://ai-gateway.vercel.sh/v1/models", {
    signal: AbortSignal.timeout(10000),
  });
  ensure(
    catalog.ok,
    "MODEL_UNAVAILABLE",
    "Gateway transcription pricing is unavailable.",
  );
  const models = await catalog.json();
  const model = models.data?.find(
    (m: { id: string }) => m.id === preparedAsrModel,
  );
  ensure(
    model?.type === "transcription" &&
      Number(model.pricing?.transcription_duration_cost_per_second) <=
        0.00002778,
    "QUOTE_CHANGED",
    "The selected transcription price or capability changed.",
  );
  const startedAt = Date.now();
  // One dispatch only. A timeout retains the reservation; it never selects a paid fallback.
  const response = await transport(
    "https://ai-gateway.vercel.sh/v4/ai/transcription-model",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
        "ai-gateway-protocol-version": "0.0.1",
        "ai-transcription-model-specification-version": "4",
        "ai-model-id": preparedAsrModel,
      },
      body: JSON.stringify({
        audio: Buffer.from(audio).toString("base64"),
        mediaType: "audio/wav",
      }),
      signal: AbortSignal.timeout(45000),
    },
  );
  ensure(
    response.ok,
    "PROVIDER_ERROR",
    "Gateway transcription did not confirm completion; reconcile its reservation.",
  );
  const bytes = await readResponseBytes(response, 500000);
  ensure(
    bytes.byteLength <= 500000,
    "INVALID_EVIDENCE",
    "Transcription response exceeded its bound.",
  );
  const raw = JSON.parse(new TextDecoder().decode(bytes));
  const receipt = {
    responseBytes: bytes.byteLength,
    responseSha256: createHash("sha256").update(bytes).digest("hex"),
    diagnostics: transcriptDiagnostics(raw, durationMs),
    generationId:
      typeof raw.providerMetadata?.gateway?.generationId === "string"
        ? raw.providerMetadata.gateway.generationId.slice(0, 100)
        : null,
    model: preparedAsrModel,
    provider: "azure",
    startedAt,
    completedAt: Date.now(),
    requestId:
      response.headers.get("x-vercel-ai-gateway-generation-id") ??
      response.headers.get("x-vercel-id"),
    costCeilingUsd,
    providerSettledUsd: null,
  };
  await options.onReceipt?.(receipt);
  // Commit the bounded private response before coordinate validation.
  // A validator fix can reuse returned speech without another ASR request.
  await options.onTranscript?.(apiTranscriptResponse.parse(raw));
  const result = normalizedApiTranscript(raw, durationMs);
  return {
    ...result,
    provenance: {
      origin: result.segments.length ? ("api_asr" as const) : ("none" as const),
      model: preparedAsrModel,
      provider: "azure",
      inputSha256: createHash("sha256").update(audio).digest("hex"),
    },
    receipt,
  };
}
