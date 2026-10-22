# VibeScroll complete implementation work packages

Owner-approved direction, October 22, 2026. No implementation is performed by this planning update. Baseline inspected: local main `a6b3bbf655fb50b951c8cab771217de345c9e285`. These are proposed work packages; actual implementation status must be checked again before changes. The owner selected either verified local or explicitly chosen cloud processing for the pilot, with founding-pass pricing after the pilot.

## P0 Resolve release and capability uncertainties

The production dependency audit ran on 22 October and returned a failing result. It reported three high and two moderate advisories. The existing policy recognized the bounded local braces mitigation but left two high MCP SDK findings unresolved. Both arise through `repomix -> @modelcontextprotocol/sdk@1.31.0`; the directly declared `@modelcontextprotocol/server` is already 2.3.1.

The [task-store advisory](https://github.com/modelcontextprotocol/typescript-sdk/security/advisories/GHSA-22jm-h49p-29qw) applies to servers configuring the affected experimental task store. Importing Repomix's tree utility alone does not establish that exposure. Inspect the actual reachable graph before making an exploitability claim. Registry metadata checked on 22 October still lists Repomix 1.18.1 as latest, declaring SDK `^1.30.0`; the SDK's latest is 1.32.1. First evaluate a pinned lockfile refresh to 1.32.1 within that permitted range. Use a narrow override only if resolution requires it and compatibility passes. Do not replace the direct MCP architecture unnecessarily.

The [validation resource-limit advisory](https://github.com/modelcontextprotocol/typescript-sdk/security/advisories/GHSA-46jr-4wx8-v453) requires configured bounds as well as a patched version. In the inspected `packages/mcp/server.ts`, `McpServer` has no `maxToolInputElements` option and the handler specifies only legacy stateless behavior. The outer route already verifies OAuth before parsing and uses `readAssistantBody` with a 32,768-byte bound. Preserve that protection; configure and test the additional tool-input element limit appropriate to the actual schema. Do not describe the existing endpoint as an unauthenticated, unlimited-body service. Version upgrades alone do not enable the new element limit.

Acceptance: the dependency policy passes or each remaining finding has a reviewed reachability and mitigation disposition. Oversized/deep tool inputs fail before expensive validation. Existing OAuth, library retrieval, saving, status and project tool behavior still pass. No claim of exploitation or data disclosure follows from the audit result.

Build one capability matrix spanning account eligibility, runtime, source type, funding, permissions, device availability and workload. Compare it with dispatch behavior and customer-facing language. The observed connected plugin's `request_analysis` schema offers a review URL, while repository code defines local, credits, project and cancellation modes. Verify the deployed tool listing and connector metadata before claiming automatic sharing works through the user's connected assistant.

Acceptance: a fresh user sees only usable routes, a blocked route explains the cause, and switching funding requires an explicit current choice. Verify the selected ChatGPT host's actual behavior rather than assuming completion Events will reopen a finished conversation.

## P1 Finish the first submitted source

Reuse `convex/lib/assistantIntake.ts`, `convex/assistantIntakeUi.ts`, `packages/mcp/server.ts`, `packages/runner/assistant-runner.mjs`, `assistant-local.mjs` and the existing local-library import APIs. The grant/version, account/profile binding, source generation, private evidence and atomic receipt machinery already exist.

The current workspace's assistant grant has automatic analysis off. Reviewing this setting is distinct from implementing automatic intake. Do not silently change existing grants as part of a UI redesign.

Proposed sequence:

1. Explain assistant library access and optional submitted-link processing in one connection flow. Preserve the owner-selected once-reviewed preferences and permitted future-source inclusion.
2. Save an explicit submitted link and return a durable source/status link promptly.
3. Use one source-version intent and one active worker claim. Fence duplicate submissions, expired grants, changed sources and membership loss.
4. Show named real stages: acquiring permitted media, transcribing, analyzing sampled evidence and saving the result. A sampled analysis is not exhaustive audiovisual coverage.
5. Finish only on validated output and an accepted source revision. A stale or unknown completion needs reconciliation, not a blind duplicate run.
6. Show citations, coverage, corrections and filing, then offer optional project evaluation.

The first acceptance set needs an actual eligible fresh account and another paired computer, not two accounts operated only by the founder. Cover an online run, a sleeping computer followed by resumption, duplicate submission, a revoked grant, unsupported acquisition, quota exhaustion, account change and an interrupted result import. Verify from the assistant through the app to the persisted cited output.

Reuse the existing evaluation harness and a small rights-cleared quality set. Include speech-led, visually dense and incomplete-evidence sources, plus a case where the caption and spoken claim differ. Have a person inspect citation fidelity and omissions. Schema-valid output is necessary but does not establish that a claim is grounded or useful. Preserve held-out cases and record actual model/effort rather than assuming more reasoning is better.

## P2 Make local setup approachable

Support one verified platform first. The inspected assistant runner is Windows-specific. Do not advertise macOS/Linux companion support until corresponding implementations and acceptance exist.

Design a guided setup with these visible stages:

- Check the computer and dependencies without requesting unrelated access.
- Install or select the supported runtime, with actual download sizes and restart requirements.
- Pair this user and workspace through a short-lived pairing flow.
- Connect that person's supported official account locally.
- Validate the account's available model and required reasoning capability.
- Process one approved sample and verify the final cited result in the browser.
- Offer optional startup at sign-in, resource limits and a clear pause/disconnect control.

For the first technical canaries, founder-assisted setup of the existing trusted runtime can establish which steps fail. Use that evidence to shape the self-service installer before widening local adoption. A full new desktop UI and automatic updater do not need to precede the first assisted session. Customers choosing an accepted cloud route should not need the companion at all.

Keep credentials in the existing protected local stores. A signed installer and signed, staged update process should wrap the trusted runtime rather than introduce a separate agent framework. Show a diagnostic summary that can be shared without tokens, private media or source contents.

Compare a browser-only local approach only if a concrete task warrants it. It would not reuse the current native official-client controller and cannot be assumed to perform background laptop work after the browser closes. The paired companion matches the requested phone-to-available-laptop behavior more directly. Keep its controls inside the web app while making the installed component's role clear.

Use separate states for paired, account connected, worker available and ready to process. “Your computer is offline” and “Reconnect your account” require different repairs. Include disk exhaustion, unavailable Docker, model limits, expired authentication and unsupported media.

A running computer does not guarantee immediate pickup. The existing runner has bounded idle backoff and periodic announcements. Measure its pickup latency and idle requests; explain periodic checking honestly. The app browser can be closed while an authorized background worker runs. A switched-off or sleeping computer cannot be promised automatic remote wake-up.

Cancellation, local logout, unpairing and server revocation have different effects. Make each action understandable. Preserve job leases and absolute worker lifetimes when providing background startup.

## P3 Offer bounded cloud processing

Audit the existing managed processing route before adding infrastructure. A cloud option is useful for people without a supported computer and for explicitly chosen work while their computer is unavailable.

Show estimated credits and a maximum, reserve the approved amount atomically, dispatch once, reconcile usage and display remaining balance. Distinguish settled cost from an estimate or unresolved hold. Transcription, model inference, storage and execution can have different funding.

Choose one primary local device in the first release. A cloud claim and a local claim must not process the same intent concurrently. Preserve completed transcription and evidence so a reasoning retry does not repeat every earlier stage. No default paid fallback, pooled founder subscription, or unbounded retry.

Cloud acceptance must cover authorization, media permission, isolation, budget exhaustion, provider failure, cancellation and settled receipts. Keep the OpenAI commercial-access application and the exact workload permission separate from engineering success.

## P4 Polish the core screens and setup

Retain the Library palette, type, semantic icons, touch targets, controls and stored navigation behavior. Use the existing Motion and Lucide dependencies where sufficient. Do not accumulate background, chart, 3D and component libraries from saved posts.

| Surface                 | Proposed composition                                                          | Important states                                                             |
| ----------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Home                    | One next action, recent useful evidence, waiting work, then optional overview | New user, processing, ready result, no fit, needs attention                  |
| Library                 | Preserve Tree/Folders, clear search, evidence in the selected branch          | First source, loading, no results, selected insight, corrections             |
| Source                  | Summary and distinct cited insights; coverage and processing details nearby   | Incomplete evidence, unsupported source, ready, stale revision               |
| Projects                | Last decision and next task per project, with context review when needed      | No project, stale context, useful/no-fit/already implemented, editable plan  |
| Connections             | Concise summaries and guided flows; advanced settings below                   | Assistant scope, computer availability, own-account eligibility, cloud route |
| Onboarding              | Short resumable steps and help at the point of difficulty                     | Skip optional setup, switch route, resume, reconnect, import preview         |
| Account and usage       | Familiar settings, clear service terms and actual balances                    | Theme, motion, credit holds, cancellation, export and deletion               |
| Public website and help | Real product demonstration and the same visual system                         | Mobile, reduced motion, no-JavaScript explanation where feasible             |

Keep five mobile actions: Home, Library, Save, Projects and Account. Support device-following appearance and explicit light/dark choice. Extend the existing character consistently; do not replace the chosen Library design with a new visual identity. Optimistic feedback is appropriate for reversible local interaction; analysis-ready, paid and approved states must come from authoritative receipts.

Acceptance should include long titles, empty and large libraries, pending permissions, poor networks, 320/390/768/1440 widths, both themes, keyboard use and reduced motion. Do not rerun inference because someone changes a folder, theme or screen.

The design-tool context also reported older product metadata and unfinished brief references. Reconcile those before a design build while preserving the current Library as visual authority; this planning task changed no design configuration.

## P5 Complete one project decision

Use one selected repository, current context and bounded cited source evidence. Let the user inspect and correct the project's purpose before evaluation. Do not make a third-party source repository an editable destination.

Present the relevant current behavior, proposed change, source evidence, assumptions, risks and alternatives. Distinguish useful, no fit, already implemented, deferred and insufficient context. Let the user export or copy an editable private plan to their preferred agent. Keep issue publication, code execution, patch approval, PR creation, merge and outcome measurement separate.

Acceptance needs real examples of useful and already-implemented/no-fit results. It also needs a changed repository/context case that invalidates stale evaluation. Do not require a funded coding run merely to complete the first pilot.

## P6 Reduce Convex work where it is unnecessary

The inspected `workspace-data.ts` already has narrow branches for Library, Connections and Account, and a compact Home query when enabled. Preserve these. The fallback used by other surfaces requests a wider bundle containing library, repositories, proposals, overview, usage, devices, GitHub choices, connections and categories. Profile Projects and plan views and split their reads where the measured waste warrants it.

Keep stable indexed pagination for sources and insights. Avoid per-tree-node queries, full-library reactive payloads, provider-status polling and a global counter scan on every navigation. Retrieve a short source status while processing and the detailed evidence only when opened. Stop browser refreshes when hidden and clear unauthorized cached state on logout or grant loss.

If the pilot reveals a return-use problem, improve the existing Home return section with explicit pins, deferred decisions or a user-chosen review date before building another AI recommendation system. An optional periodic review should use the person's selected interests and permissions, with consented notifications and an easy stop. A recurring review does not require reanalyzing the library on every visit.

[Convex's guidance](https://docs.convex.dev/understanding/best-practices) supports indexed filtering and bounded or paginated reads. Do not add redundant indexes without examining write/storage costs. Stale-while-refresh behavior must preserve authorization and revision fences; private data cannot be reused across accounts merely to avoid a loading screen.

Measure requests, returned bytes, function duration, retries and writes for first save, processing status, first insight, Library navigation, one project decision and an idle hour. Compare matched workloads before and after a change. No cost-saving percentage is established here.

## P7 Add public collections before a public feed

Start with explicit publication of a small curated collection, with an inspectable source and clear save-to-my-library action. Keep private notes, goals, repository context and evaluations out of that public edition. Existing private/team grants do not authorize public indexing.

Choose a creator-approved or otherwise permitted starter collection that is genuinely useful without signup. Examples could cover a first-run product experience or a focused engineering practice. Ask whether recipients save it and later submit a source of their own. Track qualified referrals and useful reuse, not only page views.

Before public launch, define publisher authority, reporting/removal, source revisions, moderation, attribution, public corrections and deletion propagation. A creator's original post and the user's interpretation remain distinct. Broader discussion, rankings and follower systems can wait.

## P8 Reuse analysis without building a global private cache

Use two separate layers. The base artifact contains permitted source-level evidence and extraction. The personal layer contains notes, organization, project context, decisions and preferences. Personal layers are never shared through a global cache.

A reusable public artifact needs public publication authority or another verified basis for reuse, compatible source/content revision, language, extraction schema, model/pipeline version and coverage. Canonical URL alone is insufficient. An unavailable or private artifact must not reveal another user's activity through a cache-hit message, timing or existence lookup.

Prefer reusing eligible derived analysis over indefinitely hosting copies of every original video. Raw media caching and redistribution need their own provider and rights review. [YouTube's developer policy guidance](https://developers.google.com/youtube/terms/developer-policies-guide) restricts downloading and offline playback through its API services; its scope does not certify any other retrieval route. Link or embed permitted original playback and use short-lived private preparation assets where authorized.

Keep provenance and invalidation across derivatives. Source removal, correction, changed permission or a pipeline defect must block stale reuse. Reanalysis stays explicit and preserves a person's authored corrections. Show an artifact's actual age and coverage rather than claiming a fresh analysis.

## P9 Add an optional community globe

The globe should display voluntary coarse sharing locations, not inferred device or IP locations and not the original creator's location unless independently supplied for that purpose. Label what the geography means.

Publish aggregate cells with a minimum contributor threshold and avoid precise times that reveal individual routines. Let people withdraw geographic participation without losing their library. Provide topic and list alternatives, lazy-load the 3D view, respect reduced motion and avoid continuous database polling.

Build this after public contributions exist. A sparse globe is weaker evidence than useful public collections. A preview with illustrative data must say so visibly. Measure whether the page produces useful discovery and qualified signups before expanding the rendering system.

## P10 Update the laptop and dependencies deliberately

Observed local versions: Node 24.12.0, pnpm 12.3.4, Python 3.14.0, Docker Desktop 4.36.0.175267, Docker CLI 27.3.1 and WSL 2.3.26.0. The Docker engine is now running and completed this task's isolated analysis. No versions were upgraded.

Keep Node on the repository's 24.x line and evaluate a current supported security/bugfix patch, pinned consistently in local setup and CI. [Node's release policy](https://nodejs.org/en/about/previous-releases) recommends supported LTS for production. Keep pnpm at the declared 12.3.4 until a concrete need justifies a change.

Plan a maintained Docker Desktop update after saving work and checking release compatibility, retained image digests, WSL behavior and rollback. [Docker's Windows requirements](https://docs.docker.com/desktop/setup/install/windows-install/) distinguish basic WSL support from the newer requirements for Enhanced Container Isolation. WSL 2.3.26 meets the documented basic minimum; it does not establish ECI eligibility or that VibeScroll uses that feature. Review the intended isolation mode before choosing a WSL upgrade.

Keep offline ASR in its dedicated environment with pinned compatible packages and model files. Do not upgrade global Python and assume native inference packages will follow. Pin the official-client protocol and container images, test saved-login renewal and cancellation, then stage updates. Background-worker signing and health checks matter more to first users than installing unrelated UI packages.

For each proposed change, record current version, target, official release/advisory, reason, affected paths, migration, verification and rollback. Prioritize the actual MCP dependency findings and runtime reliability. Broad Next/React/Convex major migrations are separate work unless a concrete compatibility or security need emerges.

## P11 Complete the website, onboarding content and actual-product media

Implement the accepted first-value and resumable setup design across fresh and returning states. Offer an optional full guided setup, but preserve skip/resume for optional steps. Review purpose, first source, route, assistant scope, computer health, optional project and saved-link import at the relevant point. Never silently migrate grants or turn an imported link into an analyzed result.

Build the website and public Help with the existing web application architecture. Home, How it works, Pricing, Open source, Help, FAQ and current legal/contact paths share the Library typography, surfaces and controls. Reuse content where separate thin pages would add no value. Provide truthful source/platform and funding availability, error/support paths, accessible forms and no-signup approved example reading. The example is backed by a deliberately permitted public artifact or clearly labelled synthetic data, with private workspace data excluded.

Produce the actual-product overview, deeper setup walkthrough, screenshots, social preview and a text transcript. Show a source, evidence, decision and retained next step; include one no-fit/already-implemented outcome. Compress real waiting only with a visible label. Reuse existing recording/Motion tooling, and use a more elaborate production dependency only when it solves a concrete need. Avoid autoplay audio, offscreen animation loops and expensive decoration in the first viewport.

Issue 119 remains the detailed guide contract. Ship Getting started and the first-result, Library and project-decision journeys with contextual links, then finish recovery/import/cost/publication guides as modules pass. Sanitize screenshots, distinguish mockups from actual UI and retain caption/text alternatives.

Acceptance: an independent person can explain the intended benefit, start a first task, find setup repair and understand costs/limitations. Browser checks cover both themes, stated widths, keyboard/zoom/reduced motion, no overflow, truthful pending states, link integrity, public-only assets, metadata and actual target URLs. Run real human comprehension later if the overnight run has no independent tester; do not mark it passed from screenshots alone.

## P12 Make the open-source repository a usable product entry point

Implement [the GitHub package](GITHUB-AND-LAUNCH.md): concise README, actual product visuals, demo/hosted/setup paths, supported capabilities, architecture, realistic self-hosting requirements, current contribution/security entry points, templates, roadmap, release notes and limited truthful badges. Preserve CompanyNerve attribution, MIT and third-party notices. Correct stale product descriptions and canonical URLs without rewriting historical receipts.

Prepare accurate metadata and a social image. Change public repository settings only if preflight includes that authority. Add visible repository links to the website, open-source explanation, demos and permitted launch kit. Prepare a relevant distribution checklist and venue-specific factual material. No mass submissions, star purchases or AI-written HN posts.

Acceptance: fresh-clone synthetic demo succeeds with pinned versions, root documentation routes lead to maintained instructions, all public links/media and license references are checked, GitHub light/dark and narrow reading are reviewed, and no private corpus or account data is committed. A good README does not establish public-provider eligibility or successful self-hosting.

## P13 Prepare the pilot, measurement and offers

Implement minimal privacy-conscious journey events and an exportable cohort worksheet. Events distinguish saving, processing, ready evidence, citation inspection, a project decision, plan retained/exported, return and actual payment. Do not log source text, project contents or full URLs. Include matched request/byte measurements and sampled support/processing cost fields. Use existing analytics where sufficient; do not add session replay by default.

Prepare the twenty-prospect qualification worksheet, ten-person pilot instructions, five observed/five independent session script, correction log, reasons-for-decline record and follow-up template. Keep contact information in private storage. Prepare the forgotten-save session, later creator/clinic experiments and a comparison with the user's current method. Sending invitations remains separate authority.

Verify the existing monthly checkout/entitlement/cancellation behavior in test mode without changing live catalogue prices. Prepare a founding-pass cost worksheet and a feature-gated offer configuration capable of a defined three-year term, allowance and overage. Keep that offer inactive until actual pilot costs and the owner-approved price/terms exist. Existing tax/market and publication gates still apply.

Acceptance: event definitions have denominators and privacy limits, no duplicates falsely count a ready result or purchase, costs separate holds/estimates/settlement, and test checkout/webhook replay/cancellation preserve entitlements. Real recruitment, recurring use, invoice settlement and purchases remain pending until observed. A ten-person target is not fabricated traction.

## P14 Complete both direct source adapters as one released feature

Follow [issue 118](../../issue-plans/2026-10-22/118-cited-non-media-sources.md) for source contracts, SSRF-safe canonicalization, GitHub snapshot context, Reddit discussion structure, citations, revisions, extraction and recovery. Implement the direct adapters and acquisition failure states with contract fixtures. Investigate actual Reddit commercial/API permission early; supplied text is recovery, not completion of direct retrieval.

Github source repositories are knowledge sources, not automatically code destinations. Bound shared provider quotas, recursive repository inspection and discussion depth. Access changes invalidate cached results and publication. Keep automatic permission expansion out of the model.

Acceptance: both direct adapters meet their exact live and fixture criteria, or the combined direct feature stays disabled with its remaining provider requirement. Do not ship only GitHub as the completed combined feature. Existing supported-source pilot use can proceed. Other source platforms remain on the verified capability matrix; broad URL saving does not imply every video can be acquired.

## P15 Preserve the complete existing V1 and finish operational readiness

The new launch emphasis does not remove V1 contracts for separately approved code execution, final patch review, draft PR publication, billing, export/deletion, restore and revocation. Audit existing implementation first. Finish genuine gaps without rebuilding tested authentication, tenancy, WorkOS, permission, funding or isolation machinery. Windows local coding and general hosted subscription-funded execution remain gated by their original requirements.

Cover the state/data boundaries as a single system: source revision, base artifact, private insight interpretation, project context revision, decision, plan, approval, execution, patch and publication. Keep public editions separately authorized. An old plan/approval cannot mutate a changed repository or publish through a stale grant. Inspect original contracts before adding serialized fields.

Verify export/deletion propagation into derived analysis, public editions, location aggregation and reuse indexes; retain tombstones where needed for restore safety. Provide redacted diagnostics, a clear support route, task kill switches and a rehearsable recovery procedure. Keep maintenance notes and dependency/runtime update reasons. Required service/provider/legal evidence is not established by passing a production build.

Acceptance: meaningful integration tests cover tenant crossing, revoked access, corrected/deleted sources, changed heads, expired approvals, duplicate jobs/payments, failed imports, local/cloud races, private-cache invalidation, publication withdrawal and blocked isolation. Test only authorized environments under the cost contract. Record which checks are local/synthetic, staging/live, physical-device or human.

## Shared architecture and acceptance matrix

Before parallel implementation, the root assigns ownership for contracts, schema and indexes, shared UI, route/status terms, feature availability, tests, documentation and the lockfile. Reuse source-version intents and bounded queries. Do not create a second queue, generic agent framework, component system or global private cache to implement each work package independently.

Every package reports five separate states: engineered, locally tested, live integration verified, independently usable, and released. A disabled externally gated feature may be engineered and fixture-tested while live verification remains pending. Do not call that fully complete. Continue other independently buildable packages rather than using one provider gate as a reason to stop the entire run.

The integrated release matrix must include first save online/offline, save-only, duplicate/cancel/revoke, route eligibility/quota, citation corrections, manual filing, library retrieval, optional project decision, plan export, separately approved coding/patch/draft PR, costs, export/deletion, public publication/reuse/withdrawal and optional geographic participation. Attach actual commands, environment, commit and result to review evidence. Preserve all failures and explicit skips.

## Existing issues and release order

Issue 119 supports the first-source, Library and project journeys and belongs in the pilot work. Issue 5 supplies the funding acceptance inventory and eligible-route repairs. Issue 118 remains a combined direct Reddit/GitHub release, with its permitted retrieval and evidence contract prerequisites. Start the access investigation early without making it a dependency of the existing-video pilot.

Before implementation, follow the up-front permissions, authentication and shared US$2 Convex ceiling in [the unattended contract](UNATTENDED-RUN.md). Review the pilot offer and verify which of the selected local/cloud routes is actually available for each participant. During implementation, run the checks required by the repository for affected code once, retain unavailable external checks as skipped, verify the exact release, and test the fresh-user journey. Planning success and an owner-account demonstration are not substitutes for that acceptance.
