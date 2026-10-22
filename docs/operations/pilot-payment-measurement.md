# Verify pilot payment observations

Status: engineered, local synthetic tests only. Measurement is disabled by default. No external sender, billing activation, catalogue change or real purchase is created by this module.

The signed V1 Stripe webhook verifies signature, provider account and mode before forwarding a bounded paid-event record. A monthly observation also requires the current matching positive paid invoice and an accepted entitlement ledger revision. A top-up requires the retrieved paid checkout, a positive amount and the accepted purchased-credit ledger. Pending, failed, refunded, unverified and stale transactions do not count. Annual/weekly renewals and the inactive founding pass are not recorded as monthly purchase tests.

The ledger mutation atomically persists a minimal `payment_verified` observation with a digest replay key. Properties contain only schema version, test/live mode and purchase kind. They contain no customer/card data, payment identifier, source text, repository or complete URL. Internal keys are not analytics payloads. Duplicate provider deliveries and replayed ledger grants retain one observation.

Consent comes from current persisted workspace analytics preferences and must predate the provider event. Current cohort eligibility comes from the server-owned organization allowlist. The following settings are required before a reviewed pilot can record observations:

- `PILOT_PAYMENT_MEASUREMENT_ENABLED=true`
- `PILOT_PAYMENT_MEASUREMENT_START_AT_MS`, a positive UTC epoch-millisecond start, no later than an eligible event
- `PILOT_PAYMENT_ORGANIZATIONS_JSON`, an explicit JSON array of eligible workspace IDs
- Existing verified Stripe account/mode configuration and current analytics consent

These are configuration requirements, not permission to set them or start live work. Empty, missing or invalid configuration records no observations. A later consent opt-in cannot convert an older event into a new purchase observation.

Refunds and consent withdrawal mark pending observations withdrawn. Restore keeps withdrawn digest tombstones so old webhook replay cannot recreate a measurement. Any future sender must recheck current consent, cohort and restore authority; none is implemented here. Browser events and checkout redirects never assert verified payment.

An observation means an accepted provider-paid purchase at its recorded scope. It does not certify cleared bank payout, settled net revenue, tax treatment or customer value. Test mode remains explicitly distinct from live, and repeat invoices do not establish unique buyers. The pilot worksheet needs its own participant denominators and observation window.

Local acceptance uses fixture Stripe responses and actual Convex mutation transactions, including duplicate delivery, current ledger rejection, missing consent, pending settlement, wrong mode/account/payment identity, refunds and consent revocation. Actual provider settlement and payment decisions remain separate pending evidence.
