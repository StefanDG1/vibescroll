# State machines

## Purchased allowance candidate

An accepted checkout keeps its offered policy after the short reservation expires. A verified paid subscription binds that acceptance to its first subscription and creates an immutable paid-term commitment. Renewal creates a new verified term; annual monthly grants retain the original calendar anchor and base invoice. An accepted paid upgrade adds its separate contribution without rewriting the base. Unknown/ambiguous purchase evidence holds new grants or changes for reconciliation while issued pools and private work remain. Provider deletion, refund revocation, restore locks and stale revisions retain their existing authority. See [ADR 134](adr/134-purchased-allowance-commitments.md).

## Work Cloud text candidate

The existing personal source job moves approved/queued to one claimed/running lease, then completed or unknown. Approval expires after fifteen minutes; execution has a fixed three-minute deadline and forty-second renewable leases. Expired, canceled, revoked or changed work cannot reclaim itself. A completed result retry only acknowledges its identical stored hash while authority remains current. A reported failure records unknown host usage; source replacement cannot clear that uncertainty into new executor authority. Privacy deletion and recovery remain available. App revocation does not attest provider cancellation. See [ADR 129](adr/129-gated-work-cloud-text-handoff.md); both runtime flags remain off.

Mode: reference. These state names are canonical for the specification.

## Source processing

Catalog browsing has only transient interface states: closed, loading, page, inspecting, saving, unavailable and error. It creates no processing state or job. Closing the panel, leaving its workspace, changing entitlement scope or losing access fences pending responses. Every new page, preview and save rechecks server authority; cached browser state grants no access. A successful save uses the existing retained-copy lifecycle. Expired, removed or denied content clears from the current catalog view while the user's separately authored private work remains.

`received -> validating -> queued -> acquiring -> extracting -> analyzing -> ready`

Alternate terminal or waiting states are `needs_upload`, `needs_auth`, `unsupported`, `unavailable`, `low_confidence`, `budget_paused`, `failed`, `cancelled`, and `deleted`.

`low_confidence` can have a usable partial result. Its `coverage` identifies `full_sampled`, `audio_only`, `visual_only`, `caption_only`, or `metadata_only`. Only `full_sampled` means both a transcript and sampled visual analysis exist. It never means every frame was analyzed.

A retry creates a new attempt under the same processing run or a new explicitly versioned run. It does not create a second source. Failed acquisition must not advance to a fully analyzed state.

## Matching and proposals

A match disposition is `relevant`, `no_fit`, `already_implemented`, `unsupported_claim`, `needs_context`, or `defer`.

A proposal review state is `new`, `reviewing`, `accepted`, `rejected`, `deferred`, `superseded`, or `archived`.

Accepting a proposal can start plan generation under the user's analysis budget policy. It does not authorize code execution. Editing an accepted plan invalidates an approval that references the old hash.

## Execution

`awaiting_approval -> approved -> queued -> waiting_for_runner -> preparing -> running -> checking -> awaiting_patch_review -> publishing -> completed`

A cloud run normally skips `waiting_for_runner`. A local run can stay there while its device is offline. Alternate states are `budget_paused`, `approval_expired`, `auth_required`, `cancel_requested`, `cancelled`, `failed`, and `blocked_by_policy`.

Default execution approval expires after 24 hours if not claimed. The default coding attempt lasts at most 20 minutes, with a separate maximum token budget. A user can authorize a bounded extension. No automatic extension increases a paid ceiling.

`checking` can produce failing tests. Those failures lead to repair within the existing approved budget or to `awaiting_patch_review` with explicit failure status. A successful process exit is not proof that the change is correct.

The default V1 flow requires a final patch review before publication. A user can approve "run checks and publish a draft PR" at execution approval, but cannot authorize merge or production deployment. High-risk changes always require final review.

## PR state

The GitHub projection has `state=open|closed`, `isDraft`, and nullable `mergedAt`. User-facing statuses derive from these fields:

| Condition                       | Label                |
| ------------------------------- | -------------------- |
| Open and draft                  | Draft PR             |
| Open and not draft              | Open PR              |
| Closed with mergedAt            | Merged               |
| Closed without mergedAt         | Closed without merge |
| Cannot verify after access loss | Status unavailable   |

