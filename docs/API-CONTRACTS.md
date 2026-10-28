# Interface contracts

## Bounded Home post summaries and progress

`packages/contracts/post-summary.ts` defines strict versioned Home, post-summary and progress responses. Home contains at most thirty recent posts and labels its counts as the loaded window. Each post contains a title, nullable coverage/dates/counts, at most three short insight previews and an authenticated thumbnail pointer. Transcripts, original text, images, analysis payloads, private variants, job credentials and repository context are absent. Unknown legacy values remain null.

`GET /api/workspace/{org}?view=post-progress&sourceIds=A&sourceIds=B` accepts at most thirty distinct IDs and performs one scoped `dashboard.progress` query after validation. This is a projection read, not a source-detail loop. The current actor, membership, generation, retention and rights still govern every response. Status stages have no fabricated percentage. Running work stops appearing active when its execution lease ends; return-only recovery uses its own fresh lease.

The existing Console request owner patches stage changes while content hashes remain stable. Changed generation, content, retention or authorization removes stale previews before a full read. Mutations always request a serialized full refresh. Idle Home has no periodic query; active Home uses compact progress through the existing visible/online poller. Visibility and reconnect refresh remain. The Home preview marker is never a Library pagination cursor. These contracts do not complete Library's separate projected-list migration or the Cloud host bridge.

## Global catalog and Cloud setup direction, October25

[ADR154](adr/154-global-catalog-defaults-and-cloud-intake.md) requires one global paid catalog, no region or opt-out in normal neutral analysis, and personal-post removal that preserves independent canonical insights. Actual privacy, rights and moderation erasure remain separate. Existing source/account-coupled artifacts need a versioned ownership/lifecycle change; this is not accomplished by skipping one delete call. Keep private context out and preserve the existing stores, approved public examples and advanced editions.

For an explicitly requested video already sent in a ready Work Cloud chat, the host can complete the existing save/status/request/lease/media/result chain in that turn. New tool guidance does not grant automatic future work or launch a host. External saves and creator monitoring require one-time standing setup and a proven signed Events-to-operational-host bridge. Reconnect only when provider authorization expires or is revoked. Current Cloud output remains private-only until the independent generic-contribution path is implemented and admitted.

## Current source loading candidate, October25

[ADR153](adr/153-source-page-loading-and-active-refresh.md) limits the existing source workspace slice to five authorized direct queries, reuses current full detail, lazily loads related-source choices and stops idle periodic reads while retaining active updates and visibility/reconnect refresh. This is a frontend candidate, not a complete compact-progress contract or production acceptance. Preserve every source action, stale-scope fence and retention check.

The earlier Cloud return is now verified in production: five insights and twenty-nine citations, without GitHub, through exact retained-result recovery. [The receipt](operations/evidence/launch-20261025-cloud-video-return.json) supersedes older pending-return wording below. Automatic dispatch, ordinary fresh-run reliability, shared catalog and full-main migration remain open. Cumulative EUR5 and earlier unknown/future holds remain; only completed HTTP compute was reconciled, leaving USD4.916258194860614 conservatively retained and USD0.3837418051393857 unreserved.

## Conservative Cloud result return, October 25

[ADR 152](adr/152-conservative-cloud-result-return.md) records a real accepted preparation and rejected completion, followed by exact-payload offline verification. The adapter reduces overstated confidence and supports a recent-owner-reviewed, hash-bound return of the same retained attempt. It starts no processing and preserves saved posts/insights. Current Cloud status overrides old local-intake advice. Production completion remains pending; cumulative EUR5 and all prior holds remain.

## Existing sole-owner Cloud posts, October 25

[ADR 151](adr/151-existing-sole-owner-cloud-posts.md) extends the experimental route to the original creator/current sole owner of an active team without active invitations. Reuse existing post IDs and separate organization-bound grants; preserve all saved insights. The cumulative run ceiling is now EUR5 with every prior hold retained. A fresh metadata-capable Cloud chat has no executor; the earlier task currently verifies operational cached tools and enforced restricted Instagram access. Actual production video return remains pending.

## Explicit experimental MCP Cloud requests

[ADR 150](adr/150-explicit-mcp-cloud-analysis-requests.md) adds `request_analysis(mode=work_cloud)` with required current `generation`, `revision`, `grantVersion` and strict `cloud:{model,effort,useOwnPlan:true,maxApiUsd:0,retainUntil}`. It requires the reviewed `explicit_per_source_v1` app-grant policy, server-owned current media-policy hash, both request/execution scopes and owner-private media authority. Old grants do not acquire approval authority. Identical unclaimed replay is idempotent; claimed/unknown work cannot be replaced. `get_job_status` returns compact identities and Cloud state/stage. This does not launch a host, dispatch future links, publish catalog data or authorize paid processing.

