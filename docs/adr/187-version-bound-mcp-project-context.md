# ADR 187: exact-version project context through MCP

Date: October 28, 2026. Status: deployed at d0fb903; native production read accepted October 29 after official Refresh tools on the existing connection, without new authentication. See [release evidence](../operations/evidence/launch-20261029-source-progress-production.json). The write/completion phase below remains planned.

## Problem

A shared-cache post stores a personal association rather than copied analysis. Older project evaluation reads the raw source analysis and references a mutable source revision. An assistant needs one exact retained analysis and a current confirmed project profile to continue from a cached post without reacquiring the video or confusing two analysis versions.

## Decision

Add the read-only `get_project_application_context` MCP action under both existing `knowledge:read` and `context:read` scopes. Infer the workspace from the authenticated saved source, while rejecting an inconsistent explicit profile. Require a confirmed, enabled, currently granted repository profile at its exact base SHA, profile version and snapshot selection. Return the current eligible analysis by default, or an explicitly requested retained version. Keep current source, catalog, entitlement, retention and takedown checks at every read.

Parse private and neutral shared output through their actual separate contracts. Map insights to the reader's own source and immutable version ID. Return at most eight selected insights and an omission count, evidence/revision/output hashes and the confirmed project profile. Do not expose a foreign contributor's source/job IDs, raw transcript, private image URLs, repository code, execution credentials or an unbounded library. Bound the complete context to 120KB and reject detected credential values. Bind its deterministic hash to the authenticated actor/client, grant version, exact source version and project revision. This hash is a comparison binding, not a bearer capability or coding approval.

Explain potential category matches with exact profile terms. Term overlap is a discovery hint, not proof of suitability, repository implementation, model quality or measured benefit. Preserve unsupported/uncertain insight labels. The model must inspect separately authorized repository evidence or ask focused questions before asserting implementation details. A confirmed business profile is not repository inspection.

The read writes no evaluation, proposal, issue, job, reservation or source row. It launches no media acquisition, ASR, inference, publication or coding. Existing private exact-evaluation issue drafting remains unchanged. No schema, table or index is added for this read phase.

## Next write phase

Extend the existing knowledge reference contract with optional immutable analysis-version IDs while preserving legacy keys. Resolve versioned citations through retained private/shared evidence and recheck access. Do not copy a cached analysis into a personal source merely to satisfy the old evaluator.

Add a user-requested host-reported project evaluation under a recomputed context hash and stable request key. Reuse existing evaluation/topic/issue records where their semantics fit. Record honest host provenance, preserve manual drafts and distinct no-fit/needs-context outcomes, and keep managed credit evaluation separate. No paid API fallback is authorized. Issue publication and coding retain their actual independent approval boundaries.

Add authenticated, proposal-bound, idempotent model completion reports and verified GitHub lifecycle observations. Keep self-reported completion, CI success, merge and measured usefulness distinct. Never place a bearer token in a public issue or PR body. This write/completion phase is not implemented by the read action.

## Acceptance

Prove private and reference-only shared reads, both OAuth scopes, foreign-account/project/version denial, changed project revisions, withdrawn/expired evidence and entitlement loss. Verify historical version references after selection changes. Exercise actual MCP 2.0 and authenticated HTTP transport. Confirm no provider network activity, source/job writes, copied analysis or new billing entries. Production acceptance and a later complete proposal/issue loop remain separate.
