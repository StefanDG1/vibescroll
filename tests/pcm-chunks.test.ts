import { expect, it } from "vitest";
import { pcmChunks } from "../packages/media/pcm-chunks";
import { inferencePayload } from "../packages/policy/inference-broker";
function wav(samples: number, fact = false) {
  const bytes = new Uint8Array((fact ? 56 : 44) + samples * 2),
    view = new DataView(bytes.buffer);
  const text = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) bytes[offset + i] = s.charCodeAt(i);
  };
  text(0, "RIFF");
  view.setUint32(4, bytes.length - 8, true);
  text(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true);
  view.setUint32(28, 32000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  if (fact) {
    text(36, "fact");
    view.setUint32(40, 4, true);
    view.setUint32(44, samples, true);
  }
  const header = fact ? 56 : 44;
  text(header - 8, "data");
  view.setUint32(header - 4, samples * 2, true);
  for (let i = header; i < bytes.length; i++) bytes[i] = i % 251;
  return bytes;
}
it("preserves every PCM sample across at most ten bounded actual WAV chunks and exact offsets", () => {
  const source = wav(16000 * 600),
    result = pcmChunks(source);
  expect(result).toHaveLength(10);
  expect(result.map((c) => c.offsetMs)).toEqual(
    Array.from({ length: 10 }, (_, i) => i * 60000),
  );
  expect(
    result.every((c) => c.bytes.length === 1_920_044 && c.durationMs === 60000),
  ).toBe(true);
  const joined = new Uint8Array(result.reduce((n, c) => n + c.samples * 2, 0));
  result.forEach((c) => joined.set(c.bytes.subarray(44), c.offsetSamples * 2));
  expect(Buffer.from(joined).equals(Buffer.from(source.subarray(44)))).toBe(
    true,
  );
});
it("uses actual sample duration for a short final chunk and rewrites a validated fact count", () => {
  const result = pcmChunks(wav(16000 * 60 + 17, true));
  expect(result[1]).toMatchObject({
    offsetSamples: 960000,
    samples: 17,
    offsetMs: 60000,
    durationMs: 17 / 16,
  });
  expect(new DataView(result[1].bytes.buffer).getUint32(44, true)).toBe(17);
  expect(pcmChunks(result[1].bytes)[0].samples).toBe(17);
});
it.each([20, 22, 24, 28, 32, 34])(
  "refuses changed format/header field at %i",
  (offset) => {
    const bytes = wav(160);
    bytes[offset] ^= 1;
    expect(() => pcmChunks(bytes)).toThrow("INVALID_ORDERED_PCM");
  },
);
it("rejects trailing bytes, truncation, inconsistent lengths, fact counts and duration overflow", () => {
  const good = wav(160);
  expect(() => pcmChunks(good.subarray(0, -1))).toThrow();
  const trailing = new Uint8Array(good.length + 1);
  trailing.set(good);
  expect(() => pcmChunks(trailing)).toThrow();
  const fact = wav(160, true);
  new DataView(fact.buffer).setUint32(44, 159, true);
  expect(() => pcmChunks(fact)).toThrow();
  const odd = wav(160);
  new DataView(odd.buffer).setUint32(40, 319, true);
  expect(() => pcmChunks(odd)).toThrow();
  expect(() => pcmChunks(wav(16000 * 600 + 1))).toThrow();
});
it("allows only the documented added WAV MIME without changing broker byte/output/cost limits", () => {
  const value = {
    prompt: "Transcribe synthetic audio",
    schema: {},
    parts: [{ inlineData: { mimeType: "audio/wav", data: "AAAA" } }],
    maxOutput: 1024,
    maxMicros: 1,
  };
  expect(inferencePayload.parse(value).parts).toHaveLength(1);
  for (const mimeType of ["audio/pcm", "video/mp4", "application/octet-stream"])
    expect(() =>
      inferencePayload.parse({
        ...value,
        parts: [{ inlineData: { mimeType, data: "AAAA" } }],
      }),
    ).toThrow();
  expect(() =>
    inferencePayload.parse({ ...value, maxMicros: 100001 }),
  ).toThrow();
});
