# Issue implementation plans for review

The owner accepted the launch direction and requested the [complete implementation plan](../../launch-plan/2026-10-22/README.md). Its unattended contract adds a shared US$2 Convex ceiling and beginning permission/login preflight. The issue-specific acceptance below remains intact. No application implementation starts in this documentation update.

Status: draft, with owner decisions incorporated October 22, 2026. Technical plans remain available for review.

Start with the [plain-language review and proposed improvements](REVIEW.md), then open each full technical plan below. The review rechecked all three currently open issues and adds primary-source findings about Reddit access, GitHub shared quotas and consistent Help placement. New product ideas remain proposals, not recorded owner decisions.

These plans cover all three open issues returned by the connected GitHub issue search for `StefanDG1/vibescroll`. The same search without an open-state filter returned the same three issues. All three comment threads were empty when inspected. Issue descriptions are requirements and historical research, not proof that their features work.

The source baseline is local `main` at `a6b3bbf655fb50b951c8cab771217de345c9e285`, dated October 20. This review inspected local source and dated implementation records; it did not verify that remote main or the deployed application matches that commit. Recheck the baseline before implementation. Existing edits in foundational research and the documentation index belong to earlier work and are outside this package.

## Review order

| Order | Issue and plan                                                          | Recommendation                                                                                                     | Main uncertainty                                                                    |
| ----- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| 1     | [#119: illustrated task guides](119-task-based-user-guides.md)          | Support the first polished source, Library and project journeys with public `/help` and contextual links.          | Beginner acceptance and verified current processing behavior.                       |
| 2     | [#5: ChatGPT-plan funding](005-chatgpt-plan-funding.md)                 | Inventory existing capabilities and finish eligible local/customer acceptance gaps without rebuilding the adapter. | Commercial approval remains separate from the submitted application.                |
| 3     | [#118: cited Reddit and GitHub sources](118-cited-non-media-sources.md) | Investigate permission early; release both direct adapters together after acceptance.                              | Reddit permitted access gates this combined feature, not the existing-source pilot. |

The owner now prioritizes external testers as soon as one polished core journey is ready, starting with founders and developers who have active projects. The pilot may use either a verified local route or explicitly chosen cloud processing. Evaluate a three-year founding pass after the pilot supplies usage and support costs. These are planning choices, not implementation authority.

Begin #119's journey/content audit and #5's funding acceptance inventory together. Investigate #118's Reddit access early, but do not make the new adapters a prerequisite for the existing-source pilot. Implement both direct adapters before exposing that combined feature and document them after acceptance. #119's initial video/text guides do not require #118 or commercial subscription funding; their steps must match whichever processing route is actually verified.

Recommended reviewable change sets are 118-A contracts and URL classification, 118-B GitHub acquisition and analysis, 118-C direct Reddit acquisition and supplied-text recovery; 119-A draft articles, 119-B help routes and links, 119-C walkthrough evidence; 5-A application/acceptance inventory, 5-B missing local integration, 5-C conditional coding integration. Run 118-C's provider-access spike first, and release 118-B/118-C together. Each change set has a useful review boundary. The issue remains open until its full acceptance criteria are satisfied or the owner explicitly changes its scope.

## Owner decisions and remaining application details

1. **Q118 resolved:** ship both direct adapters together. Supplied text is recovery, not a substitute for a working direct Reddit integration.
2. **Q119 resolved:** public `/help` pages with in-app links. Private evidence remains authenticated.
3. **Q5 follow-up completed:** after the earlier mailbox search found no commercial receipt, the owner confirmed the application contact and enabled browser access. The official interest form was submitted once on October 22 at 00:28:29 UTC, 02:28:29 Europe/Berlin. The page confirmed receipt; no reference ID was displayed. Contact details, submitted answers and the confirmation receipt/screenshot are stored privately outside this repository. Provider approval remains pending.

The first two decisions were explicitly supplied in chat on October 22. Provider eligibility is still unverified. Application submission and approval are separate facts. Implementation-specific unknowns and how to resolve them appear in each plan.

## Review and execution boundary

Review the outcome, sequence, acceptance and questions in each plan. Approval of a plan is separate from permission to run paid processing, publish guides, execute coding jobs or deploy. The follow-up also completed the owner-authorized OpenAI interest-form submission. No application implementation, issue mutation, plugin installation, authenticated inference or product publication was performed.

Before implementation, read the current repository instructions and relevant subsystem documents again if they changed. Use Node 24 and pinned pnpm 12.3.4. The observed root commands include `pnpm validate`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`; `pnpm check` combines them. Format only changed files, then check their formatting. Do not run a repository-wide formatter over unrelated work.

Each implementation records command, exact commit, environment, timestamp and result in `docs/implementation-status.md`. Fixture success, authenticated staging, human usability and production acceptance remain separate. Before a PR, satisfy the repository's formatting, dependency, secret-scanning and relevant integration/browser requirements as well as `pnpm check`. Use the existing check mechanism after inspecting it; do not invent unavailable script names.

## Initial issue research verification

Completed in this task: issue discovery, comment reads, source inspection, comparison with existing capability/implementation records, official OpenAI and GitHub documentation reads, and a read of the external WTFM README. No application test suite or live user journey was run because these files are implementation proposals.

These verification statements describe the earlier issue-specific research. The later launch-planning review includes separate private library analysis and sampled visual inspection; its source corpus and detailed evidence remain outside this public documentation package.

The initial Browser Harness attempt reached Chrome's remote-debugging consent prompt and was cancelled. Official documentation was retrieved through the read-only web tool instead. In the follow-up, the owner enabled browser access, the official application form was filled and submitted, and the received-submission screen was verified and captured. No VibeScroll product walkthrough is claimed.
