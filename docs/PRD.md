# Product requirements

## Global catalog and Cloud setup direction, October25

[ADR154](adr/154-global-catalog-defaults-and-cloud-intake.md) requires one global paid catalog, no region or opt-out in normal neutral analysis, and personal-post removal that preserves independent canonical insights. Actual privacy, rights and moderation erasure remain separate. Existing source/account-coupled artifacts need a versioned ownership/lifecycle change; this is not accomplished by skipping one delete call. Keep private context out and preserve the existing stores, approved public examples and advanced editions.

For an explicitly requested video already sent in a ready Work Cloud chat, the host can complete the existing save/status/request/lease/media/result chain in that turn. New tool guidance does not grant automatic future work or launch a host. External saves and creator monitoring require one-time standing setup and a proven signed Events-to-operational-host bridge. Reconnect only when provider authorization expires or is revoked. Current Cloud output remains private-only until the independent generic-contribution path is implemented and admitted.

## October 24 link-first and navigation update

[ADR 149](adr/149-automatic-link-analysis-and-insight-first-navigation.md) requires automatic link-to-result work within one-time standing authority, current eligible catalog reuse, visible Cloud stages and automatic post-page completion. Manual per-post approval/copying is not the normal product. Home owns quick metrics and recent expandable/direct-open cards; Library defaults to extracted insights with Posts/search/filter/sort. Preserve private project decisions, exact permissions, projected list contracts, authenticated cache invalidation and skeleton/action loading. [The current index](launch-plan/2026-10-23/README.md) retains all original scope. These are requirements, not production acceptance.

## October 24 requirement update

[ADR 148](adr/148-catalog-first-insights-and-paid-hosted-entry.md) requires payment after hosted signup and before product access. A billing lapse preserves stored account/data and locks access until verified payment resumes. Generic analysis uses the existing shared catalog without a workspace destination choice; preserve Pro catalog entitlement, private project work and internal execution authority. Default inviteable Full Name's team and additional named teams remain collaboration controls. These changes are authorized requirements with implementation/production acceptance pending; they supersede conflicting earlier free-entry or visible insight-destination assumptions, without opening the dataset or changing prices.

Mode: reference. Product: VibeScroller. Release: V1. Specification: 1.0.0.

## Product purpose

VibeScroller helps a person apply useful information faster than the person can watch and save it. A user shares content, sees what it says, sees whether it matters to a selected project, and chooses whether to implement a supported change.

The product is a mobile-friendly web application. The dashboard must make the connection between a source and a shipped change visible. It must also show that some sources were unhelpful, unsupported, duplicated, already implemented, or not yet reviewed.

The public site uses the motto "Make scrolling productive." It does not promise income, guaranteed productivity, or autonomous business creation in V1.

## Users and boundaries

The first audience is adult individual developers and founders. English is the initial interface and default source language. The owner approved individual and business checkout in Stripe Managed Payments' verified tax-covered markets on October 3, 2026; direct billing retains its separately reviewed country policy. Users can create multiple business profiles and select the repositories each profile owns. Businesses may buy the same Starter or Pro service; additional custom scope requires a separate agreement. The application must not advertise unbuilt enterprise features.

The founder's one-to-five daily English videos provide a starting workload. The service must use quotas and durable jobs rather than assuming every customer has that workload. The founder's laptop is a benchmark device, not a hosting dependency for paying customers.

V1 is public-source under MIT for authored code. A single user-operated personal deployment path is authorized for post-V1 preparation under ADR 051; independent setup and upgrade acceptance remains pending. Fully self-contained distribution remains deferred. Managed browser access is the current paid distribution.

## Primary journey

A user signs in, creates a workspace, connects GitHub, selects repositories, and reviews the generated business profiles. The user can also use the library before connecting GitHub.

The user shares a URL through the web inbox, the Android share sheet where supported, or Telegram. Uploads and bulk link imports provide a fallback. VibeScroller checks whether it can lawfully and technically access the media. An unavailable source shows an actionable failure, not an invented summary.

The processing pipeline extracts a transcript and selected timestamped frames. It stores a short summary and distinct main points with evidence. It groups duplicates and evaluates plausible project matches. A project card explains the current implementation, the proposed improvement, the evidence, expected benefit as a hypothesis, risks, and reasons to reject it.

The user can reject, defer, refine, or accept the proposal. Acceptance produces an editable implementation plan. Execution requires a separate approval. A local or cloud agent works in an isolated workspace, runs checks, and proposes a patch. A trusted publisher creates a draft PR. GitHub events update its status in the dashboard.

