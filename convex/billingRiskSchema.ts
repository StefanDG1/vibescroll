import { defineTable } from "convex/server";
import { v } from "convex/values";

export const billingRiskTables = {
  billingRiskHolds: defineTable({
    organizationId: v.id("organizations"),
    key: v.string(),
    accountId: v.string(),
    mode: v.union(v.literal("test"), v.literal("live")),
    kind: v.union(v.literal("dispute"), v.literal("fraud_warning")),
    providerId: v.string(),
    chargeId: v.string(),
    invoiceId: v.optional(v.string()),
    subscriptionId: v.optional(v.string()),
    state: v.union(v.literal("held"), v.literal("released")),
    eventId: v.string(),
    reviewedReason: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_org_state", ["organizationId", "state"])
    .index("by_state", ["state"]),
};
