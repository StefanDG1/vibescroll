import { z } from "zod";
import { createHash } from "node:crypto";
import {
  analysisVersionOutput,
  validateVersionOutput,
} from "../contracts/analysis-versions";
import {
  preparedAnalysisInstructions,
  validatePreparedEvidence,
} from "../contracts/prepared-evidence";
import { neutralCloudObservations } from "../contracts/cloud-catalog";
import { ensure } from "../policy";
import { readResponseBytes } from "./binary";

export const preparedInsightModel = "meta/muse-spark-1.3-contributor" as const;

export async function analyzePreparedEvidence(args: {
  sourceId: string;
  attemptId: string;
  prepared: unknown;
  frames: { id: string; bytes: Uint8Array }[];
  apiKey: string;
  maximumUsd: number;
  contributorAllowed: boolean;
  fetch?: typeof fetch;
  onReceipt?: (receipt: Record<string, unknown>) => Promise<void>;
}) {
  const prepared = await validatePreparedEvidence(args.prepared),
    e = prepared.evidence;
  ensure(
    args.contributorAllowed &&
      args.apiKey.length > 10 &&
      args.maximumUsd >= 0.02 &&
      args.maximumUsd <= 0.1,
    "DATA_POLICY_REQUIRED",
    "Use an explicitly funded Contributor-compatible evidence request.",
  );
  ensure(
    args.frames.length === e.frames.length &&
      args.frames.every((f, i) => {
        const expected = e.frames[i];
        return (
          f.id === expected.id &&
          f.bytes.byteLength === expected.bytes &&
          createHash("sha256").update(f.bytes).digest("hex") ===
            expected.sha256 &&
          f.bytes[0] === 255 &&
          f.bytes[1] === 216 &&
          f.bytes[2] === 255
        );
      }),
    "INVALID_EVIDENCE",
    "Model inputs must contain every exact prepared source JPEG.",
  );
  const transport = args.fetch ?? fetch;
  const catalog = await transport("https://ai-gateway.vercel.sh/v1/models", {
    signal: AbortSignal.timeout(10000),
  });
  ensure(
    catalog.ok,
    "MODEL_UNAVAILABLE",
    "Gateway model pricing is unavailable.",
  );
  const models = await catalog.json(),
    model = models.data?.find(
      (m: { id: string }) => m.id === preparedInsightModel,
    );
  ensure(
    model?.modalities?.input?.includes("image") &&
      model.tags?.includes("structured-output") &&
      Number(model.pricing?.input) <= 0.0000001 &&
      Number(model.pricing?.output) <= 0.0000002,
    "QUOTE_CHANGED",
    "The selected vision model price or capability changed.",
  );
  const binding = {
    sourceId: args.sourceId,
    attemptId: args.attemptId,
    evidenceHash: e.evidenceHash,
    postRevisionHash: e.sourceRevisionHash,
  };
  const packet = {
    ...binding,
    metadata: prepared.metadata,
    durationMs: e.durationMs,
    transcript: e.segments,
    evidence: neutralCloudObservations(e),
    frames: e.frames,
  };
  ensure(
    new TextEncoder().encode(JSON.stringify(packet)).length <= 250000 &&
      e.frames.every((f) => f.width <= 960 && f.height <= 960),
    "INVALID_EVIDENCE",
    "The analysis input exceeds its reserved evidence bound.",
  );
  const content: Record<string, unknown>[] = [
    { type: "text", text: JSON.stringify(packet) },
  ];
  for (const frame of args.frames) {
    content.push(
      { type: "text", text: `Source frame ${frame.id}` },
      {
        type: "image_url",
        image_url: {
          url: `data:image/jpeg;base64,${Buffer.from(frame.bytes).toString("base64")}`,
        },
      },
    );
  }
  const startedAt = Date.now();
  // No automatic retry. Client cancellation does not establish provider cancellation.
  const response = await transport(
    "https://ai-gateway.vercel.sh/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${args.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: preparedInsightModel,
        reasoning: { effort: "medium" },
        providerOptions: { gateway: { only: ["meta"] } },
        max_tokens: 6000,
        messages: [
          { role: "system", content: preparedAnalysisInstructions },
          { role: "user", content },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "vibescroll_analysis",
            strict: true,
            schema: z.toJSONSchema(analysisVersionOutput),
          },
        },
      }),
      signal: AbortSignal.timeout(120000),
    },
  );
  ensure(
    response.ok,
    "PROVIDER_ERROR",
    "Gateway analysis did not confirm completion; preserve its reservation.",
  );
  const bytes = await readResponseBytes(response, 500000);
  ensure(
    bytes.byteLength <= 500000,
    "INVALID_EVIDENCE",
    "Gateway response exceeded its bound.",
  );
  const result = JSON.parse(new TextDecoder().decode(bytes));
  ensure(
    result.model === preparedInsightModel &&
      result.choices?.[0]?.finish_reason === "stop" &&
      typeof result.choices[0].message?.content === "string",
    "PROVIDER_ERROR",
    "The selected model did not return a complete result.",
  );
  const inputTokens = result.usage?.prompt_tokens,
    outputTokens = result.usage?.completion_tokens;
  ensure(
    Number.isSafeInteger(inputTokens) &&
      inputTokens >= 0 &&
      Number.isSafeInteger(outputTokens) &&
      outputTokens >= 0,
    "COST_RECONCILIATION_REQUIRED",
    "Gateway usage is missing; preserve the reservation.",
  );
  const rateEstimateUsd = inputTokens * 0.0000001 + outputTokens * 0.0000002;
  const receipt = {
    model: result.model,
    provider: "meta",
    effort: "medium",
    startedAt,
    completedAt: Date.now(),
    requestId: result.id ?? null,
    inputTokens,
    outputTokens,
    rateEstimateUsd,
    providerSettledUsd: null,
  };
  await args.onReceipt?.(receipt);
  ensure(
    rateEstimateUsd <= args.maximumUsd,
    "COST_RECONCILIATION_REQUIRED",
    "Analysis usage exceeded its reserved cost.",
  );
  const output = validateVersionOutput(
    JSON.parse(result.choices[0].message.content),
    { ...binding, evidence: neutralCloudObservations(e) },
  );
  return {
    output,
    receipt,
  };
}
