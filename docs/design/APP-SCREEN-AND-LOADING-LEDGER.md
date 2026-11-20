# Website screen and loading ledger

Route inventory and interaction acceptance. Use [current state](../operations/CURRENT-STATE.md#start-here) for deployed behavior and release evidence.

The [November 16 review](APP-UI-REVIEW-2026-11-16.md) records measured website states and replaces the multi-layout Home proposal with Browse.

Use this ledger with the [page map and implementation plan](APP-STRUCTURE-AND-IMPLEMENTATION-PLAN.md). The [Home comparison](HOME-COMPARISON-AND-WORKSPACE-ENTRY.md) records the earlier alternatives. Route aliases share a design where they share an experience. Handoffs and overlays have their own checks. Verify the affected inventory against the route tree when changing or reviewing routes.

The November 13 inventory covered 56 starter page templates and seven marketing page templates. The root error and not-found boundaries in both apps, the signed-in loading boundary, and external handoffs are checked separately.

## Verify the core journeys

Choose the rows the change affects. Use the same post and project when comparing versions. Start with phone and desktop widths. Add the narrower, keyboard, reduced-motion, theme, and access checks that exercise the changed behavior. These rows define expected behavior. Record results in the review or release receipt.

| Journey | Exercise | Pass when |
| --- | --- | --- |
| Read a post and check its evidence | Open an insight from Home and from the full post. Try a cited frame and a transcript-only insight. Close the evidence viewer using the keyboard. | Each title stays stable on expansion. The frame or transcript belongs to the selected insight. Closing the viewer restores focus. The post title and thumbnail appear once in the reading flow. |
| Like a post while continuing to browse | Delay the like response, tap twice, and exercise a rejected response and a timeout. | The heart and count reflect the last tap immediately. Save remains available. Failure stays on the post and the reaction reconciles with saved state. Automatic retries after a timeout keep the same request identity. |
| Switch tabs and return to loaded content | Scroll Home, filter Posts, open Work, and return to Posts and Home. Delay a refresh, then simulate failure and confirmed access loss separately. | Loaded content stays visible during refresh. Return restores the Home post and the Posts query and position. Transient failure offers local recovery. Confirmed access loss removes protected content. |
| Choose a project and work on a proposal | Open a post with zero proposals and one with an existing proposal. Open a recommendation or another owned project from Home. Start or reopen a proposal chat and exercise a delayed send, failure, and retry. | Recommended and other projects are accessible independently of proposal count. An existing proposal keeps its chat and leaves room for new recommendations. The send appears immediately as pending, then confirms once or retains the message and offers recovery. Any paid generation uses the displayed credit confirmation. |

For a scored review, use the [12 design criteria](HOME-UI-SCORECARD.md). Zero means unusable, five means average and usable, and ten means perfect. State whether the target applies to the average, each criterion, or both. Record each screen's average and lowest criterion. Record each relevant journey as **Pass**, **Fail**, or **Untested**, with the environment, viewport, inputs, and evidence. Give a reason for each untested journey. A failing or untested critical journey remains open even when the design score meets its target.

## Loading and feedback rules

| When | What appears | Placement and finish |
| --- | --- | --- |
| First content read with an empty layout | A small set of static skeletons shaped like the final content | Inside the destination's content boundary. Reserve media aspect ratio, row sizes, and layout positions. Replace only those placeholders when data arrives. |
| Fast or already prefetched navigation | The ready screen, or the current screen while the transition begins | Keep the app shell. Show a placeholder only if a visible wait develops. Tune the reveal delay with device testing to avoid flashes. |
| Refresh, filter, next page | Keep valid content visible while updating | Put a subtle busy label by the trigger, or a small placeholder at the list tail. Keep focus, input, active chips, and scroll position. Mark old results as updating until they match the committed filters. |
| Short button action with unknown duration | A small button-local spinner with an action label such as Saving | Keep the button width and disable repeat submits for that action. Other useful controls remain available. Settle into the actual receipt or inline error. |
| Measurable transfer or batch | A determinate bar with real bytes or completed/total units | Put it in the upload or import row. Show discrete phases if the total changes. Upload completion can lead to a separate waiting/processing phase. |
| Long-running work | An observed stage and, when useful, indeterminate progress | Put it on the relevant post, proposal, task or connection. Keep the result and navigation available. Only show a stage when the server has observed it. |
| Pending external confirmation | A quiet persistent status with a next action | Keep the item, exact operation, and last checked state. Offer Check status when safe. A known failure can have an explicit retry, while an unknown write needs reconciliation. |
| Empty, failed, unavailable, or unauthorized | A specific message and an authorized next action | Replace placeholders after a confirmed result. Retain safe drafts and focus. Clear protected bytes when access is lost. |
| Reduced motion and assistive technology | The same states with static placeholders and immediate state changes | Mark the relevant region busy, hide decorative placeholders from assistive technology, and announce meaningful changes once. Keep real determinate bars labeled. |

Initial performance checks include ordinary and throttled navigation, a deliberately slow server, known failures, stale responses, and rapid repeats. Use canceled or superseded reads correctly. Avoid a double indicator for the same operation. Use a small interaction-driven animation where it explains position or confirms input. Always preserve the user's existing content, choices, or draft when they are still authorized and valid.

## Starter website routes

Abbreviations in this table are full routes. Each route is a separate acceptance entry. Use the same design on desktop and mobile, adapted to the available width.

| Route | Screen, entry and next step | Loading, empty and recovery |
| --- | --- | --- |
| `/` | Public landing with product explanation, real example, sign-in and onboarding entry | Render static content immediately. Reserve example media. Disable or replace a missing preview with text and a working next step. |
| `/[slug]` | Public feature, product or policy page selected by the existing slug resolver | Render matching public content directly. Reserve media where present. Unknown slug goes to the public not-found view. |
| `/example` | Public product example that opens the bounded demo | Keep the sample area stable while media decodes. Show an available example or a plain fallback and Open demo. |
| `/demo` | Synthetic product preview with its own context and signed-in entry | Reuse app-shaped placeholders on transitions. Label sample data and keep writes simulated. Offer sign-in on restricted actions. |
| `/demo/analysis` | Analysis status examples | Render authored states directly. Demonstrate skeleton, observed processing, recovery and completion with sample data. |
| `/discover` | Public discovery with visible collection and edition links | Keep heading and filters. Use cards with reserved thumbnail space, an empty state and a retry near results. |
| `/collections` | Public collections listing | Reserve the result list only when the data wait is visible. Offer Browse discovery if empty. |
| `/collections/[slug]` | Public collection detail and edition links | Keep heading and action positions, skeleton the entry list. Handle unpublished, absent, or removed collection. |
| `/editions/[slug]` | Public edition reader with evidence, version and save or sign-in continuation | Skeleton the reader content only. Show unavailable version or missing evidence in context and preserve authorized continuation. |
| `/recipes` | Public recipe catalogue | Keep recipe index visible. Reserve image previews and use a text alternative for unavailable media. |
| `/open-source` | Public source and documentation links | Render authored content directly. Keep links and fallback text visible during media reads. |
| `/docs/[[...slug]]` | Docs navigation, article, and search | Keep the docs shell while article content loads. Show pending search in results, then empty or retry. |
| `/help` | Help topics and search entry | Keep topics and controls visible. Show search feedback in its result list. |
| `/help/[slug]` | Help article with back and relevant app action | Preserve reading width and render directly. Handle invalid article with a Help link. |
| `/connect` | Public assistant setup introduction, links and app entry | Static shell. Launch controls show pending only after selection and preserve the browser return. |
| `/setup` | Configuration or setup instructions where applicable | Static instructions and retry or sign-in when available. Show no automatic readiness claim. |
| `/share` | Review pasted or OS-shared link before app continuation | Preserve the shared input. Button-local spinner when proceeding, and a clear error for invalid data or expired continuation. |
| `/onboarding` | Entry, interest quiz, saved-post benefit and initial preview | Render known questions immediately. Skeleton only recommendations while preserving answers. Use a step counter for completed fixed steps. |
| `/onboarding/resume` | Resume account, import, example, payment or assistant stage | Keep the step shell and saved answers. Display checkout or verification as observed stages. Preserve the resume path on known failure or unknown return. |
| `/onboarding/project` | Optional project handoff and context setup | Skeleton the repository list only. Show setup, no repository, load error, and Connect later when permitted. |
| `/join/[token]` | Invitation preview, acceptance and scoped entry | Skeleton just the invite summary. Use an Accept button spinner. Expired or invalid invite provides a safe back path. |
| `/account` | Account identity, manage workspaces, export and sign out | Keep the account shell. Skeleton identity as needed. Show pending and failure feedback in the chosen action. |
| `/account/invoices` | Authorized invoice operations | Skeleton table rows. Label pending pagination and action saves. Show empty, forbidden and failed states. |
| `/app` | Verify session and route to authorized continuation or default Home | Keep a neutral shell with a Home-shaped placeholder if visible. No routine standalone workspace interstitial. |
| `/app/workspaces` | Deliberate workspace management, create/join, and recovery | Skeleton the workspace list within the shell. Use a per-row switching state or create button spinner. Handle no readable workspace. |
| `/app/moderation` | Authorized moderation records, filters and record detail | Preserve filters. Skeleton rows and detail only. Show exact access, empty, action pending and known failure states. |
| `/app/[org]` | Browse opens directly to the ready feed. Insights, projects and proposals are available in place. | Reserve source and insight regions for the first card. Keep the current post visible during neighbor loads. Show exhaustion and unavailable states. |
| `/app/[org]/posts` | Canonical saved Posts list with search, category and status filters, and sort | Skeleton first results. Keep results while filtering or sorting. Add tail feedback for pagination. Show no results, index lag, offline and failed reads. |
| `/app/[org]/library` | Knowledge categories and existing Library tools for approved organization and search | Share the Posts loading treatment. Preserve selected representation, query and filters during alias navigation. |
| `/app/[org]/posts/[id]` | Canonical reader with one source header, insights, projects, proposals, evidence and settings | Reserve poster, title and first insight cards. Keep ready content during evidence or version reads. Put processing and errors beside the relevant section. |
| `/app/[org]/library/[id]` | Legacy post link using the canonical reader | Match the canonical post states and preserve authorized source and list-return filters. Version history is available within the post. |
| `/app/[org]/shared` | Team-shared sources and exact shared record | Skeleton rows and selected detail separately. Clear expired or revoked content and offer a safe list return. |
| `/app/[org]/catalog` | Eligible shared catalogue, search and filters | Keep eligibility and filter controls visible. Load result rows locally. Show off, not eligible, no results and failure. |
| `/app/[org]/catalog/[id]` | Authorized catalogue reader | Reserve source and evidence layout. Check access to exact shared version and display unavailable if withdrawn. |
| `/app/[org]/trends` | Supported trends and underlying records | Preserve dates and filters. Skeleton real charts and tables. Use distinct insufficient-data, empty and failure states. |
| `/app/[org]/inbox` | Work Activity timeline, exact item navigation and unread filtering | Skeleton timeline rows. Keep timeline during refresh. Handle empty filters and missing linked content. The current screen presents existing read state. |
| `/app/[org]/projects` | Work project list and project-level proposal/task counts where observed | Skeleton repository rows. Show no projects and Connect project. Keep list visible while any single project updates. |
| `/app/[org]/repos` | Existing projects alias | Share Projects layout, selection and loading. |
| `/app/[org]/projects/new` | Manual project setup with name and description. Repository setup stays within Projects and Connections. | Keep input through a rejected save. Show pending beside the chosen action. |
| `/app/[org]/projects/[id]` | Project details, access, context, proposals and tasks | Reserve header and tabs. Skeleton only active list or context. Show no proposals, stale context or revoked project access. |
| `/app/[org]/proposals` | Filterable proposal list with exact proposal links | Skeleton rows on first read. Preserve filters and prior valid content during refresh. Show empty, generating, stale and failed items. |
| `/app/[org]/plans` | Existing plan list or proposal alias | Share Proposals treatment and preserve existing link intent. |
| `/app/[org]/proposals/[id]` | Versioned plan review, discussion, approve and issue receipt | Skeleton the plan and discussion independently. Keep previous authorized plan visible during refresh. Use inline stages for generation and publication. |
| `/app/[org]/runs` | Work Tasks and run or issue/PR history | Skeleton rows. Preserve selected run during status refresh. Use real phases, checks and links; show blocked, unknown and failed distinctly. |
| `/app/[org]/improvements` | Improvements and observed outcomes with project context | Skeleton result list. Show no results, limited evidence and a retry without fake outcome values. |
| `/app/[org]/account` | Account profile landing with identity and groups | Keep settings labels in place. Reserve avatar and identity, display initials when needed, and show connection/credit badges only when known. |
| `/app/[org]/connections` | GitHub and assistant connections, grant and setup actions | Skeleton provider rows. Use provider-local status and button feedback. Keep connected, verifying, revoked, blocked and unavailable distinct. |
| `/app/[org]/runners` | Authorized paired computers and pairing actions | Skeleton computer list. Show pairing code and verified stages only when returned. Handle expired pairing, disconnect, and no computers. |
| `/app/[org]/usage` | Personal credit and usage history | Reserve balance and activity areas. Keep unknown separate from zero. Show holds and safe retry. |
| `/app/[org]/billing` | Current plan, credits, permitted checkout and management | Skeleton plan and balance only. Use inline button pending on handoff. Keep verified plan while awaiting provider confirmation. |
| `/app/[org]/billing/change/[id]` | Exact plan-change review and status | Reserve current and proposed plan rows. Use exact submitted, pending, confirmed or failed states. |
| `/app/[org]/privacy` | Workspace privacy, grants, retention and permitted data actions | Keep policy headings. Skeleton data reads only. Put action feedback next to the exact setting. |
| `/app/[org]/settings` | Workspace settings, catalogue preference, authorized management | Skeleton values. Keep row-level saving, saved and failure states. Require deliberate confirmation for existing destructive actions. |
| `/app/[org]/team` | Member roles, invite and ownership management | Skeleton member rows. Use per-action feedback. Show invite states and revoke or change errors without losing the list. |
| `/app/[org]/audit` | Authorized audit view | Keep query and dates visible. Skeleton rows on first load and tail on pagination. Show no records or denied. |
| `/app/[org]/launch-checks` | Authorized launch status and verification tools | Reserve check rows. Show real pending and checked states. Keep prior observed result visible and dated. |

## Separate marketing website routes

| Route | Screen and loading |
| --- | --- |
| `/` | Marketing landing. Static shell, product media with reserved size, and clear route into the signed-in website. |
| `/docs` | Marketing documentation entry. Render existing content and links directly. Keep code and long URLs readable on phones. |
| `/designs` | Design recipe listing. Stable preview dimensions and accessible placeholders. |
| `/designs/[recipe]` | Recipe detail and preview. Keep title and instructions visible while the preview loads. Handle unavailable recipes. |
| `/legal` | Legal index. Render authored links directly. |
| `/privacy` | Privacy policy. Use a readable static article and preserve approved policy text. |
| `/terms` | Terms. Use the same accessible article layout and preserve approved terms. |


## Handoffs, overlays, and interactions

| Screen or interaction | Pending feedback and placement | Completion and recovery |
| --- | --- | --- |
| Sign in, sign up, callback | Preserve the safe local return. Use pending on the initiating action until the provider takes over. Callback uses the same neutral entry shell if a wait is visible. | Expired or denied returns show Try again or a safe path. Resume approved intent once. |
| Global navigation and Back | Keep the active shell and current content through fast navigation. Reveal a shaped destination skeleton within the content area if needed. | Restore scroll, selection and focus. Avoid a global loading flash. |
| Workspace picker | Use a pending mark in the selected row only. | Close on verified selection, preserve shell, restore a valid destination, or show the local error. |
| Feed first load, next post, and end | Show one media-shaped card on first load. Reserve the next card if metadata is pending. Keep the active media and controls responsive. | Settle to an eligible post or keep the current post. Show a clear end, retry, or more control at the feed boundary. |
| Like and double tap | Immediate lightweight feedback, with the write tied to the exact post. | Reconcile repeated taps and keep the ordinary Like control available for keyboard users and touch. |
| Video playback and evidence media | Keep poster visible while player is unavailable or buffering. Only show a small media-local spinner during a real buffering wait. | Resume at the supported position, or show Open original post. An unavailable evidence frame keeps the title and explanation. |
| Open or close Home details | Keep the same media visible. Animate its position and size only when supported. Skeleton the insight rail, projects and proposals independently inside the panel. | Content appears in order. Close returns to the same post and focus. No automatic next post while the panel is open. |
| Expand insight and source evidence | Text opens immediately when available. Reserve image or transcript space for lazy reads. | Render exact authorized frame or transcript. Show a local retry or unavailable state and keep the insight text. |
| External resource link | Show the destination domain and external affordance. Avoid spinners for ordinary navigation. | Opening the link preserves the post or insight position. Omit unconfirmed destinations. |
| Search, filters, sorting and collection navigation | Keep entered query and committed chips visible. First load skeletons results. A change uses a results-local indicator and ignores stale responses. | Show grouped results or an actionable empty state. Back restores filters and selected row. |
| Save overlay and URL validation | Keep the pasted text. Validate the input inline. Save button shows a local spinner and stable label width. | Return the authorized saved receipt or existing item. Preserve draft and next action on failure. |
| Upload and bulk import | Real per-file byte bar when known. Use processed/total for a stable batch with known size, or observed status when unknown. | Distinguish transfer completed, accepted, queued and processed. Retain succeeded items and retry only supported failed ones. |
| Post analysis and reanalysis | Show observed stage under the post header or near Insights. Use indeterminate progress for active work without a meaningful percent. Keep current ready insights during a newer attempt. | Show ready, waiting, blocked, failed or unknown from actual state. Honor exact version and recover without duplicate jobs. |
| Change analysis version | Keep the selected authorized version readable while requested data arrives. Put the pending marker in version history. | Replace insights and linked evidence coherently once verified. Show an inline failure when an exact version is unavailable. |
| Load recommended and all projects | Use separate compact row skeletons. Keep the section label. The full list can load independently of recommendations. | Show actual recommendation fit and all accessible projects, distinguish none from no matches, keep manual choice available. |
| Create or refine proposal | Use a button-local request indicator for quote, save or submit. Use the observed queued/drafting/validating status in the proposal. | Keep draft, conversation, and version. Reuse the same operation on unknown response and show Check status. |
| Post proposal discussion message | Keep existing thread. Show pending on Send or beside a local pending message, without claiming it was delivered. | Render stored message or retain the draft with a retry. |
| Approve and create issue | Show one pending action on the exact proposal. If response is unknown, show persistent Checking issue status. | Show confirmed issue URL and Copy work prompt only after verification. Resume setup or reconcile the exact write. |
| Activity refresh, filters and mark read | Keep timeline and focus. Show first-load row skeletons and item-level read feedback. | Roll back a failed read update and offer safe retry. Keep earlier valid events visible. |
| Connect and manage providers | Use a spinner on Connect until handoff, then stage labels for required setup and verification. Keep the existing permission flow. | Resume exact setup step. Treat connected, waiting, blocked, revoked and expired distinctly. |
| Billing checkout and change | Show initiating button pending, then provider confirmation or a measured stage if available. Keep last verified plan and balance. | Confirm via authorized provider result. Preserve safe return on cancellation or unknown outcome. |
| Account settings, data export and deletion | Use row-local save feedback, a status for long exports, and a deliberate confirmation for deletion. Use measured export progress only if supported. | Show export/download receipt, known failure, or confirmed action. Preserve applicable ownership and permission checks. |
| Website route error and not found | Use public or signed-in shell as appropriate with a specific error and safe action. | Try again for recoverable reads. Show safe return on missing or inaccessible routes without leaking private existence. |

## Design and verification across the website

Use the app's current typography and muted mint accent. Define equivalent light and dark tokens for canvas, panel, text, active state, focus, warning and error. Public pages get a clearer display scale and real product examples. Signed-in pages put the active content first and keep the chrome compact. Use the same semantic status treatments across both.

| Page family | Mobile composition | Desktop composition |
| --- | --- | --- |
| Public landing and examples | Short value statement, one real product example, clear next action, then supporting sections | Give the product example enough space to show the workflow. Keep reading widths and action hierarchy controlled. |
| Docs, help and policy | One readable article column, optional table of contents disclosure, contextual next link | Keep navigation and search available beside a readable article. Preserve anchor and search focus. |
| Entry, setup, invites and forms | One task per screen, visible progress when steps are known, actions within thumb reach and clear of the keyboard | Focused column with enough context beside the current task when helpful. Keep the same order as mobile. |
| Home and post | Media first. One post identity. Scrollable insight cards and readable details, followed by project choices and proposals. | Preserve the same content order and controls. Keep the brand icon in the slim rail and show insights in a vertical list beside the post on wide Home layouts. |
| Posts and Work lists | Readable rows and visible search or filter controls. Open the selected record in place or on its stable screen with a Back action. | Use list/detail where users benefit from seeing both. Keep the selected item and its position visible. |
| Profile, billing and operator | Group settings and show context-specific actions close to the values they affect. Use a dedicated review view for consequential actions. | Group by purpose. Use table and detail layouts for record-heavy views. Keep role-specific actions and pending status visible. |

- Establish shared type, spacing, contrast, focus, motion, buttons, placeholders, lists and responsive navigation. Give the public landing and documentation their own reading hierarchy while carrying the same typography and visual language into the app. Use real product visuals where available. Keep public policy text, auth and permission behavior intact.
- For affected routes, review the desktop and mobile compositions, including shared templates and any changed alias behavior. Capture the normal state and meaningful alternate states such as slow, empty, failed, or blocked. Use controlled fixtures or authorized data. Record the actual route or template and link an approved reference when available.
- Validate keyboard, visible focus, 200% zoom, reduced motion, light and dark themes, no horizontal overflow at 320/390px, tablet and desktop widths, real mobile browser gestures and resize. Check touch targets, safe areas, long titles and missing media. Use screenshots, keyboard walkthroughs and short gesture recordings.
- Validate layout stability, first usable screen, loading feedback, and scoped read behavior on ordinary and throttled journeys. Test that Back, repeated submits, route switches and access revocation restore or clear the right state. Verify consistent data and labels across entry points that share a reader.
- Before calling a route ready, record the route/template, reference, main and alternate states, phone/desktop and theme coverage, keyboard or gesture check, loading and error check, scope/permission check where applicable, test environment and exact release revision. Keep design approval, implementation and production acceptance separate.

| Route | Reference | States captured | Approval | Implementation | Staged and production evidence |
| --- | --- | --- | --- | --- | --- |
| Record each route independently, including aliases | Mobile and desktop design links | Ready, pending and relevant recovery states | Pending, approved or revisions requested | Pending, in progress or verified | Environment, revision, screenshots or recording, and result |
