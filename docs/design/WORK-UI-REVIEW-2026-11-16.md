# Work UI review · November 16, 2026

This review uses the private saved workspace snapshot and the [Home scorecard’s 0–10 rubric](HOME-UI-SCORECARD.md). It covers eight Work screens. Scores describe the rendered states exercised in Chromium at 1440 × 960 dark, 390 × 844 dark, and 320 × 740 light with reduced motion. Public pages and other signed-in areas have their own reviews.

## Changes between passes

| Screen | November 15 | Pass 1 | Pass 2 | Pass 3 | Pass 4 | Final |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Projects | 7 | 7.7 | 8.0 | 8.1 | 8.17 | **8.33** |
| Project detail | — | 7.7 | 7.8 | 8.0 | 8.08 | **8.25** |
| New project | — | 7.5 | 7.5 | 7.6 | 8.00 | **8.33** |
| Proposals | 7 | 8.0 | 8.1 | 8.2 | 8.25 | **8.25** |
| Proposal detail | 7 | 6.8 | 7.9 | 8.0 | 8.17 | **8.17** |
| Tasks | 6 | 7.5 | 7.8 | 7.9 | 8.08 | **8.08** |
| Activity | 7 | 7.9 | 7.9 | 8.0 | 8.08 | **8.25** |
| Improvements | 6 | 7.5 | 7.7 | 7.9 | 8.00 | **8.25** |

- Pass 1 grouped real repository, proposal, and activity records. Desktop lists became easier to scan. A proposal copy block overflowed its reader card, and Task cards still needed a tighter spacing scale.
- Pass 2 gave proposals native page scrolling and condensed Tasks. At narrow widths the Work tabs still clipped the last label when the unread indicator appeared.
- Pass 3 shortened the mobile Work label, added record-shaped loading, and restored focus after clearing filters. The first project save exposed a local server-action redirect that went through the dev bind address to the setup page.
- Pass 4 fitted Work navigation within 320 pixels and exercised project creation, editing, and deletion in their existing forms. The local development gate permits both the public loopback URL and the exact server-action bind address.
- The final pass gave the new project form field limits and action-specific progress. It opens the saved project directly. Repository context now reads as a document when editing is unavailable, with commit, version, and evidence in reach. A repository settings link opens only its matching context. Activity uses the original post titles when it has them, and Improvements can filter confirmed outcomes by merged or reverted. Work links use their text, row targets, or focus cues in place of chevrons.

## Final category ratings

| Criterion | Projects | Project detail | New project | Proposals | Proposal detail | Tasks | Activity | Improvements |
| --- | ---:|---:|---:|---:|---:|---:|---:|---: |
| Spacing and rhythm | 8 | 8 | 8 | 8 | 8 | 8 | 8 | 8 |
| Alignment and proportions | 8 | 8 | 8 | 8 | 8 | 8 | 8 | 8 |
| Typography | 8 | 8 | 8 | 8 | 9 | 8 | 8 | 8 |
| Visual hierarchy | 8 | 9 | 9 | 9 | 9 | 8 | 9 | 9 |
| Grouping and order | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 9 |
| Icon clarity and affordances | 8 | 8 | 8 | 8 | 8 | 8 | 9 | 9 |
| Gesture and scroll behavior | 8 | 8 | 8 | 8 | 8 | 8 | 8 | 8 |
| Motion and feedback | 8 | 8 | 9 | 8 | 8 | 8 | 8 | 9 |
| Phone ergonomics | 8 | 8 | 8 | 8 | 8 | 8 | 9 | 8 |
| Desktop ergonomics | 9 | 8 | 8 | 9 | 8 | 8 | 8 | 8 |
| Accessibility and recovery | 9 | 8 | 9 | 8 | 8 | 8 | 7 | 8 |
| Loading and content variation | 9 | 9 | 8 | 8 | 7 | 8 | 8 | 7 |
| **Average** | **8.33** | **8.25** | **8.33** | **8.25** | **8.17** | **8.08** | **8.25** | **8.25** |

