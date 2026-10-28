# Implementation plan

The mandatory October 28 continuation is [Shared intelligence and the VibeScroll moat](strategy/SHARED-INTELLIGENCE-MOAT.md), with the [versioned link-to-insights execution plan](launch-plan/2026-10-23/VERSIONED-LINK-TO-INSIGHTS.md). Complete S1-S6 for the focused backend-first release; retain S7-S9 experiments, rankings, recommendations and learning as later tracked additions. This owner direction does not claim those stages are already live.

Mode: how-to. Work packages are ordered dependencies, not time estimates.

## Complete work in vertical slices

Complete the browser capture-to-summary slice before building advanced matching. Complete proposal-to-plan before enabling execution. The first real end-to-end PR proves the integration boundary; it does not replace the rest of the release tests.

Keep a work-package status record with `not_started`, `in_progress`, `blocked_external`, `verified_staging`, and `verified_production`. A task is not done because a mock button responds.

## WP01. Export and isolate the foundation

Requirements: R02 R03 R04 R34.

Inspect/export CompanyNerve; preserve upstream notices; create environment validation, CI, and implementation-status record.

Completion evidence: Fresh install, typecheck, tests, and build succeed without production credentials. No upstream secrets appear.

## WP02. Build the responsive shell and labeled demo

Requirements: R01 R02 R24 R33.

Implement public route groups, application navigation, semantic tokens, fixture library, and mobile layouts.

Completion evidence: All primary screens render at 320/390/1440 widths with no page overflow. Fixtures are labeled.

## WP03. Implement identity and tenant data

Requirements: R03 R04 R36.

Connect WorkOS, workspace membership, roles, schema, private queries, and reauthentication.

Completion evidence: Real staging login and cross-workspace denial pass. Logout clears private local state.

## WP04. Implement capture and uploads

Requirements: R05 R06 R11.

Add URL inbox, private direct uploads, import manifest, idempotency, and Android share fallback.

Completion evidence: Owned media and duplicate/invalid/private-source cases produce correct states.

## WP05. Implement cost ledger and orchestration

Requirements: R07 R12 R28.

Add reservations, stage commits, outbox, retries, lease fencing, cancellation, and operator caps.

Completion evidence: Concurrent requests cannot overspend or duplicate a committed stage.

## WP06. Connect real media processing

Requirements: R07 R08 R09 R10 R35.

Build decoder image, transcription adapter, frame sampling, structured insights, and uncertainty display.

Completion evidence: A rights-cleared sample produces transcript and evidence. Caption-only fallback never claims full analysis.

## WP07. Finish the library and private reuse

Requirements: R11 R12 R24 R29.

Implement search, filters, tags, source detail, private cache keys, retention, and source deletion.

Completion evidence: Duplicate analysis is reused within a workspace only. Deleted content disappears from search and objects.

## WP08. Connect repositories and profiles

Requirements: R13 R14 R15.

GitHub App onboarding, selected repo snapshots, exclusions, secret checks, and confirmed business profiles.

Completion evidence: A read-only repo is analyzed without execution. Forbidden files never enter model context.

## WP09. Match and review proposals

Requirements: R16 R17 R18 R25.

Retrieve plausible projects, validate evidence, create proposal versions, plan editor, and feedback events.

Completion evidence: Relevant, no-fit, already-implemented, and unsupported fixtures receive distinct useful outcomes.

## WP10. Implement AI settings

Requirements: R26 R28 R36.

Managed/BYO routes, encrypted credentials, model registry, quotes, account capability states, and no-fallback policy.

Completion evidence: Revocation and exhausted allowance pause jobs. No secret appears in browser or logs.

## WP11. Build the optional local runner

Requirements: R19 R20.

Implement pairing, repository mapping, OS isolation, app-server adapter, progress, and cancellation.

Completion evidence: A staged local task completes from browser approval without opening an inbound port or touching a dirty worktree.

## WP12. Build cloud execution

Requirements: R19 R21 R28.

Implement isolated sandbox jobs, brokered inference, resource/egress controls, cost stopping, and cleanup.

Completion evidence: A browser-only user can complete a funded run. Budget and isolation adversarial tests pass.

## WP13. Publish and reconcile draft PRs

Requirements: R22 R23 R24 R35.

Validate patches, trusted publisher, final review, run markers, webhooks, and reconciliation.

Completion evidence: Exactly one PR is created. Merge, close-unmerged, reopen, revert, and access loss display correctly.

## WP14. Complete notifications and feedback

Requirements: R05 R25 R30.

Telegram pairing, safe in-app/email notifications, preferences, outcome forms, and metric projections.

Completion evidence: Messages do not execute jobs. Acceptance and merge do not populate a positive outcome.

## WP15. Connect billing and tax workflows

Requirements: R27 R28 R32.

Six prices, top-ups, portal, proration, credit renewal, refunds, invoice queue, and evidenced tax modes.

Completion evidence: Sandbox lifecycle and concurrency tests pass. Live mode is gated by tax and provider evidence.

## WP16. Finish privacy and security

Requirements: R29 R31 R32 R36.

Exports/deletion, policy pages, rights workflow, secret rotation, threat tests, backup restoration, incident switches.

Completion evidence: Deletion after restore, foreign-object denial, malicious content, and key rotation pass.

## WP17. Run evaluation and release checks

Requirements: R01 R02 R33 R34.

Run clip/repo benchmark, browser/accessibility suite, cost calibration, host profiles, and public copy audit.

Completion evidence: No unimplemented feature is advertised. Results distinguish real integrations from fixtures.

## WP18. Authorize and verify production release

Requirements: R27 R31 R32 R34.

Operator completes external gates, authorizes DNS/live changes, verifies real onboarding, and signs release record.

Completion evidence: All mandatory launch gates have evidence. No critical security defect or unresolved billing/tax mismatch remains.

## Required implementation commands

Create stable commands for formatting, linting, type checking, unit tests, integration tests, browser tests, security fixtures, benchmark evaluation, build, and package validation. Document the actual commands after inspecting the exported workspace. Do not claim commands exist before adding them.

Use CI to run safe local checks on every PR. Keep provider integration tests isolated in staging and protect their credentials. Never run untrusted fork code with production secrets.

## External blockers

A provider account, commercial permission, official tax record, or legal review can block its production activation. Continue implementing and testing the other components with explicit staging fixtures. Do not label a gated external capability as complete, silently drop it, or bypass its restrictions.

The complete V1 paid release includes a real cloud execution option. A private local-only preview is allowed but must be labeled as such. The release checklist distinguishes these states.
