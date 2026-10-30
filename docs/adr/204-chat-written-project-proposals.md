# ADR 204: chat-written project proposals in existing records

Date: October 30, 2026. Status: implemented and tested locally, not deployed.

## Direction

Implement checkpoint1 of [the chat-first plan](../strategy/CHAT-FIRST-DEMO.md), R099. Users can compose a private proposal in ChatGPT/Codex, save it through MCP, retrieve it from another chat and update it without overwriting an intervening edit. No model call, credits, source acquisition, issue publication or coding starts when a draft is saved.

Reuse `proposals` and its existing organization/source indexes. A versioned, validated detail envelope stores the exact retained analysis/insight bindings, current project snapshot, host-written draft and bounded operation receipts. Keep create-key identity across edits. Current `version` and `review` provide optimistic concurrency, including a manual review decision that keeps the numeric version unchanged. Do not add tables/indexes, copy neutral analysis into proposals or create a second proposal database. Limit any source-key lookup and organization listing explicitly; an incomplete page is not a full-library search.

The server builds evidence references from the selected retained insights, rather than trusting model-authored reference IDs. Repository context currently includes the confirmed profile and recorded revision, not inspected code. Label this route as planning-only. Existing execution approval must reject that envelope until the future inspected-context/handoff stage is implemented. Saving a draft is an ordinary authenticated operation; no five-minute sign-in or new OAuth app is required.

## Invariants and acceptance

- Use current `knowledge:read`, `context:read` and `suggestions:draft` authority, source entitlement and project selection. Cross-workspace, withdrawn evidence, revoked permissions and unselected repositories cannot be read or written.
- Bind writes to the `contextHash` returned by the exact project-context read. Updates preserve source/project/version identity; choosing different evidence creates another proposal.
- Replay an acknowledged key without duplicating work. Reusing that key with different arguments fails. An old retry cannot overwrite a newer edit. Version checks are atomic in the Convex mutation.
- Keep host-written judgment distinct from verified repository inspection or measured user benefit. Preserve existing legacy and typed proposals.
- Expose save, exact read and bounded list tools, then update the existing project-review skill. Preserve plugin identity, current OAuth scopes and disabled UI.
- Test private/shared retained versions, duplicate/racing requests, stale context, manual edits, source deletion, permission revocation, malicious content and execution refusal before release.

Implementation/local tests, actual backend preparation, exact CI, controlled publication and an authenticated production read/write/read are separate checkpoints. Keep all existing data, funding holds and source protections. A browser/demo success does not establish this backend acceptance.

## Local evidence

The37-case focused suite passes private and independent reference-only shared versions through the context, HTTP and MCP routes. It covers duplicate/racing creates, competing edits, unchanged-version manual review, deletion, entitlement/grant revocation and capability-bearing content. A valid draft larger than8KiB passes the dedicated32KiB HTTP envelope; stale edits and conflicting operation keys return static actionable errors instead of misleading reconnect guidance. Root types, lint, tests and both builds pass. Two offline official-CLI preparations match exactly. Actual compatible prediction, exact CI, publication and production write/read acceptance remain separate.
