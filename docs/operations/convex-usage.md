# Convex usage investigation and rollout

The [October 11 comprehensive follow-up audit](convex-cost-audit-20261011.md) records every resource category, the recent function ranking, repository-manifest amplification, backup source checks, and the remaining opportunities. Its candidate implementation and rollout constraints are documented in [ADR106](../adr/106-repository-manifests-and-backup-authority.md).

## October 11 recovery and restore release

The authenticated September 26 to October 26 usage breakdown now shows 47.38 GB for VibeScroller, including 4.58 GB for production `knowledge.recoverPage` and 7.63 GB for preview `recovery.applyMarkers`. The October 7 team invoice charges $9.02 for database I/O of $10.60; the current $2.20 draft includes $1.76 more database I/O. Draft amounts can change. These totals include earlier usage and do not measure this candidate's savings.

[ADR104](../adr/104-active-recovery-and-scoped-restore-reads.md) replaces full-history recovery with state/time index pages, scopes redaction to affected assets/runs, and reuses evidence source reads within one query. All three additive indexes and compatible functions deployed successfully to production `bold-lemur-667` from application `553099dd3dace3f2938036ee5f3cae92f9766572`. No data migration or financial-hold cleanup was required. Existing frontend contracts are unchanged.

A bounded read-only production baseline at 19:45-19:46 UTC read twenty historical jobs and twenty historical evaluations in separate queries. They consumed 144,191 and 138,601 database-read bytes respectively. Only safe state/count/transaction metrics were returned. The candidate's local 64 KiB regression tests exclude large terminal histories, unrelated assets/runs and duplicate same-query source reads. Neither result is a full-sweep benchmark or an invoice forecast.

At 19:52:09 UTC after deployment, all four state/time range probes reported no eligible work and together read zero documents and zero database bytes. Deployed function metadata includes the internal indexed continuation state and checkpoint fields. Main CI and alpha publication passed; the canonical health endpoint reports application `553099dd3dace3f2938036ee5f3cae92f9766572`, version `0.1.0-alpha.20261011195058.g553099dd3dac`. The [receipt](evidence/recovery-costs-20261011.json) separates local safety tests from bounded production selection evidence. No real content deletion or physical restore ran to demonstrate savings.

After release, inspect active state/time ranges and the next daily `knowledge.recoverPage` and restore-function breakdowns. Keep preview rehearsal traffic separate from serving traffic. Do not create or restore another deployment merely to measure savings. Preserve current deletion checks, restore locks, reservation holds and backup retention. Historical charges cannot be reversed by a query change.

Mode: reference. Observed October 6, 2026. Production changes and data migration deployed; comparable savings measurement pending.

## What the dashboard showed

