import { z } from "zod";
import { orderedDiagnostics } from "../social/diagnostics.ts";
const common = {
  schemaVersion: z.literal("personal-ordered-media-v1"),
  generation: z.number().int().nonnegative(),
  inputBinding: z.string().regex(/^[a-f0-9]{64}$/),
  metadata: z.unknown(),
  manifest: z.unknown(),
  warnings: z.array(z.string().max(500)).max(20),
  omissions: orderedDiagnostics.shape.omissions,
  preparedAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().positive(),
};
const file = {
  file: z.string().max(100),
  size: z.number().int().positive().max(19500000),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  type: z.enum(["image/jpeg", "audio/wav"]),
};
export const personalOrderedMediaSchema = z.strictObject({
  ...common,
  objects: z
    .array(
      z.strictObject({
        ...file,
        assetId: z.string().min(1).max(100),
        key: z.string().max(1024),
      }),
    )
    .max(83),
});
export const personalOrderedLeaseSchema = z.strictObject({
  ...common,
  objects: z
    .array(
      z.strictObject({
        ...file,
        id: z.string().min(1).max(100),
        url: z.string().max(4096),
      }),
    )
    .max(83),
});
