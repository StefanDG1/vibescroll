import { createHash } from "node:crypto";
import {
  apiModelSelection,
  apiTokenCost,
  type ApiEffort,
} from "../contracts/api-models";
import {
  validatePreparedEvidence,
  preparedAnalysisInstructions,
} from "../contracts/prepared-evidence";
import { neutralCloudObservations } from "../contracts/cloud-catalog";
import { validateVersionOutput } from "../contracts/analysis-versions";
import {
  preparedInsightBody,
  preparedInsightProviderSchema,
} from "./vercel-insights";
import { ensure, PolicyError } from "../policy";
import { readResponseBytes } from "./binary";

export type OpenAiGrantAuthority = {
  id: string;
  organizationId: string;
  projectId: string;
  validUntil: number;
  noPaidBillingPlan: true;
  allowedModels: string[];
};

export async function analyzeOpenAiPreparedEvidence(args: {
  sourceId: string;
  attemptId: string;
  prepared: unknown;
  frames: { id: string; bytes: Uint8Array }[];
  model: string;
  effort?: ApiEffort;
  apiKey: string;
  grant: OpenAiGrantAuthority;
  maximumNanoUsd: number;
  fetch?: typeof fetch;
  onDispatch?: (dispatch: {
    requestHash: string;
    inputTokens: number;
    maximumOutputTokens: number;
    model: string;
    effort: string;
    maximumNanoUsd: number;
  }) => Promise<void>;
  onReceipt: (receipt: Record<string, unknown>) => Promise<void>;
  onOutput: (receipt: Record<string, unknown>) => Promise<void>;
  onValidation?: (receipt: Record<string, unknown>) => Promise<void>;
}) {
  const model = apiModelSelection(args.model, args.effort);
  ensure(
    model.provider === "openai_responses" &&
      args.grant.allowedModels.includes(model.id) &&
      args.grant.noPaidBillingPlan === true &&
      Number.isSafeInteger(args.grant.validUntil) &&
      args.grant.validUntil > Date.now() &&
      /^org-[A-Za-z0-9]{10,100}$/.test(args.grant.organizationId) &&
      /^proj_[A-Za-z0-9]{10,100}$/.test(args.grant.projectId) &&
      args.apiKey.startsWith("sk-") &&
      Number.isSafeInteger(args.maximumNanoUsd) &&
      args.maximumNanoUsd > 0 &&
      args.maximumNanoUsd <= 50000000,
    "SETUP_REQUIRED",
    "The selected OpenAI grant route is unavailable.",
  );
  const prepared = await validatePreparedEvidence(args.prepared),
    e = prepared.evidence;
  ensure(
    args.frames.length === e.frames.length &&
      args.frames.every((frame, i) => {
        const expected = e.frames[i];
        return (
          frame.id === expected.id &&
          frame.bytes.byteLength === expected.bytes &&
          createHash("sha256").update(frame.bytes).digest("hex") ===
            expected.sha256 &&
          frame.bytes[0] === 255 &&
          frame.bytes[1] === 216 &&
          frame.bytes[2] === 255 &&
          expected.width <= 960 &&
          expected.height <= 960
        );
      }),
    "INVALID_EVIDENCE",
    "Use every exact retained source JPEG.",
  );
  const packet = {
    metadata: prepared.metadata,
    durationMs: e.durationMs,
    transcript: e.segments,
    evidence: neutralCloudObservations(e),
    frames: e.frames,
  };
  ensure(
    Buffer.byteLength(JSON.stringify(packet), "utf8") <= 250000,
    "INVALID_EVIDENCE",
    "The retained analysis packet exceeds its bound.",
  );
  const content: Record<string, unknown>[] = [
    { type: "input_text", text: JSON.stringify(packet) },
  ];
  for (const frame of args.frames)
    content.push(
      { type: "input_text", text: `Source frame ${frame.id}` },
      {
        type: "input_image",
        detail: "auto",
        image_url: `data:image/jpeg;base64,${Buffer.from(frame.bytes).toString("base64")}`,
      },
    );
  const semantic = {
    model: model.id,
    instructions: preparedAnalysisInstructions,
    input: [{ role: "user", content }],
    reasoning: { effort: model.effort },
    text: {
      format: {
        type: "json_schema",
        name: "vibescroll_analysis",
        strict: true,
        schema: preparedInsightProviderSchema(neutralCloudObservations(e)),
      },
    },
  };
  const semanticJson = JSON.stringify(semantic);
  ensure(
    Buffer.byteLength(semanticJson, "utf8") <= 2000000,
    "INVALID_EVIDENCE",
    "The multimodal request exceeds its byte bound.",
  );
  const requestHash = createHash("sha256").update(semanticJson).digest("hex");
  const transport = args.fetch ?? fetch;
  const headers = {
    Authorization: `Bearer ${args.apiKey}`,
    "Content-Type": "application/json",
    "OpenAI-Organization": args.grant.organizationId,
    "OpenAI-Project": args.grant.projectId,
  };
  // Count the identical semantic input, including images and the strict schema.
  // No character heuristic or undocumented image multiplier decides admission.
  const counted = await transport(
    "https://api.openai.com/v1/responses/input_tokens",
    {
      method: "POST",
      headers,
      body: semanticJson,
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    },
  );
  ensure(
    counted.ok,
    "PROVIDER_ERROR",
    "The provider did not confirm the input count. No analysis was dispatched.",
  );
  const count = JSON.parse(
    new TextDecoder().decode(await readResponseBytes(counted, 20000)),
  );
  ensure(
    count.object === "response.input_tokens" &&
      Number.isSafeInteger(count.input_tokens) &&
      count.input_tokens > 0 &&
      count.input_tokens <= 48000,
    "BUDGET_EXCEEDED",
    "The counted input exceeds this analysis quote.",
  );
  const quoted = apiTokenCost(
    model.id,
    count.input_tokens,
    model.maximumOutputTokens,
  );
  ensure(
    quoted.ceilingNanoUsd <= args.maximumNanoUsd &&
      args.grant.validUntil > Date.now(),
    "BUDGET_EXCEEDED",
    "The exact counted request exceeds its funding reservation.",
  );
  await args.onDispatch?.({
    requestHash,
    inputTokens: count.input_tokens,
    maximumOutputTokens: model.maximumOutputTokens,
    model: model.id,
    effort: model.effort,
    maximumNanoUsd: quoted.ceilingNanoUsd,
  });
  const startedAt = Date.now();
  // One generation only. A timeout does not prove cancellation or authorize retry.
  const response = await transport("https://api.openai.com/v1/responses", {
    method: "POST",
    headers,
    redirect: "error",
    signal: AbortSignal.timeout(120000),
    body: JSON.stringify({
      ...semantic,
      store: false,
      service_tier: "default",
      max_output_tokens: model.maximumOutputTokens,
    }),
  });
  const raw = await readResponseBytes(response, 500000);
  let result: any;
  try {
    result = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    result = null;
  }
  const messages = Array.isArray(result?.output)
    ? result.output.filter((item: any) => item?.type === "message")
    : [];
  const texts = messages
    .flatMap((item: any) => (Array.isArray(item.content) ? item.content : []))
    .filter(
      (item: any) =>
        item?.type === "output_text" && typeof item.text === "string",
    );
  const visible = texts.map((item: any) => item.text).join("");
  const usage = result?.usage;
  let cost: ReturnType<typeof apiTokenCost> | null = null;
  try {
    cost = apiTokenCost(
      model.id,
      usage?.input_tokens,
      usage?.output_tokens,
      usage?.input_tokens_details?.cached_tokens ?? 0,
    );
  } catch {
    /* Retain the returned status/output before rejecting invalid usage. */
  }
  const receipt = {
    protocol: "openai-responses-prepared-v1",
    provider: "openai",
    model: result?.model ?? model.id,
    requestedModel: model.id,
    effort: model.effort,
    reportedEffort:
      typeof result?.reasoning?.effort === "string"
        ? result.reasoning.effort
        : null,
    serviceTier: result?.service_tier ?? null,
    requestId: result?.id ?? response.headers.get("x-request-id"),
    httpStatus: response.status,
    startedAt,
    completedAt: Date.now(),
    requestHash,
    inputCount: count.input_tokens,
    inputTokens: usage?.input_tokens ?? null,
    outputTokens: usage?.output_tokens ?? null,
    cachedTokens: usage?.input_tokens_details?.cached_tokens ?? 0,
    reasoningTokens: usage?.output_tokens_details?.reasoning_tokens ?? null,
    providerStatus: result?.status ?? null,
    funding: {
      route: "openai_promotional_grant",
      authorityId: args.grant.id,
      cashFallbackAllowed: false,
    },
    providerSettledUsd: null,
    nominalNanoUsd: cost?.nominalNanoUsd ?? null,
    ceilingNanoUsd: cost?.ceilingNanoUsd ?? null,
    rateEstimateUsd: cost ? cost.ceilingNanoUsd / 1e9 : null,
    responseSha256: createHash("sha256").update(raw).digest("hex"),
  };
  await args.onReceipt(receipt);
  await args.onOutput({
    model: receipt.model,
    requestId: receipt.requestId,
    content: visible,
    responseSha256: receipt.responseSha256,
    receivedAt: receipt.completedAt,
  });
  try {
    ensure(
      response.ok &&
        result?.status === "completed" &&
        result.model === model.id &&
        (!result.reasoning?.effort ||
          result.reasoning.effort === model.effort) &&
        result.service_tier === "default" &&
        Array.isArray(result.output) &&
        result.output.every((item: any) =>
          ["message", "reasoning"].includes(item?.type),
        ) &&
        messages.length === 1 &&
        messages[0].role === "assistant" &&
        texts.length === 1 &&
        !messages[0].content.some((item: any) => item?.type === "refusal"),
      "PROVIDER_ERROR",
      "The selected model did not return a complete Standard analysis. Its receipt remains retained.",
    );
    ensure(
      cost &&
        usage.input_tokens <= 48000 &&
        usage.output_tokens <= model.maximumOutputTokens &&
        cost.ceilingNanoUsd <= args.maximumNanoUsd,
      "COST_RECONCILIATION_REQUIRED",
      "Returned usage exceeded its funded analysis.",
    );
    const binding = {
      sourceId: args.sourceId,
      attemptId: args.attemptId,
      evidenceHash: e.evidenceHash,
      postRevisionHash: e.sourceRevisionHash,
    };
    const body = preparedInsightBody.parse(JSON.parse(visible));
    const output = validateVersionOutput(
      { schemaVersion: "analysis-version-output-v1", ...binding, ...body },
      { ...binding, evidence: neutralCloudObservations(e) },
    );
    return { output, receipt };
  } catch (error) {
    await args.onValidation?.({
      code:
        error instanceof PolicyError
          ? error.code
          : "OPENAI_OUTPUT_VALIDATION_FAILED",
      requestId: receipt.requestId,
      responseSha256: receipt.responseSha256,
      at: Date.now(),
    });
    throw new PolicyError(
      "INVALID_EVIDENCE",
      "The OpenAI analysis was not accepted. Its returned response and usage remain retained.",
    );
  }
}
