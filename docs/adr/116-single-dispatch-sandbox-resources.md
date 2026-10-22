# Dispatch each approved sandbox resource once

Mode: reference. Decision date: October 22, 2026.

## Context

The installed Vercel Sandbox SDK 3.5.1 retries transport failures, HTTP 429 and HTTP 5xx responses twice. Its generic transport also retries VM and snapshot creation. A lost response can therefore repeat a resource allocation that has already succeeded. One workflow action with retries disabled does not prevent these lower-level requests.

Job approvals bound one VM's lifetime and compute. Clean-tool maintenance and builds separately approve one candidate snapshot with a seven-day expiry. Extra VMs or retained snapshots can exceed those approvals. A sandbox name or an undocumented idempotency header is not proof that repeated creation is safe.

## Decision

Use the SDK's supported custom fetch option for job creation, clean-tool renewal and the operator image builder. Record dispatch before awaiting the first creation response. Refuse another VM creation request from that adapter, including after an ambiguous response. Refuse an unexpected initial creation endpoint before dispatch so an SDK upgrade requires review.

Only clean-tool renewal and the image builder explicitly permit snapshot creation. Their adapter separately permits one snapshot request with a positive expiry of at most seven days. An uncertain snapshot response does not authorize a second snapshot or establish that retained storage is absent.

Allow the reviewed command, file, network-policy, read, stop and deletion operations. Preserve their SDK retry behavior. Block automatic VM resume, forks, lifetime extensions, resource changes and unreviewed mutating endpoints. A stopped job cannot silently acquire another execution session outside its approval.

Bound the creation request itself to thirty seconds. This request deadline does not replace the existing VM lifetime, clear a usage reservation or become the deadline for subsequent commands and teardown. Later control requests retain their own signals and timeouts.

## Uncertain outcomes

Distinguish `SANDBOX_CREATE_UNCERTAIN` from `SANDBOX_SNAPSHOT_UNCERTAIN`. An ambiguous VM creation retains the existing compute hold even if no provider identifier was returned. Reconcile the provider inventory and actual termination before retrying. An ambiguous snapshot retains its storage exposure until authoritative inventory/deletion or actual expiry establishes its outcome. Confirmed VM deletion alone does not establish snapshot deletion.

This change does not add provider idempotency, activate media, create resources, alter credit ceilings or verify a live snapshot. Existing maintenance leases, failure backoff, scope checks and promotion requirements remain. Object-deletion retries and their funding remain a separate operating obligation; this adapter does not make them finite.

## Verification

Offline tests use the actual installed SDK with a synthetic transport. Before the fix, lost-response, HTTP 503 and HTTP 429 creation cases each dispatched three requests instead of one. The focused suite verifies one VM/snapshot dispatch, endpoint drift refusal, explicit snapshot expiry, forbidden resource operations, normal stop retry/deletion and native Node 24 image-builder loading. It also drives the actual personal-media preparation handler and verifies that unknown creation leaves its dispatched compute reservation active without an analysis or release of its compute hold. A separate renewal regression confirms that a lost snapshot response fails renewal and deletes the known VM without claiming deletion of an unidentified snapshot.

The deadline regression expires the creation signal after a successful response and then verifies that stop retries and deletion still succeed with independent signals. These fixtures establish transport and accounting behavior, not live provider isolation, pricing, cleanup or production acceptance.

Command: `node scripts/run-offline.mjs pnpm exec vitest run --maxWorkers=1 tests/sandbox-create-budget.test.ts`.
