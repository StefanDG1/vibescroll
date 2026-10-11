# ADR 106: Keep manifests and backup source checks out of large routine reads

Mode: reference. Date: October 11, 2026. Status: candidate; production verification pending.

## Problem

The authenticated October 7-11 Convex breakdown attributes 15.89 GB of I/O to VibeScroller. Restore marker application and knowledge recovery account for 12.02 GB, largely accumulated before ADR104 deployed. Evidence inventory/currentness/read-lease/restore checks account for another 1.64 GB. Production/development PR reconciliation reads add 481.06 MB. These are period totals with a partial final day and reporting delay, not forecasts.

Production repository documents still contain large file manifests after the existing 24-hour code retention clears their excerpts. Six records total 1,064,160 JSON characters. The largest record is 620,023 characters, including 599,894 characters of manifest paths and blob metadata. Normal list, version validation, PR status and retention queries fetch those fields even though they only need repository authority. JSON size is a payload measurement, not Convex metered I/O.

## Decision

Move full manifest paths and entries into `repositoryManifests`, keyed by repository and organization. Keep SHA, profile/selection versions, snapshot scope, summary and status on the canonical repository record. New snapshots write both records in one transaction. `compactRepositories` upgrades one legacy repository per transaction, schedules its continuation and skips already moved manifests. Migration does not change timestamps, revisions, approvals or funding.

Existing content hydration restores the manifest for code inspection, matching, planning and publication. Plan editing and repository content export explicitly hydrate it too. Snapshot reuse reads the hydrated entries. Missing, foreign or wrong-SHA side records fail closed. Legacy inline records remain readable. Temporary code expiry leaves the manifest intact, matching its prior retention; GitHub revocation, restore quarantine and workspace purge clear the added records. Full database backups include the new table.

Keep ordinary evidence-reference validation on canonical source analysis. Add a version to source dashboard cards produced by the existing atomic source trigger. Evidence backup eligibility may read only the versioned card's exact source identity, workspace, state and generation. Legacy, missing or malformed cards fall back to the canonical source. A bounded source-only projection upgrade does not modify original sources or schedule inference. Each query checks current records independently. Expiry, object retirement, tombstones, workspace status, restore locks, and before/after download or restore fences are retained.

Restore readiness uses the already deployed knowledge state indexes to find queued/running work. Empty improvement/library recovery deployments avoid starting actions. Paused or expired improvement policies still enter reservation cleanup. V1 billing configuration starts one V1 reconciliation pass instead of additionally invoking its delegating legacy wrapper; legacy configuration retains its existing routes. All cron cadences stay unchanged. Already empty expired run payloads avoid repeat retention writes.

## Verification and rollout

New regression fixtures first reproduce the 348,857-character retained manifest and a repeated-source read exceeding a 64 KiB transaction budget. Required coverage includes migration continuations/idempotency/locks, refresh/cache reuse, exports, SHA/workspace mismatch, revocation/quarantine, backup authority fallback and source changes, terminal-history readiness, paused cleanup and V1/legacy scheduling. Full checks and exact release evidence are recorded in implementation status.

Deploy the compatible backend before running either migration. Run `usageMaintenance:compactRepositories` and `usageMaintenance:projectSourceAuthority`, then verify their continuations and matched manifest digests/authority fields. Verify every upgraded source card against its canonical source without returning private content. Compare matched bounded read sizes and subsequent daily usage. Do not equate smaller JSON records with invoice savings.

After manifest migration, retain a backend that understands `repositoryManifests`. An inline-only rollback cannot read the moved paths. Prefer a compatible forward fix; a reverse migration needs separate validation. Projection rollback can use canonical source checks while retaining the optional card field. Do not disable backups or reduce retention to obtain savings.

See the [complete cost audit](../operations/convex-cost-audit-20261011.md) for ranking, reviewed subsystems, deferred changes and measurement limits.
