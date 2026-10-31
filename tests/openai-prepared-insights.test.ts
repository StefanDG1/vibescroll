import { expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { syntheticJpeg } from "./cloud-frame-fixture";
import { makePreparedEvidence } from "../packages/contracts/prepared-evidence";
import { analyzeOpenAiPreparedEvidence } from "../packages/providers/openai-prepared-insights";

async function fixture() {
  const bytes = Buffer.from(syntheticJpeg, "base64");
  const prepared = await makePreparedEvidence({
    requestedCanonical: "https://www.instagram.com/reel/ABCdef12345/",
    canonical: "https://www.instagram.com/reel/ABCdef12345/",
    platform: "instagram",
    sourceHash: "a".repeat(64),
    recipeHash: "b".repeat(64),
    downloaderVersion: "2026.10.26",
    title: "Synthetic demonstration",
    authorName: "creator",
    durationMs: 10000,
    language: "en",
    observedAt: Date.now(),
    transcript: {
      origin: "platform_manual",
      model: null,
      provider: null,
      inputSha256: "c".repeat(64),
    },
    segments: [
      { id: "speech-1", startMs: 0, endMs: 1000, text: "Check the evidence." },
    ],
    frames: [
      {
        id: "frame-1",
        timestampMs: 1000,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        bytes: bytes.length,
        width: 2,
        height: 2,
      },
    ],
  });
  const body = {
    summary: "Cited synthetic lesson",
    warnings: [],
    insights: [
      {
        id: "point_1",
        kind: "lesson",
        title: "Check evidence",
        claim: "Check the evidence.",
        interpretation: "Verify the claim.",
        categories: ["coding"],
        confidence: "supported",
        verificationNeeds: [],
        evidence: [
          {
            kind: "video_observation",
            id: "speech-1",
            startMs: 0,
            endMs: 1000,
          },
        ],
      },
    ],
  };
  const response: any = {
    id: "resp_synthetic",
    status: "completed",
    model: "gpt-6-luna",
    service_tier: "default",
    output: [
      {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: JSON.stringify(body) }],
      },
    ],
    usage: {
      input_tokens: 100,
      output_tokens: 200,
      input_tokens_details: { cached_tokens: 20 },
      output_tokens_details: { reasoning_tokens: 50 },
    },
  };
  const requests: { url: string; body: any }[] = [],
    receipts: any[] = [],
    outputs: any[] = [],
    validations: any[] = [];
  const fetch = vi.fn<typeof globalThis.fetch>(async (url, init) => {
    requests.push({ url: String(url), body: JSON.parse(init!.body as string) });
    if (String(url).endsWith("input_tokens"))
      return Response.json({
        object: "response.input_tokens",
        input_tokens: 100,
      });
    return Response.json(response);
  });
  const args = {
    sourceId: "source",
    attemptId: "attempt",
    prepared,
    frames: [{ id: "frame-1", bytes }],
    model: "gpt-6-luna",
    apiKey: "sk-synthetic-no-authority",
    grant: {
      id: "synthetic-grant",
      organizationId: "org-" + "a".repeat(20),
      projectId: "proj_" + "b".repeat(20),
      validUntil: Date.now() + 60000,
      noPaidBillingPlan: true as const,
      allowedModels: ["gpt-6-luna"],
    },
    maximumNanoUsd: 25000000,
    fetch,
    onReceipt: async (r: any) => {
      receipts.push(r);
    },
    onOutput: async (r: any) => {
      outputs.push(r);
    },
    onValidation: async (r: any) => {
      validations.push(r);
    },
  };
  return {
    args,
    requests,
    receipts,
    outputs,
    validations,
    response,
    body,
    fetch,
  };
}

