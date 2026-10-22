# Plan for #119: illustrated task-based user guides

Status: draft for owner review. [Original issue](https://github.com/StefanDG1/vibescroll/issues/119). Baseline and common checks are in the [review index](README.md).

## Outcome and initial scope

A new user can find a guide from the screen where they need help and complete a useful task on a phone. Start with three complete guides: first useful insight, organizing/revisiting the library, and connecting one project to evaluate an idea. Add a short Getting started page. Keep the action/coding journey and broader troubleshooting as scoped follow-up articles, while including recovery steps in every initial guide.

Owner decision, October 22: public `/help` articles with contextual authenticated-app links. The public articles contain only synthetic examples and reviewed screenshots. Source and repository evidence links continue to require their existing access checks. Q119 is resolved in the review index.

## Existing behavior to build on

`docs/HOSTED-TUTORIAL.md` already describes the first-source sequence. `docs/CAPABILITIES.md` records gated features and October 20 assistant intake changes. `apps/starter/app/[slug]/page.tsx` renders a short public `/docs` page, rather than serving the repository Markdown guides. `apps/starter/proxy.ts` scopes authentication to listed private routes; a new public help route should not require widening or bypassing private access.

`apps/starter/components/console.tsx` owns capture, source evidence and several related flows; it already has one generic `/docs` runner-setup link. `apps/starter/components/account-menu.tsx` and `apps/starter/components/site.tsx` are discovery/link integration candidates. The source/Library/project routes exist under `apps/starter/app/app/[org]`. Inspect each actual component and its role-dependent controls before assigning exact link locations.

The initial guides should describe currently available video/upload/text workflows. #118's GitHub/Reddit intake is a later article update after acceptance, not an implied feature of this documentation release. #5's commercial subscription path remains gated unless independently verified.

## Proposed refinements from the review

These are recommendations for discussion, not added owner commitments.

- Keep one consistently located Help entry across app pages, with extra task-specific links near the relevant controls. This follows the direction of [W3C's consistent-help guidance](https://www.w3.org/WAI/WCAG22/Understanding/consistent-help.html). A contextual link supplements the stable entry point.
- Teach one small outcome in each initial guide. A learner should be able to save and reopen a cited insight, find and correct its filing, or explain a project-fit result. Keep advanced coding setup out of the first task.
- Map common safe error codes to specific article anchors, so an offline-device message opens the exact recovery steps. Passing this help context must not put private titles, source IDs, tokens or user text into public URLs. Confirm mappings against actual emitted errors before adding links.
- Make every required step readable without images. Screenshots illustrate actual labels and positions; they are not the only place an instruction or cost decision appears. Test narrow mobile reading and image loading failure.
- Preserve unsaved input when a user opens help and returns. Include that round trip in the capture/context walkthrough.

Use one help manifest for routing, review status, assets and component dependencies. The original draft proposed an additional dependency file and a custom diff-check script; for this first batch that duplicates information and adds maintenance work. Start with a manifest and an explicit affected-article review in the existing contribution process. Automate diff reporting later only if manual reviews demonstrate a need. No AI help chatbot, external search provider or new analytics system is necessary for this issue.

## 119-A: audit and draft the articles

1. Read all four foundational documents and their copy-review process before authoring user-facing text. Read the current tutorial, capabilities, personal-video/assistant runner setup and release evidence. Record contradictions as draft corrections; do not rewrite dated evidence to match desired behavior.
2. Build a compact inventory per journey: exact route, owning components, user role, available processing modes, actual labels, prerequisite permissions, quote/funding decision, success state and recovery. Verify labels against source and a test-workspace walkthrough. A source read alone cannot establish live availability.
3. Create proposed `docs/help/getting-started.md`, `first-useful-insight.md`, `organize-your-library.md` and `evaluate-an-idea-for-a-project.md`. Each guide has one task, prerequisites, numbered steps, two or three useful images, a visible success criterion, recovery, and one practical tip. Prefer fewer images when they add no information.
4. First insight covers a permitted capture, explicit source-rights and route/quote review, waiting/offline state, opening completed evidence and finding it again. Distinguish saved metadata, completed extraction and verified truth. Explain when a paired laptop is needed and which actions do not start inference. Verify costs against the actual current route rather than promising free processing.
5. Library covers current search, Topics, Tree/Folders, pins/exclusions and duplicate handling. Use current visible product terms. Show returning to the exact source evidence and correcting organization without implying that inactivity supplies feedback.
6. Project evaluation covers GitHub connection, selected destination repository, confirmed context/pinned snapshot, explicit idea evaluation and distinct fit outcomes. Stop at an inspected result/private draft. Provide a clear link explaining that coding, publication, merge and measured benefit are separate decisions.
7. Add a follow-up backlog for insight-to-action and troubleshooting. The former requires verified plan edit/export, funding ceiling, isolated checks, patch review and draft-PR steps. The latter covers blocked links, incomplete coverage, expired permissions, offline devices, credits, export/deletion and assistant grant revocation. Include prerequisites and acceptance now, but do not advertise unwritten articles as complete.

## 119-B: render help and add contextual discovery

Proposed new files are `apps/starter/app/help/page.tsx`, `apps/starter/app/help/[slug]/page.tsx`, `apps/starter/lib/help-content.ts`, `docs/help/manifest.json` and a small help-link component if existing link styling cannot serve it. Keep Markdown as the single article source and use the already installed `react-markdown`/`remark-gfm` stack. Do not add a CMS, external help vendor, arbitrary filesystem route reader or runtime MDX execution for four articles.

1. Use a build-time allowlisted manifest of article slugs, titles, summaries, source files, related guides, draft/review status, verified commit and reviewed image paths. Only approved articles render on public routes; draft preview stays local or behind existing authenticated preview controls. Unknown slugs return 404. Verify tracing/bundling includes the chosen Markdown files in the deployed build.
2. Render accessible headings, ordered steps, captions, alt text, clear links and responsive images. Disable raw HTML and sanitize/allowlist URL schemes. External links must not carry tokens or private source references. Keep help reading free of provider/model calls and new polling.
3. Link `/docs` to Getting started rather than maintaining a second long copy of the same steps. Preserve useful setup/operator links and current incoming links. Update `docs/README.md` and `docs/HOSTED-TUTORIAL.md` with intentional cross-links or a short canonical-content explanation after reviewing their current edits.
4. Add a visible Help entry in the existing account/navigation system. Add focused links near capture and source evidence, Library options, and repository/context/evaluation controls. Keep mobile five-action navigation intact; a small contextual link is enough.
5. Preserve current locale/theme, keyboard focus, reduced-motion and 320-pixel layout behavior. Keep the owner-selected help routes public while retaining current tenancy/authentication for private app and evidence routes.

Before implementing Next.js routes, read the installed Next.js documentation required by `apps/starter/AGENTS.md`. This plan does not assume legacy routing or data-loading conventions.

## Images and the authoring workflow

Use test-workspace captures with synthetic data as the default. Capture the actual candidate version at mobile and desktop widths, crop only to clarify the relevant control, and retain accessible captions. Proposed approved assets live in `apps/starter/public/help/`; drafts/evidence remain outside public assets until reviewed. A public-directory image is published even if its article is hidden, so keep unapproved files out of it.

Maintain an asset manifest with article/step, viewport, route, role, capture commit, synthetic workspace marker and review status. Inspect every image for tokens, private source text, repository details and browser/account chrome. Label any rendered example as an illustration; it cannot stand in for a live acceptance screenshot.

The [WTFM README](https://github.com/SupportPages-io/wtfm/blob/main/README.md), read October 22, describes template-based mockups and unattended project analysis using bypass flags. Recommend an in-house source audit and browser captures for this first batch. Installing or running WTFM is not a dependency. If trialed later, pin/review code, hooks, telemetry, downloads and permission flags first, in a disposable synthetic checkout with normal controls retained. No installer or analysis command was run in this planning task.

## Keep guides current

Add article dependencies to the proposed `docs/help/manifest.json`, alongside routing/review metadata. Map article IDs to routes, components, contracts, capability records and assets. A reviewer inspects affected entries for a change and records updated, unaffected-with-reason or reverified status. Defer a custom diff-check tool until a recurring maintenance problem justifies it. Do not auto-rewrite or auto-publish an article on merge.

For example, capture/source changes flag first insight; knowledge navigation changes flag Library; profile/repository-selection changes flag project evaluation; funding/eligibility changes flag every guide that describes costs. Record `lastVerifiedCommit` and verification mode, not only a calendar date. Validate that manifest entries reference actual content/assets and do not expose drafts. Avoid tests that merely assert prose wording.

## Acceptance and validation

| Requirement                    | Evidence required                                                                                                                                                            |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Three complete journeys        | Each has prerequisites, current steps, images, success and recovery; contextual app links resolve.                                                                           |
| Getting started discovery      | A signed-out visitor finds the index, and a signed-in mobile user can open relevant help from capture/Library/projects.                                                      |
| Accurate permissions and costs | Owner/admin and limited-role walkthroughs show only permitted controls; unsupported routes are clearly gated. No credit-consuming action runs without its existing approval. |
| Beginner usability             | A consenting beginner finds and completes first-source on a synthetic test workspace without the developer README. Record assistance, wrong turns and completion honestly.   |
| Accessibility and layout       | 320/390/1440 widths, keyboard/focus, readable image text, alt text, headings and links pass.                                                                                 |
| Maintenance                    | The manifest identifies articles affected by a sample component change, and the reviewer records the disposition; unrelated changes do not require blanket rewrites.         |

Run changed-file formatting and link/asset/manifest checks, route rendering tests and the shared repository checks. Add only targeted tests for new renderer/slug handling, draft exclusion and manifest references. Include a stable Help entry, help-and-return preservation, missing-image reading and the distinction between saved versus analyzed in the walkthrough. A human walkthrough cannot be replaced with a snapshot test. If a beginner is unavailable, keep that acceptance item explicitly pending and identify the needed participant.

## Release and rollback

First deliver local review artifacts and a help preview. After human verification, include only approved articles/assets in the public build. Publication/deployment remains a separate explicit action. No help-host purchase or external code upload is needed.

Rollback removes new contextual links and public article exposure while preserving reviewed source and image manifests. Existing `/docs`, authentication and app workflows continue to work. If an article becomes stale, hide or visibly mark that article and route users to current recovery instructions until reverified.

The help location is confirmed. A beginner and appropriately permissioned test workspace are required for final acceptance; recruiting or messaging anyone needs a separate instruction. Choose the image count from actual task clarity rather than treating three as a quota.
