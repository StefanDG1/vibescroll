# ADR223: publish the approved Pro offer without bypassing funding

Date: November1,2026. Status: approved live price/portal configuration and matching policy publication accepted; public sales await funded customer admission.

The owner explicitly approves the reviewed EUR35/month with300monthly credits, EUR350/year with300credits granted monthly, and EUR17every seven days with75credits. The approval authorizes three replacement live prices under the existing Pro product, a separate safe billing portal, the reviewed fair-use terms and new-sale activation subject to the existing provider/funding gates. Do not ask for the same price/terms approval again. No payment, new subscription, automatic customer migration, top-up or provider purchase is authorized by this step.

## Provider and policy changes

Use the working Stripe connection and the existing verified live merchant. Preserve the old product, six legacy price bindings, default price, old portal, top-ups and all wallet history. Create only the three approved prices with distinct lookup keys and the immutable credit-policy metadata. Verify each live response and read back the old prices unchanged. A unique lookup key and durable intent prevent blind duplicate creation after an unknown response.

Create a separate portal with cancellation at period end, invoice history and payment-method updates. Disable subscription updates and its standalone public login page. The application's current-customer binding remains authoritative. New prices and a portal are not a live purchase test; create no customer, checkout payment or subscription merely to demonstrate them.

Publish release `v1-2026-11-01.1` with terms/refunds/acceptable-use version1.1.0. Archive the complete previous published bundle first. Preserve statutory rights, the first14-day refund window, old entitlements and purchased credits. The approved offer adds individual-Pro workspaces, requested-post cache reuse, the separate full-catalog entitlement and restrained fair use. No storage quantity or repository-count limit is advertised. Unchanged privacy, cookies and DPA versions keep their actual dates. Render each policy's own published header rather than a misleading global effective-date banner.

## Funding remains separate

The actual live preparation and proposal configurations remain explicit owner-only pilots, with ten video jobs and eleven plan jobs respectively. OpenAI funding is also an owner-only ten-job policy. Do not erase or reset their counters to launch paid sales. The price/terms approval retains the funding gates.

The cutover temporarily failed closed while the published policy and old configured version differed. After canonical verification, the exact new policy/price/portal bindings were installed and read back, with `LIVE_CHECKOUT_ENABLED=false` explicitly retained as the sales gate. Leave sales closed until paid-customer processing is funded and its admission tests pass. Preserve old balances, retained results and valid subscription controls throughout. Ordinary MCP use requires no reconnect or new permission review.

## Acceptance

Verify all three live price amounts/intervals/metadata, the safe portal and unchanged old records. Test that a stale published-policy binding refuses a new charge. Full checks, exact CI, actual no-scan/no-backfill admission and staged/canonical policy/pricing/Library checks precede publication. Verify the real owner Usage page is unchanged. Actual paid-customer processing and live charges remain unclaimed until their own acceptance and funding gates pass.

## Currency research

Stripe's current [Adaptive Pricing reporting](https://docs.stripe.com/payments/currencies/localize-prices/adaptive-pricing?payment-ui=stripe-hosted) and [tax/invoicing guidance](https://docs.stripe.com/tax/calculating/adaptive-pricing) retain the integration currency for reporting/invoicing while exposing local presentment separately. Managed Payments supplies this localization automatically. Keep the exact canonical EUR price/invoice checks; do not weaken grant validation based on a guessed local-currency conversion. A real cross-currency purchase remains untested and no test charge is authorized.

## Production acceptance, November1

Website/backend480e9fc are live with exact CI41291279045, full local1503main/52auth/174knowledge cases, two deterministic preparations and17 actual zero-change publication guards. One42.911s fixed Basic/normal build passed24staged and24canonical policy/pricing/feed/Library cases and same-build promotion. Both canonical aliases completed and normal domain assignment was restored. The approved three live Pro prices and safe portal are configured and read back. Published policyv1-2026-11-01.1 preserves the complete previous bundle and first14-day refund section. All seven legacy price/portal bindings, the complete owner Usage text and its expired unknown hold are unchanged. Original MCP reads show automatic analysis enabled and no setup required. No customer, subscription, charge, source job, model call, wallet grant, migration or provider purchase occurred. New sales are explicitly closed with LIVE_CHECKOUT_ENABLED=false. The matching policy binding and approved price/portal mapping are installed; no stale policy identifier is used as an accidental gate. Existing processing remains the finite owner pilot. The separate proposed USD10/month paid-customer operating allowance is pending. Do not infer approval from existing Gateway credit, the price/terms approval or elapsed time. Paid-customer admission and independent acceptance remain open. Do not reconnect the original MCP or reset pilot counters. [Receipt](../operations/evidence/launch-20261101-approved-pro-offer-production.json).
