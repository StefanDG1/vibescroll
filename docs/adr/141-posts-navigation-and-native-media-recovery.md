# ADR 141: Posts navigation and native media recovery

Status: reviewed recovery candidate; exact-head CI and deployment pending. Date: October 24, 2026.

## Decision

The owner resumed work after the October 24 stop checkpoint to investigate a production page error and complete one selected local media analysis. This recovery does not lift the full-main deployment hold in [ADR 140](140-public-main-consolidation-with-deployment-hold.md).

The captured production error was `Cannot read properties of undefined (reading 'replaceAll')`. Compact Home cards omit source coverage. A Library context response cleared `compact` while retaining those cards, so selecting Posts passed an incomplete card to `coverageLabel` before the Library page arrived.

Discard only compact preview rows and their preview cursor when merging Library context. Preserve already loaded full rows and their real cursor. A successful Library page marks its rows authoritative while retaining the existing partial-workspace marker, so Save still loads full editor context. Context and page responses can arrive in either order without discarding a completed page or restarting loading. Missing display coverage reads `Coverage not recorded`; it does not imply link or analysis coverage.

The local media CLI now imports the existing native `prepareLocalUrl` module directly. Runtime Vite bundling rewrote the cleanup helper's file URL into a data URL and caused `ERR_INVALID_URL_SCHEME` before Docker or acquisition. Native imports preserve the cleanup helper's real location and reuse the same policy checks, configuration size limit, redacted errors and isolated preparation path.

## Verification and release scope

Reviewed full-main repair commit `e2fd30bea0191a71ae0441beca753ba8fc76b3ee` has focused tests, final types/format checks and actual Console hydration/navigation evidence. The native fixture reproduces the old crash and verifies delayed page loading, full-page reuse, reversed page/context ordering, Save's full-context refresh, and missing display coverage. It uses authored synthetic responses. The complete offline `pnpm check` passed before the final small race fixes; exact-head CI remains pending.

One real local preparation completed in 130.217 seconds with 48 sampled frames and 27 speech segments. One official own-subscription inference completed in 41.7217 seconds and produced seven insights retained privately. No canonical production result has been saved. This is one owner-local run, not a quality benchmark or official Cloud acceptance.

A narrow compatible cherry-pick, `e2e25b996ca9eac0e81c05f070bf5c2435c4a7ef`, is prepared on `launch-foundation-verify` and remains unpushed. Neither repair is deployed. Production remains frontend `fba56d44c484260dc98e27174e943ee5ed21af51` and backend `abfdeff6779a2fc7790d4441152117262965fe60`. Main versioning still follows [the versioning policy](../VERSIONING.md); local commits do not create a public product version.

The [sanitized recovery receipt](../operations/evidence/launch-20261024-video-page-recovery.json) records verification limits, retained failures and budget reconciliation. Separate uncommitted cleanup work is outside this repair's acceptance.
