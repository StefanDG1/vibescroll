import Link from "next/link";
import { redirect } from "next/navigation";
import { CreditCard, Gauge, Wallet } from "lucide-react";
import { backend, api } from "@/lib/backend";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { ActionForm } from "@/components/action-form";
import { ChoiceSelect } from "@/components/choice-select";
import { ProOfferSummary } from "@/components/pro-offer-summary";
import { CreditMeter } from "@/components/assistant-elements/credit-meter";
import { ErrorState } from "@/components/assistant-elements/error-state";
import { usageOverview } from "../../../../../../packages/billing/usage-overview";
import { billingRecovery } from "@/lib/processing-recovery";
import {
  AccountPageFrame,
  AccountSection,
  AccountStatus,
} from "@/components/account-layout";
import { localSnapshotRequest } from "@/lib/local-snapshot-request";
import {
  startV1Checkout,
  cancelV1Subscription,
  buyV1Credits,
  requestV1Refund,
  billingPortal,
  refreshBilling,
} from "@/app/actions";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams?: Promise<{ checkout?: string }>;
}) {
  const { org } = await params,
    c = await backend(),
    organizationId = org as Id<"organizations">;
  const back = { href: `/app/${org}/account`, label: "Account" };
  if (await localSnapshotRequest()) {
    await c.query(api.organizations.details, { organizationId });
    return (
      <AccountPageFrame title="Billing" back={back}>
        <AccountSection
          title="Credit balance"
          icon={Gauge}
          description="Allowance and subscription details are unavailable."
        >
          <Link
            prefetch={false}
            className="button secondary"
            href={`/app/${org}/usage`}
          >
            View usage
          </Link>
        </AccountSection>
        <section className="account-section account-billing-offer">
          <ProOfferSummary />
          <Link prefetch={false} className="button secondary" href="/pricing">
            Compare renewal options
          </Link>
        </section>
        <Link className="account-footer-link" href="/refunds">
          Refund policy
        </Link>
      </AccountPageFrame>
    );
  }
  const onboarding = await c.query(api.onboarding.status, {});
  if (!onboarding.legacy && (await searchParams)?.checkout === "complete")
    redirect("/onboarding/resume?checkout=complete");
  const [auth, catalogue, usage] = await Promise.all([
    c.query(api.billing.authorize, { organizationId }),
    c.query(api.commerce.catalogue, {}),
    c.query(api.product.usage, { organizationId }),
  ]);
  const offerReady =
    catalogue.proOffer.configured &&
    (catalogue.sandboxEnabled || catalogue.liveEnabled);
  const hasSubscription = Boolean(
    auth.billing?.subscriptionId &&
    !["free", "canceled", "incomplete_expired"].includes(auth.billing.status),
  );
  const returned = (await searchParams)?.checkout === "complete";
  const recovery = billingRecovery({
    billing: auth.billing,
    wallet: usage.wallet,
    pools: usage.pools,
    checkoutReturned: returned,
  });
  const overview = usageOverview(usage);
  const tier = usage.wallet?.tier;
  return (
    <AccountPageFrame
      title="Billing"
      description="Manage your subscription and processing credits."
      back={back}
    >
      <AccountSection
        title="Credit balance"
        icon={Gauge}
        description={
          tier
            ? `${tier.charAt(0).toUpperCase()}${tier.slice(1)} plan`
            : undefined
        }
        trailing={
          <AccountStatus
            tone={auth.billing?.status === "active" ? "positive" : "neutral"}
          >
            {auth.billing?.status.replaceAll("_", " ") ?? "No subscription"}
          </AccountStatus>
        }
      >
        {overview && (
          <CreditMeter
            used={overview.activeSpent}
            reserved={overview.activeReserved}
            available={overview.available}
          />
        )}
        {!overview && <p>Allowance details are unavailable.</p>}
        {recovery && (
          <ErrorState
            title={recovery.title}
            detail={recovery.detail}
            tone="attention"
            action={
              <ActionForm
                action={refreshBilling}
                label="Reconcile payment and credits"
              >
                <input type="hidden" name="organizationId" value={org} />
              </ActionForm>
            }
          />
        )}
        <Link prefetch={false} href={`/app/${org}/usage`}>
          View credit activity
        </Link>
      </AccountSection>
      {auth.billing?.subscriptionId && (
        <AccountSection
          title="Subscription"
          icon={CreditCard}
          description="Open the billing portal for provider records and payment details."
        >
          <div className="account-actions">
            <ActionForm action={billingPortal} label="Open billing portal">
              <input type="hidden" name="organizationId" value={org} />
            </ActionForm>
            {!recovery && (
              <ActionForm
                action={refreshBilling}
                label="Reconcile provider status"
              >
                <input type="hidden" name="organizationId" value={org} />
              </ActionForm>
            )}
          </div>
          <details className="account-disclosure">
            <summary>Cancel renewal</summary>
            <p>Cancellation preserves access through the paid period.</p>
            <ActionForm
              action={cancelV1Subscription}
              label="Cancel renewal at period end"
            >
              <input type="hidden" name="organizationId" value={org} />
            </ActionForm>
          </details>
        </AccountSection>
      )}
      {!hasSubscription && (
        <section className="account-section account-billing-offer">
          <ProOfferSummary />
          <p>
            Credits cover quoted work. Cached results for posts you request are
            included; full-catalog browsing is separate.
          </p>
          {offerReady && auth.personal && !recovery ? (
            <ActionForm
              action={startV1Checkout}
              label={
                catalogue.liveEnabled
                  ? "Continue to checkout"
                  : "Open sandbox checkout"
              }
            >
              <input type="hidden" name="organizationId" value={org} />
              <input type="hidden" name="tier" value="pro" />
              <label htmlFor="checkout-renewal">
                Renewal
                <ChoiceSelect
                  id="checkout-renewal"
                  name="interval"
                  aria-label="Renewal"
                  defaultValue="monthly"
                >
                  <option value="weekly">Every seven days</option>
                  <option value="monthly">Monthly</option>
                  <option value="annual">Annual with monthly credits</option>
                </ChoiceSelect>
              </label>
              {catalogue.billingCountryRequired && (
                <label htmlFor="checkout-country">
                  Billing country
                  <ChoiceSelect
                    id="checkout-country"
                    name="country"
                    aria-label="Billing country"
                    defaultValue="RO"
                    required
                  >
                    {catalogue.countries.map((country) => (
                      <option key={country} value={country}>
                        {country === "RO" ? "Romania" : country}
                      </option>
                    ))}
                  </ChoiceSelect>
                </label>
              )}
              <label className="checkbox-label">
                <input type="checkbox" name="terms" required />
                <span>
                  I accept the displayed <Link href="/terms">terms</Link>,{" "}
                  <Link href="/refunds">refund and credit expiry policy</Link>,
                  and applicable <Link href="/dpa">data processing terms</Link>
                </span>
              </label>
              <label className="checkbox-label">
                <input type="checkbox" name="immediate" />
                <span>
                  I request immediate service, with statutory rights and the
                  refund policy explained.
                </span>
              </label>
              <p>
                {catalogue.liveEnabled
                  ? "The provider confirms your total, currency and applicable taxes before payment."
                  : "Sandbox only. Use Stripe test details. No real charge is activated."}
              </p>
            </ActionForm>
          ) : (
            <p>
              {recovery
                ? "Resolve the existing payment or allowance state above before opening another checkout."
                : !auth.personal
                  ? "Subscribe from your personal account. Each workspace member uses their own Pro and credits."
                  : "The Pro offer is unavailable for checkout. Your existing balance remains available."}
            </p>
          )}
        </section>
      )}
      {!auth.personal && (
        <p>
          <Link prefetch={false} href="/app?view=billing&tier=pro">
            Open personal billing
          </Link>
        </p>
      )}
      {auth.billing?.subscriptionId &&
        !recovery &&
        (catalogue.sandboxEnabled || catalogue.liveEnabled) && (
          <AccountSection
            title="Buy credits"
            icon={Wallet}
            description="Choose a one-time pack. Your subscription renewal stays separate."
          >
            <ActionForm
              action={buyV1Credits}
              label={
                catalogue.liveEnabled
                  ? "Buy processing credits"
                  : "Open sandbox top-up"
              }
            >
              <input type="hidden" name="organizationId" value={org} />
              <label htmlFor="topup-pack">
                One-time pack
                <ChoiceSelect
                  id="topup-pack"
                  name="pack"
                  aria-label="One-time pack"
                  defaultValue="200"
                >
                  <option value="200">EUR 17 / 200 credits</option>
                  <option value="500">EUR 35 / 500 credits</option>
                </ChoiceSelect>
              </label>
              {catalogue.billingCountryRequired && (
                <label htmlFor="topup-country">
                  Billing country
                  <ChoiceSelect
                    id="topup-country"
                    name="country"
                    aria-label="Top-up billing country"
                    defaultValue="RO"
                    required
                  >
                    {catalogue.countries.map((country) => (
                      <option key={country} value={country}>
                        {country === "RO" ? "Romania" : country}
                      </option>
                    ))}
                  </ChoiceSelect>
                </label>
              )}
              <label className="checkbox-label">
                <input name="terms" type="checkbox" required />
                <span>
                  I accept the displayed <Link href="/terms">terms</Link> and
                  processing-credit policy.
                </span>
              </label>
              <label className="checkbox-label">
                <input name="immediate" type="checkbox" />
                <span>
                  I request immediate service, with statutory rights and the
                  refund policy explained.
                </span>
              </label>
            </ActionForm>
          </AccountSection>
        )}
      {auth.billing?.subscriptionId && (
        <details className="account-disclosure">
          <summary>Request a refund review</summary>
          <p>
            Weekly renewals can qualify for review. The form does not waive
            statutory consumer rights.
          </p>
          <ActionForm action={requestV1Refund} label="Request refund review">
            <input type="hidden" name="organizationId" value={org} />
            <label>
              Your invoice ID
              <input name="invoiceId" required placeholder="in_..." />
            </label>
          </ActionForm>
        </details>
      )}
      <details className="account-disclosure">
        <summary>Credit expiry and reservations</summary>
        <p>
          Included credits expire at the end of their allowance period.
          Purchased credits are tracked separately and stay available under
          their terms when renewal stops.
        </p>
        <p>
          Reservations hold credits until work settles. Credits are service
          units separate from the provider balance.
        </p>
      </details>
      <Link className="account-footer-link" href="/refunds">
        Refund policy
      </Link>
    </AccountPageFrame>
  );
}
