# App design review · November 15, 2026

The review uses the private local snapshot of 236 saved posts and retained evidence. Captures use Chrome at 390 × 844 and 1440 × 960. Scores are reviewer judgments on the [owner's 0–10 scale](HOME-UI-SCORECARD.md), where 0 is unusable, 5 is average and usable, and 10 is perfect. An average of 8 would still miss the requirement if any category is below 8.

## Home recommendation

Keep **Browse** as the default. The primary task is finding something useful in a saved post, checking its evidence and deciding which project it belongs in. Browse exposes the insights by scrolling and gives them an adjacent desktop column. Full-screen works for watching a sequence of short videos, with a sheet for insights and project work. Like or pass is for quick triage, where the user makes one decision per post and can undo it.

The post title and media appear once. Available insight cards use their own retained frames. A text-backed claim shows a transcript cue when it has no linked frame. Project selection labels recommended projects and keeps other connected projects available in the same section. Known project icons use their marks and the remaining projects use initials. The desktop rail keeps the VibeScroll icon.

## Iterations

| Pass | Changes and what the captures showed | Browse | Like or pass | Full-screen |
| --- | --- | ---: | ---: | ---: |
| Nov 14 baseline | Removed the redundant Home actions and introduced compact project selection. Large media and weak transitions dominated the screenshots. | 6.2 | 5.8 | 5.5 |
| 1 | Added the desktop Browse split, moved insight previews up on phones, and simplified Posts, Projects and proposal lists. Poster cropping cut off meaningful text on mobile, and Full-screen still spent most of the desktop viewport on media. | 7.2 | 6.4 | 5.9 |
| 2 | Restored the full poster, added the native details sheet and shortened the desktop media layout. Local Tasks and Connections pages started rendering. Narrow Activity filters still wrapped midword. | 7.3 | 6.6 | 7.1 |
| 3 | Fixed the filters, added a swipe-dismissable sheet header, improved the feed's small-screen spacing, and linked proposal list actions to their canonical pages. Verified keyboard Pass and touch swipes with actual browser input events. | 7.6 | 7.1 | 7.3 |
| 4 | Made expanded evidence scroll into view when necessary, echoed the Browse composition on desktop post pages, fixed light theme focus and organized the account subpages. | 7.8 | 7.3 | 7.5 |

## Final Home ratings

| Criterion | Browse | Like or pass | Full-screen | What the final pass showed |
| --- | ---: | ---: | ---: | --- |
| Spacing and rhythm | 8 | 7 | 8 | Browse fits the first insight titles in a phone viewport. Triage still has a tall vertical journey if the user wants to read every detail. |
| Alignment and proportions | 8 | 7 | 7 | Browse aligns the media and evidence columns. Portrait media still leaves margins in the other desktop layouts. |
| Typography | 8 | 7 | 7 | Browse has distinct title, section and metadata text. The Full-screen media overlay truncates longer copy. |
| Visual hierarchy | 8 | 7 | 8 | Browse puts the post and its evidence first. In triage the decisions still share a visual plane with topic chips and summary copy. |
| Grouping and order | 8 | 8 | 8 | Source, insights, projects and proposals follow consistently. The direct reader adds evidence and settings farther down. |
| Icon clarity and affordances | 8 | 8 | 7 | Heart and X are distinct. Full-screen's discussion-style icon is recognizable, but gives little indication that it contains project work. |
| Gesture and scroll behavior | 8 | 8 | 8 | Browse right swipe, triage left swipe, Full-screen down-scroll and sheet open and dismiss worked in Chromium. |
| Motion and feedback | 8 | 7 | 8 | Insight reveal follows the selected card and the sheet enters from below. Like or pass offers Undo, with only a short transition between cards. |
| Phone ergonomics | 8 | 7 | 8 | Bottom controls are compact and the project picker can be reached in the feed. Undo is in the upper mode bar in triage. |
| Desktop ergonomics | 8 | 7 | 7 | Browse uses both columns and keeps the evidence in view. Full-screen leaves less evidence visible during browsing. |
| Accessibility and recovery | 7 | 8 | 8 | Keyboard Pass returned focus to the next title. The sheet has a named close control and Escape. Browse has visible focus and named cards, with screen-reader behavior still to assess. |
| Loading and content variation | 7 | 7 | 6 | Real ready posts, transcript-only evidence, missing media and empty proposals were visible. Slow or intermittent media and the full write and recovery matrix are still to verify. |
| **Average** | **7.8** | **7.3** | **7.5** | Browse leads. Each design still has criteria below 8. |

## Signed-in screen review

These are overall screen judgments. The first number refers to the opening pass where a comparable screen was available. The final number applies to the rendered state tested here. The [route and loading ledger](APP-SCREEN-AND-LOADING-LEDGER.md) covers the broader site inventory, expected states and aliases.

| Screen | Opening | Final | Observed and still needed |
| --- | ---: | ---: | --- |
| Posts | 5 | 8 | Compact thumbnails, search, filters and sort fit both viewports. The first page includes ready and needs-upload posts. |
| Exact post | 6 | 8 | One source card, a frame rail, and project actions. The desktop two-column reader makes the previous long header less costly. |
| Projects | 5 | 7 | Project icons and attached proposals are easy to scan. Older project entries still use initials and cards with many proposals dominate the list. |
| Proposal list and detail | 5 | 7 | Rows show status and a bounded summary. Exact links open the saved proposal on both widths. Discussion, authorizations and recovery need a dedicated pass. |
| Tasks | 0 | 6 | The local render crash is resolved. Older runs can still have only the generic task title and partial execution details. |
| Activity | 5 | 7 | Tabs stay on one line and the dates render consistently. The snapshot contains repeated system notices that remain hard to scan. |
| Account | 6 | 7 | Profile, appearance and workspace links have a consistent structure. Manage profile still opens its existing account flow. |
| Connections | 0 | 6 | The local crash is resolved and setup availability is explicit. Live authorization, disconnect and reconnect remain unverified. |
| Usage and privacy | — | 6 | The forms and support links render inside the signed-in shell. Production account data and mutations are outside this snapshot. |
| Computers, Shared knowledge and Improvements | — | 6 | The captured routes render on both widths. Populated computer, shared-grant and outcome states still need review. |
| Knowledge and Trends | — | — | The snapshot lacks live topic organization and engagement history. The local screens disclose that and link back to Posts. |
| Workspace settings, Team and Billing | — | — | Shared subpage layout and read-only local states are present. Live plan, roles and team data are needed for rating. |
| Launch checks and new project | — | — | The routes have captured first states. Access and submit branches need a separate test environment. |

Public pages, onboarding, external authorization and billing handoffs, and the remaining signed-in routes in the ledger are outside the scored captures. No physical-device or screen-reader run is included.

## Evidence and review

The local screenshot set is under `outputs/app-review-2026-11-15/` in this checkout. Files prefixed `before-`, `pass1-`, `pass2-`, `pass3-`, and `final-` preserve the passes. The final capture includes first views and expanded insights, project picker, proposal composer, and Full-screen sheet states on both widths.

The final input checks opened an insight, revealed the other projects, opened the proposal composer from Home, passed and undid a post, dismissed the details sheet with Escape, scrolled to the next post, and opened exact posts and proposals. Dedicated touch checks passed for Browse's right swipe, Like or pass's left swipe, and opening and closing the Full-screen sheet. At 320 pixels, Browse, Posts and Activity fit in light theme with reduced motion enabled. Lint, starter type checking, and 192 focused tests passed. The redesign is a local checkout review.

The saved design-rules post informed type hierarchy, spacing and accent use. The six UX laws post informed the compact project choice set, thumb targets and clear feedback. The Nessie motion post informed short motion, skeletons and reduced-motion behavior. [Typography and spacing](https://scroll.companynerve.com/app/nn7d15ckc9p6xsx0z7sd09w7298fey3s/posts/px7f0mh8dnp0aypn0acgf6j6js8g21g3) · [UX laws](https://scroll.companynerve.com/app/nn7d15ckc9p6xsx0z7sd09w7298fey3s/posts/px78c2ccrch73zbv55trnf69rd8ff9ch) · [Motion](https://scroll.companynerve.com/app/nn7d15ckc9p6xsx0z7sd09w7298fey3s/posts/px76mwh8n60et1ghnz2ngm9zx98g3kg0)
