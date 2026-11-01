# ADR221: integrate Pro credits without rewriting legacy balances

Date: November1,2026. Status: compatible backend live atfc6208c; candidate commercial policy remains unset. [Receipt](../operations/evidence/launch-20261101-credit-policy-backend.json).

The owner requests finishing the medium-term plan, starting with credit policy and webhook/wallet integration. Preserve existing subscriptions, purchased balances, valid results and unknown reservations. ADR220's provider receipts establish billing dates, not application settlement.

## Integration

Keep the existing six legacy price IDs and their65/250 Starter and150/600 Pro allowances. Resolve a separately configured candidate policy only for three distinct new price IDs, with exact account/mode/version and EUR17/35/350 terms. Production has no candidate mapping today. An explicit reviewed live mapping is an activation step, not a consequence of deploying compatible code. Disable new checkouts independently of already-paid grant reconciliation.

Reconciliation must match the first-class customer/subscription/paid-invoice/non-proration-line graph before granting the new policy. Require the exact price, amount, currency and provider period. Annual payment grants only the current300-credit monthly window. Weekly grants75over seven UTC days. Preserve the November30→December31 provider end, stable subscription/window identity, existing refund allocation and revision fencing.

The internal ledger derives the allowance from the configured policy; callers cannot choose an arbitrary credit amount. New-policy grants belong only to the person's canonical private workspace. Joining or creating teams grants no second pool. Legacy workspace grants and old subscription balances keep their current behavior. Replaying or lowering a policy must never shrink an existing grant or release a reservation.

Risk review found the existing handler accepts refunds but does not resolve dispute/fraud-warning events. Add one initially empty risk-hold table with exact customer/account/charge ownership. Existing schemas/indexes remain unchanged. A confirmed risk pauses new reservations and included grants; existing reservations may finish and balances/results are retained. Resolve modern Stripe events through PaymentIntent→InvoicePayment→Invoice→Subscription where present. A won dispute or a restricted invoice operator's recorded review can release that exact hold. Replays and out-of-order events cannot reopen resolved risks or clear another risk. Actual publication must explicitly admit only this empty table and require zero populated scans/backfills.

Follow [Stripe's subscription event and object-graph guidance](https://docs.stripe.com/billing/subscriptions/webhooks#refund-events). Risk handling introduces no automatic refund, cancellation, deletion or customer-price migration.

## Acceptance order

1. Controlled policy/paid-graph rejection and UTC boundary tests, including unknown prices and disabled/mismatched configuration.
2. Actual signed Stripe webhook payloads through the application handler into wallets: new and legacy initial/renewal grants, duplicate/out-of-order delivery, failure/recovery, cancellation and annual monthly grants.
3. Preserve purchased and unknown reserved units, reject cross-customer/account/workspace graphs, enforce one personal pool and retain legacy upgrade/refund behavior.
4. Reuse retained sandbox receipts for provider-shape acceptance. Any actual provider delivery remains separately reported from signed synthetic payloads or direct SDK event reads.
5. Full checks, exact CI and compatible publication within the current monetary/provider limits. Verify legacy production reads without modifying a real customer's subscription or funding a test wallet there.

Finish the concrete migration and tax/storage/top-up/customer review before live price creation or customer movement. Keep the medium-term checklist open for unmet external acceptance; do not call a disabled gate commercially complete.

## Local checkpoint

The candidate policy, HTTP webhook, wallet and risk holds are implemented. Focused tests pass the actual Stripe SDK signature verifier and application handler with synthetic events, retained actual sandbox subscription/invoice shapes, concurrency, stale delivery, annual windows, failed payments, renewal migration and preserved purchased/reserved units. Historical unconfigured legacy prices retain status reconciliation without creating new credits. Missing new-policy configuration cannot downgrade the existing stored entitlement.

Risk tests cover independent dispute/warning holds, won-dispute release, restricted operator review, provider-enrichment outage, blocked new purchases/work and completion of already-reserved work. The schema regression permits only the new initially empty risk table and three indexes, retaining historical comparisons. These are controlled signed delivery and isolated wallet tests. They do not establish an actual Stripe provider endpoint delivery, a real customer migration, live offer activation or commercial approval.

Actual provider follow-up passed in13.07seconds using the existing official Stripe CLI1.35.0 listener and verified sandbox key, with no new tunnel/service. A genuine sandbox event was read back through Stripe, accepted by the application's real signature verifier/HTTP handler and settled300credits once into an isolated synthetic wallet. Replaying that same signed delivery changed nothing. The owned synthetic subscription was cancelled and the listener stopped. This closes actual sandbox delivery-to-wallet acceptance, not live managed Checkout/tax or real-customer purchase acceptance. Production's owner allowance and expired hold are unchanged; original MCP reads still work. Exact CI41260073813 and actual zero-scan/no-backfill publication passed.
