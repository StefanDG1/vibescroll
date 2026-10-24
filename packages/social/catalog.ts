import { z } from "zod";

// Catalog cards are separate from immutable service-import-v1 saved DTOs.
export const serviceCatalogPageSize = 5;
export const serviceCatalogSummaryLimit = 1200;
export const serviceCatalogCursor = z.string().min(1).max(8192).nullable();
export const serviceCatalogCard = z.strictObject({
  artifactId: z.string().min(1).max(256),
  compatibilityKey: z.string().regex(/^[a-f0-9]{64}$/),
  title: z.string().min(1).max(240),
  summary: z.string().max(serviceCatalogSummaryLimit),
  summaryTruncated: z.boolean(),
  sourceUrl: z
    .url()
    .max(2048)
    .refine((url) => url.startsWith("https://")),
  platform: z.enum(["instagram", "tiktok"]),
  language: z.string().min(1).max(100),
  insightCount: z.number().int().min(0).max(1000),
  availableUntil: z.number().finite().positive(),
});
export const serviceCatalogPage = z
  .strictObject({
    version: z.literal("service-catalog-v1"),
    availability: z.enum(["ready", "unavailable"]),
    page: z.array(serviceCatalogCard).max(serviceCatalogPageSize),
    continueCursor: serviceCatalogCursor,
    isDone: z.boolean(),
  })
  .superRefine((value, ctx) => {
    if (
      value.isDone !== (value.continueCursor === null) ||
      (value.availability === "unavailable" &&
        (value.page.length > 0 || !value.isDone))
    )
      ctx.addIssue({ code: "custom", message: "Invalid catalog continuation" });
  });
export type ServiceCatalogCard = z.infer<typeof serviceCatalogCard>;
export type ServiceCatalogPage = z.infer<typeof serviceCatalogPage>;
