# ADR 134: purchased allowance commitments

Status: reviewed implementation candidate; exact-head CI and live acceptance pending. Date: October 24, 2026.

## Decision

Preserve purchased credit quantities independently of the editable pricing presentation. Extend the existing billing row, legal acceptance, billing period and plan-change records. Do not add another wallet, billing provider, queue or entitlement store.

The frozen `allowance-policy-v1` registry recognizes the current catalogue 1.1.0 contracts. Starter grants 65 credits weekly or 250 per calendar month; Pro grants 150 weekly or 600 per calendar month. An annual purchase grants the monthly quantity across its paid year. The registry records price, catalogue, schedule and acceptance provenance. A future offer requires a separately reviewed registry entry. EUR35/350 remains a proposal, its allowance quantity remains unselected, and lifetime access remains deferred.

Record the server-selected checkout policy on the existing legal acceptance with its checkout key, workspace/customer, provider account/mode and first subscription binding. Subscription metadata locates that record; it cannot supply a credit quantity or confer authority. Retain this evidence after a checkout reservation expires or a later checkout replaces it. Idempotent retries use the first accepted purchase.

Reconciliation requires a complete subscription/item result, one licensed item with quantity one, the actual customer/account/mode and a complete paid invoice covering the exact subscription item, price and paid term. A paid discounted invoice can qualify. Do not mistake a partial provider page or an arbitrary metadata price for a contract. Exact durable purchase/change evidence takes precedence over mutable current price configuration; unrecognized legacy histories require reconciliation.

Persist a `paid-allowance-v1` commitment containing the provider environment, subscription/item, paid start/end, original UTC calendar anchor, base policy and original base invoice. A paid upgrade adds the existing plan-change identity and separate upgrade invoice contribution. Do not replace the annual base invoice with the latest proration invoice. Existing credit-funding records retain the separate refund attribution for every monthly pool.

Use the original billing anchor for calendar grants, including January 31 clamping and February 29 across nonleap renewals. An annual term has at most twelve monthly grants. A quote crossing a monthly allowance boundary can apply its paid upgrade within that same annual term; clamp its additional credits to the current monthly pool rather than rejecting the earlier quote time.

New periods require a verified persisted commitment. Copy their base policy into the existing billing-period record. Replays do not manufacture a new allowance; unknown purchase evidence holds new unissued grants and plan changes while preserving valid issued pools, purchased top-ups, reservations, saved copies and the user's private work. Restore locks, provider deletion, revision fencing and invoice revocation remain authoritative.

## Evidence and release limits

Root owns the serialized fields and integration. An independent High reviewer checked purchase binding, renewal, upgrade, refunds and conservative legacy recovery. Its durable-price, annual-boundary and namespace-deletion findings were corrected. [The receipt](../operations/evidence/launch-20261024-purchased-allowance.json) and status record retain commands, base commit, failures and skips. The full offline check passed 1,603 cases with three hosted skips before the final namespace guard; the final fifty-four-case focused run, actual root/Convex types and scoped lint/format passed afterward. Exact-head CI must verify the committed final source.

This decision changes no price, payment method, SDK version, policy publication, live catalogue or provider setting. It authorizes no charge, deployment or new spending. The cumulative US$3 task cap and all prior unknown holds remain. Live payment/portal and migrated legacy-account acceptance remain separate from offline fixtures.
