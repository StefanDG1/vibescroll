# ADR 190: retain simultaneous saves and reconcile overlapping publication

Date: October29,2026. Status: local candidate, not deployed.

The owner requires two people analyzing the same post at about the same time to keep their saves and shared results without errors. Production testing is not required for this addition. Use isolated real backend mutations/actions with synthetic accounts, results and screenshot storage.

The existing indexed catalog-family reservation runs in the same Convex transaction as producer selection. Equivalent app saves keep two private source records and one producer with a bounded waiter list. The second user receives a reference to the independently retained shared result after publication. Subscriptions and private context remain separate. A different requested analysis may produce another immutable version; it does not overwrite the other user's private version or evidence.

Two completion actions can still overlap while screenshots are being copied. A repeated completion previously reported unknown, and an equivalent second contribution could receive SOURCE_BUSY before the first artifact became eligible. Keep those automatic publications pending. Reconcile them through at most twelve15-second scheduled retries, without another analysis, acquisition or screenshot copy. The normal transaction and stable contribution key make each retry idempotent. A typed internal waiting result crosses the mutation/action boundary; do not rely on JavaScript exception class identity surviving transport.

When the first copy is eligible, a duplicate completion reuses its contribution. A distinct equivalent private version receives its own contribution pointing to the same shared artifact. Distinct output/model/recipe variants retain separate catalog versions. If the copy remains uncertain after the bounded wait, preserve every private result and report catalog uncertainty rather than rerunning paid or subscription analysis. Normal deletion, withdrawal, entitlement and authorization checks still apply.

Isolated tests cover two accounts reserving together, two saved source records and one producer, overlapping completions during storage IO, two preserved private versions with one shared artifact, no duplicate screenshot IO, bounded waiting and original ready analysis surviving uncertainty. No new table, index or production concurrency test is needed.