it("counts the same exact image/schema packet before one Standard response, retaining truthful usage before validation", async () => {
  const f = await fixture();
  const result = await analyzeOpenAiPreparedEvidence(f.args);
  expect(f.requests).toHaveLength(2);
  const { store, service_tier, max_output_tokens, ...generated } =
    f.requests[1].body;
  expect(generated).toEqual(f.requests[0].body);
  expect({ store, service_tier, max_output_tokens }).toEqual({
    store: false,
    service_tier: "default",
    max_output_tokens: 12000,
  });
  expect(generated.input[0].content[2]).toMatchObject({
    type: "input_image",
    detail: "auto",
    image_url: expect.stringMatching(/^data:image\/jpeg;base64,/),
  });
  expect(generated.text.format.strict).toBe(true);
  expect(generated.reasoning.effort).toBe("max");
  expect(result.output).toMatchObject({
    sourceId: "source",
    attemptId: "attempt",
    summary: f.body.summary,
    evidenceHash: f.args.prepared.evidence.evidenceHash,
  });
  expect(result.receipt).toEqual(f.receipts[0]);
  expect(result.receipt).toMatchObject({
    provider: "openai",
    inputTokens: 100,
    outputTokens: 200,
    cachedTokens: 20,
    reasoningTokens: 50,
    nominalNanoUsd: 108200,
    ceilingNanoUsd: 110200,
    funding: { route: "openai_promotional_grant", cashFallbackAllowed: false },
    providerSettledUsd: null,
  });
  expect(f.outputs[0].content).toBe(JSON.stringify(f.body));
  expect(f.validations).toHaveLength(0);
});

it("stops before any provider request for expired authority, an unapproved model or changed JPEG bytes", async () => {
  const f = await fixture();
  await expect(
    analyzeOpenAiPreparedEvidence({
      ...f.args,
      grant: { ...f.args.grant, validUntil: Date.now() - 1 },
    }),
  ).rejects.toThrow();
  await expect(
    analyzeOpenAiPreparedEvidence({ ...f.args, model: "gpt-6.1-sol" }),
  ).rejects.toThrow();
  const changed = Uint8Array.from(f.args.frames[0].bytes);
  changed[5] ^= 1;
  await expect(
    analyzeOpenAiPreparedEvidence({
      ...f.args,
      frames: [{ id: "frame-1", bytes: changed }],
    }),
  ).rejects.toThrow("INVALID_EVIDENCE");
  expect(f.fetch).not.toHaveBeenCalled();
});

it("does not generate when exact counting exceeds the input or funding bound", async () => {
  const f = await fixture();
  await expect(
    analyzeOpenAiPreparedEvidence({ ...f.args, maximumNanoUsd: 1000000 }),
  ).rejects.toThrow("BUDGET_EXCEEDED");
  expect(f.requests).toHaveLength(1);
  const fetch = vi.fn<typeof globalThis.fetch>(async () =>
    Response.json({ object: "response.input_tokens", input_tokens: 48001 }),
  );
  await expect(
    analyzeOpenAiPreparedEvidence({ ...f.args, fetch }),
  ).rejects.toThrow("BUDGET_EXCEEDED");
  expect(fetch).toHaveBeenCalledTimes(1);
});

it.each([
  "refusal",
  "incomplete",
  "other-model",
  "fast",
  "bad-citation",
  "missing-usage",
])(
  "retains %s failures without a repair request or model/funding substitution",
  async (kind) => {
    const f = await fixture();
    if (kind === "refusal")
      f.response.output[0].content = [
        { type: "refusal", refusal: "Synthetic refusal" },
      ];
    if (kind === "incomplete") f.response.status = "incomplete";
    if (kind === "other-model") f.response.model = "gpt-6.1-sol";
    if (kind === "fast") f.response.service_tier = "priority";
    if (kind === "bad-citation") {
      f.body.insights[0].evidence[0].id = "invented";
      f.response.output[0].content[0].text = JSON.stringify(f.body);
    }
    if (kind === "missing-usage") delete f.response.usage;
    await expect(analyzeOpenAiPreparedEvidence(f.args)).rejects.toThrow(
      "INVALID_EVIDENCE",
    );
    expect(f.requests).toHaveLength(2);
    expect(f.receipts).toHaveLength(1);
    expect(f.outputs).toHaveLength(1);
    expect(f.validations).toHaveLength(1);
  },
);

it("does not retry an unacknowledged generation", async () => {
  const f = await fixture();
  const fetch = vi.fn<typeof globalThis.fetch>(async (url, init) => {
    if (String(url).endsWith("input_tokens"))
      return Response.json({
        object: "response.input_tokens",
        input_tokens: 100,
      });
    expect(JSON.parse(init!.body as string).model).toBe("gpt-6-luna");
    throw Error("Synthetic network timeout");
  });
  await expect(
    analyzeOpenAiPreparedEvidence({ ...f.args, fetch }),
  ).rejects.toThrow("Synthetic network timeout");
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(f.receipts).toHaveLength(0);
});
