# Simple setup, persistent results and proposal feedback

October29 latest direction: [Chat workflows and the saved-post reader](CHAT-FIRST-DEMO.md) prioritizes proposals composed in ChatGPT/Codex and persisted through MCP, then a shared website reader and later compact embedded view. R110 supersedes the older widget deferral for the compact shared view; actual owner-host acceptance is recorded under ADR208. Direct hosted ChatGPT-plan integration remains paused. Use CURRENT-STATE for live facts instead of dated checkpoints below.

Current-state authority: [accepted production snapshot](../operations/CURRENT-STATE.md) and [owner register](OWNER-REQUEST-REGISTER.md). The compact shared ChatGPT view and private proposal workflow are accepted under ADR207/208 at6a9d3e1; original MCP remains connected. Historical paused-pilot/finite-slot statements below are not the current owner policy. Independent short setup, managed/prepared publication and proposal completion feedback remain open.

Current October29 acceptance: the same native VibeScroll Assistant remains Monitoring after an actual ordinary MCP Save completed automatically, with no extra prompt or per-post approval. Owner rates100/day,20/hour/no-expiry are live. Results, matching transcript and real screenshots are shared/published and retained until deleted. Native Ready reply was read; mobile push delivery is not verified. [Evidence](../operations/evidence/launch-20261029-general-automatic-tiktok-accepted.json). Exact-version proposal/issue feedback remains the next backend phase.

## Shared website and ChatGPT presentation

