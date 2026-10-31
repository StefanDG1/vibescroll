import { z } from "zod";

// Keep source transcript data separate from provider/transport metadata.
export const apiTranscriptResponse = z.object({
  text: z.string().max(60000),
  language: z.string().min(1).max(40).nullable().optional(),
  durationInSeconds: z
    .number()
    .finite()
    .nonnegative()
    .max(601)
    .nullable()
    .optional(),
  segments: z
    .array(
      z.object({
        text: z.string().max(6000),
        startSecond: z.number().finite(),
        endSecond: z.number().finite(),
      }),
    )
    .max(240)
    .default([]),
});

export function transcriptDiagnostics(value: unknown, durationMs: number) {
  const parsed = apiTranscriptResponse.safeParse(value);
  if (!parsed.success)
    return {
      schemaValid: false,
      issues: parsed.error.issues.slice(0, 12).map(({ code, path }) => ({
        code,
        path: path.map(String).join("."),
      })),
    };
  const d = parsed.data;
  const starts = d.segments.map((s) => Math.round(s.startSecond * 1000));
  const ends = d.segments.map((s) => Math.round(s.endSecond * 1000));
  return {
    schemaValid: true,
    durationMs,
    providerDurationMs:
      d.durationInSeconds == null ? null : d.durationInSeconds * 1000,
    textCharacters: d.text.length,
    segmentCount: d.segments.length,
    firstStartMs: starts.length ? Math.min(...starts) : null,
    lastEndMs: ends.length ? Math.max(...ends) : null,
    endOverflowMs: ends.length
      ? Math.max(0, ...ends.map((end) => end - durationMs))
      : 0,
    invalidIntervalCount: d.segments.filter(
      (s) => s.startSecond < 0 || s.startSecond >= s.endSecond,
    ).length,
    unsortedStartCount: starts.filter((s, i) => i > 0 && starts[i - 1] > s)
      .length,
  };
}