The user can record whether the implemented change helped. Merge and business benefit remain separate facts.

## V1 requirements

| ID  | Requirement              | Required behavior                                                                                                      |
| --- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| R01 | Responsive web app       | Core journeys work at 320 CSS pixels through desktop. No native installation is required.                              |
| R02 | Public website           | Home, pricing, how it works, docs, FAQ, contact, legal, and account entry routes are complete.                         |
| R03 | Authentication           | WorkOS email code and Google sign-in, secure sessions, sign-out, account recovery, and verified identity.              |
| R04 | Workspace authorization  | Every private object belongs to a workspace. Membership and role checks occur on the server.                           |
| R05 | Capture                  | Paste URL, share target where supported, upload, CSV/JSON link import, and linked Telegram inbox.                      |
| R06 | Source access            | Unsupported, private, removed, or blocked sources have explicit statuses and a safe upload fallback.                   |
| R07 | Media processing         | Extract audio and timestamped visual evidence. Use bounded, restartable jobs.                                          |
| R08 | Transcription            | Preserve original output, corrections, source language, model version, and uncertainty.                                |
| R09 | Visual understanding     | Identify relevant demonstrations, visible code, diagrams, and UI changes without claiming every frame was reviewed.    |
| R10 | Evidence-backed insights | Distinct main points link to transcript or frame evidence. Claims and system interpretations remain separate.          |
| R11 | Library                  | Browse, search, filter, tag, edit, export, and delete saved content and its derived records.                           |
| R12 | Private reuse            | Deduplicate within a workspace. A second identical import does not repeat completed processing or billing.             |
| R13 | Repository selection     | An explicit All repositories grant is allowed. Only repositories selected in the app supply code for analysis.         |
| R14 | Business profile         | Store purpose, audience, stage, goals, business model, constraints, and non-goals for each project.                    |
| R15 | Repository snapshots     | Analyze selected content at a recorded commit. Respect exclusions and scan for secrets.                                |
| R16 | Selective matching       | Evaluate plausible matches. Return no fit, already implemented, unsupported, or deferred when appropriate.             |
| R17 | Proposal review          | Show source evidence, repository evidence, concrete change, expected benefit, risks, effort, and alternatives.         |
| R18 | Plan generation          | Generate a versioned, editable, exportable implementation plan with acceptance tests and rollback.                     |
| R19 | Execution approval       | Separate planning acceptance from permission to execute. Bind approval to a specific plan and budget.                  |
| R20 | Local coding             | Optional paired runner uses official Codex app-server with the user's supported authentication.                        |
| R21 | Cloud coding             | Offer an explicitly funded, bounded isolated execution route without requiring a laptop.                               |
| R22 | Draft PR publishing      | Validate the patch, run checks, and publish to an authorized branch. Never merge or deploy automatically.              |
| R23 | PR lifecycle             | Track open, draft, ready, merged, and closed-unmerged states from GitHub, with reconciliation.                         |
| R24 | Dashboard                | Show summaries, main points, project applicability, next actions, PR state, and benefit evidence.                      |
| R25 | Feedback                 | Record rejection reason, acceptance, implementation, merge, reversion, and outcome independently.                      |
| R26 | AI funding               | Support included API allowance, customer API keys, and supported local subscription execution.                         |
| R27 | Billing                  | Weekly, monthly, annual individual plans, subscription portal, cancellation, refunds, and webhook-driven entitlements. |
| R28 | Budget enforcement       | Reserve estimated costs atomically. Cap retries, tokens, runtime, storage, and paid fallbacks.                         |
| R29 | Privacy                  | Private evidence by default, short raw-media retention, export, deletion, and auditable retention exceptions.          |
| R30 | Notifications            | In-app inbox, optional email, and optional Telegram. No sensitive source text in lock-screen messages by default.      |
| R31 | Operations               | Health checks, error monitoring, backup restoration, incident response, and provider failure handling.                 |
| R32 | Legal launch             | Publish product-specific policies and enforce consent, tax, consumer, and data-processing requirements.                |
| R33 | Accessibility            | Keyboard access, readable contrast, text alternatives, visible focus, and reduced motion.                              |
| R34 | Evidence of completion   | Test and release records distinguish local, staging, and production verification.                                      |
| R35 | Source traceability      | Every claim, proposal, and implementation retains provenance and processing versions.                                  |
| R36 | Account disconnection    | Disconnecting a provider revokes its capabilities without unexpectedly deleting the user's app account.                |

## Confirmed V1 extension

