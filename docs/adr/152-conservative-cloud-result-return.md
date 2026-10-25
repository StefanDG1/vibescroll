# ADR 152: preserve uncertain Cloud results and recover exact returns

Date: October 25, 2026. Status: implemented, merged and production return verified.

## Observed failure

The real owner-account MCP run acquired the permitted Reel, decoded its 46.9-second video, transcribed eighteen segments and inspected eight frames. The backend accepted preparation. Final completion was rejected with `ORDERED_MEDIA_UNCERTAIN_EVIDENCE`: four insights claimed support while their citations disclosed uncertainty. No canonical analysis was saved. The exact private payload reproduces the failure offline; five insights and twenty-nine citations pass the unchanged strict validator when affected confidence is uncertain.

## Decision

In the private Work Cloud adapter, lower supported confidence to uncertain whenever the same `socialCitation` predicate used by the strict validator finds cited uncertainty. Clone parsed output, preserve the raw completion hash and all evidence, reject invalid citations and never upgrade unsupported confidence. Add an explanatory warning. Keep the shared validator unchanged.

Extend existing recent-owner approval with an optional exact-result recovery review. Bind current source generation, owner and organization-bound grant, original task, input/policy hashes, unchanged retained preparation and raw canonical completion-envelope hash. Refuse existing results, expired evidence and changed authority. Audit the review. Preserve source IDs, generation, original execution deadline, preparation, selected identity, consent, token hash and settled reservation.

Recovery authorizes only the original authenticated task's exact result return for at most three minutes, capped by original retention. Reuse state `recovering` and the existing completion hash. Only completion receives this exception. Input, preparation, heartbeat, claim and failure cannot restart execution. Changed output, usage or model reports fail before writes. Provider usage stays unverified. There is no new acquisition, inference, reservation, paid fallback, schema, index or store.

Current Cloud status overrides older local-intake advice. Cloud waiting, processing, unknown, recovery and ready states must not tell users to wake a computer or buy credits.

## Acceptance

Focused tests cover conservative confidence, raw/evidence preservation, exact return after the original deadline, fixed expiry, current authority, hash tampering, denied execution operations and idempotency. Root owns actual payload validation, independent review, exact-head CI, unchanged-schema publication and real MCP return. Keep cumulative EUR5, all prior unknown/future holds, reserved owner-test post and provider/privacy/catalog gates. The existing frontend remains live; no extra website build is required.

## Production outcome, October25

[The receipt](../operations/evidence/launch-20261025-cloud-video-return.json) records backend398c325 and accepted completion plus canonical fetch of five insights/twenty-nine citations in the original account. Owner recovery used the normal protected app API and fresh SSO, then only the original Cloud completion and one fetch. Generation, preparation and raw result stayed unchanged; no new provider work ran. The original failure remains recorded. This closes that exact return, not automatic dispatch, full visual coverage, fresh-run reliability, native rendering or commercial availability.
