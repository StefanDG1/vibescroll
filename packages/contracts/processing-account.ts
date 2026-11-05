import { z } from "zod";

export const processingAccountInput = z.strictObject({
  profileId: z.string().min(1).max(100).optional(),
});
export const processingAdmissionOutput = z.strictObject({
  allowed: z.boolean(),
  reason: z.string().max(100).nullable(),
  message: z.string().max(300).nullable(),
  dimension: z
    .enum(["hour", "day", "pilot", "credits", "provider", "setup"])
    .nullable(),
  retryAt: z.number().int().nonnegative().nullable(),
  limit: z.number().int().nonnegative().nullable(),
  used: z.number().int().nonnegative().nullable(),
});
export const processingAccountOutput = z.strictObject({
  version: z.literal("processing-account-v1"),
  availableCredits: z.number().int().nonnegative(),
  reservedCredits: z.number().int().nonnegative(),
  expiredReservedCredits: z.number().int().nonnegative(),
  observedAt: z.number().int().nonnegative(),
  nextExpiry: z.number().int().nonnegative().nullable(),
  allowanceKind: z.enum(["admin", "paid", "legacy"]),
  monthlyAllowance: z.number().int().nonnegative().nullable(),
  nextRenewal: z.number().int().nonnegative().nullable(),
  processing: processingAdmissionOutput,
  reviewUrl: z.url().startsWith("https://scroll.companynerve.com/app/"),
});
export type ProcessingAdmission = z.infer<typeof processingAdmissionOutput>;
export type ProcessingAccountSummary = z.infer<typeof processingAccountOutput>;
