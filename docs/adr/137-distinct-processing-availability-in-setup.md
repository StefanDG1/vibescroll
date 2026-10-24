# ADR 137: distinct processing availability in setup

Status: locally verified implementation candidate; exact-head CI and release pending. Date: October 24, 2026.

## Decision

Extend the existing setup snapshot with optional `workCloudTextState`, either `unavailable` or `available_unverified`. The existing private-owner status query projects this through `workCloudTextAllowed(actor.subject)` without another read. A true feature gate establishes availability for review only. It never proves account connection, host execution, a successful result, media support or automatic background work.

Keep the saved `local`, `cloud` and `save_only` routes unchanged. Their existing `cloudAvailable` field still represents the separately funded managed-media route. Qualify paired-computer own-subscription and managed-cloud wording, and link to the existing experimental text guide. Legacy snapshots without the optional field stay readable and conservative.

Preserve project-builder chapter order, optional GitHub and skills, required Instagram export education, skips, reload/workspace isolation and existing completion rules. Text availability cannot complete setup or grant analysis authority. Source-specific handoff controls continue their own current input, account and grant checks. Add no polling, task, inference, API funding or provider route.

## Evidence and limits

Nineteen focused backend/step cases and seventeen existing UI cases passed, along with starter/Convex types and scoped lint/format/diff checks. Root requested shorter product copy; the affected seventeen UI cases and lint/format passed again. Initial internal-link lint warnings were fixed with the existing Next link and no-prefetch behavior, not suppression.

The dependency installation reused 721 packages with zero downloads and scripts disabled. Its first invocation used the already installed Node24.12.0 before the portable path arrived; all checks used verified portable Node24.22.1. The lockfile stayed unchanged. Do not misreport installation provenance or repeat it unnecessarily.

Root owns final integration and exact-head evidence. Native browser, supported host, model usefulness and production acceptance remain pending. Keep the same cumulative US$3 cap, all previous holds and provider/privacy/release gates. No new hosted or provider request, purchase or deployment follows.

[The receipt](../operations/evidence/launch-20261024-distinct-setup-routes.json) records 1,674 passing integrated tests with three hosted skips, all types, both builds and seventeen finance checks. Root then corrected the legacy missing-field label from unavailable to unverified; the affected seventeen UI cases, lint and formatting passed again. Final source still requires exact-head CI. No state or API value was added for that copy correction.
