# VibeScroll website redesign review

R173–R174 · November 13, 2026 · Local implementation checkpoint

The [screen and loading ledger](APP-SCREEN-AND-LOADING-LEDGER.md) covers the planned site. This checkpoint implements the signed-in core and provides [a browser comparison](../../outputs/redesign-review-2026-11-13/index.html) using synthetic fixtures. The deployed version is tracked in [current state](../operations/CURRENT-STATE.md).

The [November 14 Home scorecard](HOME-UI-SCORECARD.md) supersedes the ratings below and records the newer controls and project picker.

## Home comparison

The three modes share the feed, post header, insight rail, projects, proposal composer, and full post link. Browse is the temporary fallback when no mode is specified. The candidate accepts the comparison links `?mode=review`, `?mode=browse`, and `?mode=snap`. The permanent default is open for review.

Scores are design judgments from browser review at 390 × 844 and 1440 × 960. Each category is equally weighted. A 10 means the primary task is clear, short, and recoverable in that category. A 5 means the task remains possible with meaningful friction.

| Mode | Discoverability | Reading and evidence | Phone interaction | Desktop interaction | Recovery and control | Average |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Like or pass | 8 | 8 | 8 | 7 | 9 | 8.0 |
| Browse | 9 | 9 | 8 | 9 | 8 | 8.6 |
| Full-screen | 8 | 8 | 9 | 7 | 8 | 8.0 |

- **Like or pass** gives triage a clear decision and Undo. Once readers scroll into evidence and projects, the decision controls sit above the reader.
- **Browse** gives Insights and Projects their own entry points while leaving the next post visible. Desktop puts media beside its title and actions. It scores highest for finding a post and drafting from it.
- **Full-screen** is strongest when media leads. The same poster shrinks above the details and returns on close. Desktop gives media more space and shows less of the next post.

## Design decisions

- Saved Arc UI and Nessie posts informed the visible controls, scoped skeletons, and 220 ms media transition. Space UI and Componentry informed the decision to reserve the largest movement for opening the full-screen details.
- Reuse the existing focus-managed dialog for settings and the proposal composer. The Home details sheet stays inside the post so the current media remains visible. The insight rail and full-screen pages use native scroll snap. Review and Browse use directional pointer handling with visible button equivalents. [Radix Dialog](https://www.radix-ui.com/primitives/docs/components/dialog) · [Vaul](https://github.com/emilkowalski/vaul) · [Embla](https://www.embla-carousel.com/) · [CSS scroll snap](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_scroll_snap)
- Keep evidence bound to a retained frame cited by the exact insight. The Cindy Zhu post demonstrated why one generic poster cannot identify individual ideas. The rail displays text or transcript treatment when a cited frame is unavailable. Resources show usable HTTPS links from citation data.
- Retain the ranked Posts search and workspace access checks. Workspace switching is reachable through Account. Cold entry uses a neutral skeleton. The existing workspace resolver and dedicated management or recovery page still run where required.

## Implemented scope and verification

| Area | Candidate behavior | Verification |
| --- | --- | --- |
| Home | Three modes, one post header, expandable insight cards, project choices, recommendations, proposal draft entry, full post link | Browser on phone and desktop with synthetic data. Real signed-in feed and proposal saves need staging. |
| Posts | Search, category, analysis state, sorting, URL filters and no-results state. Knowledge and Trends remain reachable. | Browser geometry on both sizes. Auth suite exercises bounded data reads. |
| Full post | Single source header, shared insight rail, projects, proposals, source evidence and settings at the end | Browser screenshots and existing evidence, access and progress regressions. |
| Work and Activity | Projects, Proposals, Tasks and Activity. Activity exposes stored notifications, proposals to review and current integration status. | Both viewport sizes. Durable proposal and integration event notifications remain open. |
| Account and shell | Compact mobile dock, desktop rail with the existing VibeScroll icon, identity, appearance controls and workspace management links | Both viewport sizes and navigation tests. |
| Remaining routes | Public, onboarding, billing, support, sharing, administration and standalone screens | Listed in the [screen ledger](APP-SCREEN-AND-LOADING-LEDGER.md). Individual redesign and verification remain open. |

The review uses the existing synthetic walkthrough and four WebP stills extracted from it. The browser review uses Chrome emulation. The screenshots do not establish physical-device, signed-in staging, or production acceptance.
