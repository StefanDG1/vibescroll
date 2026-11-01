# ADR223: publish the approved Pro offer without bypassing funding

Date: November1,2026. Status: owner approved exact live prices and terms; implementation and gated activation in progress.

The owner explicitly approves the reviewed EUR35/month with300monthly credits, EUR350/year with300credits granted monthly, and EUR17every seven days with75credits. The approval authorizes three replacement live prices under the existing Pro product, a separate safe billing portal, the reviewed fair-use terms and new-sale activation subject to the existing provider/funding gates. Do not ask for the same price/terms approval again. No payment, new subscription, automatic customer migration, top-up or provider purchase is authorized by this step.

## Provider and policy changes

Use the working Stripe connection and the existing verified live merchant. Preserve the old product, six legacy price bindings, default price, old portal, top-ups and all wallet history. Create only the three approved prices with distinct lookup keys and the immutable credit-policy metadata. Verify each live response and read back the old prices unchanged. A unique lookup key and durable intent prevent blind duplicate creation after an unknown response.

Create a separate portal with cancellation at period end, invoice history and payment-method updates. Disable subscription updates and its standalone public login page. The application's current-customer binding remains authoritative. New prices and a portal are not a live purchase test; create no customer, checkout payment or subscription merely to demonstrate them.

Publish release `v1-2026-11-01.1` with terms/refunds/acceptable-use version1.1.0. Archive the complete previous published bundle first. Preserve statutory rights, the first14-day refund window, old entitlements and purchased credits. The approved offer adds individual-Pro workspaces, requested-post cache reuse, the separate full-catalog entitlement and restrained fair use. No storage quantity or repository-count limit is advertised. Unchanged privacy, cookies and DPA versions keep their actual dates. Render each policy's own published header rather than a misleading global effective-date banner.

## Funding remains separate

The actual live preparation and proposal configurations remain explicit owner-only pilots, with ten video jobs and eleven plan jobs respectively. OpenAI funding is also an owner-only ten-job policy. Do not erase or reset their counters to launch paid sales. The price/terms approval retains the funding gates.

Publishing the new policy while the old `POLICY_RELEASE_VERSION` remains configured safely closes new purchase admission. Install the approved new portal/price mapping only after the compatible backend and matching website are verified. Leave sales closed until paid-customer processing is funded and its admission tests pass. Preserve old balances, retained results and valid subscription controls throughout. Ordinary MCP use requires no reconnect or new permission review.

## Acceptance

Verify all three live price amounts/intervals/metadata, the safe portal and unchanged old records. Test that a stale published-policy binding refuses a new charge. Full checks, exact CI, actual no-scan/no-backfill admission and staged/canonical policy/pricing/Library checks precede publication. Verify the real owner Usage page is unchanged. Actual paid-customer processing and live charges remain unclaimed until their own acceptance and funding gates pass.
