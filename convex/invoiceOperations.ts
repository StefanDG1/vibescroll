import { paginationOptsValidator } from "convex/server";
import { query } from "./_generated/server";
import { mutation } from "./lib/projectedMutations";
import { v } from "convex/values";
import { fail, limit } from "./lib";
import { invoiceOperator, requireInvoiceOperator } from "./lib/invoiceOperator";
export const status = query({
  args: {},
  handler: async (ctx) => ({ allowed: (await invoiceOperator(ctx)).allowed }),
});
export const record = query({
  args: { id: v.id("invoiceTasks") },
  handler: async (ctx, { id }) => {
    await requireInvoiceOperator(ctx);
    const task = await ctx.db.get(id);
    if (!task) fail("Invoice record unavailable.");
    return { invoiceId: task.invoiceId, organizationId: task.organizationId };
  },
});
export const queue = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    await requireInvoiceOperator(ctx);
    const result = await ctx.db
      .query("invoiceTasks")
      .order("desc")
      .paginate(args.paginationOpts);
    return {
      ...result,
      observedAt: Date.now(),
      mode: process.env.STRIPE_MODE === "live" ? "live" : "test",
    };
  },
});

export const authorizeSettlementExport = mutation({
  args: {},
  handler: async (ctx) => {
    const actor = await requireInvoiceOperator(ctx);
    await limit(ctx, `settlement-export:${actor._id}`, 5);
    return { authorized: true };
  },
});
