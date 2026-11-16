"use client";

import Link from "next/link";
import { Gauge, History } from "lucide-react";
import { useState, useTransition } from "react";
import type { UsageOverview } from "../../../packages/billing/usage-overview";
import { CreditMeter } from "./assistant-elements/credit-meter";
import { AccountSection } from "./account-layout";
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
  retry,
}: {
  usage: UsageOverview | null;
  organizationId: string;
  retry?: () => Promise<unknown>;
}) {
  const [pending, startTransition] = useTransition();
  const [retryError, setRetryError] = useState(false);
  return (
    <div className="account-content">
      <div className="account-grid account-grid-start">
        <AccountSection title="Credit balance" icon={Gauge}>
          {usage ? (
            <>
              <CreditMeter
                used={usage.activeSpent}
                reserved={usage.activeReserved}
                available={usage.available}
              />
              {usage.nextExpiry !== null && (
                <p className="fine">
                  Next available allowance expires {date(usage.nextExpiry)}{" "}
                  (UTC).
                </p>
              )}
              {usage.expiredReserved > 0 && (
                <output>
                  {number.format(usage.expiredReserved)} reserved credits belong
                  to expired allowances. They stay reserved until
                  reconciliation.
                </output>
              )}
              {usage.trial && (
                <p className="fine">
                  Trial account. Paid plans require checkout.
                </p>
              )}
            </>
          ) : (
            <p>Allowance details are unavailable.</p>
          )}
          <div className="account-actions">
            <Link
              prefetch={false}
              className="button secondary"
              href={`/app/${organizationId}/billing`}
            >
              Plans and billing
            </Link>
            {!usage && retry && (
              <button
                type="button"
                className="button secondary"
                disabled={pending}
                aria-busy={pending}
                onClick={() => {
                  setRetryError(false);
                  startTransition(async () => {
                    try {
                      await retry();
                    } catch {
                      setRetryError(true);
                    }
                  });
                }}
              >
                {pending ? "Refreshing…" : "Refresh usage"}
              </button>
            )}
          </div>
          {!usage && retryError && (
            <p className="error" role="alert">
              Could not refresh usage. Try again.
            </p>
          )}
        </AccountSection>
        <AccountSection title="Recent credit use" icon={History}>
          {usage?.recent.length ? (
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
            <p>
              {usage
                ? "No recent settled credit use."
                : "Recent credit use is unavailable."}
            </p>
          )}
          {usage && (
            <p className="fine">Up to ten recent entries. Dates use UTC.</p>
          )}
        </AccountSection>
      </div>
      <details className="account-disclosure">
        <summary>How credit reservations work</summary>
        <p>
          Reserved credits stay unavailable while work or provider usage is
          reconciled. Unknown costs keep their holds. Credit records are
          separate from provider invoices.
        </p>
      </details>
    </div>
  );
}
