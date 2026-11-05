import { convexTest } from "convex-test";
import { afterEach, expect, it, vi } from "vitest";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
const mocks = vi.hoisted(() => ({
  account: vi.fn(),
  balances: vi.fn(),
  payouts: vi.fn(),
}));
vi.mock("stripe", () => ({
  default: class {
    accounts = { retrieve: mocks.account };
    balanceTransactions = { list: mocks.balances };
    payouts = { list: mocks.payouts };
  },
}));
const modules = import.meta.glob("../convex/**/*.ts");
afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});
async function setup() {
  vi.stubEnv("STRIPE_MODE", "test");
  vi.stubEnv("STRIPE_SECRET_KEY", "rk_test_synthetic");
  vi.stubEnv("STRIPE_ACCOUNT_ID", "acct_synthetic");
  vi.stubEnv(
    "INVOICE_OPERATOR_SUBJECTS_JSON",
    JSON.stringify(["synthetic-operator"]),
  );
  mocks.account.mockResolvedValue({ id: "acct_synthetic" });
  mocks.balances.mockResolvedValue({ data: [], has_more: false });
  mocks.payouts.mockResolvedValue({ data: [], has_more: false });
  const t = convexTest(schema, modules);
  for (const subject of ["synthetic-operator", "synthetic-other"])
    await t.mutation(internal.accounts.syncUser, {
      subject,
      email: "accounting@example.test",
      name: "Synthetic accounting",
    });
  return {
    t,
    operator: t.withIdentity({
      subject: "synthetic-operator",
      auth_time: Math.floor(Date.now() / 1000),
    }),
  };
}
it("requires an allowlisted operator and uses the normal session for export authorization", async () => {
  const { t } = await setup();
  await expect(
    t
      .withIdentity({
        subject: "synthetic-other",
        auth_time: Date.now() / 1000,
      })
      .action(api.settlementAccounting.download, { month: "2026-09" }),
  ).rejects.toThrow("operator access required");
  await expect(
    t
      .withIdentity({
        subject: "synthetic-operator",
        auth_time: Date.now() / 1000 - 301,
      })
      .mutation(api.invoiceOperations.authorizeSettlementExport, {}),
  ).resolves.toEqual({ authorized: true });
  expect(mocks.account).not.toHaveBeenCalled();
});
it("rejects invalid periods, mismatched credentials and foreign accounts before listing transactions", async () => {
  const { operator } = await setup();
  await expect(
    operator.action(api.settlementAccounting.download, { month: "2026-13" }),
  ).rejects.toThrow("valid accounting month");
  await expect(
    operator.action(api.settlementAccounting.download, { month: "2099-01" }),
  ).rejects.toThrow("future month");
  vi.stubEnv("STRIPE_SECRET_KEY", "rk_live_synthetic");
  await expect(
    operator.action(api.settlementAccounting.download, { month: "2026-09" }),
  ).rejects.toThrow("Accounting provider unavailable");
  vi.stubEnv("STRIPE_SECRET_KEY", "rk_test_synthetic");
  mocks.account.mockResolvedValue({ id: "acct_other" });
  await expect(
    operator.action(api.settlementAccounting.download, { month: "2026-09" }),
  ).rejects.toThrow("account mismatch");
  expect(mocks.balances).not.toHaveBeenCalled();
});
it("paginates one UTC month and exports only settlement fields without customer data or invented tax", async () => {
  const { operator } = await setup();
  const row = {
    id: "txn_synthetic1",
    created: 1788220800,
    available_on: 1788307200,
    type: "charge",
    reporting_category: "charge",
    status: "available",
    currency: "eur",
    amount: 1200,
    fee: 80,
    net: 1120,
    exchange_rate: null,
    source: "ch_synthetic",
    fee_details: [
      {
        amount: 80,
        currency: "eur",
        type: "stripe_fee",
        description: "PRIVATE UNNECESSARY DESCRIPTION",
      },
    ],
    customer_email: "NEVER EXPORT",
    description: "NEVER EXPORT",
  };
  mocks.balances
    .mockResolvedValueOnce({ data: [row], has_more: true })
    .mockResolvedValueOnce({
      data: [{ ...row, id: "txn_synthetic2", currency: "ron" }],
      has_more: false,
    });
  const result = await operator.action(api.settlementAccounting.download, {
    month: "2026-09",
  });
  expect(result.entries).toHaveLength(2);
  expect(mocks.balances.mock.calls[1][0]).toEqual({
    created: { gte: 1788220800, lt: 1790812800 },
    limit: 100,
    starting_after: "txn_synthetic1",
  });
  expect(result.period.monthClosed).toBe(true);
  expect(JSON.stringify(result)).not.toContain("NEVER EXPORT");
  expect(JSON.stringify(result)).not.toContain("PRIVATE UNNECESSARY");
  expect(result.entries[0].feeDetails).toEqual([
    { amountMinor: 80, currency: "eur", type: "stripe_fee" },
  ]);
  expect(result.recordType).toBe("provider_settlement_handover");
});
it("rejects over-limit and wrong-mode payout data rather than returning a misleading partial report", async () => {
  const { operator } = await setup();
  mocks.balances.mockResolvedValue({
    data: [
      {
        id: "txn_cursor",
        created: 1788220800,
        available_on: 1788307200,
        type: "charge",
        reporting_category: "charge",
        status: "available",
        currency: "eur",
        amount: 100,
        fee: 0,
        net: 100,
        exchange_rate: null,
        source: null,
        fee_details: [],
      },
    ],
    has_more: true,
  });
  await expect(
    operator.action(api.settlementAccounting.download, { month: "2026-09" }),
  ).rejects.toThrow("no partial export");
  expect(mocks.balances).toHaveBeenCalledTimes(10);
  expect(mocks.payouts).not.toHaveBeenCalled();
  mocks.balances.mockResolvedValue({ data: [], has_more: false });
  mocks.payouts.mockResolvedValue({
    data: [{ livemode: true }],
    has_more: false,
  });
  await expect(
    operator.action(api.settlementAccounting.download, { month: "2026-09" }),
  ).rejects.toThrow("Payout environment mismatch");
});
