# Chat workflows and the saved-post reader

Mode: implementation plan. Updated October 29, 2026. Owner requirements R099–R101.

## Product direction

Use ChatGPT and Codex chats for research, follow-up questions, project evaluation and proposal writing. VibeScroll owns durable source/evidence versions, requested-post subscriptions, proposals, links and feedback. Use the credit-funded worker when a new post needs preparation or analysis. Direct hosted ChatGPT-plan access remains paused under R098; this plan does not need that access.

The website is the visual place to revisit saved knowledge, inspect evidence, choose projects and follow proposals. Its main screen should let users scroll their saved posts with insights ready, showing the source prominently and useful insights beside it. The owner wants a polished, usable demo and prefers assistant-ui components where suitable. A compact embedded MCP view can follow by sharing the website's components. Do not revive the old widget implementation unchanged or recreate the connected plugin.

Chat history is not the only record. A new chat can retrieve the same source, exact analysis version, project and proposal through IDs. A dedicated chat can be convenient, but users must not depend on one permanently open or ever-growing conversation. The current native Assistant remains a separate optional automatic route. This plan does not claim that any arbitrary chat can receive unsolicited background completion messages.

## Existing evidence and gaps

The original production MCP answered read-only profile calls in this review: automatic analysis is enabled, setup is not required and five confirmed project contexts are available when selecting the profile. No analysis, credits, writes or credential changes were triggered. Earlier production receipts establish the credit-funded link-to-insights flow and native automatic route for the finite operator pilot; they do not establish general paid customer onboarding.

The repository already contains skills for Save, finding insights, status, comparison, feedback and project review. Existing MCP tools search/fetch cited insights, read exact versions and retrieve project application context. `draft_project_suggestion` persists a private issue draft only from an exact current server-returned relevant evaluation. It cannot save an arbitrary proposal newly composed in chat. The current project-review skill still sends further editing/approval to the website. Closing that write-back gap is the first backend milestone.

Shared-cache browsing still follows entitlements. Searching a permitted catalog does not subscribe the user to every result. Only posts the user saves/requests enter their personal account; private project proposals do not become neutral shared analysis.

## User flows

### Find and apply existing knowledge in chat

1. Ask a normal question, such as finding saved insights relevant to a selected project.
2. Search the authorized library or entitled catalog, follow bounded result pages and retrieve the chosen immutable versions with citations.
3. Load the selected project's current context. Category overlap suggests candidates; it is not proof of implementation suitability. Inspect separately authorized repository evidence when proposing a concrete code change, or state the missing context.
4. Discuss and refine the proposal in the current chat. Save the proposal and its source/project references to VibeScroll through authenticated MCP writes.
5. Retrieve or revise that proposal from another chat or the website. Record an explicit judgment without describing it as measured business benefit.

Reasoning in the user's ChatGPT/Codex chat uses that host's normal account and capabilities. MCP access authorizes VibeScroll data/actions, not remote use of the user's subscription credentials by VibeScroll servers.

### Analyze a new link with credits

1. Send the link and request credit-funded analysis. Return the existing server-authoritative preparation/model quote and honor the user's current funding authorization.
2. Save/request the post. Reuse compatible ready cache; otherwise run the existing bounded preparation and analysis pipeline.
3. Show metadata and truthful stages as they arrive. The website can update live. A chat can check status and fetch the ready result; automatic later replies depend on the host's actual Events/background capability.
4. Continue the same find/apply/proposal workflow against the retained result. A project follow-up must not download or transcribe the original again.

### Revisit the post on the website

The initial view loads a bounded metadata feed with title, creator, thumbnail and readiness. Full analysis and player resources load for the active post. On desktop, put the portrait source next to a concise insight panel with a project selector and one primary proposal action. On mobile, keep the source first and expose insights and project details through a reachable sheet or expandable panel. Keep standalone `/posts/:id` links and back navigation.

Show a few useful insights first. Expand an insight for its evidence and a project match for its explanation. Preserve the selected post/insight in the URL where appropriate. Preserve scroll position on return. Keep failed/preparing posts discoverable separately from the ready-to-review view.

Use supported source embeds for playback. TikTok documents an iframe player and host play/pause messages. Instagram/source restrictions and browser autoplay policies need actual acceptance; do not promise universal autoplay or accurate seeking across providers. Use a thumbnail, retained screenshots and an original-source link when playback is unavailable. Do not retain raw downloaded videos indefinitely or expose expiring downloader URLs to make this UI work.

Only the visible post may play; pause it when leaving the viewport. Prefer muted playback where supported, respect reduced motion/data preferences, support keyboard/manual navigation and never require autoplay to read the insights. Preload at most the next poster/metadata, not every video and analysis in the list.

## Architecture and component reuse

Keep Next.js/React, existing Tailwind/Radix controls, Convex authorization/reactive state, the current media worker, Gateway and retained evidence storage. No new assistant-ui cloud service or second conversation backend is necessary for the demo.

