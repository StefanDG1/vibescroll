import { availableProcessingCredits } from "../plans/execution-quote";

type Pool = {
  granted: number;
  spent: number;
  reserved: number;
  revoked?: number;
  expiresAt?: number;
};
type Entry = {
  key?: string;
  provider?: string;
  unitType?: string;
  credits?: number;
  createdAt?: number;
};
export type UsageOverview = {
  available: number;
  reserved: number;
  expiredReserved: number;
  activeAllowance: number;
  activeSpent: number;
  activeReserved: number;
  nextExpiry: number | null;
  trial: boolean;
  recent: { activity: string; credits: number; createdAt: number | null }[];
};
function activity(key = "") {
  if (key.startsWith("knowledge-evaluation:")) return "Project idea review";
  if (key.startsWith("knowledge-summary:")) return "Knowledge summary";
  if (key.startsWith("source:")) return "Source analysis";
  if (key.startsWith("match:")) return "Project fit assessment";
  if (key.startsWith("plan:")) return "Plan preparation";
  return "Processing";
}
export function usageOverview(
  usage:
    | {
        pools: Pool[];
        wallet: { tier?: string } | null;
        entries: Entry[];
      }
    | null
    | undefined,
  now = Date.now(),
): UsageOverview | null {
  if (!usage?.wallet || !Array.isArray(usage.pools)) return null;
  if (
    usage.pools.some((pool) =>
      [pool.granted, pool.spent, pool.reserved, pool.revoked ?? 0].some(
        (value) => !Number.isSafeInteger(value) || value < 0,
      ),
    ) ||
    usage.pools.some(
      (pool) =>
        pool.expiresAt !== undefined && !Number.isSafeInteger(pool.expiresAt),
    )
  )
    return null;
  const active = usage.pools.filter(
    (pool) => pool.expiresAt === undefined || pool.expiresAt > now,
  );
  const sum = (pools: Pool[], field: "reserved" | "spent") =>
    pools.reduce((total, pool) => total + pool[field], 0);
  const reserved = sum(usage.pools, "reserved");
  const activeAllowance = active.reduce(
    (total, pool) => total + Math.max(0, pool.granted - (pool.revoked ?? 0)),
    0,
  );
  const available = availableProcessingCredits(usage.pools, now);
  const activeSpent = sum(active, "spent");
  const activeReserved = sum(active, "reserved");
  if (
    ![
      reserved,
      activeAllowance,
      available,
      activeSpent,
      activeReserved,
      available + activeSpent + activeReserved,
    ].every(Number.isSafeInteger)
  )
    return null;
  const expiries = active
    .filter((pool) => availableProcessingCredits([pool], now) > 0)
    .flatMap((pool) => (pool.expiresAt === undefined ? [] : [pool.expiresAt]));
  return {
    available,
    reserved,
    expiredReserved: reserved - sum(active, "reserved"),
    activeAllowance,
    activeSpent,
    activeReserved,
    nextExpiry: expiries.length ? Math.min(...expiries) : null,
    trial: usage.wallet.tier === "trial",
    recent: (usage.entries ?? [])
      .filter(
        (entry) =>
          (entry.unitType === "service_credits" ||
            entry.provider === "credit_settlement") &&
          Number.isSafeInteger(entry.credits) &&
          entry.credits! >= 0,
      )
      .slice(0, 10)
      .map((entry) => ({
        activity: activity(entry.key),
        credits: entry.credits!,
        createdAt:
          Number.isSafeInteger(entry.createdAt) && entry.createdAt! > 0
            ? entry.createdAt!
            : null,
      })),
  };
}
