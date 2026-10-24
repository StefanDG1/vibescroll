# App pages, automatic processing and loading

Mode: implementation specification linked from the [single remaining-work index](README.md). Owner direction October 24; reconciled October 25, 2026, Europe/Berlin. Root owns integration. The owner authorized these requirements; they are not claims that the new experience is live.

## Current source inventory and limits

Inspected main source `8204f400` and compatible serving source `63a071d6`. Their starter `page.tsx` path sets are identical. Their features are not identical: main adds catalog/following/digest, ordered uploads, private reanalysis, own-plan task controls and other panels whose production acceptance is still held. A URL in this inventory proves an implemented route, not a working provider, paid checkout or completed Cloud execution.

Current mobile actions are Home, Library, Save, Projects and Account. Save opens capture; it is not a separate feature page. Desktop primary navigation is Home, Library and Projects. The Account/appearance view currently exposes secondary views through All mobile pages. Several old URLs display the same console view and should remain compatible after regrouping.

## Current page inventory

Authenticated organization routes below use the prefix `/app/{org}`. The identifier remains an authorization/routing detail, not a required generic-insight destination choice in the target UX.

| Page or route                              | What currently lives there                                                                                      | Target placement                                                                                                     |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `/` under the organization prefix          | Home, setup/readiness, private-library/StudioHome; main-only creator digest                                     | Main Home: quick verified metrics, recent shared/attempted posts and processing status.                              |
| `/library`                                 | Explore/topics by default, Posts, project-evaluation Insights and Proposals; Posts search/filter/sort           | Main Library defaults to extracted source insights, with Posts and filters/sort; project decisions move to Projects. |
| `/library/{id}`                            | Post/source detail, evidence/coverage, summary/main points, corrections, filing, processing and project actions | Canonical post analysis page; automatic job updates and ready-result display; Apply to project stays here.           |
| `/shared?grant=...&source=...`             | Explicitly granted shared knowledge                                                                             | Shared with me context in Library; preserve private grant checks, distinct from the global Pro catalog.              |
| `/projects`                                | Selected repositories, context, evaluations, proposals and evidence                                             | Main Projects, with project-specific decision/work sections.                                                         |
| `/projects/new`                            | Standalone project name/description creation form                                                               | Projects action; keep the URL.                                                                                       |
| `/projects/{id}`                           | Standalone project edit/delete form, role-based read-only detail                                                | Project settings/details within Projects.                                                                            |
| `/repos`                                   | Alias showing the Projects console view                                                                         | Keep old route; avoid a duplicate Repositories destination.                                                          |
| `/proposals`                               | Proposal review                                                                                                 | Projects → Proposals.                                                                                                |
| `/plans`                                   | Alias showing the proposal view, not a distinct complete plan editor page                                       | Preserve URL; make actual plan location and labels clear.                                                            |
| `/improvements`                            | Accepted idea, editable plan, approval and implementation/release work                                          | Projects → Plans/Improvements.                                                                                       |
| `/runs`                                    | Execution/run history, reports and PR state                                                                     | Projects → Runs.                                                                                                     |
| `/inbox`                                   | Notification previews, browser notification permission and email preferences                                    | Account → Notifications; it is not the recent saved-post feed.                                                       |
| `/connections`                             | Assistant/ChatGPT, GitHub, optional API and Telegram connections                                                | Account → Connections, with Cloud readiness and standing automation setup first.                                     |
| `/runners`                                 | Optional computer pairing, device/worker status                                                                 | Connections → Computers/advanced fallback, preserving the route.                                                     |
| `/usage`                                   | Usage, processing/funding/budget information                                                                    | Account → Usage, optionally linked from a compact Home summary.                                                      |
| `/account`                                 | Console Account/appearance and secondary-page menu                                                              | Account hub; simplify labels and group settings.                                                                     |
| `/privacy`                                 | Content/privacy preferences and workspace-settings link                                                         | Account → Privacy and data.                                                                                          |
| `/billing`                                 | Authoritative billing/checkout/management screen                                                                | Account → Billing; reachable when product access is locked.                                                          |
| `/billing/change/{id}`                     | Specific quote/review/approval for a plan change                                                                | Billing detail; do not treat a URL/redirect as successful payment.                                                   |
| `/team`                                    | Members, invitations and roles, or a private-library explanation                                                | Account → Teams; the visible default must be inviteable.                                                             |
| `/settings`                                | Workspace rename/export/delete                                                                                  | Team/data settings, with existing access controls.                                                                   |
| `/audit`                                   | Recent audit activity, bounded to 50                                                                            | Role-appropriate Account → Activity/audit.                                                                           |
| `/launch-checks`                           | Optional owner/admin launch-proof setup/report                                                                  | Operator or advanced launch tools, not ordinary primary navigation.                                                  |
| `/app` without an organization suffix      | Default resolver/redirect, including workspace and billing continuations                                        | Entry router; new account-level payment and internal-home/team rules apply.                                          |
| `/app/workspaces`                          | Switch/create named workspaces and open/create private library                                                  | Teams under Account. Remove generic insight destination friction, preserve compatibility.                            |
| `/account` outside the organization prefix | Global profile, sign-out, export/deletion and eligible invoice link                                             | Account profile/security/privacy controls.                                                                           |
| `/account/invoices`                        | Restricted invoice/accounting operations                                                                        | Keep role-restricted. Normal customer billing should use their authorized billing/portal path.                       |
| `/app/moderation`                          | Authenticated operator moderation                                                                               | Operator-only, never a normal customer tab.                                                                          |
| `/join/{token}`                            | Signed-in invitation acceptance                                                                                 | Invitation flow; membership does not grant an unpaid account product access.                                         |

