import Link from "next/link";
import { backend, api } from "@/lib/backend";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { ActionForm } from "@/components/action-form";
import { ChoiceSelect } from "@/components/choice-select";
import { ProOfferSummary } from "@/components/pro-offer-summary";
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
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params,
    c = await backend(),
    organizationId = org as Id<"organizations">;
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
  return (
    <main id="main" className="doc">
      <Link prefetch={false} href={`/app/${org}`}>
        Back to workspace
      </Link>
      <h1>Billing and allowances</h1>
      <p>
        Manage your credits and subscription. Existing balances and
        subscriptions keep their recorded terms.
      </p>
      <section className="panel">
        <h2>Current allowance</h2>
        <p>
          {usage.wallet?.tier ?? "No wallet yet"}. Provider status:{" "}
          {auth.billing?.status ?? "No subscription"}.
        </p>
        <p>
          Included credits expire at their entitlement period end. Purchased
          credits are tracked separately and are not confiscated when renewal
          stops. Credits are service units, not a cash balance.
        </p>
      </section>
      <section className="panel">
        <ProOfferSummary />
        <p>
          Credits cover quoted work. Cached results for posts you request are
          included; full-catalog browsing is separate.
        </p>
        {offerReady && auth.personal && !hasSubscription ? (
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
              <input type="checkbox" name="terms" required />I accept the
              displayed <Link href="/terms">terms</Link>,{" "}
              <Link href="/refunds">refund and credit expiry policy</Link>, and
              applicable <Link href="/dpa">data processing terms</Link>
            </label>
            <label className="checkbox-label">
              <input type="checkbox" name="immediate" />I request immediate
              service, with statutory rights and the refund policy explained
            </label>
            <p>
              {catalogue.liveEnabled
                ? "The provider confirms your total, currency and applicable taxes before payment."
                : "Sandbox only. Use Stripe test details. No real charge is activated."}
            </p>
          </ActionForm>
        ) : (
          <p>
            {hasSubscription
              ? "Your subscription controls are below."
              : !auth.personal
                ? "Subscribe from your personal account. Each workspace member uses their own Pro and credits."
                : "The new Pro offer is not open for checkout yet. Your existing balance remains available."}
          </p>
        )}
      </section>
      {auth.billing?.subscriptionId && (
        <section className="panel">
          <h2>Subscription controls</h2>
          <p>
            Cancellation preserves the paid period. Provider reconciliation
            determines access, not the checkout return URL.
          </p>
          <ActionForm
            action={cancelV1Subscription}
            label="Cancel renewal at period end"
          >
            <input type="hidden" name="organizationId" value={org} />
          </ActionForm>
          <ActionForm action={billingPortal} label="Open billing portal">
            <input type="hidden" name="organizationId" value={org} />
          </ActionForm>
          <ActionForm action={refreshBilling} label="Reconcile provider status">
            <input type="hidden" name="organizationId" value={org} />
          </ActionForm>
          {(catalogue.sandboxEnabled || catalogue.liveEnabled) && (
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
                  <option value="200">EUR 10 / 200 credits</option>
                  <option value="550">EUR 25 / 550 credits</option>
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
                <input name="terms" type="checkbox" required />I accept the
                displayed <Link href="/terms">terms</Link> and processing-credit
                policy.
              </label>
              <label className="checkbox-label">
                <input name="immediate" type="checkbox" />I request immediate
                service, with statutory rights and the refund policy explained.
              </label>
            </ActionForm>
          )}
          <ActionForm
            action={requestV1Refund}
            label="Request invoice-aware refund review"
          >
            <input type="hidden" name="organizationId" value={org} />
            <label>
              Your invoice ID
              <input name="invoiceId" required placeholder="in_..." />
            </label>
          </ActionForm>
        </section>
      )}
      <Link href="/refunds">Refund policy</Link>
      <p>
        Weekly renewals can qualify for review. The form does not waive
        statutory consumer rights.
      </p>
    </main>
  );
}
