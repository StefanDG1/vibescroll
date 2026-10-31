import { expect, it } from "vitest";
import { usageOverview } from "../packages/billing/usage-overview";

it("excludes expired and revoked authority while retaining unresolved expired holds", () => {
  const summary = usageOverview(
    {
      wallet: { tier: "trial" },
      pools: [
        { granted: 30, spent: 16, reserved: 10, expiresAt: 300 },
        { granted: 50, spent: 20, reserved: 8, expiresAt: 100 },
        { granted: 20, spent: 3, reserved: 2, revoked: 15 },
      ],
      entries: [],
    },
    100,
  );
  expect(summary).toMatchObject({
    available: 4,
    reserved: 20,
    expiredReserved: 8,
    activeAllowance: 35,
    activeSpent: 19,
    activeReserved: 12,
    nextExpiry: 300,
    trial: true,
  });
});
it("projects settled use independently of the recent page and rejects aggregate overflow", () => {
  const summary = usageOverview({
    wallet: {},
    pools: [{ granted: 300, spent: 120, reserved: 30 }],
    entries: [],
  });
  expect(summary).toMatchObject({
    activeSpent: 120,
    activeReserved: 30,
    available: 150,
    recent: [],
  });
  expect(
    usageOverview({
      wallet: {},
      pools: [
        {
          granted: Number.MAX_SAFE_INTEGER,
          spent: Number.MAX_SAFE_INTEGER,
          reserved: 1,
        },
      ],
      entries: [],
    }),
  ).toBeNull();
});
it("does not invent allowance or settled provider bills from missing or invalid records", () => {
  expect(usageOverview(null)).toBeNull();
  expect(usageOverview({ wallet: null, pools: [], entries: [] })).toBeNull();
  expect(
    usageOverview({
      wallet: {},
      pools: [{ granted: 10, spent: 0, reserved: -1 }],
      entries: [],
    }),
  ).toBeNull();
  expect(
    usageOverview({
      wallet: {},
      pools: [{ granted: 10, spent: 0, reserved: 0, expiresAt: NaN }],
      entries: [],
    }),
  ).toBeNull();
  const summary = usageOverview({
    wallet: {},
    pools: [],
    entries: [
      {
        provider: "google",
        credits: 9,
        key: "private-provider-key",
        createdAt: 30,
      },
      {
        provider: "credit_settlement",
        credits: 0,
        key: "match:private-source:private-repo",
        createdAt: 20,
      },
      {
        unitType: "service_credits",
        credits: 6,
        key: "source:private-source",
        createdAt: 10,
      },
    ],
  });
  expect(summary?.recent).toEqual([
    { activity: "Project fit assessment", credits: 0, createdAt: 20 },
    { activity: "Source analysis", credits: 6, createdAt: 10 },
  ]);
  expect(JSON.stringify(summary)).not.toContain("private-");
});
it("bounds recent credit use without treating a partial page as whole-history absence", () => {
  const summary = usageOverview({
    wallet: {},
    pools: [],
    entries: Array.from({ length: 100 }, (_, index) => ({
      unitType: "service_credits",
      credits: 1,
      createdAt: 100 - index,
    })),
  });
  expect(summary?.recent).toHaveLength(10);
  expect(summary?.available).toBe(0);
  expect(summary?.recent.at(-1)?.createdAt).toBe(91);
});
