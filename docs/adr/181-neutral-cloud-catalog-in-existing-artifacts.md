# ADR 181: neutral Cloud versions in the existing catalog

Date: October 28, 2026. Status: local candidate. Production enablement remains gated.

## Decision

Extend `publicArtifacts` and `publicImports` with an explicit Cloud variant. Keep the existing edition variant unchanged. Store neutral evidence and analysis in the existing version tables under an independent service organization. Add bounded catalog families, normalized URL aliases and private contribution receipts. This creates no second catalog, database, inference provider or billing product.

Contribution requires both current operator-reviewed provider/content/privacy permission for the exact resolved post and the contributor's exact-version consent. Copy at most eight byte/hash/dimension-verified JPEGs into independent service storage. Recheck current authority after reads and before writes. Stage the copy before making its artifact eligible. Failed or unknown copies remain unavailable. Equivalent candidates reuse the same service evidence bundle and screenshots when retention matches. Existing private-only output gains no publication authority from an old connection grant.

Ordinary Save checks current verified Pro access before looking up a shared result. An eligible hit creates a private association, without a source job, acquisition, transcription, inference or another image copy. A Cloud-selected save can use this hit while its monitor is unavailable. A miss retains the existing executor and setup requirements. Normalized aliases identify previously verified links and expire; they do not authorize arbitrary network resolution.

The default follows the family's reviewed recommendation. A user can pin an eligible shared version or create a private retained-evidence candidate, then return to the recommendation. Private candidates do not change the global selection. Notes and corrections remain in the user's association, keyed by exact analysis version, with bounded history. No user grant, task identifier, lease, source identifier, repository context or private note enters the neutral bundle.

Global promotion requires service-owner authority, recent authentication and a server-computed review hash bound to the exact candidate, incumbent, evidence, permission and selection revision. The evidence-review-v1 rubric records fidelity, completeness, citation accuracy, uncertainty and usefulness. Fidelity, citation accuracy and uncertainty require at least 4/5; completeness and usefulness require at least 3/5. Unsupported claims cannot be promoted. This is an operator review, not an automatic judge or proof that a model is stronger.

Every app, MCP, history, pin, reanalysis and screenshot read checks current access and retention. Shared images use a private byte proxy with uncached read-only mutation checks before and after storage I/O. This follows the [Convex guidance on cached time-dependent queries](https://docs.convex.dev/understanding/best-practices/); the final byte-disclosure check uses the current server clock. Library metadata queries read compact artifact fields for shared selections, not the transcript or complete output. Canonical withdrawal blocks the family immediately and schedules bounded erasure. Personal deletion removes the association while preserving independently authorized service data. Withdrawal of one contribution preserves another current independent contribution to the same artifact. Retiring the last eligible artifact queues its independent image objects for deletion.

## Migration and recovery

Add three initially empty tables and eleven indexes only on those tables. The candidate root schema has 95 tables, compared with 92 in the serving private-version release. All existing table/index definitions, component configuration, authentication and crons remain unchanged. The new Cloud branches do not invalidate legacy edition records. No library backfill or reprocessing runs on deployment. A fresh frozen deployment inventory and index prediction are still required before publication.

Account purge withdraws the deleted account's contribution authority and includes its private receipts. Deleting the independent service organization retires its catalog records. Recovery quarantine removes restored catalog authority before unlocking. Exports redact copy credentials and storage ownership keys; saved notes retain their version association. A rollback must preserve the new data and disable the catalog gates before reverting readers. It must not restore an old schema by deleting version history.

## Evidence and open requirements

Full local checks passed 1,381 Vitest cases with recorded hosted/platform skips, Node/Python checks, all workspace types/lint and both builds. Audit and changed-source secret scans passed. Exact-head CI is still pending. Local tests cover actual synthetic JPEG copying, deduplication, two-account Save and MCP reads, access loss, exact history, private reanalysis, recommendation changes, personal pins, notes, rollback, canonical withdrawal and the image proxy's post-I/O access check. These tests use synthetic billing and permission records. They are not independent production acceptance.

Production remains frontend `da275f4` and backend `b03a480`, with the accepted private automatic second version and rollback. Catalog flags/configuration have not been enabled. The second test account is signed in to Edge; genuine paid access and a rights-cleared shared test post remain unverified. The requested extra backend publication slot remains subject to its separate approval.

This candidate handles explicit contribution of existing compatible private versions. Automatic contribution after one-time future-save disclosure, shared in-flight production coalescing, version-bound feedback across every downstream consumer, cold independent onboarding, latency acceptance and the real paid two-account cache test remain open under [ADR 180](180-versioned-cloud-analysis-and-shared-selection.md). Do not mark the whole focused release complete or describe these gates as enabled.
