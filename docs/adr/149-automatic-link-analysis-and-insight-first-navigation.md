# ADR 149: automatic link analysis and insight-first navigation

Date: October 24, 2026. Status: owner-authorized requirements; implementation and automatic production acceptance pending. Extends ADR148 and the complete launch scope. Supersedes manual per-post handoff/approval as the normal target, without discarding the existing diagnostic route or execution controls.

## Link-only normal flow

After one-time supported setup and standing authorization, sharing a permitted link must require no further phone action. Reuse a current compatible shared artifact when entitled; otherwise join one existing intent or start one bounded own-subscription Cloud job. The post page shows persisted stages and automatically displays the validated result when ready. No manual refresh, copied task prompt, GitHub, workspace destination or awake local computer is permitted in the accepted default journey.

Standing authority must bind the authenticated user, current payment and app grant/consent, source/provider scope, generic processing policy, supported model/effort, per-job/period usage, concurrency, expiry and permitted host/network capabilities. Derive exact source-generation/job authority under that standing grant. A user may revoke automation. No unlimited subscription use, implicit source rights, provider credential sharing, paid fallback or skipped security check follows.

Initial connection, supported monitoring authorization and required Internet/provider access can require one-time user consent. A later expired/revoked session, quota or unsupported source produces a truthful needs-attention state. Normal links inside valid bounds must not ask for fresh per-source approval. Bulk backlogs, creator subscriptions and private project/coding work retain their separately scoped authority.

## Supported wake-up bridge

Official [MCP Events](https://developers.openai.com/plugins/build/mcp-events) provides an event subscription/webhook path into a user-authorized Work Cloud chat. It does not by itself establish VibeScroll's actual host eligibility, standing execution authority, media access, quota or result return. A delivery acknowledgement is not a claim or completed analysis. Native [scheduled app events](https://learn.chatgpt.com/docs/automations) are a separate capability; Gmail/Slack/GitHub examples do not prove an arbitrary VibeScroll trigger.

Extend the existing authenticated MCP2 event transport with a versioned waiting-work event. It currently defines only `analysis_completed`, which reports a finished source and does not start a processor. Reuse durable subscription/delivery records, callback verification, SSRF/redirect defenses, signatures, occurrence identity, bounded retry and revocation. Payloads carry minimal identifiers, not source text, credentials or model instructions. Suppress duplicate jobs and completion-to-new-job loops. Preserve unknown host outcomes without automatic replacement or double inference.

Release requires actual discovery/subscription, verified callback, link capture, event delivery, host claim, real acquisition, cited commit and app render on the owner's account. Capability docs or synthetic transport tests are not that proof. No event subscription, recurring task or live dispatch is activated by this planning change.

## Home and Library

Home is the leftmost mobile tab. Show bounded quick metrics followed by recent posts the user shared or attempted to analyze, including processing and failed items. Use stable IDs and recent share/request activity, not every heartbeat as new activity.

Collapsed card body expands a compact preview. A subsequent tap on its noninteractive expanded body opens the post. Thumbnail and right-side action open detail directly. Provide explicit Collapse/Open controls and keyboard behavior; interactive descendants must not accidentally toggle or navigate. Reuse the source-card owner; do not nest interactive elements illegally.

Library defaults to extracted source insights, with a Posts switch and persisted search, filters, sort and cursor position. Current Explore/topics and repository-evaluation Insights are different concepts: simply switching to internal `ideas` would not implement the requested insight feed. Move project evaluations/proposals into Projects while preserving URLs and all features. Preserve categories, collections, following and Pro catalog exploration in Library. Keep Account, Save and Projects as existing mobile actions.

## Data and progress contracts

Extend current `dashboardCards`, `dashboard.home`, `product.library/detail`, knowledge views and request generation/cache owners. Home and list responses must explicitly allow only small display fields. A spread of a source record can leak original text, personal media or job internals even after omitting `analysis`. Projection reads, not response clipping alone, must reduce database work. Keep existing filter/search/sort semantics, real opaque cursors, access/retention checks and migration/backfill gates. Home `more` is not a Library cursor.

Stage changes need to affect the visible progress signature. Presently the detail signature excludes `personalAnalysis.stage` and ordered phase; some heartbeat/preparation updates do not change source `updatedAt`. Completion already has a refresh path. Extend it with compact progress state while keeping full content/result revision separate, so status-only updates do not redownload heavy detail. Do not create another queue, progress store, client poller or heartbeat-driven feed reorder.

Use a scoped authenticated reactive query where supported, or the existing single visible/online polling owner with bounded compact updates/backoff. Stop terminal/hidden/revoked watching. Show measured stage counts only when supplied; use an indeterminate bar instead of invented percentages or instant completion claims.

Cache bounded authorized metadata/pages in memory with account/session/scope/grant/query/filter/sort/cursor/revision keys. Preserve abort/generation and compact-Home/authoritative-Posts race protections. Invalidate on mutation/completion/expiry and clear on access loss. Persist UI position only, not protected content or authority, in existing local storage.

Each main app page gets matching first-load skeletons. Actions use independent busy/duplicate-submit state and retain button dimensions/labels. Background refresh preserves valid content; empty/error/retry states are distinct. All modes need keyboard, 320px, light/dark, reduced-motion and stale-response tests.

## Integration and acceptance

[The current execution index](../launch-plan/2026-10-23/README.md) owns the order; [page inventory and loading specification](../launch-plan/2026-10-23/APP-MAP-AND-LOADING.md) owns page-by-page detail. Root owns integration and budget. Preserve paid hosted entry, Pro catalog/own-result rules, private personalization/project context, unpaid data retention and internal team/private processing authority.

The existing manual private protocol is not rewritten or weakened to pass this acceptance. Add neutral contribution/standing authority compatibility and prove current source rights, host controls and cancellation. Keep explicit coding/publication approvals. All P/R/N/C/M work remains; the same USD3 cap, no new purchase/API fallback and existing provider/privacy gates remain.
