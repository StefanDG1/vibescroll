import { defineTable } from "convex/server";
import { v } from "convex/values";
export const pilotPaymentTables = {
  pilotPaymentObservations: defineTable({
    organizationId: v.id("organizations"),
    key: v.string(),
    event: v.literal("payment_verified"),
    mode: v.union(v.literal("test"), v.literal("live")),
    purchaseKind: v.union(
      v.literal("monthly_subscription"),
      v.literal("topup"),
    ),
    properties: v.object({
      schema_version: v.literal("1"),
      mode: v.union(v.literal("test"), v.literal("live")),
      purchase_kind: v.union(
        v.literal("monthly_subscription"),
        v.literal("topup"),
      ),
    }),
    state: v.union(v.literal("pending"), v.literal("withdrawn")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_key", ["key"])
    .index("by_org_state", ["organizationId", "state", "createdAt"]),
};