The owner wants the ChatGPT view to reuse the website's components and interactions rather than maintain a separate design. Both already use React and the same backend, but their presentation/data adapters differ. Extract shared source cards, insight cards, Save composition, progress, tokens and compact post detail alongside packages/ui. Keep thin website session/router and ChatGPT MCP/host adapters. Do not embed the entire authenticated Next.js site or forward browser cookies into the widget. Its frame/auth assumptions differ, and host actions must remain authorized MCP calls. Use a compact Home/recent-posts/detail flow and link to the full website for account/billing. The current backend/worker priority takes precedence over implementing this visual work. This is consistent with [OpenAI's MCP UI guidance](https://developers.openai.com/plugins/build/chatgpt-ui); it is not a claim that the shared presentation has already been built.

Also read [One Cloud assistant per user](ONE-CLOUD-ASSISTANT-PER-USER.md). The owner now prefers one named VibeScroll Assistant task per user, one short setup request, reuse of an existing monitor and accurate Open/Resume status. They are pasting the current message now and explicitly defer this redesign until later. The current long prompt and task-picker readiness issue remain implementation facts; the simpler flow is planned.

Mode: standing owner direction and implementation plan. October 28, 2026. Status: required until implemented and accepted. These requirements steer the ongoing shared-database work; they do not replace it. The owner supplied production screenshots showing redundant Cloud controls and overloaded connection cards.

## Setup and defaults

Show exactly the three execution choices already requested: My own Cloud Work using the user's ChatGPT subscription, recommended; VibeScroll's servers using separately bought credits; Local machine using the user's own subscription. Keep routes disabled when they do not actually work. Selecting a route hides unrelated settings. Selecting Cloud already selects automatic analysis after Save, so remove its second analysis checkbox and contradictory save-only copy. Offer explicit Save only as a separate action when wanted.

Fix Manage setup from inside the Save dialog. Use a normal route transition that closes the dialog and opens the relevant connection section. Do not navigate a hidden page behind an open modal. Replace the overlapping access/setup/task cards with the chosen route, actual status and a clear Continue setup, Connected or Resume action. Put technical scopes, raw permissions, record exports, diagnostics, retention overrides and developer details under Advanced. Keep Disconnect available; do not present disabled library access as a normal operating configuration.

Default library access and supported ordinary actions on, within actual OAuth scopes and workspace roles. Default to all relevant current/future library posts and confirmed projects, with explicit narrower settings only in Advanced. Do not make users approve VibeScroll's own grant again after every OAuth connection, model choice, repository refresh or source save. Actual provider consent, revocation, role restrictions and an explicitly chosen paid action remain real boundaries. Never silently widen another user's explicit advanced restriction.

Use a labelled model dropdown populated from the user's supported host/model catalog, with a useful default and reasoning choices. Do not require exact model strings. Keep requested, host-reported and provider-attested settings distinct. A public API model catalog does not establish availability in a particular ChatGPT subscription. Surface unavailable choices honestly and never fall back to paid inference automatically.

The current setup prompt prepares a native Work chat, verifies current runtime/cache availability, registers native MCP Events and starts its monitor. Copy/paste alone does not prove completion. Prefer one clear Continue step and detect the real resulting status. Existing preferences or OAuth access are not proof the monitor is running. Avoid new MCP app creation where the current connection suffices. The current finite owner pilot is Paused until a newly prepared bounded test resumes it.

## Keep results until deleted

The owner requests persistent results by default, including updating their own settings. Separate durable analysis, transcript, sampled evidence and immutable version history from temporary source downloads and finite execution authority. Default results to until deleted, withdrawn or taken down. Raw video/audio downloads, upload/copy capabilities, task leases, authentication and finite job limits still expire normally. Do not use a distant fake timestamp to represent permanence or make an expired worker credential valid forever.

Introduce an explicit additive retention mode and centralized retention helpers. Preserve legacy finite records and valid explicit advanced limits; the owner separately authorizes updating their own saved results/defaults. Update expiry jobs, reads, history/reanalysis, evidence routes, catalog copies and view metadata together. Permanent result retention cannot bypass deletion/takedown, account boundaries or storage quotas. Do not silently purchase storage or allow unlimited infrastructure spending. Test time travel beyond the old deadline without renewing a task and prove durable results remain readable while temporary inputs and execution leases expire.

## Issue or draft PR is enough for V1

The [exact-version project-context candidate](../adr/187-version-bound-mcp-project-context.md) starts this bridge with a dual-scoped read of retained insights and a confirmed project profile. It handles reference-only shared posts without copying their analysis. Private proposal persistence, host-reported evaluation, issue publication and authenticated completion feedback remain separate work; do not claim the read action completes them.

The proposal flow can create a GitHub issue or draft pull request when that is the supported handoff. The user explicitly accepts this as a useful V1 instead of requiring direct desktop delivery. Bind the handoff to the exact source version/insights, confirmed project/repository and base revision. Explain a recommendation using matching categories/subcategories, then inspect current repository context and ask targeted questions only where needed.

Include clear instructions for the implementing model to report completion or failure to VibeScroll. Supply a narrowly scoped completion action or capability tied to that proposal/run, with expiry, idempotency and no broad account credential in an issue/PR body. Public issue text is untrusted and cannot expand authority. The normal authenticated MCP completion tool can serve the callback; never embed bearer tokens in a public issue or repository file.

Also ingest verified GitHub webhook events for issue/PR lifecycle and merge/close status. Bind repository, issue/PR number, head revision and proposal ID before updating state. Distinguish a model's completion report, CI success, a merged change and actual user benefit. Deduplicate retries and retain failures. User confirmation/quality feedback remains useful but should not be required just to discover that work completed. Later outcome metrics and A/B/model ranking use these exact-version records.

## Acceptance order

1. Finish the shared backend and the known Posts authentication-proxy correction.
2. Make Cloud selection imply automatic Save analysis and simplify the route-specific connection flow. Fix Manage setup, defaults and the model dropdown together with actual backend status.
3. Implement explicit persistent-result retention and update the owner's defaults/data under the new mode. Verify old worker deadlines remain finite.
4. Complete one link through automatic shared publication, a second-account cache hit, history/evidence access and an MCP project follow-up.
5. Create one supported issue or draft PR, ingest lifecycle events and test an idempotent scoped completion report. Direct Codex-device delivery remains a separate supported/paired-host acceptance item.

Keep cumulative spending, old unknown holds, the reserved post, fixed Basic queued builds and real provider/source gates. Update [shared intelligence](SHARED-INTELLIGENCE-MOAT.md), [the execution plan](../launch-plan/2026-10-23/VERSIONED-LINK-TO-INSIGHTS.md) and actual production evidence as each step is accepted. No widget or MCP visual redesign is required.

## Model shortlist evidence, October 28

Read the official model selector in the existing Run readiness test Work Cloud chat without changing the selection. It displayed GPT-6.1 Sol, GPT-6.1 Terra, GPT-6 Astra, GPT-6 Sol, GPT-6 Luna, GPT-5.6 Sol, GPT-5.6 Terra and GPT-5.6 Luna. The candidate uses those eight labelled choices; existing requested settings remain selectable instead of silently changing. This establishes the observed account's menu, not universal plan entitlement or actual inference attestation. The native monitor was still Paused. Setup must check the individual host/model. No private model endpoint or paid API was used.

## October29 prepared-route checkpoint and deferred ChatGPT UI

Both prepared-model routes now save immutable private candidates on backend4fefc65, using identical retained transcript/JPEG evidence. Muse queued-to-stored62.713s; automatic native189.216s. Separate fresh preparation41.093s; these are not two fresh full-link trials. Original selection is preserved and the native monitor remains active. Legacy source-runtime cache failure, managed/prepared shared publication and precise customer credits remain open. See the [comparison receipt](../operations/evidence/launch-20261029-prepared-model-comparison.json).

The owner deferred embedded ChatGPT UI on October29. Production will use ordinary MCP tools and saved-result website links; do not recreate or visually redesign the widget now. OAuth, Events and the existing plugin stay connected. ADR199 also corrects prepared versions incorrectly labelled removed by history. This combined change is a local candidate until exact CI/publication and read-back pass.

Production acceptance: fc2ef42 is live after exact CI40923237655,22 guards and a41.749s fixed Basic build. Canonical setup has embedded UI disabled. Original MCP automatic analysis remains enabled without setup/reconnection. Prepared history returns versions1/2/3 Ready with original selection unchanged. Temporary comparison policy/key are removed/revoked. No new analysis ran. Managed/prepared shared publication, precise customer credits and the legacy source-runtime cache correction remain open.

## Active issue handoff continuation, October30

[ADR209](../adr/209-frozen-issue-handoffs-and-authenticated-work-reports.md) is live at8974c39 for frozen issue text and authenticated completion reports, reused across proposal edits. It does not publish or treat a model report as CI/merge evidence. [The MCP procedure](../operations/PROPOSAL-ISSUE-HANDOFF.md) describes the intended authorized GitHub handoff. Exact CI, compatible publication and one real owner-host handoff/report passed. Verified lifecycle correlation and actual issue/PR publication remain open. Dated disabled-widget/pilot statements above are historical; use CURRENT-STATE for actual availability.