Public/support and entry routes remain distinct from the paid product:

| Page family                        | Pages and purpose                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Website                            | `/`, `/how-it-works`, `/about`, `/pricing`, `/docs`, `/faq`, `/status`, `/contact`. Marketing, product explanation, support and current availability.                                                                                                                                                                                                                                           |
| Public approved examples           | `/example`, `/discover`, `/collections`, `/collections/{slug}`, `/editions/{slug}`. Current explicitly published editions/collections; do not expose the proprietary corpus through these routes.                                                                                                                                                                                               |
| Public policies                    | `/legal`, `/terms`, `/privacy`, `/cookies`, `/refunds`, `/acceptable-use`, `/copyright`, `/subprocessors`, `/dpa`, `/publication-checklist`.                                                                                                                                                                                                                                                    |
| Help index and articles            | `/help`, `/help/{slug}`. Approved articles: `work-cloud-text-review`, `share-a-post`, `instagram-export-guide`, `connect-your-computer`, `getting-started`, `first-useful-insight`, `organize-your-library`, `evaluate-an-idea-for-a-project`, `processing-and-recovery`, `imports-and-data`, `actions-and-publication`. The advanced troubleshooting draft is excluded from public navigation. |
| Source/distribution                | `/open-source`: source and deployment/distribution information.                                                                                                                                                                                                                                                                                                                                 |
| Capture handoff                    | `/share?url=...` or text: carries an unsaved draft through sign-in to capture. It does not prove an analysis is queued.                                                                                                                                                                                                                                                                         |
| Authentication                     | `/sign-in`, `/sign-up`, `/callback`: supported hosted AuthKit flows and safe app return. These are route handlers rather than feature `page.tsx` screens.                                                                                                                                                                                                                                       |
| Labeled demo/design/operator pages | `/demo` is synthetic fixture UI; `/recipes` previews designs; `/setup` is operator configuration/setup. Keep their purpose explicit and separate from real product acceptance.                                                                                                                                                                                                                  |

There is also a separate marketing application with `/`, `/designs`, `/designs/{recipe}`, `/docs`, `/legal`, `/privacy`, `/terms`. Do not count those as extra signed-in starter pages or build a second product navigation around them.

## Target automatic processing

One supported setup establishes the user's paid account, Cloud connection, bounded standing processing/contribution authorization, source-provider access and actual event subscription. It must not require GitHub, a private-workspace choice or routine computer pairing. Once ready, sending a permitted link is the complete normal user action.