## Reviewed routes and states

| Screen | Route | Screenshot evidence |
| --- | --- | --- |
| Projects | `/app/[org]/projects` | Selected repository names and icons, reviewed context, proposal counts and disclosure, connections entry and New project |
| Project detail | `/app/[org]/projects/[id]` | Exact authorized repository, branch, proposal links, reviewed context, management link and editable manual project |
| New project | `/app/[org]/projects/new` | Named and optional fields at all three sizes, invalid name validation, visible submit progress and exact saved-project route |
| Proposals | `/app/[org]/proposals` | Search, clear, unreviewed filter and counts, actual project name and exact proposal link. `/app/[org]/plans` uses the same view. |
| Proposal detail | `/app/[org]/proposals/[id]` | Shared reader for current plans and older assessments, source and project links, one scroll area, acceptance checks when present and an accurate timeline |
| Tasks | `/app/[org]/runs` | Real draft, canceled, merged, closed, and reverted states, execution detail disclosure, no active tasks view |
| Activity | `/app/[org]/inbox` | Daily groups, original saved-post titles, repeated updates counted together, unread and review filters, GitHub connection state |
| Improvements | `/app/[org]/improvements` | Merged and reverted filters with original PR and reversal links. Live planning and feedback use in-place refresh and error recovery. |

Activity scores 7 for accessibility and recovery because unread state has no mark-as-read action. Thirteen of the 23 distinct post references in the saved activity data have title metadata in the existing snapshot. The inbox uses a generic link when no title is available. Proposal detail and Improvements score 7 for loading and content variation. The private snapshot includes real plan text and observed GitHub outcomes. Live plan discussion, issue publication, and provider-backed improvement actions need an environment with those services before they can be rated.

## Verification

- Keyboard filters and disclosures worked across the three sizes. Clearing proposal filters returned focus to search. Phone swipes scrolled the proposal page itself.
- The Work shell stayed visible during a throttled Tasks read, then displayed its records. An offline Proposals read showed Retry and recovered when the connection was restored.
- The project form rejected an empty name, created one exact local project, reopened it, renamed it, and removed that record. The earlier redirect-test record was also removed by its exact identity. Captured data remained read-only during the form test.
- The refined form also rejected whitespace-only input and incorrect delete confirmation. A real 80-character project name wrapped on the detail page, submitted under simulated latency, and was edited and deleted by its exact identity. A 200-character preview title, including a long uninterrupted identifier, stayed within both proposal layouts. This preview changed only the rendered text.
- Both outcome filters responded to keyboard input. Reverted outcomes linked to the original PR and its distinct reversal record. Repository settings opened the exact linked context and keyboard access exposed its snapshot evidence.
- The Tasks and Improvements requests fetch their workflow data without querying the saved post library. The test suite verifies the scoped data and member access expectations.
- Both proposal formats render through the same reader. The older assessment shows its recorded progress and available evidence before editing. An authorized approved assessment loads its own runs and execution prerequisites, with unrelated runs excluded from its response. The synthetic demo accepted-to-deferred transition also worked. Review and execution forms require their existing permissions. Provider-backed actions were not exercised.
- The snapshot gate accepted `localhost:3192` and `127.0.0.1:3192` only in the explicitly enabled development process. Missing hosts, alternate ports, similarly named hosts, disabled snapshot mode, and production mode were denied.
- Run instructions and private screenshots are in `outputs/app-review-2026-11-16/work` and its parent directory. Files beginning `final-` cover the route matrix. Files beginning `polish-` show input limits and latency, long titles, filtered outcomes, and the opened repository context. Earlier offline, throttled, and edited project states use the `pass3-` prefix. The local captured workspace remains private.

The Work redesign reads the existing workspace and provider records. Changes and verification are local to this checkout.
