import { SettingsPanel } from "./settings-panel";
import {
  processingAccountOutput,
  type ProcessingAccountSummary as AccountSummary,
} from "../../../packages/contracts/processing-account";

export type ProcessingAccountView = AccountSummary;
const format = new Intl.NumberFormat("en");
export function ProcessingCreditReceipt({
  processing,
}: {
  processing: unknown;
}) {
  if (!processing || typeof processing !== "object") return null;
  const value = processing as Record<string, unknown>;
  const maximum = value.maximum_credits;
  const charged = value.charged_credits;
  const knownMaximum =
    typeof maximum === "number" &&
    Number.isSafeInteger(maximum) &&
    maximum >= 0;
  const knownCharge =
    typeof charged === "number" &&
    Number.isSafeInteger(charged) &&
    charged >= 0;
  if (!knownMaximum && !knownCharge) return null;
  return (
    <p className="processing-credit-receipt">
      {knownCharge
        ? `${format.format(charged)} credits charged`
        : knownMaximum
          ? `Maximum ${format.format(maximum)} credits held. Final charge pending.`
          : "Credit usage pending."}
    </p>
  );
}
export function processingAccountView(
  value: unknown,
): ProcessingAccountView | null {
  const parsed = processingAccountOutput.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Missing financial permission is unavailable, never a zero balance. */
export function ProcessingAccountSummary({
  account,
  unavailable,
  onOpen,
}: {
  account: ProcessingAccountView | null;
  unavailable?: boolean;
  onOpen: (url: string) => void;
}) {
  if (!account)
    return (
      <span className="processing-account-unavailable">
        {unavailable
          ? "Credits unavailable for this connection"
          : "Checking credits…"}
      </span>
    );
  return (
    <div className="processing-account-summary">
      <SettingsPanel
        title="Your processing credits"
        triggerLabel="View personal credits and processing availability"
        trigger={
          <span>
            {format.format(account.availableCredits)} credits available
          </span>
        }
      >
        <dl className="processing-account-details">
          <div>
            <dt>Available</dt>
            <dd>{format.format(account.availableCredits)}</dd>
          </div>
          <div>
            <dt>Held for processing</dt>
            <dd>{format.format(account.reservedCredits)}</dd>
          </div>
          {account.expiredReservedCredits > 0 && (
            <div>
              <dt>Pending holds from expired allowances</dt>
              <dd>{format.format(account.expiredReservedCredits)}</dd>
            </div>
          )}
          {account.monthlyAllowance !== null && (
            <div>
              <dt>
                {account.allowanceKind === "admin"
                  ? "Admin monthly allowance"
                  : "Monthly allowance"}
              </dt>
              <dd>{format.format(account.monthlyAllowance)}</dd>
            </div>
          )}
        </dl>
        {account.nextRenewal !== null && (
          <p>
            Next allowance {new Date(account.nextRenewal).toLocaleDateString()}.
          </p>
        )}
        {account.nextExpiry !== null && (
          <p>
            Next credit expiry{" "}
            {new Date(account.nextExpiry).toLocaleDateString()}.
          </p>
        )}
        <p>
          {account.processing.allowed
            ? "New processing remains subject to the source, selected route and quoted maximum."
            : (account.processing.message ??
              "New processing is currently unavailable.")}
        </p>
        {account.processing.retryAt !== null && (
          <p>
            Check again after{" "}
            {new Date(account.processing.retryAt).toLocaleString()}.
          </p>
        )}
        <p className="fine">
          Checked {new Date(account.observedAt).toLocaleString()}. These are
          your own credits across workspaces. Unknown usage stays held until
          reconciled.
        </p>
        <button className="button" onClick={() => onOpen(account.reviewUrl)}>
          Open usage
        </button>
      </SettingsPanel>
    </div>
  );
}
