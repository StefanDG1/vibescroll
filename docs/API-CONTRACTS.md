# Interface contracts

## Private evaluation brief candidate

[ADR 136](adr/136-private-evaluation-brief-origin.md) adds only optional caller `privateEvaluationBrief` to the existing project task quote/approval. A server-owned private workspace is required. Validate exact non-whitespace, well-formed text up to4,000 UTF-8 bytes, unsafe controls and secrets. Server origin `{schemaVersion:"1.0.0",kind:"private_evaluation_brief",ownerId,briefHash,model,effort}` is immutable and client text supplies no authority. Plan draft input rejects a new brief and inherits the current accepted proposal origin under a separate approval. Default keys/operations remain unchanged. Raw text belongs only to the approved task/leased context; status exposes origin only.

## Purchased allowance candidate

`AllowancePolicy` version `allowance-policy-v1` binds policy/catalogue/price, tier, billing interval, grant schedule, credits per grant and recorded acceptance or explicit `legacy_not_reconstructed` provenance. `PaidAllowance` version `paid-allowance-v1` binds provider account/mode, subscription/item, paid start/end, original UTC anchor, base policy/invoice and optional existing upgrade-change ID. These are internal server contracts, not client-provided quantities. Checkout metadata carries only the locator for an exact server-created legal acceptance. Reconciliation verifies complete provider records and paid invoice coverage before persisting the commitment; `commerce.grantPeriod` rechecks commitment/revision/environment and the current grant period. See [ADR 134](adr/134-purchased-allowance-commitments.md).

## Work Cloud text handoff candidate

[ADR 129](adr/129-gated-work-cloud-text-handoff.md) defines the private, default-off `work-cloud-text-v1` route. App `workCloudAnalysis.preview` and `approve` bind a recent owner's exact input/grant/model/effort approval. MCP `work_cloud_claim`, `work_cloud_input`, `work_cloud_heartbeat`, `work_cloud_complete` and `work_cloud_fail` require the new `analysis:execute` OAuth and app scope. A first claim returns its lease token once; subsequent operations require the same task/consent/token and current authority. Canonical output schema, run and evidence are supplied in the bounded input. Complete accepts `resultJson`, at most 120,000 UTF-8 bytes, then uses existing insight validators. Only completion gets the 262,144-byte envelope limit; ordinary MCP/backend limits remain 32,768/8,192 bytes. No source acquisition, media, repository authority, public artifact or paid fallback follows. Official host and production acceptance remain pending.

Mode: reference. These are proposed application interfaces, not existing provider endpoints.

## Public and authenticated HTTP boundaries

| Route                      | Method      | Authentication                        | Contract                                                               |
| -------------------------- | ----------- | ------------------------------------- | ---------------------------------------------------------------------- |
| `/api/capture`             | POST        | App session and CSRF protection       | URL or uploaded object reference, workspace selection, idempotency key |
| `/share`                   | GET or POST | Login before committing an import     | Receive share text, show confirmation, then call capture               |
| `/api/uploads/grant`       | POST        | App session                           | Bounded media type/size grant to a private object key                  |
| `/api/uploads/complete`    | POST        | App session                           | Verify object metadata and fingerprint before workflow start           |
| `/api/webhooks/github`     | POST        | Verified GitHub signature             | Persist receipt, acknowledge, process asynchronously                   |
| `/api/webhooks/stripe`     | POST        | Verified Stripe signature             | Reject wrong mode or account before entitlement changes                |
| `/api/webhooks/telegram`   | POST        | Secret webhook header and linked user | Deduplicate update ID, store capture request                           |
| `/api/runner/pair/start`   | POST        | Device challenge, rate-limited        | Create short-lived untrusted pairing request                           |
| `/api/runner/pair/approve` | POST        | Browser session and reauthentication  | Bind exact device key and named workspace                              |
| `/api/runner/lease`        | POST        | Narrow device credential              | Claim one authorized job compatible with capabilities                  |
| `/api/runner/events`       | POST        | Device credential, current lease      | Bounded redacted events with sequence numbers                          |
| `/api/runner/artifacts`    | POST        | Current job capability                | Grant upload for approved artifact type and maximum size               |
| `/api/runner/complete`     | POST        | Current lease and artifact digest     | Validate result and move to patch review                               |
| `/api/health`              | GET         | Public minimal output                 | Service availability only, no secrets or internal configuration        |

A GET request cannot import, approve, bill, delete, or execute work. The GET share receiver only populates an uncommitted draft. Login callbacks must prevent open redirects and bind the intended draft to the current session.

## Application backend functions