Extract a shared typed post/insight/project view model and presentation components. Use route/auth adapters for the website and the MCP Apps bridge for an embedded iframe. Component state owns expansion/selection; the server owns source versions, credits, proposals and feedback. The iframe must not depend on the website's cookies, page router or server components.

Prefer suitable assistant-ui components, initially the standalone model/reasoning selector and relevant tool-result/loading states. Its runtime-oriented chat components are not automatically portable into ChatGPT. ChatGPT supplies its outer conversation/composer. An embedded VibeScroll view should show the useful post, insights and actions instead of adding another chat interface inside that chat.

OpenAI recommends the MCP Apps shared bridge and `_meta.ui.resourceUri`, with optional extensions only when needed. Keep text tools fully useful in Codex and any host without UI. Verify the exact component licence/dependencies, CSP, protected image access and host capabilities before enabling embedded media. The compact embedded presentation may use poster/screenshots where a nested platform player is unsupported.

## Delivery order and acceptance

| Checkpoint                     | Change                                                                                                                                                                                                                                                                                                                                                                                                                        | Demonstration and test                                                                                                                                                                                                                                                         |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. Durable chat proposals      | Extend the existing evaluation/draft/proposal model with authenticated host-written candidate evaluation and proposal save/read/update actions. Bind source/analysis/insight IDs, project/context hash, repository revision when available, provenance and stable operation key. Preserve manual edits with expected-revision checks. Update existing project-review/feedback skills rather than creating parallel workflows. | In chat, retrieve a ready post, select a project, compose/save a cited private proposal and reopen it in another chat. Verify unauthorized/stale references, duplicate calls and competing edits in isolated tests. No issue publication or implementation is implied by Save. |
| 2. Shared reader design        | Build one complete post-and-insights component using real retained data, with responsive source presentation, progressive detail and project selection. Integrate it first at the standalone post URL, then the home feed.                                                                                                                                                                                                    | Visually inspect desktop and phone. Correct title/thumbnail and actual screenshots, playable supported source or honest fallback, loading/error/empty states, keyboard navigation and deep links. No backend rewrite.                                                          |
| 3. Feed and live behavior      | Reuse bounded recent-post pagination and existing reactive stages. Lazy-load active detail. Cache project suggestions by exact insight version and project revision; do not run inference on every scroll.                                                                                                                                                                                                                    | Fast metadata-first rendering, single active player, no duplicate analysis/charges, preserved scroll position and a ready-state update after a credit job completes. Record measurements rather than inventing a target result.                                                |
| 4. Compact MCP view            | Reuse the accepted reader components with the MCP Apps host adapter. One focused source/insight/project surface and a website deep link.                                                                                                                                                                                                                                                                                      | The same source/version and edits agree between website and chat. Test actual supported ChatGPT host; Codex/text workflows remain usable without the iframe. UI stays disabled until this acceptance, not merely because a component builds.                                   |
| 5. Implementation and feedback | Add the supported issue/draft-PR handoff and authenticated completion update, plus verified GitHub lifecycle events. Preserve proposal/run/repository linkage and distinguish model-reported completion, CI, merge and user benefit.                                                                                                                                                                                          | One explicitly authorized issue or draft PR links back to the saved proposal. Duplicate webhook/callback does not duplicate state. No credentials in issue bodies and no implicit coding authority.                                                                            |

The quickest honest demo uses a real already-analyzed post for immediate browsing, a real project and a persisted proposal, then a separately identified fresh credit run to show live progress. It must not label a cache hit as a fresh analysis. Publication still respects actual funding, Vercel below USD20, finite operator capacity, protected sources and unknown holds. Paid checkout/general cold-user acceptance remains separate.

## Documentation sources

- [OpenAI plugin skills](https://developers.openai.com/plugins/concepts/skills): repeatable workflows around live MCP tools.
- [OpenAI MCP UI](https://developers.openai.com/plugins/build/chatgpt-ui): shared bridge, iframe presentation and useful tools without UI.
- [assistant-ui model selector](https://www.assistant-ui.com/elements/model-selector): standalone model and reasoning controls.
- [assistant-ui Tool UI](https://www.assistant-ui.com/docs/tools/tool-ui): custom React loading/result/interactive components within its runtime.
- [TikTok Embed Player](https://developers.tiktok.com/docs/en/embed-player): supported embedded playback and host messages.

This file records the owner's direction and a delivery plan. It deploys no feature and does not resume R098.

## October30 checkpoint

The owner asked whether the entire app could be copied into the plugin. Reuse the accepted presentation components, styles and view models with a thin authenticated MCP Apps adapter. Website cookies, server components and router state are not the iframe authentication/navigation contract. Preserve one source of UI behavior rather than maintaining a copied application. Embedded UI remains deferred until website acceptance.

Checkpoint1 is implemented locally under ADR204. The quiet shell is separately browser-checked under ADR203; it does not close the full post/insight reader checkpoint. Both remain unpublished pending exact CI and compatible release.

Publication update: c862450 is live. Checkpoint1 persistence is accepted through the official SDK and app; new-tool host discovery/OAuth write remains open. The quiet shell passed local and production browser checks. Checkpoint2, the complete post/insight reader, is next.
