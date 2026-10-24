# ADR 139: private variant project references

Status: implemented and independently reviewed candidate; full offline check passed, exact-head CI and release pending. Date: October 24, 2026.

## Decision

Extend existing project evaluation, proposals and editable plans to accept explicitly selected insights from an earned private source-text result. Resolve the actual immutable task run, private version, output hash and insight IDs on the server. Client text cannot become evidence. Do not create canonical knowledge memberships or topics for private variants.

Canonical reference, synthesis, evaluation and ordinary cache formats remain unchanged. A separate strict private evaluation reference carries the source generation/revision plus its actual run, private version and output hash. Its identity cannot collide with a canonical reference or another private output. Only evaluation-derived references admit this branch. Private source variants remain excluded from neutral synthesis, generic histories, shared artifacts and standing automatic execution.

The server authors a distinct `private_source_variant` origin on the existing task, evaluation, proposal, issue and improvement lineage. The origin binds the owner, source, earned run, selected insight IDs, base/output hashes, model and effort. This stage does not combine a second project focus brief with the selected variant. Existing brief-only tasks remain supported.

Evaluation and issue topic anchors are absent only for this private origin. Their currentness checks must enforce that distinction. An absent canonical topic never becomes a wildcard. Repository base, profile, selected context, inspection, preference and proposal versions retain their existing checks. Plans, implementation, spending and publication retain separate approvals.

## Runtime and privacy

Use task protocol `3.0.0` for private variant evaluation and its inherited plan. Reuse the existing workload names, controller, lease operations and device/state/schema index. Require separately admitted `project_private_variant_v1` runtime support at quote, claim, context, heartbeat and finish. Old workers must neither claim nor spend on these tasks. Keep bounded fair selection across supported versions.

Keep one output owner on the original source-analysis run. Project tasks store only exact selection and provenance. The existing source-erasure index also receives a truthful two-field source/generation locator for private project tasks; this is not a fabricated source inference binding. Source rights expiry, deletion and restore quarantine must erase private task inputs/results and evaluation output through existing bounded cleanup. No-topic evaluations require an explicit recovery branch.

The UI starts with no selected private insights and requires an explicit project review action for one to twelve actual loaded insights. It reuses repository, device, model, quote and consent controls. Selection changes, stale responses, source revision changes, rights expiry and another loaded result invalidate approval. Earned result reading remains independent of execution availability. No inference starts by opening or exporting a result.

## Ownership and acceptance

Root owns shared contracts/schemas, integration, documents, fiscal controls and final review. High owns backend/runtime and focused authorization tests. Medium owns the existing result and task-control extension. An independent High reviews authority, privacy, compatibility and currentness before the root integrated check.

Test exact output identity, actual selected insights, foreign owner and stale rights rejection, no canonical memberships/topics, old-worker exclusion, changed model/context/version consent, private evaluation through reviewed proposal and plan, neutral-history isolation, automation rejection and bounded cleanup/recovery. Preserve ordinary project/plan behavior and initial failures.

This is C6c text-variant project integration. Full media reanalysis, approved skills, trusted creator acquisition/contribution and official Cloud execution remain unfinished. No new provider request, deployment, live billing, purchase or budget increase follows. The cumulative US$3 cap and all earlier uncertainty holds remain. Earlier index migrations and the full backend fiscal proof remain release gates.
