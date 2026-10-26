# ADR 176: review a source inside the compact ChatGPT widget

Date: 26 October 2026. Status: local implementation candidate.

## Decision

Replace the compact card's hidden feedback section with a collapsed Review this source control. Opening it reads the current connection's saved judgment and note for that exact source version. The person can choose any of the five existing judgments and save an explicit note correction. Expanded source detail and Scroll reuse the same component and44px minimum judgment targets.

Preserve the current cited claim, source action and deliberate conversation attachment. Compact cards gain no application navigation. Their initial render reads no private judgment until the control opens.

## Existing authority and data

Reuse `record_feedback`, its existing append-only records, version checks, input hash and same-key replay. Add only an app-only `widget_feedback_state` read requiring current `knowledge:read` and `feedback:write` OAuth, configured-client and app-grant permissions. Writer membership, the exact source generation/revision, retention, rights and current source scope are checked again. Selected-source grants remain supported; no whole-library edit permission is required.

The read returns only the current actor/client's eligible judgment. It uses the existing `by_target_actor` index for a bounded51-record lookup and `by_assistant_key` for reconciliation. If a matching current judgment is not established within that bound, it reports an incomplete lookup and the UI offers protected review. It never treats a limited search as evidence that no judgment exists. Manual quality reviews and other actors' or connections' notes are not returned.

No new table, index, provider permission, client scope, app grant, worker, cron, component or execution route is introduced. The candidate preserves serving baseline97dfa2c. The separate default-off topic/idea-filing candidates remain isolated.

## Reopening and uncertain outcomes

When no current judgment exists, the server derives a stable first-request key from the current grant ID and exact source version. Reopened widgets share that initial key, so concurrent first writes use the existing version fence. If a saved judgment exists, the widget reuses its key and version. A read is not approval to write.

Before writing, the UI reauthorizes the exact source and connection. A changed grant identity masks private fields and refuses the draft. After the existing mutation acknowledges, a canonical keyed read must match the action, trimmed note, source, grant, key, version and acknowledgement ID before success is shown.

Unknown replies retain their complete request through disclosure collapse. Check saved judgment reads the existing key. A matching record confirms the operation without another write; a retry keeps the same payload/key/version. A later conflicting judgment requires explicit review of current state. Leaving the view does not replay a command, and no token or note is stored in browser storage. Access-read failure masks the private controls until authoritative recovery.

This is a source judgment from the current connection, not a measured benefit or a rewrite of evidence. It changes no analysis, sharing, funding, coding or publication authority.

## Verification and release

Verify all five choices, reopening with a saved note, stale/revoked/selected-source access, cross-actor privacy, bounded lookup, exact-key recovery, stable first keys, identity changes and actual strict HTTP transport. Synthetic AppBridge checks use compiled HTML and close their owned tab. Whole-card light/dark captures cover680px and320px; expanded Library and Scroll also verify44px targets at320px.

Local checks and screenshots do not establish actual ChatGPT editing acceptance. Exact combined CI, coordinated publication of the matching frontend/backend, existing-plugin discovery refresh and a separately authorized real-host write check remain release steps. Do not publish during the other release chat's active media attempt or reuse another operation's reserved budget.
