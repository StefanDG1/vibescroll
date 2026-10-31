# VibeScroll production plugin and widget build plan

Date: 25 October 2026. Status: proposed implementation plan, ready for engineering review. This document does not claim that the proposed widgets, public onboarding, or additional MCP operations already exist.

## 1. Product decision

Build VibeScroll as a production MCP service with a complete embedded workspace, focused conversation widgets, and packaged workflow skills. Users should be able to connect an existing VibeScroll account themselves and do most everyday work inside ChatGPT or Codex. Preserve the independent mobile website as an equally functional interface and the destination for browser authentication, subscription purchase, and sensitive account operations.

Confirmed requirements from this conversation:

- ChatGPT and Codex have equal product priority.
- Include a full library workspace and inline cards.
- Match ChatGPT's native visual styling closely.
- Serve ordinary production customers, including people adding the MCP server themselves.
- Provide a copyable prompt that an AI agent can use to configure the connection and guide onboarding.
- Cover the complete feature set proposed in the research, not a small-widget pilot as the final deliverable.
- Assume that saving a supported link can automatically run insight analysis in Work Cloud. Treat that working processing pipeline as an integration dependency, not as an unresolved feasibility question or an engine that this project must rebuild.

A phase is a delivery sequence, not permission to omit later scope. Production completion requires all required work packages and acceptance criteria below.

### What success looks like

A customer creates and pays for a VibeScroll account on the website, copies a setup prompt into their agent or installs the plugin, completes official sign-in and scoped consent, and reaches their own library. They paste a supported link once. VibeScroll saves it and automatically analyzes it in Work Cloud under their reviewed preferences. The widget shows actual processing state, then cited insights. They can organize knowledge, inspect evidence, judge relevance, evaluate selected projects, prepare proposals, and follow reviewed work through plans and draft-PR status without repeatedly reconstructing context in chat.

The same account, permissions, records, usage, corrections, and work approvals apply in the website and embedded experience.

## 2. Evidence and implementation baseline

Read-only inspection covered the main checkout at `vibe-scroller`, commit `54a0b26`, and the newer Cloud connector checkout at `.worktrees/cloud-mcp-live-20261025`, commit `398c325`. These are research snapshots, not a direction to implement on either existing branch. Resolve the current release baseline before editing and preserve concurrent work.

Existing building blocks:

| Area                   | Inspected implementation                                                                        | Consequence                                                        |
| ---------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| MCP endpoint           | `apps/starter/app/mcp/route.ts`                                                                 | Reuse the HTTPS resource and current authentication boundary       |
| MCP tools              | `packages/mcp/server.ts`                                                                        | Extend the existing connector; retain headless operations          |
| Business authorization | `convex/assistant.ts`, `convex/lib/assistant*`                                                  | Add narrow projections and commands around existing policy         |
| Structured results     | Current tool handlers return `structuredContent`                                                | Define and validate formal output contracts before rendering       |
| Cloud status           | `getJobStatus` returns generation, revision, grant version, executor, and stage                 | Project existing facts into the UI state model                     |
| Cloud execution        | Newer checkout exposes claim/input/prepare/heartbeat/complete/fail operations                   | Keep executor operations separate from customer widget controls    |
| Events                 | `packages/mcp/events.ts` and related credential/delivery modules                                | Reuse after actual supported-host verification                     |
| Website                | Library, source detail, projects, proposals, plans, runs, connections, usage, settings, privacy | Reuse business rules and carefully extract presentation components |
| UI runtime             | React 19, Tailwind 4, TypeScript, Zod, existing shared UI                                       | Native-style widget components fit the existing stack              |
| Identity and hosting   | WorkOS, Convex, Vercel                                                                          | No new identity service, database, or hosting vendor needed        |

The current `assistantClients()` accepts at most four configured client records and expects WorkOS-style `client_...` identifiers. Four host registrations can serve many customers; this is not a four-user limit. However, arbitrary CIMD/DCR identities and additional hosts will not become supported just by publishing a URL. Public connection onboarding must explicitly resolve this contract.

The September plugin investigation and some operational notes describe earlier states. Update them during implementation using exact release evidence. Do not interpret an old statement that a feature is absent as proof against the newer inspected code.

## 3. Research decisions

### Standard UI with a capability-based OpenAI adapter

Use MCP Apps for the shared tool-to-widget connection. Add OpenAI extensions for supported workspace entrypoints and host integration. Keep useful text results for hosts without rendering. OpenAI's current guidance recommends the shared UI protocol before product-specific additions. [UI integration guide](https://developers.openai.com/plugins/build/chatgpt-ui)

