import { z } from "zod";
import { orderedDiagnostics } from "../social/diagnostics.ts";
import { preparationRuntimeSchema } from "../contracts/preparation-runtime.ts";
const preparation = z.strictObject({
  version: z.literal("personal-ordered-preparation-v1"),
  generation: z.number().int().positive(),
  inputBinding: z.string().regex(/^[a-f0-9]{64}$/),
  binding: z.string().regex(/^[a-f0-9]{64}$/),
  creationProvenance: z.strictObject({
    version: z.literal("sandbox-create-receipt-v1"),
    selection: preparationRuntimeSchema,
    sandboxId: z.string().regex(/^vercel:[A-Za-z0-9_-]{1,128}$/),
  }),
});
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
  preparation: preparation.optional(),
  objects: z
    .array(
      z.strictObject({
        ...file,
        assetId: z.string().min(1).max(100),
        key: z.string().max(1024),
        etag: z.string().min(1).max(1024).optional(),
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
