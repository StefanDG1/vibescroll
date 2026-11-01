import { managedMarketVerified } from "./managed-markets";
import { policyRelease } from "../policy/publication";
import { singleProConfigured } from "../billing/credit-policy";

type Environment = Record<string, string | undefined>;
const tiers = ["STARTER", "PRO"],
  intervals = ["WEEKLY", "MONTHLY", "ANNUAL"];
export function billingReturnOrigin(env: Environment) {
  try {
    const url = new URL(env.APP_URL ?? "");
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    )
      return undefined;
    if (
      url.protocol !== "https:" &&
      !(env.STRIPE_MODE === "test" && loopback && url.protocol === "http:")
    )
      return undefined;
    if (env.STRIPE_MODE === "live" && loopback) return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}
export function billingReadiness(env: Environment) {
  const mode = env.STRIPE_MODE;
  const catalogueConfigured =
    ["test", "live"].includes(mode ?? "") &&
    !!billingReturnOrigin(env) &&
    new RegExp(`^[sr]k_${mode}_`).test(env.STRIPE_SECRET_KEY ?? "") &&
    !!env.STRIPE_ACCOUNT_ID &&
    !!env.STRIPE_V1_WEBHOOK_SECRET &&
    (singleProConfigured(env)
      ? !!env.STRIPE_PRO_PORTAL_CONFIG_ID
      : !!env.STRIPE_PORTAL_CONFIG_ID) &&
    (singleProConfigured(env) ||
      tiers.every((tier) =>
        intervals.every(
          (interval) => !!env[`STRIPE_${tier}_${interval}_PRICE_ID`],
        ),
      ));
  const liveEnabled =
    catalogueConfigured &&
    mode === "live" &&
    env.LIVE_CHECKOUT_ENABLED === "true" &&
    env.BILLING_RELEASE_APPROVED === "true" &&
    env.POLICY_RELEASE_VERSION === policyRelease.id &&
    (env.STRIPE_BILLING_ROUTE !== "managed_payments" ||
      (env.STRIPE_MANAGED_PAYMENTS_VERIFIED === "true" &&
        managedMarketVerified(env)));
  return {
    catalogueConfigured,
    liveEnabled,
    sandboxEnabled:
      catalogueConfigured &&
      mode === "test" &&
      (env.STRIPE_BILLING_ROUTE !== "managed_payments" ||
        env.STRIPE_MANAGED_MARKET !== "tax_covered" ||
        managedMarketVerified(env)),
  };
}
