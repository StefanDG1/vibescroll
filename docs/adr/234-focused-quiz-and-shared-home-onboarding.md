# ADR234: Focused quiz and shared Home onboarding

Status: V1 implementation approved under R151, November 2, 2026. Production acceptance remains separate.

Use a typed journey with actual Back history and optional new answer fields. Keep existing signed draft and onboarding adoption contracts. Preserve legacy users and useful saved answers.

Use FeedPostCard for the guest preview through explicit media, evidence and continuation capabilities. Do not reuse authenticated queries or synthetic-demo mutations for guests. The public starter route remains the only authority for the complete preview and thumbnails.

Assistant setup is a resumable account-owned choice. A clicked setup link does not prove a connection. Record an optional connection receipt only after an authenticated successful MCP profile read and current grant validation. Show deferred readiness before payment because ordinary MCP access requires current Pro. Preserve explicit revoked/narrow grants and separate Events execution readiness. Connected assistant preference never silently reroutes a paid API job.

New persisted quiz/assistant fields are optional. No new table/index, scan, backfill, paid model call or real payment is needed. Reuse current GitHub, checkout, cache binding, project context and proposal contracts.
