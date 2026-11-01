# Configure the versioned Pro credit policy

Mode: how-to. Follow [ADR221](../adr/221-versioned-pro-credit-policy.md) and the [migration review](../launch-plan/2026-10-31/PRO-MIGRATION-REVIEW.md). This procedure does not authorize live activation.

## Keep legacy terms

Leave the existing six `STRIPE_{STARTER|PRO}_{WEEKLY|MONTHLY|ANNUAL}_PRICE_ID` values unchanged. They continue to resolve to65/250 Starter and150/600 Pro credits. Purchased balances and existing grants keep their original units. Do not point an old variable at a new smaller-allowance price.

The optional backend-only `STRIPE_PRO_CREDIT_POLICY_V2_JSON` maps three additional prices. Do not put it in a browser environment. Its shape is:

```json
{
  "version": "pro-eur-20261031-preview-v2",
  "accountId": "acct_synthetic",
  "mode": "test",
  "activation": "sandbox",
  "prices": {
    "weekly": "price_synthetic_week",
    "monthly": "price_synthetic_month",
    "annual": "price_synthetic_year"
  }
}
```

Use the verified account and exact IDs from the private review packet. All three IDs must differ from each other and every legacy price. The immutable policy binds EUR17/week/75credits, EUR35/month/300credits and EUR350/year/300monthly. Price metadata must retain `product=vibescroller`, `tier=pro`, the exact `policy` version and interval `weekly`, `monthly` or `annual`. Recurring count is1, currencyEUR and tax behaviorinclusive. Retiring a price from new sale does not invalidate an already-paid allowance.

For a reviewed live activation only, use `mode=live` and `activation=reviewed_live` with separately reviewed live IDs and the matching merchant. Never install sandbox credentials or IDs in production. Existing checkout, tax/publication and customer-migration gates still apply. This mapping alone does not change the public offer, create a purchase, migrate customers or install a new checkout UI.

## Verify settlement

The reconciler reads the current provider subscription and paid invoice, not the age of the webhook. Match exact customer/subscription/price/line ownership and provider period. A signed event wakes reconciliation; an old event cannot choose an old snapshot. Annual reconciliation grants only the monthly window containing the current time. Invoice-level billing periods do not define the new allowance end.

Candidate grants require the canonical personal workspace. Team membership creates no allowance. A new paid wallet starts without a newly minted trial; an existing trial or purchased balance remains untouched. Period keys stay `subscription:start`, so replay adds no second grant and a smaller new policy does not shrink an existing paid period. Migration happens through a reviewed renewal change, never by rewriting balances.

## Handle payment review

Subscribe the dedicated Stripe endpoint to the lifecycle events it processes and to `charge.refunded`, `charge.dispute.created`, `charge.dispute.closed` and `radar.early_fraud_warning.created`. Verify actual provider endpoint delivery separately from local signed tests.

A canonical dispute/fraud-warning Charge maps to its stored billing customer. The backend persists that hold before optional invoice enrichment. It resolves modern PaymentIntent→InvoicePayment→Invoice→Subscription context where present. Holds pause new funded reservations, new purchases and included grants. Existing reservations can finish; results, purchases and balances remain stored. No automatic refund, cancellation or deletion occurs. Unknown or multi-invoice allocation remains review work.

Each risk has its own key. A canonical won dispute releases only that risk. Fraud warnings or unresolved/lost disputes require a recorded review. Only verified subjects in the existing `INVOICE_OPERATOR_SUBJECTS_JSON` allowlist can call `billingRisk.reviewQueue` and `billingRisk.releaseReviewed`. Ordinary owners and assistant tokens cannot authorize financial review. Never clear all holds to make a test pass.

## Roll back safely

Disable new checkout through the existing release gate; keep the price-policy mapping needed by already-paid customers. If a mapping is accidentally absent, reconciliation returns a retryable error without downgrading the current stored entitlement or modifying pools. Restore the reviewed mapping and reconcile again. Do not release unknown reservations, remove paid windows, delete the risk table or reset funding counters.

The candidate terms file remains an immutable policy definition; business approval is recorded separately. Changing allowance/term values needs a new policy version and migration review.

## Single-Pro checkout and portal

ADR222 adds one new-sale offer without replacing legacy settlement. Public/account pages share the canonical candidate amounts. The new-sale form is disabled unless the exact candidate mapping and normal provider/release gates pass. Candidate checkout requires the personal billing workspace, refuses Starter and partial subscription snapshots, verifies the actual price and uses replay-safe checkout intents. An old subscription remains manageable without a forced migration.

Set the separate backend-only `STRIPE_PRO_PORTAL_CONFIG_ID` for new-offer mode. The configuration must be active in the same Stripe mode and enable cancellation, payment-method updates and invoice history, with subscription updates disabled. Both candidate checkout and portal access verify this contract. Keep the old `STRIPE_PORTAL_CONFIG_ID` and old six price bindings for historical records; do not reuse a portal that can sell obsolete prices. Without the candidate mapping, legacy behavior remains unchanged.

Once the new mapping is active, new wallets receive no hosted trial allowance; existing wallet rows are returned unchanged. Pro has no subscription repository-count quota. Per-operation batching, permissions, concurrency and credit admission still apply. Review [the launch terms](../launch-plan/2026-10-31/PRO-LAUNCH-TERMS-REVIEW.md) before live offer activation.

Bulk repository selection admits at most1,000choices/connection records/installation records in one operation. It refuses an incomplete prefix before writes; individual Pro registration skips the product-count scan. Existing projects remain intact on refusal.