| Intake outcome                                        | User experience                                            | Required backend behavior                                                                                                                                               |
| ----------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Compatible current eligible catalog result            | Insights appear immediately with source/coverage/citations | Recheck payment, Pro or valid own-result authority, content revision, policy/model/tool/schema compatibility, rights, moderation and expiry. Reuse with zero inference. |
| Compatible job already active                         | Show its actual status                                     | Attach the permitted recipient through existing intent/receipt authority; do not duplicate inference or leak contributor identity.                                      |
| New permitted work                                    | Queued/Cloud/media/analysis status, then the saved result  | Derive a source-bound job from the current standing grant, deliver a minimal waiting-work event and require an actual host claim and cited commit.                      |
| Missing setup, denied access, quota or source failure | Specific needs-attention state                             | Preserve the link and truthful state. No local or paid fallback, fabricated progress or silent retry after unknown outcome.                                             |

The current `analysis_completed` MCP event only notifies about ready output. Add a versioned waiting-work event through that same signed/persistent callback owner; do not build another queue or assume receipt wakes a usable media runtime. One-time Work monitoring consent is different from approving every source. Preserve expiry/renewal/revocation, callback verification and bounded replay/duplicate behavior.

The current experimental per-source Review/Approve/copy-handoff route remains a diagnostic fallback. It fails the requested normal link-only acceptance. Source rights and scopes, standing quota/model limits and separate coding/publication approval remain enforced.

## Home cards and analytics

Place quick lightweight analytics above the recent-post list. Show metrics only for an explicitly supported scope/window. Existing recent-page counts must not be labeled all-time Library totals. A bounded maintained counter/projection can provide verified totals; do not scan every source on each Home visit.

Include recently shared and attempted posts, whether ready, waiting, processing, failed or needing input. Reuse stable source/intake identity and meaningful share/request activity. A lease heartbeat must not reorder old posts as a new share. The initial feed is bounded and paginated; use the existing batch/cursor conventions rather than loading all content.

Interaction contract:

1. Thumbnail or right-side Open action navigates straight to the post detail.
2. First tap on the collapsed noninteractive card body expands a compact preview.
3. A later tap on the expanded noninteractive body opens the post. An explicit Open analysis link is also present.
4. An explicit Collapse control collapses it. Inputs, links, selection and other interactive children do not accidentally navigate/toggle.
5. Provide separate valid keyboard targets, `aria-expanded`, focus preservation and no invalid nested button/link structure. Do not implement a timing-based double-click requirement.

Load thumbnail metadata and a short preview only as needed. Use permitted/protected thumbnail references, fixed aspect ratio and a fallback when none exists. No automatic source-media preparation is justified merely to draw a card. Expanded previews may lazily fetch bounded additional summary/evidence metadata; opening full detail fetches its heavier data.

## Insight-first Library

The current internal `topics` view is labeled Explore. The current internal `ideas` view labeled Insights contains repository-specific evaluations. Neither a label change nor switching the default to `ideas` implements an extracted-insight feed.

Reuse source evidence and knowledge/topic/artifact projections for the actual source-insight list. Default to Insights, provide a Posts switch, and keep categories/topics, collections, shared-with-me, creator following and Pro discovery reachable. Project applicability/evaluations/proposals move visibly to Projects while old URLs remain compatible. New personal insight customization stays private.

Retain existing Posts state/disposition/category search and sort behavior. Current supported sorts include newest, oldest, platform-saved, published, updated and title; search uses its existing relevance behavior. Add insight-appropriate filters/sort only through explicit server contracts. Preserve view/filter/sort/cursor/scroll on back navigation; an empty filtered page with a continuation remains pageable.

## Convex and cache contracts

Extend `dashboardCards` and its existing mutation synchronization/backfill readiness. Home currently reads compact projections; `product.library` currently queries sources and omits some heavy fields but spreads the remainder. That can still return original text/media/provenance/private job structures. Use an explicit row whitelist and projected/indexed reads for supported cases. Preserve exact source search semantics and measure underlying read volume; response clipping alone does not fix database I/O.

