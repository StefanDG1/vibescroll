# ADR215: refresh one project without reselecting a workspace

Date: October31,2026. Status: implementation candidate; production acceptance pending.

## Problem

The live proposal issue preflight returns BASE_CHANGED. The saved VibeScroll snapshot is95f4265, while the current remote main iscf19602. No issue was published. The existing repository connection/selection refresh prepares every selected project, changes their selection versions and can unnecessarily stale unrelated proposals.

## Decision

Add a normal owner/admin-session refresh for one enabled repository, bound to its expected SHA and selection version. Advance only that selection fence and prepare its current authorized snapshot using the existing provider, content and manifest services. Keep the confirmed profile, drafts, discussion, old proposals and other repositories. No AI draft, inference, credit reservation or issue publication is part of refresh.

Concurrent clicks admit one preparation. A stale or disabled selection rejects a returned snapshot before persistence. Known preparation failures retain the old snapshot with needs_attention. An interrupted preparing state is not automatically replayed. Review the current selection and actual outcome first.

Expose the action alongside repository context. Refreshing does not reapprove or rewrite a plan. The exact updated context must be reviewed before saving a new proposal version or publishing. Preserve BASE_CHANGED in asynchronous issue failure receipts instead of labelling it GITHUB_UNAVAILABLE. Unknown publication after dispatch remains lookup-only.

No schema, index, component, auth or cron changes are required. The existing fresh repository snapshot transport and all exclusion rules remain in force.

## Validation

Focused tests cover single-project isolation, confirmed-profile retention, concurrent refresh, stale and unauthorized callers and changed-selection completion fencing. Run full checks, exact CI and compatible publication guards before release. A local test does not establish live provider permission or issue publication.
