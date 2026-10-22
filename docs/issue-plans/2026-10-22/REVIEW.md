# Review the plans before implementation

Updated October 22, 2026. All three currently open issues are covered. Application code has not been changed. New suggestions below are proposed for discussion; the confirmed decisions remain both direct adapters in one release, public help pages, and the submitted OpenAI commercial-access request.

## The three plans

| Issue                                             | What the user gets                                                                                                        | Proposed implementation sequence                                                                                                                                                                     | Completion evidence                                                                                                                                 |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| [#118: full plan](118-cited-non-media-sources.md) | Save public Reddit discussions and GitHub repositories, extract cited ideas, and evaluate them against selected projects. | Verify Reddit access; define typed non-media evidence; build both adapters; connect analysis, UI, assistant, export and deletion; release together.                                                  | Both direct paths work with actual permitted examples, citations survive the whole journey, and existing media behavior still works.                |
| [#119: full plan](119-task-based-user-guides.md)  | Public `/help` guides that explain useful tasks and are reachable from the relevant app screens.                          | Audit current journeys; write three guides and Getting started; capture reviewed synthetic examples; add public routes and contextual links; run beginner/role/mobile walkthroughs.                  | A beginner can find and complete first-source without the developer README; all three guides match verified behavior.                               |
| [#5: full plan](005-chatgpt-plan-funding.md)      | Clear, trustworthy own-plan funding for eligible supported tasks, with visible limitations and recovery.                  | Inventory existing implementation/evidence; fix proven gaps in local inference, capability reporting and accounting; verify acceptance; handle SIWC coding/commercial activation only when eligible. | The acceptance matrix links each claimed capability to code and appropriate test evidence. OpenAI application receipt stays separate from approval. |

## #118: make new sources useful without losing evidence

The user flow is save a source, inspect scope, select a processing route and approve its quote, read cited ideas, then optionally choose projects for evaluation. A GitHub source never becomes an editable destination project merely because it was saved.

The implementation changes the evidence contract as well as URL handling. GitHub needs commit/path/line references; Reddit needs original-post/comment identity and reply context. Neither should be represented as invented video timestamps. Existing media readers and saved analyses must remain compatible.

The most material research finding is the provider dependency. [Reddit's current guidance](https://support.reddithelp.com/hc/en-us/articles/14945211791892-Developer-Platform-Accessing-Reddit-Data) says commercial use requires permission and a contract. The [Responsible Builder Policy](https://support.reddithelp.com/hc/en-us/articles/42728983564564-Responsible-Builder-Policy) requires explicit API-access approval. No applicable VibeScroll approval was established. Since you chose a combined release, unresolved Reddit access holds the new feature release. This does not prevent contract design or fixture-based development.

GitHub has a separate scaling concern. [Unauthenticated REST requests share a limit associated with the originating IP](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api?apiVersion=latest). The proposed adapter needs service-level budgeting and a verified public-read authentication strategy before broad release; a per-source cap alone is insufficient.

I recommend reviewing these refinements:

- Show an editable README/license/docs selection preset, then confirm it once. Require an explicit choice for extra source files.
- Make coverage visible: what was fetched, what was omitted, when it was observed, and how comments were sampled. Include reply ancestors and test a thread with important disagreement outside the top comments.
- Let the user relate an announcement to its repository while keeping distinct evidence. Repeated claims should not create duplicate project drafts or count as corroboration.
- Before reanalysis, show a changed-revision preview. Keep refresh explicit and preserve manual corrections.
- Resolve provider removal rules before calling the evidence design complete. Remove affected cached/derived content as required, and block resurrection through restores or late results. External GitHub exports have different recall limits from private drafts.

The first four are product refinements for review. Provider access, shared quotas and retention behavior are acceptance concerns that the technical plan must resolve.

## #119: teach the first useful outcomes

The initial set is Getting started plus three complete task guides:

1. Save and reopen a first cited insight, with clear rights, processing and quote decisions.
2. Find, organize and revisit useful knowledge through the existing Library controls.
3. Connect one selected project, confirm its context and understand a useful/no-fit/already-implemented result.

The coding/action guide and broader troubleshooting remain scoped follow-up work. Each initial guide still includes its own failure/recovery steps. New Reddit/GitHub intake is documented after its acceptance; the first guides can ship using current media/text behavior.

I recommend one stable Help entry plus contextual links and error-specific anchors. [W3C's consistent-help guidance](https://www.w3.org/WAI/WCAG22/Understanding/consistent-help.html) supports keeping repeated help mechanisms in a predictable relative location. The steps must remain usable without images, and opening help must preserve an unfinished capture or context form.

Use the existing Markdown renderer, reviewed screenshots and a single article manifest for publication status, dependencies and assets. Defer a bespoke diff checker, AI help chatbot and new analytics. A lightweight review process is enough to begin. The screenshots should come from an actual synthetic test workspace; a mockup must be labeled as an illustration.

The human acceptance question is more useful than a page-count target: can someone find the guide, complete the task, explain whether the source is merely saved or actually analyzed, and recover from the documented blocked state?

## #5: finish the gaps without rebuilding the local adapter

The local protocol utility and narrow owner processing routes already exist. The first work item is to identify which requirements are implemented, which have fixture tests, which have real acceptance evidence, and which remain gated. The original issue predates much of this work.

The OpenAI interest form was submitted and its received-submission page verified. Commercial approval remains pending. No new application or follow-up message is proposed here.

I recommend auditing whether the UI and dispatch already share an authoritative capability resolver. If they do not, consolidate duplicated decisions. A connection can have identity, granted plan permission and a valid local profile while its deployment or device is unavailable. Show the actual reason and recovery instead of a misleading connected badge.

Task confirmation should explain each stage's selected runtime and funding, including any separately quoted compute/transcription costs. A failed own-plan request must not silently choose paid API usage. Use a small fixed task set to evaluate future model/effort changes instead of treating more reasoning as automatically better.

Keep local inference acceptance separate from SIWC-funded coding. Coding adds isolation, credentials, durable thread renewal and worker-lease requirements. Implement that conditional work only after its prerequisites are met. Hosted commercial activation also needs the permitted workload/deployment evidence and real tests; the form receipt does not satisfy those requirements.

## Proposed order and discussion points

The owner now prioritizes the first external testers as soon as one polished journey is ready. Start with the guide journey audit and funding acceptance inventory, alongside the broader intake/setup and design review. The first cohort is founders and developers with active projects; either a verified local route or explicitly selected cloud processing is acceptable. Test a three-year founding pass after the pilot supplies cost evidence.

Investigate Reddit access early, but keep #118's new adapters independent of the existing-source pilot. After review, build its common evidence contract and both adapters as a separate combined feature. Finish only the proven #5 gaps that are eligible. Prepare #119's first guides against verified current behavior and update them when new source workflows are accepted.

The main decisions to discuss are whether to pursue Reddit commercial access now, whether the default GitHub file preset fits how you want to save repositories, and whether three complete guides are the right first release. My recommendation is to pursue the access question early, use the editable preset, and finish three useful guides before broadening the help library.

### Draft wording for a possible Reddit inquiry

This is an unsent discussion draft, not authorization to contact Reddit or agree to fees.

> VibeScroll is a commercial web application for a private cited knowledge library and optional relevance evaluation against user-selected software projects. We would like permission to retrieve individual public Reddit posts and a bounded sample of comments only when a user explicitly saves the thread. We propose read-only access, no posting or messaging, no bulk subreddit collection and no model training. Selected text would be processed by a user-approved AI provider to produce private summaries and cited ideas. Please confirm the permitted API route and whether this processing, private storage and optional user-directed exports are allowed, along with attribution, deletion, retention and commercial pricing requirements. We can provide projected volumes and a detailed data-flow diagram for review.

No Reddit request was submitted, no fee commitment was made, and no application implementation was started during this review.