## Private source-text reanalysis candidate

[ADR 138](adr/138-private-source-text-results-on-existing-runs.md) adds `source_reanalysis_text` to existing task quote/approval with source ID, expected private version and optional private source brief; reject repository/member/proposal arguments. The strict task is protocol2.0.0, while project/plan1.0.0 and HTTP envelopes stay unchanged. Separately hashed local runtime admission is not an official model capability. The actual run ID binds processing/input/output hashes. `privateSourceAnalysis.detail({sourceId,runId?})` returns owner-qualified parsed output/provenance and a transient effective `readUntil`; status/history contain no raw context/output. Complete source thread/turn requests including schema/instructions are capped before model dispatch; persistent result is canonical `outputJson` only.

## Setup text-review availability candidate

`SetupSnapshot.workCloudTextState?` is `unavailable` or `available_unverified`. The existing private-owner setup query uses the existing subject/feature gate and performs no extra read. It grants no account, host or source authority. Missing legacy values are conservative. Existing `cloudAvailable` and `local/cloud/save_only` continue to represent their original managed/paired/save routes. See [ADR 137](adr/137-distinct-processing-availability-in-setup.md).

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

## Private variant project references, October 24

A strict private-source-variant selection identifies actual run/version/output hash and one to twelve insight IDs. Only private project evaluation accepts it. Its separate evaluation reference cannot enter canonical synthesis. Task3.0.0 requires project_private_variant_v1 runtime admission. No additional project brief is accepted for this mode.

## Explicit legacy private-library adoption

Existing product operations `previewPrivateAdoption` and `adoptPrivateLibrary` dispatch to `organizations.previewPrivateAdoption` and `organizations.adoptPrivate`. Preview input is `organizationId`. It returns organization identity/name, membership ID, eligibility/reason, `expectedVersion`, `previewedAt`, `expiresAt` and explicit post/project preservation/team-invitation restriction flags.

Adoption input is `organizationId`, the exact `expectedVersion`, exact `previewedAt` and `acknowledgePrivateOnly: true`. The server rechecks current authority and eligibility, rather than trusting preview fields. Success returns the same `organizationId` and `status: adopted | already_private`. Snapshot expiry, changed state or permission failure creates no partial adoption. No processing, grant, billing or default-workspace authority follows. See [ADR 147](adr/147-explicit-legacy-private-library-adoption.md).

## Profile Cloud Events candidate, October25

Modern `events/subscribe` and `events/unsubscribe` accept `work_cloud_waiting` or `work_cloud_connection_verified` with strict arguments `{profileId, grantVersion}` and existing verified webhook delivery settings. Source/generation arguments belong only to legacy `analysis_completed`; mixing the argument shapes fails validation. Subscription identity binds the event name, principal, callback and exact arguments. Existing legacy identities are preserved.

Waiting payload `work-cloud-waiting-v1` contains `sourceId`, `profileId`, `generation`, `grantVersion`, `approvedAt`, `status=waiting` and protected `reviewUrl`. The existing delivery store deduplicates by subscription/source/generation/approval time. Connection payload `work-cloud-connection-v1` contains `profileId`, `grantVersion`, `status=webhook_verified` and literal `hostExecutionVerified=false`. Only new subscription creation emits it; TTL renewal does not. No retrospective work scan or job creation follows either subscription. See [setup and limits](operations/assistant-access.md#profile-cloud-events-candidate-october25) and [candidate evidence](operations/evidence/launch-20261025-catalog-cloud-events.json). Neither contract is production-accepted yet.

## Finite automatic Cloud saves candidate

[ADR162](adr/162-finite-app-save-cloud-intents.md) records the optional app-save defaults and source-bound intent. Authenticated app capture stages at most24hours of exact authority, with no execution job or reservation. The native saved-link event remains identity-only. `get_job_status` returns a current intent only to its same actor/client/grant; `request_analysis(mode=work_cloud,savedIntentId=...)` consumes its fixed settings after host readiness. Changed/expired authority refuses consumption. Exact unclaimed replay reuses one generation; claimed/unknown work is preserved. Old grants, ordinary captures and creator/MCP intake gain no automatic authority. Deletion/recovery/retention and executor replacement clear this field. Both new gates default off, UI wiring and native media acceptance remain, and nothing is published.