A merged PR remains a historical merge even when a subsequent PR reverts it. Add a `reverted` outcome with evidence rather than rewriting history. A reopened unmerged PR returns to open. A delayed close event cannot overwrite a newer merged state without authoritative reconciliation.

Reversal evidence uses the bounded immutable-tree comparison in [ADR 024](adr/024-authoritative-pr-reversal-evidence.md). A revert message alone is not evidence. Preserve verified merge and reversal history across later access loss; expose incomplete inspection rather than claiming every reversal can be discovered.

## Outcomes

`not_measured`, `measurement_planned`, `positive`, `neutral`, `negative`, or `inconclusive` describe benefit. Outcomes require an author or evidence source and an observation date. The app cannot infer `positive` from acceptance, a merge, a green test, or lack of complaints.

## Billing and jobs

A Pro catalog save creates an immutable retained private copy under its original rights and retention deadline. Subscription cancellation blocks new catalog access and reuse, while the earned copy and authored notes remain readable. Operational processing/following pauses and benign upstream edits do not authorize physical deletion or refresh. Durable removal, rights withdrawal, expiry and recovery quarantine fence the copy immediately; bounded existing privacy callbacks scrub its derived payload while preserving authored overlays. Unknown database/crypto failures fence reads without granting cleanup authority.

Credit reservations are `active`, `settled`, `released`, or `expired`. Settlement and release are mutually exclusive. A partially consumed reservation settles actual usage and releases the remainder in one transaction.

Subscription access derives from a verified provider state and the product's grace policy. Cancellation at period end retains the current paid entitlement until that end. It does not grant a new period. Renewal events and reconciliation converge on one period record.

## Race handling

Each external result carries an operation ID, attempt number, lease generation, and artifact digest. Reject a stale generation. A cancellation records intent before sending a stop command. A revoked runner cannot claim new work. The backend refuses stale results after revocation except for a redacted diagnostic receipt.

A job that created a PR but failed before recording completion must reconcile by its idempotent branch and run marker. It must not open another PR on retry.

## Knowledge and issue state

Knowledge jobs move queued to running, then ready, failed, stale or unknown. Unknown usage retains reservations; queued dispatch can recover. Topics show pending, updating, ready or budget_paused. Input/manual-decision changes invalidate results. Issue drafts move draft to approved, then published, denied or unknown. An immutable attempt separates approval from the provider write. External open/closed/reopened, edited, unavailable and access_lost observations do not establish benefit or authorize external edits. Recovery quarantines authority and jobs. See [the execution ledger](V1-KNOWLEDGE-EXECUTION.md).

## Snapshot preparation failures

Repository selection persists preparing, drafting_context, connected or needs_attention under the current actor/selection-version fence. A safe preparationError distinguishes oversized snapshots, missing eligible paths and unavailable access; success clears it. Oversized snapshots require an explicit smaller scope, not a blind retry. Legacy connection uses the same bounded per-project flow. See [ADR 053](adr/053-explicit-bounded-repository-snapshots.md).

## Full-library scan

Prepare starts inventory/running without inference; complete pagination moves to ready. Explicit approval starts sources/running, then knowledge, then topics/repository comparisons, finally completed. Unavailable source acquisition advances only after confirming no reservation exists. Unknown cost, stale authority, revoked consent, insufficient credits or provider failure pauses rather than retries blindly. Owner pause/cancel invalidates the lease/version; approved in-flight work can settle normally. Resume requires current authority and the same funding route; a renewed own-plan grant needs fresh authentication. Useful unrejected results create app issue drafts; no-fit/already-implemented results remain evidence.

## Reviewed improvement

A current reviewed issue can create a bounded plan proposal. Plan acceptance and execution are separate. Passing job checks permit independent review; routine publication and merge additionally require current policy, exact reviewed patch/head and protected required GitHub checks. A durable pending merge intent prevents blind retry after an unknown write. Merge does not imply deployment or benefit. Append-only owner judgment/data requires a declared or verified deployed context, and measured data has completed nonoverlapping periods and real samples. Monthly renewal refuses unresolved work or active reservations before resetting a new period.
