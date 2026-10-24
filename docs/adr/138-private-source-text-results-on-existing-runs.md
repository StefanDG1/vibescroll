# ADR 138: private source text results on existing runs

Status: implemented and independently reviewed candidate; local stages completed, exact-head CI and release pending. Date: October 24, 2026.

## Decision

Add a separately approved private source-text reanalysis through the existing own-subscription task controller. Use genuine supplied or retained source text, not saved-analysis placeholders or a claim to have watched media again. Preserve canonical source analysis and every existing ordinary project/plan task. This is C6b text coverage, not complete video, skills or official Cloud execution.

The owner-private source stores only a latest-completed metadata pointer and a pending run ID. The sole full output belongs to `localLibraryRuns.sourceTaskResult`, a strict versioned canonical JSON string with input/output hashes, private version and completion time. Do not copy up to 120 KB of output onto the source, where every ordinary library read would pay for it. Existing completed runs preserve earlier variants without a new result table or cache.

Keep the previous completed pointer while new work is queued, running, failed or uncertain. Completion compares the pending run ID and approved prior private version before atomically writing an immutable result and advancing the pointer. Source generation, state, top-level `updatedAt`, generic summary/search/tags/categories and canonical knowledge remain unchanged. A private insight cannot silently become a canonical project reference or shared artifact.

## Exact input and output

Require the current private owner, eligible personal execution, actual model/effort, current source generation/canonical timestamp/analysis hash, original retained evidence and applicable rights. Reject service-import text stubs. A private brief is optional, at most 4,000 UTF-8 bytes, with the same Unicode/control/secret checks as the existing private evaluation brief. Raw text stays with its original source/revision; raw context stays on the approved task.

Quote exact base, rights, evidence, context, pipeline and output-schema hashes. Reserve bounded run-ID overhead before approval; allocate the real database run ID and bind the final input hash atomically afterward. Output `processingRunId` must be that actual ID. Do not invent a source revision for ordinary supplied text.

Use existing strict insight validators. Ordinary supplied text has user-note evidence and truthful legacy text-only coverage; retained typed text uses `source_text` and its real revision/citation registry. Require actual evidence for every private insight and reject fake frames, timestamps or media coverage. Extract validation from canonical completion while keeping its writer's behavior unchanged.

Cap complete model input including schema at 120,000 UTF-8 bytes, canonical output JSON at 120,000 bytes and the complete serialized run at 320 KiB, including JSON escaping. Validate before hashing/writing and when reading. Unknown dispatch/usage cannot become a free retry or a fabricated completed result.

## Versioned local runtime admission

Add a separately hashed, profile-bound, five-minute local runtime snapshot advertising `source_reanalysis_text_v1`. It is our runtime report, outside the official model catalogue and its hash. Missing hello metadata clears the optional snapshot. It is not provider attestation, installed-skill evidence or Cloud availability.

Preserve existing HTTP envelopes and project/plan task protocol 1.0.0. Source tasks have a strict separate 2.0.0 branch without invented repository/member fields. New claims require the admitted source protocol/runtime hash; old claims and fallback paths leave source tasks queued. Recheck runtime, model, profile, expiry and source authority at approval, claim, context, heartbeat and completion. Source context bypasses repository authorization/retrieval because no repository was approved. Use the same controller, client, leases, quota checks and deadlines.

## Earned results and privacy

An explicit owner-qualified detail read can open the latest or an earlier completed run while its base and derived rights remain current. New-execution switches, provider credentials or runtime availability do not erase an earned private result. Keep original rights/retention metadata; actual rights withdrawal, source removal or canonical revision change fences stale results. Raw-only expiry cannot be treated as provider revocation or a new observation.

Strip private pointer/result metadata from ordinary library, neutral matching and publication projections. Default source reads must not load the full private output. Export may retain authorized private outputs/context while stripping leases. Source deletion and retention must scrub result/context bytes; recovery clears result authority and source pointers before supplied-text early returns. Preserve uncertain-use metadata without claiming that the provider stopped.

Add one necessary `by_source_reanalysis` index to the existing run table, keyed by organization and the task's source ID. It allows five matching rows per privacy continuation instead of scanning every unrelated result in a workspace. Preserve generation fences so a delayed scrub cannot remove newer work. This is no new store or queue, but its index build/storage requires a separately bounded release proof. Do not activate it through the older compatible-backend guard.

Extend the existing device/state index with task schema version. Legacy claims can then inspect five v1 candidates without being starved by unsupported queued v2 tasks. Admitted new claims merge bounded v1/v2 candidate pages by creation time. Existing unknown/active prefix queries remain valid. This changed index also requires explicit migration/backfill evidence; no deployment is implied.

Existing run-history page bounds still have real read costs, potentially several MiB at the conservative serialized limit. Avoid repeated background history scans and do not claim this route or retention is free merely because inference uses the user's subscription.

## Ownership and acceptance

Root owns schemas, shared contracts, the generated API type mapping, integration, budget and final review. High implementation owns backend/protocol/validation/privacy; Medium owns reused task controls and the explicit private result view. Test old-worker exclusion, current-input identity, real processing IDs, coverage, cache/base preservation, cross-device pending holds, result CAS/idempotency, limits/escaping, feature-off earned reads, rights withdrawal, export/deletion/recovery and UI stale-response fences. Preserve all initial failures and distinguish fixtures from actual host/model/browser/production acceptance.

Private variant project references, media reanalysis, approved skills, creator acquisition/contribution and official Cloud authority remain unfinished requirements. No new provider request, purchase, live billing or deployment follows. The cumulative US$3 cap, all earlier unknown holds and all release/provider/privacy gates remain.
