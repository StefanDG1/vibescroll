import Link from "next/link";
import type { UsageOverview } from "../../../packages/billing/usage-overview";
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
        <dl className="usage-balances">
          <div>
            <dt>Available credits</dt>
            <dd>{number.format(usage.available)}</dd>
          </div>
          <div>
            <dt>Reserved credits</dt>
            <dd>{number.format(usage.reserved)}</dd>
          </div>
        </dl>
        {usage.activeAllowance > 0 ? (
          <>
            <label
              className="usage-meter-label"
              htmlFor="usage-allowance-meter"
            >
              Available from unexpired allowances
            </label>
            <meter
              id="usage-allowance-meter"
              className="usage-meter"
              min={0}
              max={usage.activeAllowance}
              value={usage.available}
              aria-valuetext={`${number.format(usage.available)} available credits from ${number.format(usage.activeAllowance)} unexpired allowance credits`}
            />
            <div className="usage-meter-range" aria-hidden="true">
              <span>0</span>
              <span>{number.format(usage.activeAllowance)} credits</span>
            </div>
          </>
        ) : (
          <p>No unexpired processing allowance.</p>
        )}
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
