import { z } from "zod";
import { canonicalJson } from "./canonical-json.mjs";

const snapshotId = z.string().regex(/^snap_[A-Za-z0-9_-]{8,128}$/);
const scopeId = z.string().regex(/^[A-Za-z0-9_-]{1,200}$/);
export const snapshotAuthoritySchema = z.strictObject({
  kind: z.enum(["media", "coding"]),
  snapshotId,
  expiresAt: z.number().int().positive(),
  updatedAt: z.number().int().nonnegative(),
  parentSnapshotId: snapshotId.nullable(),
  projectId: scopeId,
  teamId: scopeId,
});
export type SnapshotAuthority = z.infer<typeof snapshotAuthoritySchema>;
export const preparationRuntimeSchema = z.discriminatedUnion("route", [
  z.strictObject({
    version: z.literal("preparation-runtime-v1"),
    route: z.literal("broker"),
    authority: snapshotAuthoritySchema,
  }),
  z.strictObject({
    version: z.literal("preparation-runtime-v1"),
    route: z.literal("static"),
    kind: z.enum(["media", "coding"]),
    source: z.union([
      z.strictObject({ type: z.literal("snapshot"), snapshotId }),
      z.strictObject({
        type: z.literal("image"),
        image: z.string().regex(/^[A-Za-z0-9/_.-]+@sha256:[a-f0-9]{64}$/),
      }),
    ]),
  }),
]);
export type PreparationRuntime = z.infer<typeof preparationRuntimeSchema>;
export type SandboxCreationProvenance = {
  version: "sandbox-create-receipt-v1";
  selection: PreparationRuntime;
  sandboxId: string;
};

/** Trusted create-input provenance, not an independent provider attestation. */
export function preparationRuntime(
  value: unknown,
  now = Date.now(),
): PreparationRuntime | null {
  const parsed = preparationRuntimeSchema.safeParse(value);
  if (!parsed.success) return null;
  if (
    parsed.data.route === "broker" &&
    (parsed.data.authority.expiresAt <= now + 30000 ||
      parsed.data.authority.updatedAt > now)
  )
    return null;
  return parsed.data;
}
export function samePreparationRuntime(
  a: unknown,
  b: unknown,
  now = Date.now(),
) {
  const left = preparationRuntime(a, now),
    right = preparationRuntime(b, now);
  return !!left && !!right && canonicalJson(left) === canonicalJson(right);
}
export function creationProvenanceCurrent(
  value: unknown,
  expected: PreparationRuntime,
  now = Date.now(),
): value is SandboxCreationProvenance {
  const parsed = z
    .strictObject({
      version: z.literal("sandbox-create-receipt-v1"),
      selection: preparationRuntimeSchema,
      sandboxId: z.string().regex(/^vercel:[A-Za-z0-9_-]{1,128}$/),
    })
    .safeParse(value);
  return (
    parsed.success &&
    samePreparationRuntime(parsed.data.selection, expected, now)
  );
}