The owner approved separate workspace knowledge libraries, automatic organization with persistent manual corrections, a GitHub repository checklist and AI-drafted business context with easy confirmation/correction. Connected insights can be applied to selected projects and turned into separately reviewed GitHub issues. [The implementation plan](V1-KNOWLEDGE-LIBRARY-PLAN.md) and [ADR 052](adr/052-workspace-knowledge-and-reviewed-issues.md) distinguish existing behavior from missing work, contracts, costs and acceptance. The library extension does not imply cross-workspace reuse or customer-content training. An issue requires its own publication approval; execution and draft PRs keep separate permission. These additions are planned V1 work, not completed acceptance.

## Release exclusions

V1 does not create new businesses, production domains, customer merchant accounts, advertising campaigns, or social accounts. It does not merge PRs, deploy user repositories, or retrain a model automatically from feedback.

Cross-customer cached analysis, guaranteed Instagram Saved synchronization, full TikTok portability approval, independent self-hosting support, and unrestricted hosted ChatGPT subscription inference are gated follow-on integrations. Their absence must not break the core product or appear as a working marketing promise.

The cloud runner is required for a complete hosted option. Its availability must not be advertised before a real sandbox integration passes testing. A local-only private preview can exist, but it is not the complete paid hosted release.

## Limits and entitlements

The initial tier catalogue is in [Billing and tax](BILLING-AND-TAX.md). Every billable operation presents a quote in processing credits before the user commits. Users can enable bounded automatic analysis of future captures. Code execution always requires an approval in V1.

Uploads are initially limited to 250 MB and 10 minutes per source. Reject over-limit files before expensive processing when metadata is available. Recheck after decoding because supplied duration can be false. A source can contain multiple clips or carousel images, but each asset must fit a documented supported type. Unsupported carousels remain saved links with a clear status.

A user can connect a repository without enabling writes. Generated plans remain useful without an execution provider. Source content can be useful without a repository. These are valid product states, not incomplete onboarding failures.

## Nonfunctional requirements

Private reads and mutations must reject missing or foreign workspace membership. Paid access must come from verified entitlements, never browser-supplied plan names. Replayed notifications and webhooks must not create duplicate work or credits.

The web shell must meet the initial mobile performance budgets in [Dashboard and mobile UX](DASHBOARD-AND-MOBILE-UX.md). Processing latency is measured and displayed. The product must not promise real-time completion while a local computer is asleep or a provider queue is full.

The system must recover a queued job without repeating already committed side effects. It must distinguish provider refusal, unavailable content, low-confidence extraction, budget exhaustion, and internal failure.

No user code runs in the web application process or database backend. No GitHub write token enters the media decoder or reasoning prompt. All execution secrets have narrow scope and short lifetime.

## Success measures

The primary activation event is a user reviewing the first evidence-backed proposal for a selected project. An import alone is not activation.

The product tracks useful-proposal rate, accepted-plan rate, PR merge rate, confirmed-benefit rate, time to first review, processing failure rate, cost per processed minute, and contribution margin. Definitions and denominators are in [Feedback and evaluation](FEEDBACK-AND-EVALUATION.md).

The initial launch benchmark uses at least 40 rights-cleared test clips and two repositories with known expected outcomes. It includes code on screen, accents, music, misleading advice, already-implemented ideas, and no-fit cases. A benchmark report is required before advertising accuracy.

## Definition of done

A new user can subscribe through tested billing, import a permitted sample, read the summary on a phone, understand its relevance to a selected repository, approve a plan, execute it through an authorized runner, and see the resulting PR state after GitHub changes it.

The same journey must handle an unavailable source, insufficient credits, a disconnected provider, an offline laptop, a failed test, a closed-unmerged PR, and a workspace deletion without misleading states or cross-workspace exposure.

The website must describe the actual enabled capabilities. Required legal and production gates must have recorded evidence. Passing a mock-only test suite is insufficient.

## Bounded full-library and reviewed improvements extension

[ADR 058](adr/058-bounded-full-library-scans.md) adds a metadata-only full saved-link inventory, then an explicitly funded bounded scan: available unanalyzed links, knowledge gathering, every topic evidence page for every selected confirmed repository, and useful app issue drafts. Reuse completed work; preserve corrections/exclusions and no-fit decisions. Source cutoff, exact repository/profile/selection versions, lease and current account/model authority fence dispatch. Publication remains separately reviewed. [ADR 057](adr/057-continuous-reviewed-improvements.md) adds issue-linked plans, separately approved isolated coding, independent review, opt-in routine policy, protected-work review, exact-head checked merge and distinct judgment/data outcomes. Routine activation remains disabled until its actual linked-cycle acceptance. No V2 business creation is added.
