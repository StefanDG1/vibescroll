import { convexTest } from "convex-test";
import { afterEach, expect, it, vi } from "vitest";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
const modules = import.meta.glob("../convex/**/*.ts");
afterEach(() => vi.unstubAllEnvs());
async function fixture() {
  const t = convexTest(schema, modules);
  for (const subject of ["invoice-operator", "invoice-customer"])
    await t.mutation(internal.accounts.syncUser, {
      subject,
      email: "same-email@example.test",
      name: subject,
    });
  const customer = t.withIdentity({
    subject: "invoice-customer",
    auth_time: Date.now() / 1000,
  });
  const operator = t.withIdentity({
    subject: "invoice-operator",
    auth_time: Date.now() / 1000,
  });
  const organizationId = await customer.mutation(api.organizations.create, {
    name: "Synthetic customer",
  });
  const taskId = await t.run((ctx) =>
    ctx.db.insert("invoiceTasks", {
      organizationId,
      invoiceId: "in_synthetic",
      dueAt: Date.now() + 86400000,
      state: "pending_submission",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  );
  return { t, customer, operator, organizationId, taskId };
}
it("separates company invoice permissions from customer ownership and matching email", async () => {
  const { customer, operator, taskId } = await fixture();
  vi.stubEnv("INVOICE_OPERATOR_SUBJECTS_JSON", "[]");
  expect((await operator.query(api.invoiceOperations.status, {})).allowed).toBe(
    false,
  );
  vi.stubEnv("INVOICE_OPERATOR_SUBJECTS_JSON", '{"malformed":"list"}');
  expect((await operator.query(api.invoiceOperations.status, {})).allowed).toBe(
    false,
  );
  vi.stubEnv("INVOICE_OPERATOR_SUBJECTS_JSON", '["invoice-operator"]');
  expect((await customer.query(api.invoiceOperations.status, {})).allowed).toBe(
    false,
  );
  await expect(
    customer.query(api.invoiceOperations.queue, {
      paginationOpts: { cursor: null, numItems: 20 },
    }),
  ).rejects.toThrow("Invoice operator access required");
  await expect(
    customer.mutation(api.commerce.submitReceipt, {
      id: taskId,
      receipt: "synthetic-receipt",
    }),
  ).rejects.toThrow("Invoice operator access required");
  const queue = await operator.query(api.invoiceOperations.queue, {
    paginationOpts: { cursor: null, numItems: 20 },
  });
  expect(queue.page.map((item) => item._id)).toEqual([taskId]);
});
it("requires active operator identity, audits evidence and preserves the original reference", async () => {
  const { t, operator, taskId } = await fixture();
  vi.stubEnv("INVOICE_OPERATOR_SUBJECTS_JSON", '["invoice-operator"]');
  const stale = t.withIdentity({
    subject: "invoice-operator",
    auth_time: Date.now() / 1000 - 1000,
  });
  await stale.mutation(api.commerce.submitReceipt, {
    id: taskId,
    receipt: "synthetic-receipt",
  });
  await operator.mutation(api.commerce.submitReceipt, {
    id: taskId,
    receipt: " synthetic-receipt ",
  });
  await operator.mutation(api.commerce.submitReceipt, {
    id: taskId,
    receipt: "synthetic-receipt",
  });
  await expect(
    operator.mutation(api.commerce.submitReceipt, {
      id: taskId,
      receipt: "different-receipt",
    }),
  ).rejects.toThrow("previous reference is retained");
  await t.run(async (ctx) => {
    expect((await ctx.db.get(taskId))?.receipt).toBe("synthetic-receipt");
    const events = await ctx.db.query("audit").collect();
    expect(
      events.filter((event) => event.action === "invoice.receipt_recorded"),
    ).toHaveLength(1);
    const actor = await ctx.db
      .query("users")
      .withIndex("by_subject", (q) => q.eq("subject", "invoice-operator"))
      .unique();
    await ctx.db.patch(actor!._id, { status: "deleting" });
  });
  await expect(
    operator.query(api.invoiceOperations.queue, {
      paginationOpts: { cursor: null, numItems: 20 },
    }),
  ).rejects.toThrow("Account unavailable");
});
