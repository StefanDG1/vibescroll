# ADR 151: analyze existing sole-owner posts through Work Cloud

Date: October 25, 2026. Status: implementation candidate; production result pending.

## Decision

The owner authorizes changing the existing production account/team and backend while preserving every saved post and insight. They confirm they are the only production user. Prefer the existing source, analysis job, connection and result page over copying posts or introducing a second queue. The same cumulative task ceiling is now EUR5, including all prior usage and retained holds. GitHub remains optional.

Extend experimental Work Cloud source eligibility to the original creator who is the current sole owner of an active team, with no active invitations. Use indexed bounded checks at setup, grant review, approval, request, recovery, claim and every leased operation. A second member, active invitation, role loss, ownership transfer or deleting organization removes eligibility. Current owner-private libraries remain eligible. A separate private library does not disqualify execution in the original team; this is not private-library adoption.

The original team needs its own reviewed connection grant. Never transfer a grant across organizations. Preserve source IDs, organization ownership, billing, saved insights and every other post. Fresh experimental media approvals refuse posts with existing analysis, summary, ordered evidence or private result pointers. Reanalysis is outside this first production proof.

## Simplest execution sequence

Reuse an existing operational user-owned Work Cloud environment with verified cached media tools and current enforced restricted network access. A fresh chat that exposes MCP tools but has no execution environment is insufficient. Prepare actual permitted media before claiming the short source lease. Then request/approve, claim, read the exact input, bind preparation and return cited analysis through the existing tools. Revalidate source identity and current authority at the protocol boundary. A prepared local result is not a completed production result.

The owner permits deferring local/managed-credit processing if this route proves reliable. Keep their existing implementations while that condition remains unproven. No automatic dispatch, shared-catalog publication, commercial provider approval, paid API fallback or production success follows from this authorization change.

## Verification

Focused tests cover team grants, existing separate private library, current membership/invitation and role races, retention, existing-result refusal, unchanged saved content and server-derived UI availability. Exact-head CI, compatible code-only publication, real media return and same-post display are separate release evidence. Full main's pending schema/index migration remains held.
