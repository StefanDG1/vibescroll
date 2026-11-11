import Link from "next/link";
import type { UsageOverview } from "../../../packages/billing/usage-overview";
import { CreditMeter } from "./assistant-elements/credit-meter";
const number = new Intl.NumberFormat("en");

function date(timestamp: number) {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(timestamp);
}
export function UsageSummary({
  usage,
  organizationId,
}: {
  usage: UsageOverview | null;
  organizationId: string;
}) {
  if (!usage)
    return (
      <section className="panel">
        <h2>Your allowance</h2>
        <p>Allowance unavailable. Reload to check your current balance.</p>
      </section>
    );
  return (
    <div className="usage-summary">
      <section className="panel usage-allowance">
        <h2>Your allowance</h2>
        <CreditMeter
          used={usage.activeSpent}
          reserved={usage.activeReserved}
          available={usage.available}
        />
        {usage.nextExpiry !== null && (
          <p className="fine">
            Next available allowance expires {date(usage.nextExpiry)} (UTC).
          </p>
        )}
        <p>
          Reserved credits stay unavailable while work or provider usage is
          reconciled. Unknown costs keep their holds.
        </p>
        {usage.expiredReserved > 0 && (
          <p>
            {number.format(usage.expiredReserved)} reserved credits belong to
            expired allowances. Expiry does not settle that work or release its
            hold.
          </p>
        )}
        {usage.trial && (
          <p className="fine">Trial account. No automatic paid conversion.</p>
        )}
        <Link
          prefetch={false}
          className="button secondary"
          href={`/app/${organizationId}/billing`}
        >
          Review plans and billing
        </Link>
      </section>
      <section className="panel">
        <h2>Recent credit use</h2>
        {usage.recent.length ? (
          <ol className="usage-entries">
            {usage.recent.map((entry, index) => (
              <li key={`${entry.createdAt}:${index}`}>
                <div>
                  <strong>{entry.activity}</strong>
                  <span className="fine">
                    {entry.createdAt === null
                      ? "Date unavailable"
                      : date(entry.createdAt)}
                  </span>
                </div>
                <span>
                  {number.format(entry.credits)}{" "}
                  {entry.credits === 1 ? "credit" : "credits"}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p>No settled credit use in the recent entries.</p>
        )}
        <p className="fine">
          Up to ten recent entries. Older activity may not appear here. Dates
          use UTC. Credit records are separate from provider invoices.
        </p>
      </section>
    </div>
  );
}