The extension documentation establishes sidebar, conversation-panel, settings, mention, and onboarding integration. Its platform matrix distinguishes desktop, Work web, and mobile; Work web is not a blanket claim about classic ChatGPT. Record real capabilities for each target rather than inferring them from a product name. [Extensions overview](https://developers.openai.com/plugins/build/extensions), [platform specification](https://github.com/openai/mcp-extensions/blob/main/docs/spec.md)

### One backend, two presentation environments

Share domain contracts, policy, command handling, evidence formatting, and selected pure components with the website. Build a small embedded client rather than placing the entire Next.js website in a nested iframe. This avoids depending on third-party browser cookies and importing the website's navigation and runtime into each result card. Nested embedding remains a separately justified exception for a genuinely necessary existing editor. [UI resource and embedding guidance](https://developers.openai.com/plugins/build/chatgpt-ui)

### Focused conversation cards and a persistent workspace

Use inline cards for immediate outcomes and a full workspace for navigation, comparison, and editing. Keep the host composer available and avoid duplicating its chat interface. Host-native colors, fonts, spacing, and controls take precedence over the website's dark studio composition. [UI design guidance](https://developers.openai.com/plugins/concepts/ui-guidelines)

### Subscription purchase stays on the website

Current public plugin rules permit access to an existing paid account but prohibit digital subscriptions or credits being sold through the plugin. They also restrict subscription upsells and transactional links. Therefore acquisition and payment begin on the independent website. The plugin reports entitlement status, permits refresh after a website change, and can show permitted informational help. It must not create checkout sessions, show a subscription comparison table, embed payment collection, or use a setup prompt as a workaround. Recheck the exact policy at release. [Commerce rules](https://developers.openai.com/plugins/plugin-guidelines)

## 4. Chosen technical combination

| Layer                         | Choice                                                         | Reason and boundary                                                                   |
| ----------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Base MCP server               | Existing `@modelcontextprotocol/server` integration            | Preserve transport, authorization, and deployed operations                            |
| Portable widget bridge        | `@modelcontextprotocol/ext-apps`, including React bindings     | Typed host connection and tool communication                                          |
| OpenAI integration            | `@openai/mcp-extensions`, isolated behind our host adapter     | Sidebar/panel entrypoints, mentions, settings, context, and supported messages        |
| Widget design                 | `@openai/apps-sdk-ui` with host style variables and Tailwind 4 | MIT-licensed React controls matching the requested native appearance                  |
| UI and contracts              | React, TypeScript, Zod                                         | Already used in the app; share serializable contracts                                 |
| Server-state client           | TanStack Query, transported through MCP tool calls             | Scoped caches, request deduplication, pagination, mutation invalidation, and recovery |
| Widget build                  | Vite and `vite-plugin-singlefile`                              | Produce a self-contained HTML resource without runtime CDN dependencies               |
| Authoritative state           | Existing Convex services                                       | Keep permissions, status, edits, and entitlement checks centralized                   |
| Identity                      | Existing WorkOS OAuth boundary                                 | Preserve app accounts; add public-client compatibility deliberately                   |
| Protocol debugging            | Official MCP Inspector                                         | Inspect discovery, tools, schemas, and resource behavior                              |
| UI/OAuth/evaluation workbench | Local MCPJam Inspector                                         | Develop widgets and diagnose authorization and model/tool sequences                   |
| Automated verification        | Existing Vitest/Convex tests, Playwright, axe-core             | Verify contracts, real browser behavior, and accessibility                            |
| Manual browser inspection     | Existing Browser Harness workflow                              | Inspect actual host UI and documented device classes                                  |

Primary implementation references: [MCP Apps SDK](https://github.com/modelcontextprotocol/ext-apps), [OpenAI extension SDK](https://github.com/openai/mcp-extensions/blob/main/typescript/README.md), [Apps SDK UI](https://github.com/openai/apps-sdk-ui), [TanStack Query](https://github.com/TanStack/query), [single-file build plugin](https://github.com/richardtallent/vite-plugin-singlefile), [MCP Inspector](https://github.com/modelcontextprotocol/inspector), [MCPJam](https://github.com/MCPJam/inspector), [Playwright](https://github.com/microsoft/playwright), [axe-core](https://github.com/dequelabs/axe-core).

All selected libraries/tools are open source. Hosting, billing providers, inference, and model-driven evaluations can still cost money. Record exact package licenses and notices from the chosen lockfile; do not assume all MCP packages share the same license.

### Dependency compatibility must be proved early

The existing server pins SDK 2.3.1. At research time the MCP Apps repository describes a 2.x peer setup, while the OpenAI extension README's app example references an earlier `ext-apps` and client SDK combination. Do not combine unrelated `latest` packages or replace the working server with an old quickstart.

In WP01, inspect actual published package peers and exports, choose one compatible version set, and prove server discovery, resource reading, React bridge connection, tool calls, and an extension on both target desktop clients. Prefer a supported modern combination. If the extension package lags the portable SDK, retain the standard bridge and implement the documented extension protocol in the isolated adapter where maintainable. Record the reason and deletion condition for any compatibility shim.

Use separate Vite build invocations for each single-file resource. The selected single-file plugin is not a multi-entry application bundler. Start with three resources: compact cards, the workspace, and the portable export viewer. Share modules at source level; set a byte budget per resulting HTML file.

Do not add a second agent framework, a new vector database, a graph database, Electron, or a local bridge service just to render widgets. Do not mix the extension SDK's optional CSS reset with Apps SDK UI's foundation without an explicit stylesheet precedence check.

## 5. Feature coverage and boundaries

This table is the intended complete customer experience. A sensitive handoff is part of the built workflow, with a return destination and status refresh; it is not an unfinished button.

| Feature                    | Embedded workspace                                                    | Inline/conversation behavior                   | Required website or host handoff                                          |
| -------------------------- | --------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------- |
| First connection           | Setup checklist, account/workspace selection, readiness               | Setup skill and connection diagnosis           | Official OAuth and consent                                                |
| Subscription entitlement   | Current account access and usage facts                                | Explain a specific unavailable entitlement     | Purchase, plan change, billing portal remain on website                   |
| Save links                 | URL or supported batch intake, title correction, destination          | Paste link, receipt card                       | Source-specific review only when genuinely required                       |
| Automatic insight analysis | Work Cloud default and current policy summary                         | Save progresses to cited results automatically | Working Cloud service is assumed                                          |
| Sources                    | Recent/all eligible sources, filters, detail                          | Selected source card                           | Full original media/transcript when not granted to MCP                    |
| Insights and Scroll        | Read, navigate, compare, save a position, mark feedback               | Cited insight and small result list            | Unsupported rich media opens approved source/app link                     |
| Topics and organization    | Tree/Folders, search, rename/move/pin/exclude where supported         | Relevant topic summary                         | No website dependency for routine authorized organization                 |
| Connections between ideas  | Supporting, complementary, conflicting, and related evidence          | Compare selected ideas                         | Heavy graph is an optional representation, not required to read knowledge |
| Project setup              | Create/edit project context, inspect assumptions, confirm corrections | Select named/current granted projects          | GitHub installation and repository permission consent                     |
| Project evaluation         | Review fit, no-fit, already implemented, uncertain, later             | Explain evidence-backed relevance              | Existing funding approval only when additional processing requires it     |
| Private proposals          | Draft, edit, preserve manual edits, inspect citations                 | Draft receipt and summary                      | None for a permitted private edit                                         |
| Issue publication          | Review destination, visibility, title/body, exact final action        | Publication status                             | Existing fresh-auth approval page when required                           |
| Plans                      | View/edit exact plan version, compare revisions                       | Plan summary and review action                 | Bound execution approval and any step-up authentication                   |
| Runs and draft PRs         | Current runs, budget/state, checks, diff summary, PR link             | Job/PR status card                             | Existing exact publication approval; no new merge/deploy authority        |
| Feedback and corrections   | Full judgment menu, note, correction history                          | Explicit single-record judgment                | No silent bulk judgments                                                  |
| Settings                   | Display, source defaults, approved Cloud preferences, notifications   | Settings/onboarding skill                      | Changes to grants or security-sensitive defaults require reviewed consent |
| Usage                      | Settled usage, reservations, unresolved usage, access status          | Compact usage explanation on request           | No purchase/upsell in plugin                                              |
| Sharing                    | Inspect current sharing and recipients; prepare reviewed share        | Cited shared-item preview                      | Existing exact recipient/visibility approval where necessary              |
| Export and privacy         | Request bounded selected export, inspect connection and retention     | Export receipt, access explanation             | Full account export/deletion and sensitive retention/account actions      |
| Team/admin                 | Identify workspace and role; read allowed team/audit facts            | Explain permissions                            | Invitations, owner transfer, moderation, provider administration          |

Do not reinterpret a role, subscription, repository selection, or plugin installation as approval to execute code, publish, spend, or share. Existing paid API alternatives remain separately chosen routes. The default automatic happy path uses the assumed Work Cloud integration.

## 6. Information architecture and native styling

The workspace has five primary destinations consistent with the product: Home, Library, Save, Projects, Account. Home contains recent sources, active jobs, and pending review. Library has Insights, Sources, and Topics views. Projects includes context, evaluations, proposals, plans, runs, and PR history. Account groups connection, usage, appearance, and privacy information.

Desktop fullscreen uses a compact navigation rail, main list or workspace, and an optional detail inspector. A narrow conversation panel uses one main column and explicit back navigation. Mobile uses the same destinations with a stable compact navigation control; respect the host's composer and safe-area insets. Do not stack the website's entire bottom bar beneath an overlapping host bar.

Inline cards do not include application tabs or nested navigation. Each shows one result, one primary action, and at most one secondary action. More involved actions open the workspace at the exact item. Result lists show a small bounded group, with further browsing in the workspace. Avoid nested scrolling inside inline cards.

Use host-provided font, colors, spacing, theme, and cursor preferences. Apps SDK UI owns widget controls. Keep VibeScroll identity in its registered name/icon and restrained permitted details; do not insert a duplicate logo into every result. Preserve website branding on the website. This native plugin direction is the user's explicit choice and does not authorize a website redesign.

Accessibility targets: WCAG 2.2 AA as our product target, visible focus, keyboard navigation, semantic headings, meaningful source labels, 44px touch targets where practical, 200% text resizing, reduced-motion behavior, and screen-reader announcements for meaningful state changes. Use polite live regions; do not announce each polling tick.

Responsive targets: 320, 390, 768, 1024, and 1440 CSS pixels, including actual constrained panel widths. Long titles, translated labels, unbroken URLs, empty sources, many projects, and incomplete pages must remain usable. English is the initial content language; format dates/numbers using host locale and keep strings extraction-ready.

## 7. Widget and screen specifications

### W01. Connection and onboarding

Show current account, available approved workspaces, role, entitlement, granted scope, and setup progress. Distinguish unauthenticated, wrong account, missing app account, no workspace, no access grant, missing entitlement, expired OAuth, and revoked grant.

Required steps are account recognition, workspace selection, source/library access, automatic Cloud preference review, optional project context, and one successful private read. Offer a clearly labeled sample experience only through synthetic records in a dedicated sample context; never mix sample data into the user's library. Users can finish the knowledge flow without linking GitHub.

Persist completed setup stages server-side by account/workspace and policy version. Resume after OAuth, website activity, app reload, or opening another conversation. Existing grants are not silently widened. A user who already approved the current policy does not answer rights or analysis questions for every saved link.

### W02. Save and receipt

Accept a supported URL, a small deliberate batch, or a supported attachment/text import. Show what will be saved and the current automatic-analysis route. Default to save plus Work Cloud insights under the approved policy. A deliberate Save only option suppresses analysis for that intake.

Canonicalize and deduplicate on the server using existing rules. Retries retain the original request key. A duplicate opens the existing source and explains whether an existing result was reused or current work is still running. A batch returns per-item receipts and errors; it never hides partial failure behind one success toast. Proposed initial batch cap is ten URLs, bounded separately from analysis concurrency and adjustable after load testing.

An inline receipt shows source title/type, actual state, destination, and the next useful action. Do not show invented progress percentages or finish estimates. Editing a title does not rewrite evidence. A saved link does not claim the provider was read successfully.

### W03. Active analysis and completion

Show factual stage, latest observation time, and saved source identity. Collapse routine operational details behind a disclosure. Preserve the source and request IDs across a remount. A customer must be able to close the widget while Cloud work continues and reopen the same result later.

On completion, transition to a concise insight summary with source citations and an Open insights action. If analysis returns no defensible insights, show that valid outcome and evidence coverage. Do not turn an empty or conservative result into a processing failure.

Cancellation is a request to the existing execution service. Display cancellation requested until its authoritative outcome is known. Unknown usage, lost host connection, and recovery are separate from failure. A retry creates or resumes work only according to the service's current idempotency and generation contract.

### W04. Library and Scroll

Provide a dense readable list of current insights, source and topic filters, pagination, saved sort/view, and evidence-first detail. Scroll can present one insight at a time with explicit next/previous controls; it is another representation over the same authorized records. Use conventional scrolling as the baseline so touch gestures and keyboard controls remain optional enhancements.

Each insight shows its stored title, bounded claim, source/evidence reference, source type, and available project connections. Distinguish untimed file/thread/text evidence from timed media. Never invent a zero-second timestamp. Preserve source title and reference location in expanded detail.

Search includes the selected workspace and scope. Report partial coverage, cursors, and filtered pages accurately. No automatic whole-library scan follows from an empty page. Selection and scroll restore only after the selected IDs pass a fresh authorization read.

### W05. Topics and idea connections

Reuse the product's Tree and Folders organization over the same topic hierarchy. Keep remembered place, manual names and moves, collapse state, insight expansion, and explicit pagination. Topic filing does not change access scope. Pins, exclusions, and manual corrections survive later automatic analysis.

Provide readable explanations of support, disagreement, and complementary ideas before offering a diagram. Use existing lightweight SVG/DOM components for optional relationships where practical. Do not add a heavy graph engine for a core task that a list explains clearly. All diagram information must also be reachable by keyboard and text.

Counts require exact authorized coverage. Otherwise show loaded counts or a partial-coverage label. Do not sum overlapping child proposal counts. A stale project connection loses its current-fit treatment until revalidated.

### W06. Source and evidence detail

Show source metadata, current insight set, coverage, citations, processing history relevant to the user, and exact current project links. Preserve distinctions among media, repository, discussion, file, thread, and supplied text.

MCP disclosure remains limited to the approved evidence projection. Full transcripts, original private files, signed asset URLs, repository credentials, and raw provider logs do not become widget props just because the website can display them. Use the existing protected website viewer when more sensitive evidence needs a separately authenticated session. Any future broader disclosure requires a new specific contract and consent.

### W07. Compare and synthesize

Users select two to five ideas or sources, inspect evidence side by side, and ask how they support or contradict one another. Distinguish a stored app synthesis from a new explanation generated by the host assistant. Cite both. A conversation-generated suggestion does not become a saved project evaluation or measured benefit automatically.

If saving a synthesis is supported by the selected backend, expose a private versioned draft command. Otherwise implement that command as part of this work package, reusing existing canonical insight/reference types. Do not persist opaque model text as authoritative evidence.

### W08. Projects and relevance review

List current approved projects with context freshness and evaluation state. Permit private project creation and editing through narrow commands. A repository-backed project first uses the normal GitHub installation and active-repository selection flow. A selected project does not authorize repository code retrieval in the knowledge widget.

Show the confirmed business goal, user corrections, inferred assumptions, and missing context separately. For evaluations, retain useful, no-fit, already implemented, unsupported, needs-context, and deferred outcomes. Relevant results show exact supporting insights and current evaluation identity.

Automatic insight extraction remains the default; project evaluation follows the user's named project or explicitly reviewed matching preference. Do not infer that every source should be evaluated against every repository. Confirmed project preferences can remove repeated selection, but cannot be inferred from imported source text.

### W09. Proposals, plans, runs, and PRs

Prepare/reopen a private draft from exact current evaluations. Support editing with expected-version checks, evidence selection, dirty-state protection, and manual-edit preservation. Conflicts show the saved and local versions and offer a deliberate reconciliation.

Plan detail shows proposed actions, exact repository/base, executor/funding route, limits, version, and evidence. Editing produces a new version and invalidates stale approvals. A publication review shows the target, visibility, exact outgoing content, and distinct requested action.

Reuse the application's existing approval service. When fresh website authentication is required, prepare a short-lived approval intent and open the exact protected review page. Return to the widget through a nonsecret intent identifier and re-read its status. The widget must not accept a chat statement, a render token, or a model-generated hash as approval proof.

Runs show actual lifecycle, budget/usage uncertainty, checks, and draft-PR state. Links open the exact app review or provider PR. Merge, deploy, and arbitrary repository execution are not added by this plugin plan.

### W10. Feedback and corrections

Expose the five existing judgments: useful, not relevant, already implemented, unsafe/unsupported, and later. Require an explicit user action, current evidence versions, an idempotency key, and expected feedback version. A note is optional unless existing policy requires it.

Changing a judgment submits a versioned correction. Do not implement Undo by deleting audit history. Pending UI can acknowledge a submission, but must not show success before the server accepts it. Changed evidence prompts a fresh review rather than attaching an old judgment to a new generation.

### W11. Settings, usage, privacy, and sharing

Keep display preferences separate from authority-bearing settings. Sort order, density, last view, and locale are ordinary preferences. Access scope, automatic processing, project matching, retention, notification subscriptions, and funding selection use reviewed versioned settings with proper permissions.

Show settled usage and unresolved reservations separately. Never equate an execution self-report with measured host subscription allowance. Access can be read before entitlement so a customer can understand why a feature is unavailable without disclosing their private library.

Sharing has recipient, content, expiry, and visibility review. Account deletion, full-library export, membership administration, and provider/security settings retain protected website flows. Every handoff has an explicit destination, return state, cancellation state, and refreshed result.

### W12. Mentions, context attachments, and portable exports

Offer searchable current sources, insights, topics, and permitted projects through composer mentions where supported. Return bounded results with stable typed resource links. The mention handler must authenticate and apply the same grant checks as search. A typed resource is reauthorized when resolved; its URI is not a capability token.

Selecting an item in the workspace does not silently send the whole library to the model. An Add to conversation action attaches only the selected bounded context, citations, and revision. Context updates replace obsolete selections rather than accumulating hidden disclosures.

Add a portable read-only `.vibescroll` export format with a versioned schema, MIME declaration, clipped insights, provenance, and no raw private media or secrets. The desktop file viewer validates content and displays a static exported snapshot. It does not treat it as a live authorized app record or automatically import it. Do not register broad `.json` or `.md` handlers. Import, if offered, is a separate reviewed save workflow with size limits and explicit provenance. Unsupported clients can read the same export through a small web viewer or ordinary text representation.

## 8. Host capabilities and graceful fallback

Maintain a runtime capability object built from actual initialization and feature discovery. Test capabilities rather than branching on a product-name string.

| Capability            | Preferred behavior                        | Fallback                                                    |
| --------------------- | ----------------------------------------- | ----------------------------------------------------------- |
| MCP Apps rendering    | Inline card or workspace                  | Structured text, citations, exact website links             |
| Global entrypoint     | Persistent library workspace              | An Open VibeScroll render tool or website                   |
| Thread entrypoint     | Contextual panel beside chat              | Inline card expands where supported                         |
| Fullscreen mode       | Multi-step editing and library navigation | Narrow one-column view or website                           |
| Deep links            | Open exact source/project route in app    | Canonical protected HTTPS URL                               |
| Composer mentions     | Searchable typed attachments              | Tool search and explicit attach/copy action                 |
| Model-context updates | Bounded current selection                 | Explicit user message containing selected citations         |
| Structured settings   | Native settings form                      | Same settings screen inside workspace                       |
| Extended forms        | Native structured choices where useful    | Regular accessible widget controls                          |
| File entrypoint       | Read-only `.vibescroll` viewer            | Download/text/web view                                      |
| Event subscriptions   | Authorized completion notification        | Read current status when open or reopened                   |
| Packaged skills       | Plugin's installed workflows              | Server instructions, tool descriptions, public usage prompt |

Direct MCP connection and plugin installation are distinct distribution paths. Adding an MCP URL does not necessarily install skills, add navigation, or enable UI. Expose a connection health page with separately tested tools, UI, skills, notifications, and Cloud-route support. A generic text-only client remains useful but is not advertised as a full widget client.

Target real-host acceptance: current ChatGPT desktop, current Codex desktop, ChatGPT Work web with Cloud, mobile ChatGPT where account/client capabilities allow, and Codex CLI as a headless client. Test Windows and macOS desktop paths where supported. Test the owner's Android device as an actual device, not an inferred pass from viewport emulation.

MCP Events currently has a narrower documented host scope than tools. It uses webhook delivery for supported Work contexts; its polling/streaming delivery modes are not supported by that integration. Widget-initiated status reads are a separate mechanism, not an implementation of a polling Events transport. [Events documentation](https://developers.openai.com/plugins/build/mcp-events)

## 9. Self-service installation, authentication, and access

### Public setup website

Create a stable `/connect` destination with ChatGPT, Codex, and Other MCP clients choices. It must offer the canonical HTTPS endpoint, a Copy setup prompt action, exact tested host instructions, connection diagnostics, and a link to ordinary product documentation. A small `/connect/agent` instruction page contains plain text, current setup version, supported client versions, public OAuth client configuration where needed, and read-only success checks.

The canonical resource remains `https://scroll.companynerve.com/mcp` unless a separately recorded deployment decision changes it. Publish standards-compliant protected-resource and authorization-server discovery. No customer enters an API secret, database credential, or downloaded personal token to connect.

Provide a separately generated, machine-readable setup descriptor with server URL, transport, supported registration methods, public client IDs where applicable, supported scopes, minimum client requirements, documentation links, and setup version. Call this our setup descriptor, not a new MCP standard. Do not put user information or secrets into it. The human instructions, copied prompt, and downloadable config examples are generated from the same source to prevent drift.

### Host connection paths

For ChatGPT: provide the current verified custom-MCP flow and, after approval, the public plugin listing. The user performs the host's risk acknowledgement and official OAuth consent. The instructions detect when the user's plan, workspace policy, or client does not permit adding a server and explain the exact limitation without promising universal OpenAI-host access.

For Codex: prefer the supported CLI/configuration interface when the agent has a shell. The intended sequence is inspect existing configuration, add the HTTPS server if absent, start official OAuth login, let the person authenticate, and validate in a refreshed session. The current documented forms include `codex mcp add ... --url ...`, `codex mcp list`, and `codex mcp login ...`; validate exact arguments against the installed version before executing. [MCP setup documentation](https://learn.chatgpt.com/docs/extend/mcp), [official HTTP example](https://developers.openai.com/resources/docs-mcp)

For other clients: offer Streamable HTTP configuration and read-only checks. Only list a client as compatible after its actual discovery/authentication/read journey passes. Do not bundle a local HTTP-to-stdio proxy unless a named supported client requires one and its credential storage is reviewed.

### Production OAuth registration

Start with predefined public host clients where that provides a stable self-service path. One host registration can support many users. For Codex, publish any required public client configuration through the supported config format; do not distribute a client secret. Test variable loopback ports and exact callback paths against the provider.

Support CIMD or DCR only if the chosen WorkOS setup and our token validation support them end to end. The current fixed registry cannot accept arbitrary metadata-document URLs as if they were existing `client_...` values. Introduce a typed trusted-client registry or official provider-supported registration path, enforce allowed metadata origins, and protect metadata fetching against SSRF, redirects, size abuse, and unbounded registrations. Test issuer-bound responses and exact resource indicators. [Authentication contract](https://developers.openai.com/plugins/build/auth)

The public release must not require the founder to edit a registry for each paying user. If an unsupported client's registration contract is not available, label that client unsupported and provide tested supported paths. Do not weaken issuer/audience/client checks to make an arbitrary connection succeed.

### Access and entitlement model

Evaluate these independently on every operation: authenticated principal, active workspace membership/role, app grant and current version, requested action scope, current source/project authorization, processing policy, and subscription entitlement. Return stable recoverable error categories.

Allow minimal account/readiness information without library content so onboarding can explain missing setup or entitlement. After purchase completes independently on the website, a verified billing webhook updates authoritative entitlement; the widget's Refresh access action reads that state. A browser return URL or frontend flag cannot grant paid access.

Connecting once does not eliminate future provider-mandated login, explicit scope expansion, step-up authentication, or a material policy review. Do eliminate repeated questions already answered by current valid preferences. Revoke promptly in both OAuth and app-grant layers. The widget clears affected data at the next denied read and on explicit access-loss notifications; already disclosed chat history cannot be remotely erased.

## 10. Automatic Work Cloud insight flow

### Accepted assumption and policy migration

For this plan, the supported-link-to-automatic-insights pipeline works in Work Cloud and persists canonical results in VibeScroll. The widget consumes that service and does not execute media processing in the iframe or keep the chat turn open to sustain the job.

The inspected Cloud tool descriptions still require an exact approved request and say that recording waiting work alone does not launch a task. This is a baseline contract to align with the working automatic pipeline assumed by the user. During implementation, update the existing server, tool descriptions, settings, and skills to describe the actual automatic route consistently. Add a reviewed preference/policy version for existing connections if their old grant did not authorize that route. Do not silently reinterpret an old local-only policy.

After that one-time review, routine supported links follow the saved automatic policy without per-link rights or Cloud-mode questions. Preserve Save only and explicit cancellation. A named project or saved explicit project-matching preference may add project evaluation according to that separate policy.

### Required integration contract

Saving returns the durable source ID, intake/request ID, duplicate/reuse information, current source generation/revision, processing policy version, and initial job state. The backend orchestrator owns routing and queueing. The customer UI does not choose executor lease IDs or pass execution secrets.

Cloud job lifecycle and canonical source lifecycle remain separate. A projected UI state includes queue state, work stage, result availability, recoverability, and whether usage is settled. The widget renders server-projected permitted actions rather than deriving retry or spending authority from a status label.

Suggested display mapping, reconciled to exact current contracts in WP02:

| Server observation                    | Display                                  | Useful action                                             |
| ------------------------------------- | ---------------------------------------- | --------------------------------------------------------- |
| Saved and awaiting automatic dispatch | Saved; waiting for analysis              | Open source, cancel if allowed                            |
| Queued Cloud work                     | Waiting for Work Cloud                   | View current queue information                            |
| Claimed/running                       | Analyzing; factual current stage         | Open source, request cancellation if allowed              |
| Preparing/transcribing when reported  | Preparing source / Transcribing          | Keep reading available prior evidence with version labels |
| Finalizing/recovering                 | Finishing / Recovering result            | Check status; do not start duplicate work                 |
| Completed                             | Insights ready                           | Open insights, inspect evidence                           |
| Completed with no defensible insights | Analysis complete; no supported insights | Inspect coverage or save a note                           |
| Failed with a safe retry contract     | Analysis stopped                         | Explain cause and offered retry                           |
| Unknown execution or usage            | Status needs checking                    | Recover exact result/status; no automatic funding switch  |
| Cancellation pending                  | Cancellation requested                   | Wait for authoritative settlement                         |
| Cancelled/expired                     | Stopped / Request expired                | Offer only currently allowed next actions                 |
| Source/grant changed                  | Access or evidence changed               | Revalidate or open protected app review                   |

Never infer a percentage from stage order, treat a host-reported model as provider attestation, expose a lease token to the widget, or call an uncertain run refunded.

### Completion, refresh, and notification

Use a shared job projection and a bounded active-jobs query. Mounting multiple cards must not multiply status calls for the same job. While visible and running, use adaptive status reads under the existing rate limits, for example 10, 20, 30, then 60 seconds with jitter and server retry guidance. These are proposed client defaults; confirm against the actual server window and expected customer load. Pause interval reads when hidden, disconnected, terminal, or unauthorized. Refresh on focus only when stale and coalesce simultaneous reads.

Use existing signed MCP Events for opted-in supported Work chats. Deduplicate events by stable ID, reauthorize current grants before delivery, and treat event payloads as a hint to refetch current data. Callback verification, subscription expiry, revocation, and address validation are mandatory. Do not put source bodies or model instructions in event payloads. Use the actual implemented event name after contract review rather than inventing a second completion vocabulary.

Separate four facts: Cloud work continues, a server event is sent, a visible widget refreshes, and a host writes a new conversation message. Each requires its own evidence. Unsupported hosts still get current results when reopened. A saved preference to analyze links does not authorize arbitrary future notifications or background tasks.

## 11. MCP operations and contract design

All names below marked new are proposals. Preserve existing callers, scopes, and output semantics. Add formal `outputSchema` to structured responses and validate actual bounded projections against it. [Tool metadata reference](https://developers.openai.com/plugins/reference)

### Preserve existing operations

`search`, `fetch`, `get_profile`, `save_link`, `get_job_status`, `request_analysis`, `record_feedback`, and `draft_project_suggestion` remain available to conversational clients. Align their descriptions with the selected release and automatic Cloud preference. Keep current idempotency, exact evaluation hashes, source generations, revisions, and grant-version checks.

Cloud execution tools remain in the executor interface. Ordinary widgets must not call `work_cloud_claim`, `work_cloud_input`, `work_cloud_prepare`, `work_cloud_heartbeat`, `work_cloud_complete`, or `work_cloud_fail`. Their presence in model tools is not a reason to expose them as UI controls.

### Add the missing app operations

| Proposed family    | Required operations                                                           | Visibility and authority                                                 |
| ------------------ | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Readiness          | New `get_connection_status` and setup/preferences read                        | Model and app; minimal non-content readiness                             |
| Rendering          | New `open_vibescroll`, `render_vibescroll_card`                               | Open accepts empty arguments for entrypoints; authorize selected records |
| Library browsing   | New bounded source/insight/topic listing and detail projections               | App plus selected model-facing browse tools                              |
| Organization       | New rename/move/pin/exclude commands                                          | Explicit app/model actions under new narrow write scope                  |
| Source intake      | Batch wrapper and typed text/file intake where current backend supports them  | Per-item keys, source-specific limits and reviewed grant                 |
| Project context    | New project list/detail/create/update/confirm operations                      | Separate project/context write authority                                 |
| Project review     | New evaluation and proposal list/detail projections                           | Reuse exact current evaluation identity                                  |
| Draft editing      | New versioned private proposal/plan update commands                           | Private writes, role checked; no publication side effect                 |
| Reviewed actions   | New approval-intent preparation/status plus existing approved action dispatch | Intent is not approval; authority stays in existing service              |
| Runs               | New bounded runs and draft-PR read projection                                 | Read-only; no merge/deploy                                               |
| Feedback           | Existing tool plus feedback detail/history projection                         | Explicit judgments and versioned corrections                             |
| Settings           | New preference read/update under narrow settings scope                        | Separate UI preferences from processing/grant changes                    |
| Usage              | New read-only entitlement/usage projection                                    | No checkout or credit-purchase tool                                      |
| Sharing/export     | New prepare/read/export projections and existing reviewed share command       | Explicit bounded disclosure and recipient checks                         |
| Mentions/resources | New bounded mention search and typed resource resolution                      | Read-only; same source-level authorization                               |

Prefer a small typed command family for closely related private operations over dozens of duplicate public tools. Do not create an unrestricted `execute_action`, arbitrary Convex dispatcher, generic file read, arbitrary URL fetch, or direct table access tool. App-only visibility reduces model clutter but is not a security boundary.

### Data transfer shape

Define versioned discriminated schemas, not one untyped response blob. A useful shared envelope contains schema version, snapshot ID/time, workspace/profile identity, grant version where relevant, operation result or typed error, bounded page/cursor information, and projected actions. Item records carry source/evidence versions. Exact field casing must follow existing serialized contracts; the following concepts are not instructions to rename existing fields.

Core types: ConnectionStatus, Capabilities, EntitlementSummary, SourceSummary, InsightSummary, EvidenceReference, TopicSummary, ProjectContext, EvaluationSummary, ProposalDetail, PlanDetail, JobSnapshot, FeedbackRecord, UsageSummary, PageInfo, AppRoute, and RecoverableError.

Use a discriminated evidence union for timed media, repository references, discussion comments, file locations, thread messages, and supplied text. Unknown timestamps stay null. Truncation and partial coverage are explicit. Exclude raw tokens, lease credentials, signed asset URLs, provider logs, arbitrary HTML, and full transcripts from standard DTOs.

Render tools accept typed IDs, view intent, and bounded navigation information. They re-fetch authorized records rather than trusting arbitrary titles, claims, or object graphs from the model. Pass a small model-readable summary in `content` and only the required structured data. UI-only metadata is still disclosed to the host and is never secret storage.

Mutations use stable request keys and expected versions. A safe read may retry on transient transport failure with backoff. A write with an uncertain result first checks its existing receipt; do not blindly replay a new key. Errors distinguish authentication, authorization, entitlement, stale version, validation, rate limit, unavailable provider, transient transport, and unknown outcome.

### Scope expansion

Reuse existing scopes where their documented meaning covers the action. New organization, project editing, preference editing, proposal/plan editing, export, or reviewed-action operations require explicitly defined scopes and app grants. Name and register them through the existing policy module, provider config, consent UI, and negative tests together. Do not let `knowledge:read` authorize private edits or attach all future scope additions to old grants automatically.

## 12. Frontend architecture, state, and performance

Proposed modules, finalized against the selected baseline:

```text
apps/widget/
  src/entries/card.tsx
  src/entries/workspace.tsx
  src/entries/export-viewer.tsx
  src/host/bridge.ts
  src/host/openai.ts
  src/host/capabilities.ts
  src/data/mcp-transport.ts
  src/data/query-keys.ts
  src/screens/
  src/components/
  src/state/navigation.ts
  build/
packages/assistant-contracts/
packages/mcp/ui-resources.ts
packages/mcp/app-tools.ts
packages/mcp/readiness.ts
packages/mcp/mentions.ts
packages/mcp/settings.ts
plugins/vibescroll/
  plugin.json
  mcp.json
  skills/
  assets/
docs/operations/widget-and-plugin.md
tests/widget/
tests/mcp-app/
```

These are proposed paths, not claims about existing files. Keep server-only secrets and provider SDKs out of frontend dependency graphs. Extract pure evidence presentation and formatting from existing components; do not import server actions, app-session hooks, or website-only routing into the widget.

The host bridge exposes connect/dispose, capabilities, callTool, openExternal, requestDisplayMode, navigate, updateModelContext, sendMessage, and optional resource/file helpers. Each returns a typed supported/unsupported outcome. Register initial input/result listeners before connecting so the first result is rendered without a duplicate read. Bound timeouts, cleanup, and host-message validation are shared.

Business data belongs on the server. React state owns transient selections and open disclosures. TanStack Query owns in-memory server snapshots. Durable preferences belong to account/workspace storage. Host widget state is an optional convenience containing only nonsecret navigation IDs and small presentation settings. Never rely on it for authorization or the only saved copy of a draft.

Query keys include connection/account, workspace/profile, grant version, source generation/revision where applicable, filter, and cursor. Switching account/workspace or losing access cancels outstanding requests, discards incompatible responses, and clears the relevant cache before rendering the new context. A late response from the previous account cannot populate the next account's view.

Do not persist private query caches into general browser local storage. Keep bounded caches, page limits, and explicit cache eviction. Persist draft edits through versioned backend operations with visible saving status; ephemeral unsaved text is isolated per instance and cleared on authority loss. Avoid cross-widget singleton assumptions because each card can be a separate iframe.

Build three versioned resources, for example `ui://vibescroll/card/v1.html`, `ui://vibescroll/workspace/v1.html`, and `ui://vibescroll/export/v1.html`. Add content hashes/version labels and immutable asset retention. Publish a new URI for breaking changes. Keep old valid resources long enough for existing conversation widgets to recover through compatible contracts. [Resource versioning guidance](https://developers.openai.com/plugins/build/chatgpt-ui)

Initial product budgets, to measure rather than claim achieved: compact card HTML at most 300 KiB gzip, workspace at most 800 KiB gzip, normal list page at most 64 KiB serialized with strict item/field bounds, no per-row requests, and one deduplicated status read per unique active job per allowed interval. Measure uncompressed resource bytes as well and enforce each host's actual resource ceiling. Confirm host resource limits before freezing these budgets. Make a slow panel usable before optimizing an optional graph. Split resources by actual usage if a build exceeds its budget; do not conceal size behind an initial skeleton.

Use self-contained styles/scripts and a narrow declared CSP. Explicitly list asset and connection origins. Prefer host tool calls over direct browser backend requests. Do not rely on arbitrary external CDNs, service workers, third-party cookies, or unauthenticated remote previews. Declared nested-frame origins require specific review and should not be needed for the normal workspace.

## 13. Complete skill package

Skills are workflow instructions and resources around real tools. Backend policy remains authoritative. Package all five originally proposed skills and the additional workflows needed by the larger production scope. Keep each focused and load supporting references only when needed. [Skill model](https://developers.openai.com/plugins/concepts/skills)

| Skill                       | Trigger and workflow                                                        | Required output and safeguards                                                                                           |
| --------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `vibescroll-setup`          | Connect, configure, onboard, or fix initial access                          | Identify host; use tested setup path; resume consent; verify account and one private read; distinguish partial readiness |
| `vibescroll-save`           | Save supplied links or permitted text/files                                 | Stable receipt, automatic Cloud route, duplicate reuse, per-item failures, no repeated approved-policy questions         |
| `vibescroll-find`           | Find something in granted knowledge                                         | Bounded search/pagination, fetch selected evidence, cite current sources, label incomplete coverage                      |
| `vibescroll-project-review` | Apply selected ideas to named/approved projects                             | Read current context/evaluations, explain fit and non-fit, prepare exact private draft, preserve edits                   |
| `vibescroll-feedback`       | Explicit useful/not-relevant/already-implemented/unsupported/later judgment | Versioned exact-source feedback; no inferred judgments or claimed measured value                                         |
| `vibescroll-library`        | Browse, organize, rename/move/pin, or inspect topic relationships           | Preserve scope and manual work; no whole-library inference just to navigate                                              |
| `vibescroll-compare`        | Compare or combine explicitly selected evidence                             | Cited agreement/disagreement, distinguish host explanation from saved canonical synthesis                                |
| `vibescroll-work-review`    | Review a proposal, plan, run, issue, or PR                                  | Current version/target/funding/status, use bound approval handoff, no automatic publication                              |
| `vibescroll-status`         | Check analysis, recover a result, or request completion notification        | Exact current job state; bounded checks; supported notification setup; no duplicate execution                            |

The setup skill includes settings/connection recovery so a separate broad settings skill is unnecessary. The library skill covers bounded export and explains protected privacy handoffs. Each package includes example intents, tool order, error handling, final-output format, and a small set of meaningful evaluation fixtures.

Required skill tests include missing profile, wrong account, duplicate link, partial search, untimed citation, evidence revision change, manual draft edit on retry, explicit later judgment, failed/unknown Cloud result, unsupported host UI, missing entitlement, denied project role, injected source instructions, and a request to spend or publish without the corresponding approval.

Keep essential constraints in server instructions and tool schemas as well, since raw MCP clients may not receive packaged skills. Do not copy the developer's global coding/design skills into the customer plugin. For implementation use the upstream `add-app-to-server` skill and targeted references; use `convert-web-app` only when extracting a component actually benefits from it. [MCP Apps implementation skills](https://github.com/modelcontextprotocol/ext-apps)

## 14. Setup prompt and installer deliverables

The website must provide three maintained prompts: universal agent-assisted setup, Codex setup, and connection repair. Their complete drafts are in [setup-prompts.md](setup-prompts.md). They are public instructions, not secrets, authorization grants, or executable installers.

The universal prompt asks an agent to identify its host and capabilities, read our current canonical setup instructions, inspect an existing connection, add only the exact HTTPS server using supported configuration, guide human login/consent, verify a minimal private read, and report readiness. It must not ask for passwords, reveal tokens, overwrite unrelated MCP configuration, disable approvals, grant broad filesystem access, or silently install a local bridge.

For a host without shell or settings control, the same prompt provides exact UI steps instead of pretending to install automatically. For an existing setup, preserve it and repair only the identified missing step. Public descriptor/config values cannot authorize private data access.

Do not publish speculative one-click installation URLs. If a host offers an official install/deep-link format, generate and test it for that host. Keep Copy server URL and human steps available when automatic installation is unsupported. Prefer a small public setup descriptor and native configuration over a remotely executed `curl | shell` bootstrap.

The final installation journey must be tested with a genuinely new account, an existing paid account, a returning disconnected account, an unentitled account, an organization with restricted plugin policies, and a user with multiple workspaces. No founder intervention should be required for a supported ordinary account.

## 15. Security, correctness, and privacy work

Reuse existing permission services and add tests at every new disclosure or command boundary. The widget is an untrusted client. Tool arguments, source content, imported exports, host context, deep links, and model output are all data requiring validation. [Security principles](https://developers.openai.com/plugins/guides/security-privacy)

Specific requirements:

1. Validate tokens for issuer, resource audience, expiry, trusted client, and scope; recheck workspace role, current grant, exact source, and current versions server-side.
2. Keep OAuth and billing secrets, Cloud leases, callback signing keys, and private signed asset URLs out of HTML, tool results, client errors, analytics, screenshots, and support exports.
3. Treat `ui.visibility` as presentation metadata. Independently prevent customers from invoking execution-only tools outside their exact active authority.
4. Validate source URLs through existing provider policy; avoid arbitrary URL fetching or authenticated thumbnail proxies. Bound imported files, JSON depth, pagination, titles, notes, and all model-supplied arrays.
5. Allow only registered app-relative routes and canonical HTTPS destinations. Reject traversal, fragments where the host format prohibits them, script schemes, embedded credentials, and open redirects.
6. Preserve tenant/source isolation during search, mention resolution, cached queries, export, sharing, events, and resumed drafts. Test a stale page after role removal and a delayed response after account switching.
7. Source text cannot change default analysis mode, install software, add a repository, approve spending, select publication recipients, or instruct an agent to disclose other records.
8. Use versioned commands, idempotent receipts, and bound approval intents. A render snapshot, client-side timestamp, or locally computed hash does not create authority.
9. Disclose the content being sent to the host. Keep attachments deliberate and bounded; do not copy a whole source library into hidden model context.
10. Maintain a secret-free audit trail of relevant app actions. Retain only scoped operational telemetry that is disclosed and appropriate; do not add session recording, raw prompts, source titles, source URLs, search text, or document bodies to analytics by default.
11. Explicitly invalidate data on source deletion, changed grants, role loss, and source revision. Revocation blocks future retrieval but cannot retract content already returned into a chat.
12. Preserve current code-execution isolation and spending controls. Widget implementation must not alter sandbox policy, introduce pooled subscriptions, or enable an automatic paid API fallback.

Use authenticated and redacted support bundles containing build/version, client family/version when available, capability flags, operation names, correlation IDs, and categorized errors. Users preview any optional additional data before sharing it.

## 16. Verification strategy

Use the existing meaningful authorization and processing tests as the foundation. Add tests for the new integration behavior; avoid tests that merely repeat component implementation details.

### Contract and backend tests

Verify schema-valid real projections, output bounds, partial pagination, source-specific evidence unions, immutable version handling, source access after saving under each live scope, and missing entitlement. Cover every new mutation with allowed actor, wrong role, wrong workspace, revoked grant, stale version, repeated key, and uncertain-outcome receipt recovery.

Verify direct and plugin connection discovery, token/resource mismatch, expired/revoked tokens, unsupported OAuth registration, fixed-client mapping, variable Codex loopback callback ports, and multiple connected accounts. Keep credentials outside fixtures.

### Widget browser tests

Use deterministic synthetic fixtures for all material states, including slow tool calls, duplicate replies, malformed projections, partial results, long content, lost access, unknown Cloud outcomes, and host capabilities missing individually. Exercise keyboard navigation, form validation, empty/loading/error states, focus return, reduced motion, theme changes, narrow panels, text resizing, and account switching. Run axe-core and manual keyboard/screen-reader checks on core flows. Automated accessibility scans alone do not establish accessibility.

Test real iframe CSP and host messages in a local representative host, not only a standalone development page. Verify that listeners handle the initial tool result without a second fetch, resources dispose correctly, and an old conversation card remains compatible after a new deployment. Test three separately built single-file resources.

### Agent behavior and skills

Use MCPJam for repeatable tool-sequence and error-recovery scenarios, then validate core cases in real ChatGPT and Codex. Separate tool conformance from the model choosing the intended tool. Score correct source references, current project selection, safe retry handling, output honesty, and refusal to follow injected source instructions. Budget any paid model evaluations explicitly; an open-source evaluator is not free inference.

### End-to-end production journeys

Required journeys on staging and then the exact release candidate:

- New customer pays independently on website, connects without founder intervention, consents, completes onboarding, and opens their empty private library.
- Existing paid customer connects by copied setup prompt, sees the correct workspace, and opens a known private cited result.
- Save a supported link once; observe the assumed working automatic Cloud route; close/reopen; inspect canonical insights and evidence without duplicate work.
- Send a duplicate during processing and after completion; reuse the same source/job or canonical result as appropriate.
- Save only, then deliberately request analysis; verify the preference exception is honored.
- Search multiple bounded pages, inspect untimed and timed evidence, compare selected ideas, and record/correct feedback.
- Rename/move/pin/exclude authorized library items; refresh the website and another widget to verify consistent results and preserved manual edits.
- Connect a repository through the website's provider consent, select its project, confirm context, inspect fit/non-fit results, edit a private proposal, and traverse a bound approval handoff.
- Observe a run/draft PR and changed plan/base/evidence invalidation without gaining merge/deploy authority.
- Receive an explicitly authorized completion event in a supported Work context; separately verify a host without Events retrieves the result on reopening.
- Revoke access or workspace membership during an open session; deny subsequent reads/commands and remove incompatible client state.
- Change entitlement on the independent website and verify access from authoritative server state, with no in-plugin checkout.
- Export a selected bounded snapshot and open the dedicated viewer; verify that import does not silently happen and the file cannot grant live access.

Use at least one owned rights-cleared real source for actual provider integration. Synthetic fixtures verify UI behavior, not extraction quality. The Cloud engine is assumed operational; these journeys test that the widget connects to it correctly rather than requiring a new engine project.

### Host acceptance record

For each client record actual app version, operating system, plan/workspace constraints, protocol generation, discovery/authentication method, UI modes, entrypoints, mentions, settings, context, Events, and fallback behavior. Mark unsupported, not tested, failed, and passed distinctly. Emulators and MCPJam do not certify real-host support. Current official extension matrix entries are planning evidence, not a substitute for this record.

Before PR/release run the repository-required formatting, lint, type checks, unit/auth/integration tests, applicable Python checks, production build, dependency checks, secret scanning, and relevant browser tests. Preserve failures. Use fixed Basic Vercel builds and existing release/versioning policy. A document-only plan needs no deployment.

## 17. Operational design and observability

Set explicit request/body/page/time limits per tool family and reuse the existing rate limiter. Foreground status refresh, mention typeahead, and library browsing share a per-account/client budget. Debounce mention search and cancel superseded requests. Do not perform N+1 reads for evidence badges, proposal counts, or status rows.

Track aggregate setup completion, categorized auth failures, successful render initialization, first useful result, duplicate reuse, tool latency, failed mutation receipts, and Cloud-result-to-visible-widget delay. Make retention and telemetry disclosure match current plugin policy. Record event delivery and visible refresh separately. Do not report user benefit, full-library coverage, or subscription savings from these technical measurements.

Support connection diagnostics without exposing tokens. Give operations a kill switch for new render resources, optional extensions, Events, and newly introduced write operations. Retain existing text tools and account access where safe during a widget rollback. Switching off UI must not cancel unrelated Cloud jobs or change the user's funding route.

Proposed performance objectives to validate on a documented staging device/network: card visible within one second after the initial tool result reaches the host; workspace usable within two seconds after its first response; no more than two metadata calls to open a normal list/detail view; typing/filter controls remain responsive with loaded pages. These are engineering targets, not measured release facts or promises about upstream host latency.

## 18. Build work packages and dependency order

| ID   | Deliverables                                                                                   | Dependencies                           | Acceptance exit                                                                                  | Estimate, engineer days |
| ---- | ---------------------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------- |
| WP00 | Select baseline, inventory real APIs/scopes, record ADRs and feature trace                     | None                                   | Current paths, owners, serialized contracts, and supported-source matrix documented              | 1                       |
| WP01 | SDK compatibility proof, three-resource build skeleton, real-host capability sample            | WP00                                   | Both desktop targets render and call a read tool; dependency set and limitations recorded        | 2-3                     |
| WP02 | Shared DTOs, output schemas, authorized projections, versioned command/scopes design           | WP00; WP01 informs bridge              | Contract and negative tests pass; no unrestricted dispatcher                                     | 4-5                     |
| WP03 | Public connect site, setup descriptor/prompts, OAuth client strategy, readiness and onboarding | WP01-02                                | Fresh supported customer connects without manual founder registration                            | 4-6                     |
| WP04 | Native shell, navigation, host adapter, query/cache lifecycle, settings surface                | WP01-02                                | Desktop/panel/mobile fixture flows work with access-loss isolation                               | 3-4                     |
| WP05 | Save, receipts, automatic Cloud status/result integration, cancellation and recovery, Events   | WP02-04                                | Complete save-to-insight/reopen/duplicate/unknown-outcome journeys                               | 3-4                     |
| WP06 | Library, Sources, Scroll, Topics Tree/Folders, evidence, compare, organization, feedback       | WP02, WP04-05                          | Core knowledge work happens inside widget with accurate citations and preserved corrections      | 5-7                     |
| WP07 | Project setup/context, evaluation, proposal/plan edits, approval round-trip, runs/PRs          | WP02, WP04, WP06                       | Full project journey with exact version/role/funding fences                                      | 5-7                     |
| WP08 | Usage/privacy/share handoffs, mentions/context, export/viewer, complete fallback paths         | WP03-07                                | All feature-coverage rows have working direct UI or tested handoff                               | 3-5                     |
| WP09 | Nine workflow skills, examples, package metadata, generated installation docs                  | WP03-08 contracts stable               | Installed-plugin and raw-MCP workflows both pass their intended scenarios                        | 2-3                     |
| WP10 | Full browser/host/account/role/Cloud/recovery/load/accessibility verification                  | Starts with WP01, completes after WP09 | Required acceptance matrix passes on exact candidate; blockers explicitly resolved               | 5-7                     |
| WP11 | Public self-service rollout, support/runbook, directory submission package, rollback proof     | WP10                                   | Public server onboarding works; submission readiness and production receipts recorded separately | 2-4                     |

Planning total is approximately 40-60 engineer days, about 8-12 working weeks for one experienced engineer, with integration and refinement allowance. External account approvals and directory review are additional elapsed time. This estimate covers the expanded production workspace and self-service product, not only the original compact widgets. Re-estimate after WP01-03 reveal real client and OAuth compatibility.

The critical path is baseline → compatibility/contracts → public auth/onboarding and shell → automatic intake and library → project workflow → full acceptance → production rollout. Documentation, skills, and automated tests evolve with each completed contract. Do not defer permissions and recovery until the final visual polish pass.

## 19. Completion and release acceptance matrix

| ID  | Required result                                                                                                         |
| --- | ----------------------------------------------------------------------------------------------------------------------- |
| A01 | A new supported customer can add the public MCP server without founder-side per-user configuration                      |
| A02 | Copied setup prompts preserve unrelated client config and never request or print private credentials                    |
| A03 | Official sign-in/consent completes in both target desktop clients and account/workspace identity is visible             |
| A04 | An existing paid account unlocks correct entitlements through backend checks; no plugin commerce/upsell flow exists     |
| A05 | Onboarding resumes across reconnects and reviews old processing policies only when materially required                  |
| A06 | Saving a supported link automatically enters the assumed working Cloud insight pipeline                                 |
| A07 | Duplicate save and uncertain transport retry do not create duplicate analysis or charges                                |
| A08 | Save only suppresses analysis and a deliberate later analysis request works                                             |
| A09 | Closing the widget does not stop Cloud work; reopening loads the correct canonical result                               |
| A10 | Unknown, recovering, failed, cancelled, expired, and completed-with-no-insights states remain distinct                  |
| A11 | Cited results render correctly for both timed and untimed source types                                                  |
| A12 | Search/pagination never overstates coverage, totals, or absence                                                         |
| A13 | Library, Sources, Scroll, Tree/Folders, comparisons, and detail views work without website navigation for routine tasks |
| A14 | Organization and private draft edits persist and preserve explicit user corrections                                     |
| A15 | All five feedback judgments and versioned corrections work on current evidence                                          |
| A16 | Project creation/context confirmation and exact selected-project relevance review work                                  |
| A17 | Proposal/plan revision conflicts and changed-source/base/context invalidation are visible and enforced                  |
| A18 | Issue/coding/publication approval round-trips use existing exact authority and return to the originating item           |
| A19 | Runs and draft-PR status work without granting merge, deploy, or arbitrary execution                                    |
| A20 | Supported mentions and context attachments expose only deliberately selected current authorized records                 |
| A21 | Settings, usage, sharing, export, and privacy destinations work with truthful sensitive handoffs                        |
| A22 | Export viewer treats an exported file as a snapshot and cannot acquire live-record authority from it                    |
| A23 | Each of the nine skills has positive, incomplete-data, denied-access, and injection/recovery coverage                   |
| A24 | Raw MCP clients work without installed skills; text-only clients get useful bounded results                             |
| A25 | Both real desktop hosts pass; supported Work web/mobile behavior and limitations are documented and tested              |
| A26 | Supported opted-in completion notifications work; unsupported hosts have tested reopen/refresh recovery                 |
| A27 | Account switching, revocation, role removal, source deletion, and stale responses cannot disclose another scope         |
| A28 | No secrets/raw protected content enter widget resources, logs, analytics, or unauthorized model context                 |
| A29 | Accessibility, responsive behavior, resource budgets, and ordinary load targets meet recorded acceptance                |
| A30 | Old conversation resources remain usable or recover clearly across a versioned rollout and rollback                     |
| A31 | Required repository checks pass for the exact release candidate; staging and production evidence remain separate        |
| A32 | Public docs, support, privacy/retention disclosures, host instructions, and packaging match the released server         |

Required-core feature failures do not become acceptable by hiding them behind a feature flag. Flags handle rollout and genuine host capability differences. A production claim lists tested hosts and capabilities, not just a server that answered one tool call.

## 20. Packaging, rollout, and maintenance

Produce a portable root `plugin.json`, `mcp.json`, nine `skills/*/SKILL.md` folders, icons, documentation, and any required OpenAI extension mappings. Use the currently documented schema and validate the final package. Keep compatibility overlays only when required by tested clients. Public directory packaging and direct-MCP onboarding are separate release artifacts. [Packaging reference](https://developers.openai.com/plugins/build/plugins)

Use versioned immutable widget resources with backend-compatible schemas and deployment flags. Deploy backend additions first, then resources/metadata, then enable customer entrypoints. Retain old compatible contracts during rollback. A resource-only UI update must not expand permissions or processing defaults.

Run the full private staging suite with sample accounts, then a small production verification cohort using the same public onboarding that ordinary customers will use. This is a release method, not a permanently private product. Open the self-service server after acceptance. Submit the directory package when reviewer access, policies, domain, and publisher verification are ready. Do not imply that direct-MCP access equals marketplace approval. [Submission requirements](https://developers.openai.com/plugins/deploy/submission)

Provide a dedicated reviewer account with rights-cleared sample data and complete accessible authentication. Never give reviewers the owner's personal account. Include positive/negative scenarios, supported host versions, exact permission explanations, and a walkthrough demonstrating core value and failure recovery. Recheck current submission requirements rather than relying on screenshots or an old manifest template.

Maintain an operator runbook covering OAuth failure, changed scopes, entitlement drift, malformed resources, stale source versions, event delivery failure, Cloud unknown outcomes, rate limits, and rollback. Include redacted correlation-based support instructions. Refresh the compatibility record after material host/SDK/auth changes and recheck policy-sensitive flows before each public expansion. Keep dependency updates deliberate, with contract and host checks, rather than installing runtime `latest` packages for customers.

## 21. Decisions already settled and remaining engineering checks

No further product answer is required to start implementation planning. Use the confirmed equal-host, native-style, public self-service direction and the working automatic Work Cloud assumption.

The remaining items are engineering checks with explicit owners in WP00-03:

- Select the correct current code baseline and merge the relevant existing Cloud contracts without overwriting concurrent work.
- Pin the actual SDK/extension peer-compatible version set and prove real-host rendering.
- Choose and verify public OAuth registration for each supported host, including how direct connections obtain public client configuration.
- Reconcile stored Cloud policy/version and tool wording with the assumed automatic pipeline.
- Confirm source-specific automatic-analysis capabilities through the existing service; do not apply media methods to repository/discussion/file sources by accident.
- Audit which website operations already have reusable command services and implement the missing narrow app projections/commands.
- Record real plan/workspace/client limitations. Equal product priority does not mean every upstream host exposes identical APIs.
- Validate current commerce and submission rules before publishing. Keep subscription purchasing on the independent website unless explicit category enablement changes the verified contract.

## 22. Source register

All external sources below were checked on 25 October 2026. Product architecture, budgets, proposed operations, work-package estimates, and acceptance criteria are our recommendations. Source links support the underlying platform/library capabilities, not a claim that the proposed app is implemented.

| Source                                                                                              | What it establishes                                                        |
| --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| [OpenAI plugin architecture](https://developers.openai.com/plugins/concepts/plugins)                | Tools, skills, optional UI, and shared distribution model                  |
| [MCP/UI quickstart](https://developers.openai.com/plugins/build/app-quickstart)                     | Server-backed UI resources and a basic implementation flow                 |
| [Add UI](https://developers.openai.com/plugins/build/chatgpt-ui)                                    | Portable bridge, state ownership, render separation, resource/CSP behavior |
| [Plugin extensions](https://developers.openai.com/plugins/build/extensions)                         | Native host integration categories and documented availability limits      |
| [Extension specification](https://github.com/openai/mcp-extensions/blob/main/docs/spec.md)          | Platform matrix, entrypoints, links, mentions, settings, forms             |
| [Extension TypeScript SDK](https://github.com/openai/mcp-extensions/blob/main/typescript/README.md) | APIs, version setup examples, initialization and styling hooks             |
| [MCP Apps repository](https://github.com/modelcontextprotocol/ext-apps)                             | Standard implementation SDK, React bindings, examples, authoring skills    |
| [Apps SDK UI](https://github.com/openai/apps-sdk-ui)                                                | React/Tailwind requirements, native design components, MIT license         |
| [UI guidelines](https://developers.openai.com/plugins/concepts/ui-guidelines)                       | Inline versus larger presentations and native visual conventions           |
| [Tool reference](https://developers.openai.com/plugins/reference)                                   | Output schemas, visibility, profile and resource metadata                  |
| [Authentication](https://developers.openai.com/plugins/build/auth)                                  | OAuth resource, issuer, PKCE, scopes, client registration requirements     |
| [MCP configuration](https://learn.chatgpt.com/docs/extend/mcp)                                      | Codex/client configuration, login, callbacks, and registration behavior    |
| [OpenAI Docs MCP setup](https://developers.openai.com/resources/docs-mcp)                           | Concrete official HTTP server configuration example                        |
| [MCP Events](https://developers.openai.com/plugins/build/mcp-events)                                | Supported Work contexts, webhook protocol, subscriptions, verification     |
| [Skill concepts](https://developers.openai.com/plugins/concepts/skills)                             | Skills as reusable workflows around tool capabilities                      |
| [Plugin packaging](https://developers.openai.com/plugins/build/plugins)                             | Portable layout, mappings, onboarding, compatibility structure             |
| [Plugin guidelines](https://developers.openai.com/plugins/plugin-guidelines)                        | Digital subscription/credit commerce limits and production requirements    |
| [Security/privacy](https://developers.openai.com/plugins/guides/security-privacy)                   | Least privilege, bounded disclosure, logging and injection considerations  |
| [Submission](https://developers.openai.com/plugins/deploy/submission)                               | Public review and publication requirements                                 |
| [Official app examples](https://github.com/openai/openai-apps-sdk-examples)                         | Reference implementations, not a required runtime dependency               |
| [TanStack Query](https://github.com/TanStack/query)                                                 | Transport-independent server-state caching and mutation utilities          |
| [Single-file build plugin](https://github.com/richardtallent/vite-plugin-singlefile)                | HTML bundling capability and multi-entry limitation                        |
| [Official Inspector](https://github.com/modelcontextprotocol/inspector)                             | Protocol debugging utility                                                 |
| [MCPJam Inspector](https://github.com/MCPJam/inspector)                                             | Widget/OAuth/evaluation development tooling, Apache-2.0 project            |
| [Playwright](https://github.com/microsoft/playwright)                                               | Browser testing framework                                                  |
| [axe-core](https://github.com/dequelabs/axe-core)                                                   | Automated accessibility checks                                             |

Local authority: inspected `AGENTS.md`, `docs/START-HERE.md`, `docs/PRD.md`, `docs/decisions.md`, `PRODUCT.md`, `DESIGN.md`, `docs/V1-KNOWLEDGE-LIBRARY-PLAN.md`, `docs/VERSIONING.md`, foundational current-direction notes, assistant access/Cloud contracts, MCP route/server/policy modules, and actual application routes. This artifact proposes changes; it does not change those canonical product documents or release gates.
