import { expect, it } from "vitest";
import {
  billingReadiness,
  billingReturnOrigin,
} from "../packages/providers/billing-readiness";
import { policyRelease } from "../packages/policy/publication";
import { proOffer } from "../packages/billing/pro-offer";
import {
  managedMarketPolicy,
  managedRadarCondition,
} from "../packages/providers/managed-markets";
const env: Record<string, string> = {
  STRIPE_MODE: "live",
  APP_URL: "https://app.example.test",
  STRIPE_SECRET_KEY: "rk_live_synthetic",
  STRIPE_ACCOUNT_ID: "acct_synthetic",
  STRIPE_V1_WEBHOOK_SECRET: "whsec_synthetic",
  STRIPE_PORTAL_CONFIG_ID: "bpc_synthetic",
  LIVE_CHECKOUT_ENABLED: "true",
  BILLING_RELEASE_APPROVED: "true",
  POLICY_RELEASE_VERSION: policyRelease.id,
  STRIPE_BILLING_ROUTE: "managed_payments",
  STRIPE_MANAGED_PAYMENTS_VERIFIED: "true",
  STRIPE_MANAGED_MARKET: "tax_covered",
  STRIPE_MANAGED_COUNTRY_RULE_PROOF: JSON.stringify({
    accountId: "acct_synthetic",
    mode: "live",
    policy: managedMarketPolicy,
    condition: managedRadarCondition,
    enabled: true,
    trafficPercent: 100,
    allowRulesDisabled: true,
    sandboxAcceptancePassed: true,
    verifiedAt: new Date().toISOString(),
  }),
};

it("requires backed customer processing before opening the new Pro offer", () => {
  const configured = {
    ...env,
    STRIPE_PRO_PORTAL_CONFIG_ID: "bpc_new",
    STRIPE_PRO_CREDIT_POLICY_V2_JSON: JSON.stringify({
      version: proOffer.version,
      mode: "live",
      accountId: env.STRIPE_ACCOUNT_ID,
      activation: "reviewed_live",
      prices: {
        weekly: "price_new_w",
        monthly: "price_new_m",
        annual: "price_new_y",
      },
    }),
  };
  expect(billingReadiness(configured).liveEnabled).toBe(false);
  const funded = {
    ...configured,
    PAID_PROCESSING_CONFIGURATION_JSON: JSON.stringify({
      version: "paid-processing-prefunded-v1",
      id: "paid-readiness-fixture",
      enabled: true,
      verifiedAt: Date.now() - 1000,
      expiresAt: Date.now() + 86400000,
      maximumJobs: 10,
      maximumJobNanoUsd: 50000000,
      verifiedProviderCreditNanoUsd: 1000000000,
      providerKeyBudgetNanoUsd: 1000000000,
      priorExposureNanoUsd: 500000000,
    }),
  };
  expect(billingReadiness(funded).liveEnabled).toBe(true);
  expect(
    billingReadiness({ ...funded, DISABLE_INFERENCE: "true" }).liveEnabled,
  ).toBe(false);
});
for (const tier of ["STARTER", "PRO"])
  for (const interval of ["WEEKLY", "MONTHLY", "ANNUAL"])
    env[`STRIPE_${tier}_${interval}_PRICE_ID`] = `price_${tier}_${interval}`;
it("requires the complete V1 catalogue, matching key mode and all live release switches", () => {
  expect(billingReadiness(env)).toEqual({
    catalogueConfigured: true,
    liveEnabled: true,
    sandboxEnabled: false,
  });
  for (const key of [
    "STRIPE_PRO_ANNUAL_PRICE_ID",
    "STRIPE_V1_WEBHOOK_SECRET",
    "STRIPE_ACCOUNT_ID",
    "STRIPE_PORTAL_CONFIG_ID",
    "LIVE_CHECKOUT_ENABLED",
    "BILLING_RELEASE_APPROVED",
    "POLICY_RELEASE_VERSION",
    "STRIPE_MANAGED_PAYMENTS_VERIFIED",
    "STRIPE_MANAGED_MARKET",
    "STRIPE_MANAGED_COUNTRY_RULE_PROOF",
  ])
    expect(billingReadiness({ ...env, [key]: undefined }).liveEnabled).toBe(
      false,
    );
  expect(
    billingReadiness({ ...env, STRIPE_SECRET_KEY: "rk_test_synthetic" })
      .catalogueConfigured,
  ).toBe(false);
  expect(
    billingReadiness({ ...env, STRIPE_MODE: "invalid" }).catalogueConfigured,
  ).toBe(false);
  expect(
    billingReadiness({ ...env, POLICY_RELEASE_VERSION: "v1-draft" })
      .liveEnabled,
  ).toBe(false);
});
it("closes new sales during the approved policy cutover until the exact new release is bound", () => {
  expect(
    billingReadiness({ ...env, POLICY_RELEASE_VERSION: "v1-2026-10-03.1" })
      .liveEnabled,
  ).toBe(false);
  expect(
    billingReadiness({ ...env, POLICY_RELEASE_VERSION: policyRelease.id })
      .liveEnabled,
  ).toBe(true);
});
it("exposes sandbox checkout independently of live activation and never treats legacy prices as a V1 catalogue", () => {
  expect(
    billingReadiness({
      ...env,
      STRIPE_MODE: "test",
      STRIPE_SECRET_KEY: "rk_test_synthetic",
      BILLING_RELEASE_APPROVED: undefined,
      STRIPE_MANAGED_COUNTRY_RULE_PROOF: JSON.stringify({
        ...JSON.parse(env.STRIPE_MANAGED_COUNTRY_RULE_PROOF),
        mode: "test",
      }),
    }),
  ).toEqual({
    catalogueConfigured: true,
    liveEnabled: false,
    sandboxEnabled: true,
  });
  expect(
    billingReadiness({
      STRIPE_MODE: "live",
      STRIPE_SECRET_KEY: "rk_live_synthetic",
      STRIPE_PRO_PRICE_ID: "price_legacy",
    }).catalogueConfigured,
  ).toBe(false);
});

it("requires a canonical HTTPS return origin in live mode and permits only test loopback HTTP", () => {
  for (const APP_URL of [
    undefined,
    "",
    "not-a-url",
    "http://app.example.test",
    "https://user:password@app.example.test",
    "https://app.example.test/path",
    "https://app.example.test/?next=other",
    "https://app.example.test/#return",
    "https://localhost:3001",
  ]) {
    expect(billingReturnOrigin({ ...env, APP_URL })).toBeUndefined();
    expect(billingReadiness({ ...env, APP_URL }).liveEnabled).toBe(false);
  }
  expect(
    billingReturnOrigin({ ...env, APP_URL: "https://app.example.test:8443" }),
  ).toBe("https://app.example.test:8443");
  expect(
    billingReturnOrigin({
      ...env,
      STRIPE_MODE: "test",
      APP_URL: "http://localhost:3001",
    }),
  ).toBe("http://localhost:3001");
  expect(
    billingReturnOrigin({
      ...env,
      STRIPE_MODE: "test",
      APP_URL: "http://remote.example.test",
    }),
  ).toBeUndefined();
});
