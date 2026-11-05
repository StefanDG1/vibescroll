import { defineTable } from "convex/server";
import { v } from "convex/values";

export const providerFundingTables = {
  providerFundingPools: defineTable({
    pool: v.string(),
    limitNanoUsd: v.number(),
    legacyExposureNanoUsd: v.number(),
    heldNanoUsd: v.number(),
    spentNanoUsd: v.number(),
    blocked: v.boolean(),
    updatedAt: v.number(),
  }).index("by_pool", ["pool"]),
  providerFundingReservations: defineTable({
    pool: v.string(),
    operationKey: v.string(),
    requestHash: v.string(),
    policyId: v.string(),
    maximumNanoUsd: v.number(),
    state: v.union(
      v.literal("reserved"),
      v.literal("dispatched"),
      v.literal("unknown"),
      v.literal("settled"),
      v.literal("released"),
    ),
    dispatches: v.array(
      v.union(
        v.literal("analysis"),
        v.literal("transcription"),
        v.literal("proposal"),
      ),
    ),
    actualNanoUsd: v.optional(v.number()),
    receiptHash: v.optional(v.string()),
    basis: v.optional(
      v.union(
        v.literal("reported_tariff_usage"),
        v.literal("confirmed_zero"),
        v.literal("unknown"),
      ),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_pool_operation", ["pool", "operationKey"]),
};
