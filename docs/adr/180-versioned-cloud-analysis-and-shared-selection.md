# ADR 180: versioned Cloud analysis and shared selection

Date: October 28, 2026. Status: owner direction accepted; implementation and production acceptance pending.

## Decision

Make the automatic link-to-insights flow the next production release priority. Add deliberate reanalysis of an existing post, immutable analysis history, comparison, selection and rollback. Build an entitled shared catalog that reuses valid neutral evidence and approved analysis across customers. Widgets, creator monitoring, project execution and the remaining large plan do not block this focused release. They remain deferred work, not completed requirements.

A new model, higher reasoning setting or later timestamp creates a candidate, not proof of better analysis. Default readers receive the best approved compatible version selected by a recorded quality policy. A user can pin another eligible version for their own saved post. Changing the global recommendation requires separate service authority. Failed candidates never replace the current result.

Keep source content revisions, extracted evidence, analysis versions and execution attempts distinct. Ordinary Save reuses an eligible selected result. Explicit Reanalyze creates a new attempt and result without clearing the previous analysis. Existing execution generation and lease checks must not become the version-history mechanism: changing a live source generation currently invalidates old frame bindings and references.

Reuse `publicArtifacts`, `publicImports`, source revision contracts and the existing producer/lease systems where compatible. Do not create a second competing catalog. The current serving artifact schema and the unreleased service-artifact candidate differ. The candidate's service authority requires `managed_api`, so subscription-funded Cloud output needs its own verified authority variant before contribution. Never invent a managed-provider receipt or silently publish existing private analyses.

The shared database remains access-controlled. Store reusable neutral content once, with versioned provenance and evidence. Keep saved-post associations, notes, projects, OAuth credentials, usage and private contextual analyses private. Current subscription entitlement, source rights, retention and moderation checks apply even on cache hits, historical reads and rollback. Deleting a personal association and a canonical takedown remain different operations under their approved contracts.

## Scope and acceptance

Follow the ordered [production implementation plan](../launch-plan/2026-10-23/VERSIONED-LINK-TO-INSIGHTS.md). Release tested improvements at its boundaries. Do not remove the production guard that requires an unanalyzed Cloud media post until candidate-version writes preserve the existing result atomically.

This decision authorizes planning and the requested implementation direction, not additional source jobs, budget increases, public dataset publication, price changes or wider provider permissions. Preserve the reserved post, old unknown attempts and all retained spending holds. The current owner pilot is paused after its finite test allowance. Reconcile that allowance before another live run; do not describe a successful finite test as an enabled ongoing monitor.

## Current evidence

Two private owner automatic Reel examples are recorded on October 27 and 28. The latest took 417.742 seconds from Save to ready and verified 15 speech segments, 7 JPEGs, a thumbnail and 3 insights/19 references. Versioned reanalysis, rollback, cross-customer Cloud contribution, shared cache reuse and independent customer onboarding have not passed production acceptance. The [October 28 receipt](../operations/evidence/launch-20261028-stable-v1-reel.json) distinguishes those facts.
