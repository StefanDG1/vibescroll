# Current accepted VibeScroll state

Mode: reference. Snapshot reviewed October 29, 2026, Europe/Berlin. This is the current-state entry point, not a live dashboard or spending authority. Check provider state before the next hosted operation.

Read the [owner request register](../strategy/OWNER-REQUEST-REGISTER.md), [continuation guide](CONTINUE-VIBESCROLL.md) and [failure reference](FAILURES-AND-RECOVERY.md). Historical handovers, ADR status lines and implementation-status entries describe their dated checkpoint. They do not supersede this snapshot without later evidence.

## Accepted production baseline

- Website/backend commit: `fc2ef422aace635a122073ae59a396a62299d204`.
- Website version: `0.1.0-alpha.20261029173811.gfc2ef422aace`.
- Deployment: `dpl_DUTnyRBi5sxj2AWNHJA2HyuTXDE1`.
- Exact Linux CI: `40923237655`. Local checks include 1,530 Vitest cases, Node/Python checks and both builds. Three hosted and seven Windows Python cases were skipped.
- Backend publication acknowledged; actual 12-component/138-table/301-index prediction required zero scans/backfills and changed no schema/index/auth/cron. Fixed Basic queued website build took 41.749s, then staged checks and same-build promotion passed.
- [Production receipt](evidence/launch-20261029-headless-mcp-production.json). Later documentation-only commits do not change this serving version.

## What is accepted and what is conditional

| Area                  | Accepted behavior                                                                                                           | Limit                                                                                                                                |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| App                   | Save, recent metadata feeds, separate Posts URLs, post title/thumbnail and reactive stage updates                           | Fresh cold-preview latency and every source type are not accepted.                                                                   |
| Original MCP          | Current owner connection valid, automatic analysis enabled, no setup required, grant 12 without expiry                      | Token, grant, monitor, runtime and quota are distinct. This is not independent customer onboarding.                                  |
| Embedded ChatGPT UI   | Disabled; ordinary tools and Events remain                                                                                  | Do not recreate the plugin or redesign the widget now. Historical rendered cards can remain in old conversations.                    |
| Automatic native flow | Prior ordinary MCP Save completed via Events, real speech/images/insights and shared publication, monitor enabled afterward | Legacy source runtime later reported a corrupt cached Python payload. General fresh-source reliability is not currently established. |
| Existing shared cache | Independent neutral native artifacts and cross-account reference reuse accepted                                             | New managed/service-prepared versions still do not publish into it.                                                                  |
| Full catalog          | Owner operator grant, toggle, bounded metadata/detail, thumbnails and entitlement-checked image bytes accepted              | Paid add-on purchase/webhook activation is open. Browsing does not populate personal Posts.                                          |
| Versions              | Current test history returns versions1/2/3 Ready with4/5/5 insights; original selected/revision0 preserved                  | Requested native model/effort are not independent provider attestation. Best-version quality ranking is later work.                  |
| Teams                 | Individual-Pro membership and version-bound sharing code deployed, with isolated acceptance                                 | Complete paid-member invitation/access and customer commerce acceptance remain open.                                                 |
| Retention             | Until-deleted analysis/evidence mode implemented                                                                            | Raw downloads, worker authority and credentials stay finite; deletion/takedown still applies.                                        |

The actual original-MCP profile/history and canonical website health/descriptor were rechecked in the status turn immediately before this audit. No source job or paid model call was made for the audit.

## Prepared-route measurements

[Comparison receipt](evidence/launch-20261029-prepared-model-comparison.json): fresh preparation took 41.093s, including33.311s Sandbox and1.973s ASR. Both analyzers used the same retained transcript and eight verified540x960 JPEGs. Muse saved five insights in62.713s queued-to-stored; automatic native ChatGPT saved five in189.216s. Browser request-to-completion was63.216s/190.395s respectively.

These are separately observed phases. Do not call their sum a measured fresh full-link run. The new versions remain private candidates. The original shared selected version is preserved. Actual new model answers are retained before validation; the earlier rejected answer was not retained and its exact failure is unproved.

The comparison-only policy and exact Gateway test-key environment were removed after success. The provider test key was revoked. Good results remain. Do not restore test policy or dispatch another analysis based only on these old receipts.

## Current unfinished critical path

1. Make shared server preparation the normal admitted Save path, with truthful status/funding and no dependency on legacy per-event ASR setup.
2. Publish prepared/native and managed/API versions with truthful independent provenance into the existing shared artifact family. Verify entitlement, deletion/takedown, same-source compatibility, concurrent reuse and both personal associations.
3. Finish precise customer quotes, reservation, settlement, replay/failure handling and legacy-credit migration. An operator test is not a public VibeScroll-credits product.
4. Accept fresh single-pass API and automatic subscription journeys plus representative failures. Verify early metadata, actual transcript/JPEGs, canonical result and monitor state. Do not repeat already-proved work without a reason or allowance.
5. Complete exact-version project evaluation/proposal, issue or draft-PR handoff and authenticated completion/lifecycle feedback.

The wider linked launch scope, cache-growth economics/Visualize extension, cold-user setup, paid commerce and independent acceptance remain open. Embedded UI, local execution, communities/likes, rankings/trending and A/B/model-outcome experiments are deferred. See stable requirements in the register rather than declaring them removed.

## Standing authority and sensitive state

Routine releases are delegated. Do not ask for another release/build-count exception. Preserve exact CI, actual compatible impact guards, same-build promotion and existing monetary/provider limits. Check spending before meaningful batches or material changes, not repeatedly between tiny steps.

The last recorded cumulative cap is EUR14; the bounded comparison envelope was USD0.50. Subscription token usage is outside cash accounting. Vercel must stay strictly below USD20. Last observed usage17.97USD and conservative combined bound19.855USD are historical readings, not current free headroom. Read the local ledger before spending. No purchase, top-up, faster build, paid fallback or live billing migration is implied.

Private operational identity, protected source, unknown attempts, budget holds and once-only release journals remain in the ignored operator outputs. The known local ledger is `C:/Code/VibeScroller/.worktrees/launch-20261022/outputs/launch-run/convex-rollout-budget.json`. Keep it out of commits. The active compatible checkout is `C:/Code/VibeScroller/.worktrees/link-cloud-compatible-20261025`; inspect its actual status before using these paths.

Update this file in place after a verified production change. Preserve dated detailed receipts elsewhere. Record a new accepted commit, actual assertions, remaining limits and next checkpoint together.
