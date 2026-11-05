# ADR220: bind candidate Pro grants to provider billing periods

Status: sandbox preparation accepted; production activation remains gated.

Date: November1,2026.

## Evidence and decision

The owner selected preparation of EUR17/week with75credits, EUR35/month with300credits and EUR350/year with300credits granted monthly. The existing isolated VibeScroller sandbox contains three matching new prices under its existing Pro product. All eight older prices remain unchanged.

Actual subscriptions and test-clock renewals paid the exact three amounts. The October31 monthly anchor renewed on November30 with a December31 end. Calculating one calendar month from the clamped November30 start incorrectly produces December30. Require the verified provider period end in the candidate calendar. Weekly periods remain exactly seven UTC days; annual periods produce twelve independently clamped monthly windows from the original yearly anchor. Stable person/subscription/start keys survive replay. This helper performs no provider request or wallet write.

Invoice-level `period_start`/`period_end` describe preceding billing activity in these actual records. Resolve the paid invoice through its first-class subscription/customer graph and match its non-proration line's price and period to the subscription item. Do not grant from invoice-level period fields, metadata alone, an unpaid invoice or a Checkout success page. Six retained paid-invoice graphs pass the offline candidate mapper.

## Sandbox acceptance and failures

Three initial subscriptions and three renewals passed. A monthly failed renewal produced an open invoice, zero paid amount, `past_due` and an actual `invoice.payment_failed` event. Restoring the good method and paying the same invoice recovered the subscription. Replaying its exact idempotency key returned the same invoice and exactly one paid event. Cancel-at-period-end ended that subscription without another renewal invoice. These are provider API/event acceptance, not signed webhook delivery or application wallet acceptance.

Initial synthetic cards omitted their billing country and the merchant's existing rule blocked them. The actual payment detail identified that predicate. Adding an allowed country to only the synthetic methods resolved it; no fraud rule changed. A separate insufficient-funds fixture fails during Customer attachment, as Stripe documents. The supported `pm_card_chargeCustomerFail` fixture attached successfully and tested a later failed renewal. Preserve all failed attempts and request IDs.

## Boundaries

Production remains websitecbe062d/backend2510081 with legacy commerce unchanged. Do not install the sandbox key in production, change live prices, reduce existing600-credit allowances, migrate customers or release unknown holds. Candidate activation still requires exact legacy mapping, tax/customer terms, retention/fair-use/top-up review and concrete live publication approval. Required subscription/risk webhooks and independent paid-person/team tests remain separate acceptance.

The owner completed Stripe connection consent, but this Codex connector continues to return `UNAUTHORIZED`. The signed-in sandbox and scoped test-only SDK key supplied the accepted fallback. Repeating consent is not an authentication diagnosis. Keep the temporary key and detailed account/resource receipts out of Git and revoke only that owned key after reconciliation.

## Validation

The price-preservation, six paid-period mapping, failed-renewal/recovery/cancellation receipt tests and calendar tests pass together. The provider tests opt in to ignored receipts, need no credentials during execution and skip in ordinary CI. Public evidence records only aggregate results. No actual application credit grant, signed webhook dispatch, live charge or customer migration is claimed.
