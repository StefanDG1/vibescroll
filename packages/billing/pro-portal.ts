import type Stripe from "stripe";
import { ensure } from "../policy";

// Keep old subscriptions' portal configuration separate from the new offer.
export async function verifiedProPortal(
  client: Stripe,
  env: Record<string, string | undefined>,
) {
  const id = env.STRIPE_PRO_PORTAL_CONFIG_ID;
  ensure(
    id && /^bpc_[A-Za-z0-9_]+$/.test(id),
    "BILLING_UNAVAILABLE",
    "The Pro subscription controls are not configured.",
  );
  const configuration = await client.billingPortal.configurations.retrieve(id);
  ensure(
    configuration.active &&
      configuration.livemode === (env.STRIPE_MODE === "live") &&
      !configuration.features.subscription_update.enabled &&
      configuration.features.subscription_cancel.enabled &&
      configuration.features.payment_method_update.enabled &&
      configuration.features.invoice_history.enabled,
    "CATALOGUE_MISMATCH",
    "The Pro portal must preserve the selected offer and allow payment updates, invoices and cancellation.",
  );
  return id;
}
