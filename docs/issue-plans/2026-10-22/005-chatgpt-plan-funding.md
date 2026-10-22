# Plan for #5: finish ChatGPT-plan funding acceptance

Status: draft for owner review. [Original issue](https://github.com/StefanDG1/vibescroll/issues/5). Baseline and common checks are in the [review index](README.md).

## Outcome and current gap

Keep WorkOS application identity. Let an eligible user explicitly choose their own supported plan-funded runtime for verified capabilities, with current account/device/approval checks and separate accounting. Continue to gate commercial activation and SIWC-funded coding on their own evidence.

This issue predates substantial implementation. Rebuilding its original work packages would duplicate existing code. First produce a requirement-to-evidence inventory, then implement only proven gaps. An owner-only successful path is useful evidence, but does not establish general customer availability.

Application update, October 22: the owner-authorized official commercial interest form was submitted once at 00:28:29 UTC, 02:28:29 Europe/Berlin. The page confirmed receipt and said OpenAI would reach out if the product is a fit. No reference ID was displayed. The submitted contact, answers and receipt/screenshot remain private outside the repository. Submission is complete; commercial approval and activation remain pending.

## Proposed refinements from the review

These recommendations narrow duplication and make the remaining work easier to assess. They do not activate a new funding route.

1. Make the first deliverable a short capability/evidence matrix the owner can review. For each task type, show the existing runtime, verified capabilities, missing tests, provider eligibility and next recovery action. Distinguish text/image reasoning, audio preparation and coding. This reveals which work is already done before another adapter or settings screen is built.
2. Audit existing capability checks and consolidate duplicated decisions into one authoritative server-side resolver where appropriate. UI connection badges and dispatch should consume the same result. Keep account identity, granted plan permission, deployment eligibility and device availability as separate inputs, so a connected badge cannot imply a usable job route. Do not rewrite a working resolver if the audit finds one already serves this purpose.
3. Make task confirmation explain stage-level funding in plain language: which selected runtime handles each stage, any quoted platform compute cost, and what stops when the device or plan is unavailable. Reuse the existing receipts and quote components. Unknown plan quota remains unknown. No automatic funding change follows a failure.
4. Keep a small fixed evaluation set of real product task shapes for future model/effort changes: cited extraction, relevant and already-implemented matches, a plan and a failed/incomplete response. Begin with recorded/synthetic fixtures; any new real inference needs its approved route. Track evidence correctness, valid output, latency and safe usage rather than assuming the most expensive effort is better.
5. Agree the local-inference milestone independently of SIWC coding. The original issue permits hosted access to remain blocked with a documented prerequisite. Useful local acceptance work should not turn into a speculative hosted implementation while a commercial response is outstanding. SIWC coding remains conditional on its separate isolation and renewal proof.

Recommended order is inventory, proven gaps, complete local-route acceptance, then the conditional coding/commercial work only when prerequisites are met. This preserves the full issue while making progress reviewable.

## What exists

| Source                                                                                               | Observed implementation or recorded evidence                                                                                 | Remaining question                                                                                                          |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `packages/runner/chatgpt-protocol.mjs`                                                               | Independent protocol adapter with host identity, state/PKCE/nonce and bounded request/response helpers.                      | Current protocol conformance and all failure cases need an explicit acceptance mapping.                                     |
| `packages/runner/chatgpt-local.mjs`, `chatgpt-store.mjs`, `chatgpt-storage.ps1`                      | Account profiles, token verification/rotation, local storage and Windows DPAPI support.                                      | Real revocation, exhaustion, crash recovery and concurrency evidence must be distinguished from fixture tests.              |
| `packages/runner/chatgpt-cli.mjs`, `docs/operations/chatgpt-local.md`                                | Connect/status/models/verify/summarize utility. Recorded September 30 owner text-inference completion.                       | Current candidate-version repeat and deployment applicability are separate facts.                                           |
| `packages/runner/personal-runner.mjs`, `convex/personalAnalysis.ts`, `convex/lib/personalAccess.ts`  | Personal profile/device binding and owner-gated dispatch.                                                                    | Do not widen the allowlist based on a successful owner test. Audit eligibility before any customer expansion.               |
| `convex/lib/assistantIntake.ts`, `convex/assistantLocal*.ts`, `packages/runner/assistant-runner.mjs` | Current assistant defaults, actor/workspace/profile checks and local execution flow.                                         | Identify which path uses SIWC versus the distinct official-client personal route. Do not combine their acceptance evidence. |
| `packages/runner/app-server.mjs`, `contracts/runner-job.schema.json`                                 | Existing Codex wrapper and serialized coding funding routes.                                                                 | This does not demonstrate SIWC token renewal or coding isolation.                                                           |
| `docs/adr/009-chatgpt-plan-protocol.md`, `docs/implementation-status.md`, `docs/CAPABILITIES.md`     | Local consent/inference and narrow owner production routes recorded; commercial hosted SIWC and Windows coding remain gated. | Historical results do not prove the whole issue's present acceptance matrix.                                                |

ADR 009 records a restrictive DevKit license at the inspected commit and an independently authored adapter. Keep that implementation unless a separately reviewed change is justified. Do not add an SDK dependency merely because the original issue suggested a spike.

## 5-A: reconcile requirements and provider eligibility

1. Build a matrix for all fourteen acceptance cases in the issue, with links to code, fixture tests, dated real evidence and missing checks. Mark each implemented/fixture-tested/authenticated-verified/gated/unknown independently.
2. Separate four capabilities: local tool-free SIWC inference, owner official-client personal processing, SIWC app-server coding, and hosted commercial SIWC inference. Record runtime, allowed subjects/workloads, credential boundary and kill switch for each. A successful model listing is not completed inference.
3. Recheck official protocol, preview limits and current licensing before implementation. Record contract changes against actual request/parser behavior; do not repurpose API-key adapters by substituting tokens.
4. Record a non-secret eligibility reference, permitted deployment/workloads, verification date and expiry/review policy. The October 22 mailbox search found personal plan consent but no earlier commercial receipt or approval; it could not rule out a prior form submission. The subsequent owner-authorized interest-form submission is now verified as recorded above. Retain that receipt separately from provider approval and await the provider response. Customer commercial/hybrid activation remains unverified and disabled. Continue fixture and local-audit work.
5. Reconcile original issue language with current decisions in a new ADR if a product boundary changes. Keep historical evidence intact. A partial milestone may be marked complete in the inventory without closing the issue.

The [official quickstart](https://developers.openai.com/siwc/quickstart), retrieved October 22, still describes selected commercial partners. The [plan-usage overview](https://developers.openai.com/siwc/token-sharing-open-source) documents registration and streamed inference through completion. These public documents do not establish VibeScroll's individual approval. Recheck exact workload eligibility before activation.

Deliverable: an auditable gap list with no new funding route enabled. This change set can proceed while provider review is pending.

## 5-B: finish missing local inference and application integration

1. Map every connection state to a precise cause and recovery: disconnected, authorizing, identity-only, enabled, reconnect-required, limited, temporary failure and deployment-blocked. Device online/offline is independent. Reuse existing state/storage fields where sufficient rather than adding a second connection store.
2. Verify owner, organization membership, device and profile revisions at quote, enqueue, dispatch and commit. Account/profile switch, disconnect, membership loss and expired permission fence pending work. Old responses cannot create a new artifact or spend under a replacement approval.
3. Preserve separate registrations even with equal email. Verify refresh serialization and atomic persistence, including uncertain refresh outcomes, failed exchange and remote-revocation failure. Show local logout versus confirmed remote revocation honestly. Never erase registration/client mapping as a routine retry.
4. Audit the dedicated request allowlist, account model decoder, SSE parser and structured-output validation against the rechecked contract. Only terminal validated success commits an artifact. Partial streams, malformed events, provider failures after text and cancelled requests stay nonfinal. Keep model/effort choices tied to observed capability, with no hardcoded plan capacity or silent escalation.
5. Verify stage-level accounting across text, image reasoning, media preparation, transcription and coding. Plan usage, API-provider charges and platform compute/credits need distinct receipts. Reusing completed preprocessing must not charge twice. An unknown external result retains its hold for reconciliation.
6. Review the settings/Connections and task confirmation UI for account, runtime, model, funding and limits. WorkOS sign-in and library access continue without ChatGPT. Disconnecting AI leaves the app account and platform subscription intact. Mobile setup directs local authorization to the paired computer and offers a recoverable offline state.
7. Test current cancellation, deadlines and concurrency caps under interrupted connectivity. Never switch to managed/BYOK/cloud on failure without a fresh explicit selection and quote. Routine telemetry contains safe IDs/state only, never token-bearing URLs or source contents.

Extend existing `tests/chatgpt-local.test.ts`, `tests/personal-analysis.test.ts`, `tests/personal-media.test.ts`, `tests/assistant-intake.test.ts` and `tests/assistant-local-runner.test.ts` where the gap inventory warrants it. Avoid duplicating covered fixtures just to increase test counts.

Acceptance: the inventory's local identity, scope, request, stream, funding, account-switch, offline, revocation and stale-completion cases pass at the appropriate evidence level. Real quota/revocation cases require an eligible consenting test account and explicit allowance use. A synthetic 429 is fixture evidence only.

## 5-C: conditional coding adapter and commercial activation

Treat SIWC-funded app-server coding as a separate change set after 5-A/5-B. Preserve the existing official Codex-session mode. Inspect the pinned protocol/version, child environment, thread persistence, runner leases and OS boundary before modifying `app-server.mjs` or the runner contract.

1. Choose one versioned funding vocabulary across JSON schema, live validators, approvals, UI and billing. Keep persisted legacy values readable through explicit migration/compatibility rules; unknown values fail closed. Inference and execution authority remain distinct.
2. Keep refresh credentials in a trusted local credential component. If access credentials enter an app-server process, prove generated tools/tests cannot read them, inherit them or upload them. Use broker/isolation mechanisms already supported by the runtime; an environment variable alone does not provide that boundary.
3. Design renewal/restart around durable thread identity and exact approval/run lease. Verify resume, terminal completion, cancellation, descendant termination and duplicate-worker prevention. Existing ephemeral threads must not be presented as resumable without implementation and tests.
4. Run secret-canary and adversarial isolation tests before any real coding. Current Windows coding stays unavailable while isolation evidence is missing. Do not remove a sandbox check to satisfy the issue.
5. Prepare hosted integration only behind a server-controlled eligibility check. Missing, expired or wrong-workload evidence disables new dispatch. Operator disablement stops new work and fences unsafe completions while preserving completed artifacts and reconciled accounting.

Commercial activation requires the recorded exact deployment permission and real authorized integration tests. A local setup flag, public repository license or owner allowance cannot establish that approval. The current owner-only official-client worker must not become a pooled customer funding route.

Acceptance: no authenticated job can access another user's profile, no tool sees protected credentials, renewal preserves one authorized job, and all disabled modes remain disabled. A failed isolation test is a release blocker for that coding capability, not for ordinary library use.

## Acceptance mapping and checks

| Original issue cases                                    | Planned evidence                                                                                                                      |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 1 and 9: existing login/routes and mobile/offline       | WorkOS/tenant/managed/BYOK regressions plus mobile task walkthrough without a local callback on the phone.                            |
| 2-4 and 8: scope, identity, tenancy, renewal/revocation | Protocol negative fixtures and Convex owner/device/profile fences; real consent/revocation acceptance separately.                     |
| 5-7: catalog, requests and terminal responses           | Dedicated SIWC catalog and field fixtures, malformed/interrupted streams, partial output and schema/provenance validation.            |
| 10: separate funding and retry costs                    | Stage receipts, duplicate replay and uncertain-settlement tests across plan and paid routes.                                          |
| 11-12: coding renewal and secret isolation              | Conditional 5-C process/lease tests and secret-canary probes; actual isolated acceptance before enabling coding.                      |
| 13: eligibility/kill switch                             | Missing/expired/wrong-workload evidence and disable-during-run tests.                                                                 |
| 14: full regression and evidence record                 | Shared repository checks, changed-file formatting, dependency/secret checks and relevant browser tests with exact environment/commit. |

Use targeted suites first, then `pnpm check` and repository-required additional checks before a PR. The planning task did not rerun old tests or consume a tester's allowance. Record failed, unavailable and skipped live tests explicitly.

## Release, rollback and completion

Release requirement/evidence reconciliation first. Ship local fixes behind existing eligibility and capability checks; verify a complete selected-account request and cancellation before broadening availability. Update `docs/AI-PROVIDERS.md`, `docs/LOCAL-RUNNER.md`, `docs/operations/chatgpt-local.md`, contracts/data/API docs, capabilities and implementation status only for actual behavior. App copy changes also require the foundational copy brief.

Rollback disables new dispatch for the affected adapter, cancels/fences pending runs, retains uncertain reservations for reconciliation and preserves completed private artifacts. Keep account registrations and usable encrypted credentials unless the user disconnects or confirmed compromise requires revocation. Do not silently reroute spending or alter WorkOS identity.

Q5's application-preparation and submission action is complete. Await the provider's response and record any permitted deployment/workloads before activation. Additional provider/protocol facts belong to the spike. The full issue is complete only when its supported local path and regressions have evidence, the coding requirement has an explicit delivered or owner-resolved boundary, and hosted access is either independently verified or retained as blocked with the documented prerequisite allowed by the issue. Do not close it solely because the CLI exists or the interest form was submitted.
