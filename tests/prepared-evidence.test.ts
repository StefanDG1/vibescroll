import { expect, it } from "vitest";
import {
  makePreparedEvidence,
  validatePreparedEvidence,
} from "../packages/contracts/prepared-evidence";
import {
  normalizedApiTranscript,
  transcribePreparedAudio,
} from "../packages/providers/vercel-transcription";

const base = {
  requestedCanonical: "https://www.instagram.com/reel/ABCdef12345/",
  canonical: "https://www.instagram.com/reel/ABCdef12345/",
  platform: "instagram" as const,
  sourceHash: "a".repeat(64),
  recipeHash: "b".repeat(64),
  downloaderVersion: "2026.10.26",
  title: "A public demonstration",
  authorName: "creator",
  durationMs: 10000,
  language: "en",
  observedAt: 1793268000000,
  transcript: {
    origin: "api_asr" as const,
    model: "microsoft/mai-transcribe-2",
    provider: "azure",
    inputSha256: "c".repeat(64),
  },
  segments: [
    {
      id: "speech-1",
      startMs: 0,
      endMs: 1500,
      text: "This is a demonstration.",
    },
  ],
  frames: [
    {
      id: "frame-1",
      timestampMs: 1000,
      sha256: "d".repeat(64),
      bytes: 2000,
      width: 540,
      height: 960,
    },
  ],
};

it("keeps evidence identity independent of observation time and binds actual source, recipe and transcript", async () => {
  const first = await makePreparedEvidence(base);
  const repeated = await makePreparedEvidence({
    ...base,
    observedAt: base.observedAt + 10000,
  });
  expect(first.evidence.evidenceHash).toBe(repeated.evidence.evidenceHash);
  expect(
    (await makePreparedEvidence({ ...base, sourceHash: "e".repeat(64) }))
      .evidence.evidenceHash,
  ).not.toBe(first.evidence.evidenceHash);
  const changed = structuredClone(first);
  changed.evidence.segments[0].text = "Invented statement.";
  await expect(validatePreparedEvidence(changed)).rejects.toThrow(
    /TRANSCRIPT_HASH/,
  );
  const changedAuthor = structuredClone(first);
  changedAuthor.metadata.authorName = "Another creator";
  await expect(validatePreparedEvidence(changedAuthor)).rejects.toThrow(
    /HASH_INVALID/,
  );
  const changedAsr = structuredClone(first);
  changedAsr.transcript.model = "another-model";
  await expect(validatePreparedEvidence(changedAsr)).rejects.toThrow(
    /HASH_INVALID/,
  );
});

it("rejects out-of-source frames and fake visual observations before model dispatch", async () => {
  await expect(
    makePreparedEvidence({
      ...base,
      frames: [{ ...base.frames[0], timestampMs: 10000 }],
    }),
  ).rejects.toThrow(/COORDINATES/);
  const value = await makePreparedEvidence(base);
  value.evidence.observations[1].text = "The email was successfully sent.";
  await expect(validatePreparedEvidence(value)).rejects.toThrow(/REFERENCE/);
});

it("accepts no speech without manufacturing a transcript and rejects unaligned text", () => {
  expect(
    normalizedApiTranscript(
      { text: "", language: null, durationInSeconds: null },
      10000,
    ),
  ).toEqual({ segments: [], language: "und" });
  expect(
    normalizedApiTranscript({ text: "", segments: [] }, 10000).segments,
  ).toEqual([]);
  expect(() =>
    normalizedApiTranscript({ text: "Speech", segments: [] }, 10000),
  ).toThrow(/INVALID_EVIDENCE/);
  expect(() =>
    normalizedApiTranscript(
      {
        text: "Speech",
        segments: [{ text: "Speech", startSecond: 9, endSecond: 11 }],
      },
      10000,
    ),
  ).toThrow(/INVALID_EVIDENCE/);
});

it("blocks a transcription price increase before the paid endpoint", async () => {
  const requests: string[] = [];
  const transport: typeof fetch = async (url) => {
    requests.push(String(url));
    return Response.json({
      data: [
        {
          id: "microsoft/mai-transcribe-2",
          type: "transcription",
          pricing: { transcription_duration_cost_per_second: "0.01" },
        },
      ],
    });
  };
  await expect(
    transcribePreparedAudio(new Uint8Array(100), 10000, 0.01, {
      apiKey: "test-key-only-not-a-credential",
      fetch: transport,
    }),
  ).rejects.toThrow(/QUOTE_CHANGED/);
  expect(requests).toEqual(["https://ai-gateway.vercel.sh/v1/models"]);
});

it("dispatches transcription once and preserves ambiguous failure instead of retrying or changing model", async () => {
  const requests: string[] = [];
  const transport: typeof fetch = async (url) => {
    requests.push(String(url));
    if (requests.length === 1)
      return Response.json({
        data: [
          {
            id: "microsoft/mai-transcribe-2",
            type: "transcription",
            pricing: { transcription_duration_cost_per_second: "0.00002778" },
          },
        ],
      });
    throw new DOMException("Timed out", "TimeoutError");
  };
  await expect(
    transcribePreparedAudio(new Uint8Array(100), 10000, 0.01, {
      apiKey: "test-key-only-not-a-credential",
      fetch: transport,
    }),
  ).rejects.toThrow(/Timed out/);
  expect(requests).toHaveLength(2);
});
