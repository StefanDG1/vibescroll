import { z } from "zod";
export const prerequisiteIds = [
  "windows",
  "node",
  "paired_configuration",
  "local_docker_endpoint",
  "docker_linux_engine",
  "media_image",
  "codex_image",
  "offline_transcription",
  "saved_account",
  "disk_space",
] as const;
const report = z.strictObject({
  version: z.literal(1),
  kind: z.literal("local_prerequisites"),
  readyForLocalStart: z.boolean(),
  processingReady: z.literal("unverified"),
  checks: z
    .array(
      z.strictObject({
        id: z.enum(prerequisiteIds),
        status: z.enum(["passed", "blocked", "unknown"]),
        repair: z.string().max(400).optional(),
      }),
    )
    .length(prerequisiteIds.length),
  limits: z.array(z.string().max(400)).max(4),
});
export function parsePreflightReport(input: unknown) {
  if (JSON.stringify(input).length > 16384)
    throw Error("INVALID_INPUT: Keep the diagnostic report under 16 KiB.");
  const parsed = report.parse(input);
  if (
    new Set(parsed.checks.map((c) => c.id)).size !== prerequisiteIds.length ||
    parsed.readyForLocalStart !==
      parsed.checks.every((c) => c.status === "passed")
  )
    throw Error("INVALID_INPUT: Inconsistent prerequisite report.");
  return {
    passed: parsed.readyForLocalStart,
    checks: parsed.checks.map(({ id, status }) => ({ id, status })),
  };
}