[ADR 128](adr/128-pro-catalog-search-and-page-map.md) advances the unreleased catalog response to `service-catalog-v2`. `browse` accepts an optional explicit search phrase; its nullable `query` binds continuation to browse versus search. `searchCoverage` remains `indexed-eligible-generic-analysis`, not a completeness count. Cards add generic categories/topics and public creator/date metadata separately from saved-copy DTOs. Search uses one five-candidate index page with the same pre-read authorization and per-result validation, plus exact projection validation. Internal `reindexCatalog` has one bounded manual page and no automatic continuation. The earlier v1 contract below records ADR 127's staged candidate, never a released production catalog.

`serviceArtifacts.browse` takes the selected private `organizationId` and an opaque nullable `cursor`. It checks private ownership and current verified Pro before reading global catalog records. The versioned `service-catalog-v1` response contains at most five sanitized cards and nullable continuation, with a distinct unavailable state when operational configuration is missing. A filtered empty page can have another page; it is not an exhaustive empty-catalog claim. The fixed existing index range keeps pagination stable as time advances. Each candidate is revalidated against source, rights, settlement, moderation, revision, hashes and retention. Cards contain a clipped generic summary, original-post provenance and counts, never raw evidence, contributor identity or private taxonomy. Preview and explicit save retain their independent currentness and Pro checks. No browse starts processing.

`serviceArtifacts.preview` and `save` require the caller's own private library and current verified Pro access before reading catalog content. Pro authority combines a current verified subscription with its current Pro allowance grant; an annual subscription can have a shorter monthly allowance period. Every request rechecks authority. `publicKnowledge.savedDetail`, personal note edits and owner export use only a validated immutable retained copy after cancellation, without fetching newer catalog content. An explicit Pro save can snapshot a still-valid legacy reference; a read cannot. Approved public editions retain their separate release/reuse contract. These are candidate software contracts, not a claim that the proprietary catalog is deployed or open.

Assistant grant saves require `expiresAt` as either a numeric expiry within thirty days or explicit `null` for access until revoked. Profile discovery returns `expires_at: null` for that reviewed duration. Existing numeric expiries remain unchanged. See [ADR 108](adr/108-assistant-access-until-revoked.md).

Use Convex queries for `library.list`, `sources.detail`, `dashboard.overview`, `proposals.detail`, `runs.detail`, and `usage.current`. Use mutations for `capture.create`, `proposal.decide`, `plan.edit`, `execution.approve`, `run.cancel`, `connection.revoke`, and `source.delete`.

Every function checks identity, workspace membership, role, object ownership, and current state. Write functions accept expected version numbers for optimistic concurrency. The frontend cannot supply an arbitrary new billing tier or an approval's trusted cost.

Return typed errors with a stable `code`, safe `message`, `retryable`, and optional `nextAction`. Codes include `AUTH_REQUIRED`, `FORBIDDEN`, `SOURCE_UNAVAILABLE`, `UPLOAD_REQUIRED`, `UNSUPPORTED_SOURCE`, `INSUFFICIENT_CREDITS`, `RUNNER_OFFLINE`, `APPROVAL_STALE`, `BASE_CHANGED`, `RATE_LIMITED`, `POLICY_BLOCKED`, and `PROVIDER_ERROR`.

## Model contracts

`contracts/insight.schema.json` defines the extraction output. `contracts/proposal.schema.json` defines project-specific reasoning. `contracts/runner-job.schema.json` defines an approved execution envelope. Schemas reject extra fields. Server code validates evidence references, repository file references, and permissions separately. Schema validity is not proof of truth.

The provider adapter exposes `capabilities`, `estimate`, `analyze`, `plan`, `cancel`, and `usage`. It returns provider model IDs, prompt version, output hash, and actual usage. Model aliases resolve to a pinned compatible version in the provider registry.

## Repository and PR contracts

A repository snapshot contains provider repository ID, commit SHA, selected branch, file manifest, exclusions, and profile version. Source repository names are display fields, not the authorization identity.

A patch result contains base SHA, diff digest, changed paths, test commands/results, dependency changes, risk flags, and limitations. The publisher independently validates that changed paths are permitted and that the base SHA still satisfies policy.

The publisher uses a stable branch such as `vibescroller/<run-id>`. A PR body contains the run ID, proposal version, source attribution links approved for publication, verification results, and rollback notes. Private source evidence is omitted from a public PR unless explicitly authorized.

## Idempotency and limits

All mutation requests that can create cost or external effects have a client request ID scoped to the workspace and operation. Same key plus different payload returns a conflict. The service stores request hashes and completed results for at least the relevant job retry window.

Limit inbound JSON to 256 KB except specifically designed artifact endpoints. Limit an event batch to 100 events and each redacted event to 8 KB. Raw transcripts and logs use bounded private artifacts, not unrestricted event payloads.

