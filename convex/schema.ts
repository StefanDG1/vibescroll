import { assistantTables } from "./assistantSchema";
import { creatorTables } from "./creatorSchema";
import { librarySpacesTables } from "./librarySpacesSchema";
import { productTables } from "./productSchema";
import { knowledgeTables } from "./knowledgeSchema";
import { improvementTables } from "./improvementSchema";
import { libraryScanTables } from "./libraryScanSchema";
import { dashboardTables } from "./dashboardSchema";
import { localLibraryTables } from "./localLibrarySchema";
import { publicTables } from "./publicSchema";
import { sourceTables } from "./sourceSchema";
import { pilotPaymentTables } from "./pilotPaymentSchema";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  paidAllowanceValue,
  checkoutAllowanceValue,
} from "../packages/billing/allowance-policy";
export const role = v.union(
  v.literal("owner"),
  v.literal("admin"),
  v.literal("member"),
  v.literal("viewer"),
);
export default defineSchema({
  ...assistantTables,
  ...creatorTables,
  ...librarySpacesTables,
  ...productTables,
  ...knowledgeTables,
  ...improvementTables,
  ...libraryScanTables,
  ...dashboardTables,
  ...localLibraryTables,
  ...publicTables,
  ...sourceTables,
  ...pilotPaymentTables,
  users: defineTable({
    subject: v.string(),
    email: v.string(),
    name: v.string(),
    status: v.union(v.literal("active"), v.literal("deleting")),
    createdAt: v.number(),
    profileVerifiedAt: v.optional(v.number()),
    preferChatGPTPlan: v.optional(v.boolean()),
    defaultWorkspaceId: v.optional(v.id("organizations")),
  }).index("by_subject", ["subject"]),
  organizations: defineTable({
    name: v.string(),
    status: v.union(v.literal("active"), v.literal("deleting")),
    createdBy: v.id("users"),
    createdAt: v.number(),
    privateOwnerId: v.optional(v.id("users")),
  })
    .index("by_creator", ["createdBy"])
    .index("by_private_owner", ["privateOwnerId"]),
  memberships: defineTable({
    organizationId: v.id("organizations"),
    userId: v.id("users"),
    role,
  })
    .index("by_user", ["userId"])
    .index("by_org", ["organizationId"])
    .index("by_pair", ["organizationId", "userId"]),
  projects: defineTable({
    organizationId: v.id("organizations"),
    name: v.string(),
    description: v.string(),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_org", ["organizationId"]),
  invitations: defineTable({
    organizationId: v.id("organizations"),
    email: v.string(),
    role: v.union(v.literal("admin"), v.literal("member"), v.literal("viewer")),
    tokenHash: v.string(),
    expiresAt: v.number(),
    createdBy: v.id("users"),
  })
    .index("by_hash", ["tokenHash"])
    .index("by_org", ["organizationId"])
    .index("by_expiry", ["expiresAt"]),
  billing: defineTable({
    organizationId: v.id("organizations"),
    customerId: v.string(),
    subscriptionId: v.optional(v.string()),
    status: v.string(),
    periodEnd: v.number(),
    verifiedAt: v.number(),
    revision: v.number(),
    appliedRevision: v.optional(v.number()),
    providerDeletedAt: v.optional(v.number()),
    checkoutKey: v.optional(v.string()),
    checkoutIntent: v.optional(v.string()),
    checkoutExpires: v.optional(v.number()),
    checkoutAllowance: v.optional(checkoutAllowanceValue),
    paidAllowance: v.optional(paidAllowanceValue),
  })
    .index("by_org", ["organizationId"])
    .index("by_customer", ["customerId"]),
  events: defineTable({ eventId: v.string(), processedAt: v.number() })
    .index("by_event", ["eventId"])
    .index("by_processed", ["processedAt"]),
  audit: defineTable({
    organizationId: v.id("organizations"),
    actorId: v.id("users"),
    action: v.string(),
    target: v.string(),
    at: v.number(),
  }).index("by_org", ["organizationId"]),
  limits: defineTable({
    key: v.string(),
    window: v.number(),
    count: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_window", ["window"]),
  deletionJobs: defineTable({
    userId: v.id("users"),
    subject: v.string(),
    state: v.union(v.literal("pending"), v.literal("failed")),
    attempts: v.number(),
    error: v.optional(v.string()),
  }).index("by_user", ["userId"]),
});
