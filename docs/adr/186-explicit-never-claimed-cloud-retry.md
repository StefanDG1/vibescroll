# ADR 186: explicit retry of never-claimed Cloud requests

Date: October 28, 2026. Status: implementation candidate, not deployed.

## Problem

Ordinary Save correctly preserves an existing generation, but this leaves no simple action for a failed request that never reached a host. Reusing the old lease or treating every failure as safe would risk duplicate execution and lost usage records.

## Decision

Offer Retry using Cloud defaults on the post page only for a known never-claimed Cloud media request. Extend the existing MCP `request_analysis` action with an explicit `retry` object containing the expected generation, source revision and stable idempotency key. Native event handlers never choose retry automatically.

Require the current owner, supported Reel/TikTok identity, source retention, standing Cloud defaults and a current native monitor. App access uses the normal signed-in session. MCP also requires current request and execution scopes and the selected source grant. Do not permit model, credit, paid API, project or executor overrides on a retry.

A failed/cancelled/expired request, or an expired queued request, qualifies only when its generation matches and it has no task ID, claim time, consent, lease hash, preparation, execution tokens, result or pending analysis version. Unknown work and prior results remain protected. A new request receives a new generation, input/policy binding, finite lease and zero-API funding through the existing approval path.

Keep old reservations unchanged. Add one optional bounded source receipt array with at most twenty entries, recording the prior generation, revision, state, requested settings, grant/client, input/policy hashes, approval/expiry times and hash of the old job. The array also binds retry keys to the resulting generation. Repeated keys return that same request; mismatched or stale keys cannot create work. No table, index, component, scan, backfill or provider is added. Publication still requires actual schema-impact guards.

## Validation and limits

Test normal-session access, another account, missing MCP execution scope, revoked grants, paused monitoring, expired source retention, all claim markers, stale revisions, duplicate requests and unchanged old funding records. Exercise the actual MCP 2.0 schema, authenticated HTTP boundary and mutation together. Run the existing Cloud job/media suites and post rendering checks.

This does not reconcile a possibly running host, reopen expired media evidence, repair corrupt output, retry automatically or attest provider termination. Retained-result reanalysis uses the separate immutable version workflow. Production retry acceptance remains unclaimed until the exact candidate is deployed and tested within approved release counts and budget.