Keep separate small contracts for Home stats/recent rows, insight/post list rows, expanded preview, progress and full detail. Lists contain IDs, short titles/excerpts, status/coverage, relevant counts/timestamps and authorized thumbnail references. Full transcripts, original text, media arrays, model payloads, private variants and credentials do not belong in every list row.

Use existing request generation/abort/scope guards and one bounded in-memory cache owner. Keys include account/session, organization/grant/entitlement scope, view/query/filter/sort/cursor and content revision. Invalidate affected pages after capture/edit/delete/retry/cancel/completion/expiry and clear protected data on sign-out, payment/access loss or changed grants. Existing `library-place` local storage stores UI position, not content or authority. React server `cache(backend)` is request memoization, not a persistent private-data cache.

Preserve the existing Library race protection: compact Home cards and its `more` marker cannot seed an authoritative Posts page; a delayed context reply cannot overwrite a newer real page or cursor. Keep state-updater merging from current state, not a stale request snapshot. Do not invent coverage when only compact metadata exists.

Any added projection/index or changed search path needs a bounded migration and ready-state check before activation. No duplicate summary table, reusable-analysis store, queue or parallel pagination owner.

## Progress and loading

Completion already updates the selected source and can reload detail automatically. The current detail revision does not include `personalAnalysis.stage` or ordered phase, while heartbeat/preparation can change those without changing `updatedAt`. Extend that existing revision/progress path so the visible stage changes too. Separate the compact progress/view signature from content/result revision: render status-only changes directly without downloading full detail again. Do not force heartbeat writes to reorder the recent-post feed.

Prefer one authenticated query scoped to the selected job and visible list. If using the current REST/polling architecture, extend its single visible/online polling owner with compact progress and backoff rather than adding another timer. Stop terminal, hidden, offline or revoked watching. Do not repeatedly fetch a whole Library or transcript merely for status. Only show numeric progress from measured counts; otherwise show an indeterminate phase bar. A heartbeat reports lease renewal, not completion percentage or independent runtime attestation.

| Area                                    | Initial loading and action behavior                                                                                   |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Home                                    | Metrics skeletons and dimensionally stable recent-card/thumbnail skeletons.                                           |
| Library Insights/Posts                  | Mode-matched row/card skeletons, clear first-load versus Load More pending, stable sort/filter controls.              |
| Post detail                             | Header/evidence/insight skeletons; preserve current valid content during progress/background refresh.                 |
| Projects/proposals/plans/runs           | Matching content skeletons and independently pending review/generate/save/run actions.                                |
| Account/connections/usage/teams/billing | Section-level skeletons and exact action-specific busy/error states; unrelated controls stay usable.                  |
| Every mutation button                   | Correct pending owner, duplicate-submit prevention, stable dimensions/label, accessible status and recoverable error. |

The current root `/app/loading.tsx` and compact-to-full loader are text-only; Posts can show a topic skeleton, and Load More can use the wrong busy flag. Extend the existing skeleton package/primitives and `Button busy` rather than adding a second loader system. Keep empty, error, retry, permission and loading states distinct.

## Acceptance

The first real phone test must share an approved saved source with the laptop off and no per-post approval/copy action after standing setup. Verify real event-to-host claim/media/citations/commit, immediate eligible cache reuse, one job for duplicates, live stage changes, automatic ready display and no stale-generation resurrection. Retain the reserved owner-test post unanalyzed.

Native UI tests cover direct thumbnail/action navigation, first-body expansion, second-body navigation, explicit collapse, keyboard/nested-control behavior, all main skeletons, Load More, back navigation, stale account/filter/selection replies, empty continuing pages, 320px, themes and reduced motion. Data tests prove explicit row payloads, reduced indexed reads, no N+1 detail fetches, bounded active status reads, cache invalidation and protected-content clearing. Reuse current projection/Library/shared-refresh/Cloud-parent regressions.

Root owns source integration, exact-head CI/review and staged/canonical acceptance. Current automatic Cloud/media/provider/budget gates remain open; no live calls, recurring subscription, payment or deployment occurs by updating this specification.
