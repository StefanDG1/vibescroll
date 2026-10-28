# ADR 182: automatic Cloud intake from ordinary MCP chats

Date: October 28, 2026. Status: controls published at `f6ecf74334477e96cbff71c7502ce8293cf4dc5d`; ordinary-chat production canary pending.

## Decision

Use the existing native MCP Events monitor and exact saved-link intent for both app Save and ordinary MCP `save_link`. The sending ChatGPT chat does not need a video runtime. `request_analysis` without a mode continues the same default when scope acquisition is needed. Explicit diagnostic `mode: work_cloud` remains separate. Save-only is `analyze: false`.

Introduce the reviewed `link-save-cloud-v2` preference. Existing `app-save-cloud-v1` grants retain app-only authority. Enabling the broader preference once requires explicit-link saving, the existing analysis/events scopes and a fresh grant version. Rebind the existing monitor to that version. Never create a replacement OAuth app or silently broaden old consent.

Queue a finite, hash-bound intent only for a pristine permitted Instagram or TikTok source and a current monitor. The prepared host consumes it using the existing zero-API Cloud path. A new intent has a distinct saved-link event occurrence, so an already delivered save-only acknowledgement cannot swallow later scope continuation. A never-attempted pending acknowledgement upgrades in place; legacy intent occurrences stay unchanged. Duplicates, completed work, failed/unknown generations and old stale intents remain preserved. No fallback executor or automatic paid spending is added. Shared cache eligibility continues to precede execution.

The ordinary post view explains automatic setup. Its manual video handoff is lazy-mounted under Advanced. Old save-only pristine posts can request existing Cloud defaults without the diagnostic approval form. Other source routes retain separate eligibility.

## Limits and acceptance

VibeScroll must be available to the originating ChatGPT chat. This code cannot force app selection or unsolicited completion into an arbitrary originating chat. Results update the post and configured Work task. OAuth refresh, revocation, subscription limits and monitor readiness still apply; there is no forever-authentication promise.

Isolated tests cover serialized MCP protocols 2025-11-25 and 2026-07-28 through authenticated HTTP into real Convex mutations, scope continuation, replay, save-only, old-grant preservation, monitor absence and closed-by-default manual UI. Full local and exact Linux checks must pass before publication. An actual ordinary-chat automatic production canary remains required. Existing provider/privacy/release gates, finite canary allowance, reserved source and cumulative budget remain unchanged.

## Publication checkpoint

Exact Linux CI and full local checks passed. The compatible backend and one fixed Basic production build were published and the same staged build promoted, with canonical identity and restored domain assignment verified. The actual normal post screen hides manual review by default. Existing V1 authority remains unchanged until the owner's one-time V2 review. Source-free readiness may proceed under the finite next-canary hold, but ordinary-chat automatic acceptance, independent customer onboarding and shared catalog enablement remain separate. See the [release receipt](../operations/evidence/launch-20261028-automatic-mcp-cloud-release.json).
