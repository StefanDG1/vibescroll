# Continue VibeScroll without repeating known failures

Mode: how-to. Start with the [current state summary](CURRENT-STATE.md#start-here) and the relevant decisions in the [owner register](../strategy/OWNER-REQUEST-REGISTER.md). Use the [failure reference](FAILURES-AND-RECOVERY.md) to diagnose known symptoms.

## Establish the actual starting point

1. Read `AGENTS.md` and confirm the intended outcome, scope, and any deadline or required approval from the current request. Use older plans for context and the latest applicable owner decision for scope.
2. Run `git status --short`, identify the checkout and branch and inspect uncommitted changes. Use the compatible checkout listed in the current state summary and preserve work in other checkouts.
3. Inspect the canonical health/version and actual current MCP profile/status only when needed for the task. Use supported connectors or browser-harness. Do not start an analysis as a connection test.
4. Compare the live backend baseline, target commit and current private release/usage ledger before a hosted spending batch. Retain all historical holds and protected source identities. Never print credentials or raw environment lists.
5. State the next user-visible checkpoint and its acceptance assertions. Continue useful work without asking again for routine release/build counts. Ask only when a required user step or actual authority is missing.

## Prepare the design review

1. Open the current app and choose the affected [core journeys](../design/APP-SCREEN-AND-LOADING-LEDGER.md#verify-the-core-journeys). Use the [private production snapshot](../local-development.md#review-the-redesign-with-a-private-snapshot) for realistic content and controlled fixtures for latency, failure, missing media, and access changes. Reuse the snapshot while it covers the task. When saved VibeScroll research informs a decision, link the exact post beside that decision.
2. Compare alternatives on the same posts and tasks. Use generated boards for visual direction and a working preview for gestures, focus, loading, and recovery. Put a phone-accessible preview link or approved shareable captures first in the review. Keep private workspace content in authorized previews and artifacts.
3. When work is parallel, agree which files each agent owns and give shared components one owner. Integrate the related changes before reviewing the complete journey. Fit the number of variants and screens to the time available and carry forward any unreviewed work.

## Diagnose a failed link in order

1. Find the exact saved source and current generation. Read its status, selected version and pending attempt. Do not create a replacement source/generation to make diagnosis easier.
2. Determine whether Save was refused with no job, saved without analysis, queued, claimed/running, known returned failure, unknown/timeout, or completed. Keep consumed/unknown attempts intact.
3. Inspect the implicated boundary: submitted URL/identity, profile choice, OAuth/scopes, VibeScroll grant/membership, saved intent, relay schema, event delivery, native monitor, preparation, analysis validation or publication. A generic error is not a diagnosis.
4. Capture the smallest bounded private receipt before validation at that boundary. Record a safe public stage/code and exact correlation IDs. Never expose tokens, private transcripts or unrestricted stderr.
5. Reproduce the contract defect locally with actual transport/decoder/provider shapes. Check the same pattern in adjacent routes. Do not loosen citation, source identity or authorization validation to accept bad output.
6. Make the smallest supported correction. Verify the actual installed/provider contract, not a guessed API or an undocumented host prerequisite.
7. Run focused regressions and the checks required by changed code. Use isolated concurrency/failure tests before a new live canary. Documentation-only changes need link/format/consistency checks, not another metered production build.

## Choose the recovery action from evidence

| Observed state                                  | Appropriate action                                                                                                                 |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| OAuth valid; implicit profile ambiguous         | Use eligible saved app default/sole writable profile or targeted selection. Do not reconnect.                                      |
| Transport refused savedIntentId before mutation | Correct/test the strict relay contract. No token or scope recreation.                                                              |
| Valid grant but monitor inactive                | Inspect and resume the same supported native task where authorized; preserve identity/subscriptions. Do not create another plugin. |
| Existing valid prepared transcript/JPEGs        | Use the retained branch; do not require downloader/ASR setup, copy media again or charge preparation twice.                        |
| Never claimed and explicitly retryable          | Use the dedicated retry with exact generation/revision/key. Preserve old receipt.                                                  |
| Returned provider/schema failure                | Retain response and real usage. Use a distinct explicit bounded recovery only under current authority. Do not reset old attempt.   |
| Running or timeout/unknown                      | Reconcile exact task/provider receipts. Preserve hold; no automatic replay.                                                        |
| Direct version Ready but history Removed        | Compare evidence formats and their current-source/retention predicates. Do not delete stored versions.                             |
| Private result Ready but shared copy pending    | Reconcile idempotent publication without another model run or screenshot copy. Preserve both users' associations/results.          |
| Deployment command failed after finish ACK      | Read durable finish receipt and actual deployed hashes. Do not redeploy until the outcome is established.                          |

## Verify a full accepted result

1. Save one permitted source under a current funded admission. Record request time and source/generation/operation key. Prefer an allowed failed/queued/unanalyzed source; keep the explicitly reserved source protected.
2. Verify early native title/author/thumbnail and stage updates without refresh. State whether metadata was already cached.
3. Verify actual transcript and timestamp bounds. Open retained JPEG bytes, compare size/hash and decode dimensions. Open a full-size frame. Check evidence IDs/citations against the exact stored version.
4. Read canonical source, version and history through the app and MCP. Preserve the incumbent unless selection was explicitly intended. Verify one idempotent completion/replay causes no duplicate work.
5. Verify truthful shared publication and requesting-user association where that route claims sharing. Test entitlement/withdrawal/deletion and non-owner isolation. A private candidate does not satisfy this step.
6. Verify actual credit reservation/settlement or zero API inference for the supported subscription route. Retain unknown infrastructure holds and avoid provider-funding fallback.
7. Verify the native monitor remains available and the later result reply is actually present. Distinguish recorded reply from mobile push or an unsolicited reply in the originating chat.
8. Report observed phase times with one time origin. Label retained-evidence comparisons and composed estimates. Never claim accuracy, reliability percentage or customer readiness from one canary.

## Publish a compatible checkpoint

1. At the start of a release task, check the audit with `node scripts/audit-dependencies.mjs`, the browser and viewport controls, and access to an authorized signed-in test session if the affected path needs one. Surface any missing session early. Continue with the checks that can run.
2. Freeze the exact clean candidate and actual serving baseline. Verify required CI for that commit. Preserve fixed Basic/normal queue and unchanged billing/provider gates. For backend changes, prepare deterministic manifests offline. Review actual schema, index, component, auth and cron impact under the existing compatible guard. Stop if the predicted work requires an unreviewed populated scan or backfill.
3. Reserve the bounded release batch in the private ledger. Use current usage/headroom and reporting lag. Do not re-ask for a delegated routine release count.
4. Publish once through the current reviewed official transport. Preserve request/finish journals. Reconcile an ambiguous result before any retry.
5. Build the website only when application/policy changes require it. Stage without canonical domain promotion, verify exact health and relevant routes, then promote the same build. Restore normal domain assignment.
6. Verify canonical health and the affected user journeys. Record public and signed-in checks separately and check MCP status when the release affects it or the release plan calls for it. Update the current state, requirement acceptance and dated receipt together. Keep detailed earlier failures intact.

Do not replay an old private release script merely because it once worked. Those scripts bind a particular commit, path, module manifest, ledger state, deadline and once-only operation. Inspect and prepare the next bounded package. A historical root approval is not reusable authority.

## Close the checkpoint without losing context

1. Remove/revoke only exact disposable test policy/key/runtime resources after outcome reconciliation. Preserve good results, valid shared caches, other workers and unrelated credentials. Verify owned resolved paths before cleanup.
2. Check the Git diff and push the reviewed change. Update the existing PR attachment if needed; do not create a duplicate release chat or message unrelated chats without authorization.
3. Close owned unneeded browser tabs/servers. Preserve the user's tabs, sessions and result access.
4. Update the [current state summary](CURRENT-STATE.md#start-here) if the live baseline, approved direction, or open verification changed. Link the evidence and keep prior receipts. Record new owner decisions in the register and mark acceptance only to the level verified.
5. Close with four short lines or bullets when there is a handoff.
   - **Changed** — the user-visible result or decision.
   - **Available** — the preview, branch, staging URL, or live URL and the revision when relevant.
   - **Verified** — the actual checks, environment, and any simulated inputs.
   - **Pending** — the remaining check and the exact person or service needed, if any.

## Keep tooling output safe and useful

Use `rg` with narrow paths, `--max-columns` and generated-file exclusions. In particular exclude `packages/widget/resources.generated.ts` from broad text output. Inspect every result of batched reads. Store large private responses and print only the fields needed for the decision.

Use UTF-8 explicitly when reading/writing Windows documents. Use structured tool arguments or exact body files for PRs and JSON. Fail the script on each failed dependency rather than allowing later commands to create a misleading success exit. Do not interpolate untrusted text into shell code. Use known verified project IDs and refresh browser target/AX state when IDs become stale.

## Existing Windows offline-check runtime

Use the installed project tools instead of reinstalling caption dependencies. Prepend `C:/Code/VibeScroller/.worktrees/launch-20261022/outputs/tools/node-v24.22.1-win-x64` and `C:/Code/VibeScroller/.worktrees/launch-20261022/outputs/launch-run/prepared-evidence-oct29-local-python` to this command process’s PATH, then run `node scripts/run-offline.mjs pnpm check` from the compatible checkout. The Python wrapper pins its existing local caption dependency directory. Verify these paths if the checkout/tool installation moves. Preserve failed logs; a billing fixture timeout must be reproduced separately before changing unrelated production logic or increasing limits.

## Library layout after shared CSS changes

Run the read-only browser-harness regression against a hydrated production-build preview with `python scripts/check-library-layout.py --output outputs/library-layout-check.json`. It checks Tree and Folders at 1440 and 390 px in both themes. Wrappers must contain the 44 px controls, labels must have usable width, and the page must fit its viewport. A previous run exposed these failures even though SSR rendered the topic text. An optional canonical check uses `--url https://scroll.companynerve.com/demo?view=library`. The script opens and closes its own read-only demo tab.
