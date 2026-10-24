import { z } from "zod";
export const orderedDiagnostics = z.strictObject({
  warnings: z.array(z.string().max(500)).max(20),
  omissions: z
    .array(
      z.strictObject({
        id: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),
        index: z.number().int().min(0).max(34),
        reason: z.literal("decode_unavailable"),
      }),
    )
    .max(35)
    .superRefine((items, ctx) => {
      if (
        new Set(items.map((item) => item.id)).size !== items.length ||
        new Set(items.map((item) => item.index)).size !== items.length
      )
        ctx.addIssue({ code: "custom", message: "Duplicate omitted child" });
    }),
});
export const emptyOrderedDiagnostics = { warnings: [], omissions: [] };
export const audioTimingWarning =
  "Audio transcript times are approximate model estimates within actual PCM sample boundaries.";
export function mergeOrderedWarnings(model: string[], fixed: string[]) {
  // Fixed acquisition disclosures come first and cannot be removed by the model.
  return [...new Set([...fixed, ...model])].slice(0, 20);
}