Webhook handlers retain raw bodies only long enough to verify signatures and persist minimal necessary evidence. They reject oversized requests and do not fetch URLs embedded in a webhook without independent validation.

## Streaming

The browser receives bounded progress through authenticated Convex subscriptions. The runner sends ordered progress batches over outbound HTTPS. App-server transport stays local over stdio. The app does not expose Codex's local socket to the internet.

A reconnect reads the authoritative run state and events after a cursor. Duplicate events are ignored. Event delivery is not permission to execute a command.

## Knowledge and reviewed issue functions

The authenticated product proxy exposes topic lists/details, organization policy, corrections, evaluations and decisions; repository checklist saving/discovery; profile confirmation; and separate issue draft/edit/prepare/publish/refresh operations. Convex validates workspace access and exact states independently. Strict model/approval contracts are [knowledge synthesis](../contracts/knowledge-synthesis.schema.json), [knowledge evaluation](../contracts/knowledge-evaluation.schema.json) and [issue approval](../contracts/issue-approval.schema.json). Exact title/body SHA-256 and visibility bind publication. Unknown provider writes cannot be retried blindly. See [the execution ledger](V1-KNOWLEDGE-EXECUTION.md).

## Explicit repository snapshot paths

`selectRepositories` accepts optional `snapshotPaths` on each authorized choice; the legacy `connectRepository` accepts the same optional field and reuses batch preparation. Paths are literal files/folders, at most twenty/300 characters each/4,000 total. Omission preserves existing saved scope; an explicit empty array selects the eligible tree. Invalid or unmatched paths fail closed. Results contain repository, state and an optional safe preparation error code. The repository projection exposes selected paths, safe preparation error and structural coverage at its recorded base. Exact version fences and existing funding/access checks remain. See [ADR 053](adr/053-explicit-bounded-repository-snapshots.md).

The product proxy maps monthly operator-budget and oversized-snapshot refusals to fixed safe messages. It returns only the allowlisted code/message and no-store; provider diagnostics remain server-private. A budget refusal never raises the ceiling or authorizes a funding fallback.

Topic title search uses the workspace-filtered topic-name full-text/prefix index before pagination, including readiness when supplied. Source-title search uses its existing workspace membership index. Combined optional filters retain explicit bounded pages; no global cross-workspace ranking occurs.

## Whole-repository context, October 4

[ADR 054](adr/054-whole-repository-business-context.md) supersedes required scope selection: blank paths discover the complete eligible tree and retain a bounded representative cache. `snapshotSummary.discoveryVersion`, `indexedFileCount` and `businessDocumentPaths` distinguish discovery from inspected content. Whole-mode evidence retrieval uses the pinned complete tree, not the cache as a scope boundary. Internal proposal/plan commit may receive the trusted small inspection manifest. `profileDraftProcessingVersion` fences old context caches; detailed text remains bounded to 8,000 characters and requires human confirmation. Existing corrections, quotes, cost holds, exclusions, tenant/current-access and immutable evidence rules persist. Deployment and actual private-project draft acceptance are recorded separately.

`POST /api/product` operation `saveProfileDraft` maps to `profiles.saveDraft`: repository ID, SHA, profile version, optional selection version, exact previous draft and proposed profile text. Owner/admin access, current scope and optimistic concurrency are mandatory. Text must be nonempty, secret-free and at most 8,000 characters. Pending generation refuses the edit. The result `{saved: true}` acknowledges only an unconfirmed draft write; confirmed authority and credits stay unchanged. See [ADR 056](adr/056-save-unconfirmed-context-review.md).

## Full-library scans and issue-linked improvements

The authenticated, same-origin product endpoint exposes scanList, scanPrepare, scanApprove and scanPause. Prepare takes workspace and selected repository IDs and only inventories saved URL links. Approve binds scan/version, integer maximum credits and explicit funding; own_plan additionally binds a freshly authenticated paired device, advertised model and reasoning effort. Pause/cancel invalidates future dispatch while existing approved jobs and unknown reservations persist. List returns coarse progress/reasons and no credentials. Server-owned leases and frozen source/repository/profile versions prevent duplicate or stale dispatch.

Improvement operations list, start a bounded issue-linked plan, separately execute an accepted plan, refresh provider receipts and append reported outcomes. Owner/admin policy operations configure or pause a repository policy; routine mode requires verified activation. Preference updates remain tenant-private and version evaluation context. Outcome validators distinguish judgment from data and require actual completed periods, samples, measures and limitations for reported data. An issue, PR or merge receipt cannot claim measured benefit.
