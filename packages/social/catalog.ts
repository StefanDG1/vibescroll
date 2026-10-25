import { z } from "zod";

// Catalog cards are separate from immutable service-import-v2 saved DTOs.
export const serviceCatalogPageSize = 5;
export const serviceCatalogSummaryLimit = 1200;
export const serviceCatalogQuery = z.string().trim().min(1).max(200);
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
  categories: z.array(z.string().min(1).max(48)).max(9),
  topics: z.array(z.string().min(1).max(48)).max(20),
  creatorId: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
  publishedAt: z.number().int().nonnegative().nullable(),
});
export const serviceCatalogPage = z
  .strictObject({
    version: z.literal("service-catalog-v2"),
    availability: z.enum(["ready", "unavailable"]),
    page: z.array(serviceCatalogCard).max(serviceCatalogPageSize),
    continueCursor: serviceCatalogCursor,
    isDone: z.boolean(),
    query: serviceCatalogQuery.nullable(),
    searchCoverage: z.literal("indexed-eligible-generic-analysis"),
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