The existing authenticated [team usage page](https://dashboard.convex.dev/t/stefan-gheorghiu/settings/usage) was inspected through the normal browser UI. Its billing period was September 26 through October 26, 2026. Values are rounded and include usage accumulated so far.

| Resource         | Team total                     | VibeScroller breakdown                  |
| ---------------- | ------------------------------ | --------------------------------------- |
| Function calls   | 1M included plus 78K           | 892K across deployments                 |
| Database I/O     | 1 GB included plus 30.54 GB    | 30.95 GB                                |
| Action compute   | 8.4 of 20 GB-hours             | 7.7 GB-hours                            |
| Database storage | 512 MB included plus 614.54 MB | Per-project storage was not established |
| File storage     | 665.34 MB of 1 GB              | Per-project storage was not established |
| Data egress      | 1 GB included plus 613.22 MB   | 1.16 GB shown in function breakdown     |
| Search storage   | 1.13 MB of 512 MB              | Low usage                               |
| Search queries   | 0.00032 of 3K Query-GB         | Low usage                               |
| AI Gateway       | $0.00                          | No observed gateway spend               |

These are team allowances. Optimizing this repository does not change other projects, the configured spending limit, historical usage, or external AI/storage invoices. Billing dollar totals and the exact spending cap were not independently established.

| VibeScroller production function                 | Observed usage                                  | Cause and change                                                                                                                                                                            |
| ------------------------------------------------ | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `issues.list`                                    | 14.32 GB database I/O                           | Hidden-section polling and repeated reads of large repository records. Load Issues on demand; separate cached code from metadata. Existing evidence/currentness/redaction checks remain.    |
| `assets.registerEvidence`                        | 4.95 GB database I/O                            | Every frame scanned all retained workspace assets. Replace recurring scans with atomic stored-byte accounting; reuse identical evidence retries.                                            |
| `knowledge.evaluations`                          | 4.44 GB database I/O                            | Ideas fetched while other sections were open, with heavy repository/source validation reads. Fetch the active view and read repository metadata.                                            |
| `product.detail`                                 | 1.2 GB database I/O                             | Full source evidence and repository reads during refresh. Repository metadata becomes smaller; visible/offline polling is controlled. Full source evidence remains available.               |
| `knowledge.list`                                 | 816.78 MB database I/O                          | Topic batches repeatedly validate source references. Extend query-local document-read reuse and remove unrelated section requests.                                                          |
| `product.overview`                               | 810.77 MB database I/O                          | Workspace shells counted up to 1,000 full sources and 1,000 full proposals without using those counts. Shell callers now omit those scans.                                                  |
| `identity.bootstrap`                             | 120K calls, 3.1 GB-hours, 551.74 MB data egress | Every backend request fetched WorkOS and wrote the user. Authenticate a read-only freshness check and fetch the provider profile only at setup or after fifteen minutes.                    |
| `accounts.syncUser`                              | 120K calls                                      | Paired with each bootstrap. Stop unchanged profile writes and unnecessary provider refreshes.                                                                                               |
| `personalAnalysis.dispatch` and its HTTP handler | 38K calls each                                  | An idle runner polled every ten seconds and announced every thirty seconds. Idle polling becomes thirty seconds, catalogue announcement five minutes; active heartbeat timing is preserved. |

The first three I/O functions account for about 77% of VibeScroller's reported I/O. They are the highest priority. Actual savings depend on workload and the deployed code; no percentage reduction in the invoice has been measured.

## Expected effect and tradeoffs

Before the change, each knowledge refresh made five backend requests every fifteen seconds. An idle Topics view now makes three per minute; an idle Ideas or Issues view makes one per minute. This is an 85% or 95% reduction in those particular request groups under that cadence, before counting the cheaper identity path. Active views retain faster checks. Hidden Posts no longer poll the mounted knowledge component. These are calculations from request scheduling, not measured production reductions.

Repository compaction makes ordinary issue/idea checks independent of cached code size. The regression fixture moves over 270 KB of context and leaves a metadata record smaller than one percent of its original JSON size, while preserving snapshot reuse and versions. This is synthetic evidence, not a production bandwidth benchmark.

The new content table has fewer indexes than repositories. Separating large payloads reduces their index storage duplication. Convex documents that indexes add storage copies and that queries read complete documents even if the returned projection is small. [Convex best practices](https://docs.convex.dev/understanding/best-practices), [query scaling](https://stack.convex.dev/queries-that-scale).

The storage total removes an O(number of workspace assets) read for every frame after initialization. All application asset insertions and deletion receipts use the accounting helper. Initialization retains one legacy scan per workspace and must fit Convex transaction limits. Warm the current workspace before a large batch. Larger future installations should use a separately validated paginated initialization or aggregate component rather than repeatedly trying an oversized scan.

An idle device can take up to thirty seconds plus network time to claim newly approved work. During an active batch, the next poll follows after one second. Existing active heartbeats, cancellation fencing, funding authority and deadlines retain their timings. Completed idle views can take up to a minute to see changes from another client; visibility return and local mutations refresh immediately.

## Other cost paths reviewed

- Background jobs and reconciliation: library scans, knowledge dispatch, reviewed improvements, PRs, issues, subscriptions, privacy sweeps, asset expiry and tool-snapshot renewal. Keep recovery, deletion, billing and approval guarantees. Empty billing/PR deployments now avoid Node action startup. Other cadence changes require measured evidence of work or retries, rather than disabling recovery.
- Uploads: original media, normalized audio, sampled frames and source thumbnails. All four now participate in the same atomic stored-byte total. Physical deletion, rather than expiry alone, releases quota. Large upload bodies also produce action network/compute costs; the dashboard showed 305.31 MB of frame-action data egress and 0.76993 GB-hours in production. This change does not repackage or recompress evidence.
- Large documents: transcripts, source analyses, proposal bodies/plans, execution events and historical evaluations still affect document reads and indexes. This pass separates the measured repository-cache dependency and removes unused shell scans. If source documents dominate after deployment, split analysis/transcripts from lightweight source metadata with atomic revision updates and full deletion/currentness regression coverage. Do not truncate user evidence to make a bill smaller.
- Pagination and scans: list endpoints use bounded pages, but filtered pages and several internal/export/revocation collections can still read many full records. Workspace exports intentionally read content. Large future histories need bounded maintenance and list projections, not silent loss of records or false totals.
- Reactive UX: authenticated subscriptions to lightweight visible-view/progress queries are a possible next step. First measure these changes; subscribing to large whole-workspace queries can reintroduce frequent expensive reruns. Convex's [best practices](https://docs.convex.dev/understanding/best-practices) describe dependency invalidation and query caching.
- Development deployments: VibeScroller's development breakdown included 0.49239 GB-hours for `reconciliation.customer` and 0.29544 GB-hours for PR reconciliation. The empty-work dispatcher helps deployments without work; real development subscriptions/PRs still reconcile. Other projects' cron behavior was not changed.
- Retries and duplicate work: evidence registration now reuses the same object. Existing source deduplication, credit reservations, generations, unknown-cost holds and separately approved publication remain authoritative. A provider timeout is not permission to retry a paid operation or publish twice.
- Backups, data exports, deployment counts and logs: these contribute usage but did not lead the observed VibeScroller I/O ranking. Keep retention and recovery. Temporary repository content remains excluded from ordinary user content exports and included in complete database backups. The new table is cleared by repository quarantine, revocation, retention and workspace purge.

## Deployment and measurement

1. Review the current branch diff and passing local evidence. Main release/versioning and any outstanding exact-base issue publication remain separate. No live deployment, billing limit change or immutable release is claimed here.
2. Deploy the compatible Convex backend to the verified VibeScroller deployment. Keep legacy fields optional/readable and the new helpers enabled. The old frontend can still call the existing APIs, but frontend polling/bootstrap savings require its new build.
3. Run internal `usageMaintenance:initializeStorage` for the current workspace. It is idempotent. Compare its bytes with the sum of asset records that are not marked deleted. Do not reset the counter while uploads/deletions are active.
4. Run internal `usageMaintenance:compactRepositories` with empty arguments. It moves one repository per transaction and schedules the next page. Re-running skips already compacted repositories. It makes no model call and preserves repository SHA/profile/selection versions and timestamps.
5. Verify actual topic detail, Ideas/Issues pages, source detail, confirmed profile, plan generation/currentness and a permitted evidence registration on the matching deployment. Check foreign-workspace denial, stale evidence and deletion redaction. These staging/production checks remain pending.
6. Deploy the frontend through the existing Basic-build policy. Restart the personal runner to use its new idle cadence. Changes to idle polling cannot update an already running process.
7. Compare the next daily function-call, I/O, action compute and egress breakdowns. Track `issues.list`, `knowledge.evaluations`, `assets.registerEvidence`, `product.overview` and `identity.bootstrap` individually. Compare similar workloads and active browser-tab counts; accumulated billing-period totals will not fall.

After compaction, keep a backend that understands `repositoryContent`. Rolling back to an older inline-only backend would discard its access to cached excerpts and may reject added schema fields. Prefer a compatible forward fix; any reverse data migration needs separate validation. Full source evidence, permissions and budget enforcement take precedence over a cheaper failure.

## Local verification

`pnpm check` passed in `outputs/convex-usage-release-check.log`: lint, types, 430 backend tests with three explicit external skips, 18 authentication tests, 6 PCM tests, 6 proxy tests, 3 sampling tests, 5 Basic-build-policy tests and both production builds. Eleven new backend/scheduler tests cover freshness, compaction/reuse/revocation, quota accounting, identical retries, concurrent quota admission, empty cron dispatch, omitted overview counts, compacted-cache retention, hidden/offline wakeup, overlap/unmount and failure backoff. Two new authentication tests verify signed-in bootstrap selection.

The first new evidence test omitted the required fixture `coverage` field, causing one failure and a type error. Corrected the fixture; the final suite passed. Failed/intermediate outputs are preserved separately. Before publication, the redacted Gitleaks scan of the staged 91,078-byte patch found no leaks (`outputs/convex-usage-secret-scan.json`); formatting and the production Convex dry run passed. Dependency audit passed the repository policy with one existing locally mitigated high `braces` advisory and no unresolved finding; see `outputs/convex-usage-audit.json`.

The local production build at localhost port 3101 rendered the labeled synthetic topic map, switched to Issues through native browser clicks, and had no horizontal overflow at 320, 390, 768 and 1440 pixels. This verifies layout/navigation only. Timer behavior is covered by the scheduler tests; real authenticated staging traffic, physical Android and production savings remain unverified.

## October 6 production release

The owner explicitly authorized deployment and merge. [PR 49](https://github.com/StefanDG1/vibe-scroller/pull/49) merged at 20:34:37 UTC to `f22c1b266c4b749673a94a7424c0bfd4b7c48e2e`. Required PR [CI](https://github.com/StefanDG1/vibe-scroller/actions/runs/37527169335) and exact main [CI](https://github.com/StefanDG1/vibe-scroller/actions/runs/37527496940) passed. The immutable [alpha release](https://github.com/StefanDG1/vibe-scroller/releases/tag/v0.1.0-alpha.20261006203437.gf22c1b266c4b) published after main verification.

The Convex CLI selected `stefan-gheorghiu:vibe-scroller:production`, `bold-lemur-667`. Deployment succeeded with three new indexes and no deleted indexes. `usageMaintenance:initializeStorage` initialized the current workspace to 330,073,374 bytes; an independent transactional query matched the total across 3,139 asset records. Bounded `compactRepositories` completed all five repositories. Before/after checks matched SHA, profile/selection versions, timestamps and stored context/tree/excerpt sizes; inline context is empty and matching side content remains available. Evidence files are `outputs/convex-usage-production-deploy.log`, `outputs/convex-storage-migration.json` and the private before/after metadata reports.

The existing Git integration built production with the Basic queued policy. [Vercel deployment](https://vercel.com/stefandg1s-projects/vibe-scroller/HoeooaRLdvtU8QBmVbFNkoPrHmxx) was READY, target production, exact main SHA, Frankfurt, with `scroll.companynerve.com` assigned. At 20:35:25 UTC the public health endpoint reported that SHA and `0.1.0-alpha.20261006203437.gf22c1b266c4b`, with `Cache-Control: no-store`. No production credentials, billing cap or provider feature gates changed. No separate issue draft was published.

Authenticated browser reads of Issues, Knowledge and real topic detail succeeded with HTTP 200 and private no-store responses. The actual cited topic map and its linked real source detail rendered without error or horizontal overflow at the inspected mobile viewport. An observed seventy-second Ideas window made one Ideas refresh and no topic/policy/local-run/issue reads; workspace-shell refreshes remained independent. No personal runner process was active locally; its new cadence takes effect on next start. Production paid plan generation, physical evidence upload/deletion, permission changes and physical Android were not exercised; their relevant regression checks remain local/CI evidence. Billing-period usage accumulated before deployment will not fall. Compare subsequent daily breakdowns under similar workloads before claiming savings.

## October 7 Home measurement and Library candidate

Compact Home is operator-enabled after the authenticated bounded receipt in ADR 079: 433,170 versus 9,040 decoded workspace-response bytes on the same workspace. Chrome focus visibility was controlled; timer phases prevent causal request-total comparisons. Offline made no requests, and the attempted hidden phase was still visible and is excluded. This is transfer evidence, not cost, database-I/O or Core Web Vitals.

[ADR 089](../adr/089-visible-library-context.md) removes generic full-context and collapsed trial reads from Library. Complete project choices and latest-hundred current proposal attention remain; this candidate does not claim a new bound on the existing complete repository query. Paged source metadata still reads canonical source documents and remains a separate hotspot. Production comparison follows exact deployment; do not infer savings from mocks or smaller serialization alone.

## October 7 bounded Usage response

ADR 091 uses two existing authorized queries and projects actual allowance and up to ten settled recent entries. On exact production application d8407a951a3e, a matched ordinary Usage response changed from 436,367 decoded bytes at 19:30:33Z on the preceding application to 1,014 bytes at 19:53:47Z. It omits sources, repositories and raw ledger identifiers, retaining four available and ten reserved credits. The underlying indexed allowance and bounded ledger reads still occur. This is serialization/transfer evidence, not a daily billing, database-I/O, latency or complete-workload comparison. No financial hold, budget, provider setting or backend schema changed. See ADR 091 and the dated implementation receipt for exact checks and limits.
