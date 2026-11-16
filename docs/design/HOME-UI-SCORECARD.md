# Home UI scorecard

The [November 15 app review](APP-UI-REVIEW-2026-11-15.md) continues this baseline with four screenshot-based passes.

November 14, 2026 · Local production snapshot · 390 × 844 and 1440 × 960

The November 13 scores used five broad categories and synthetic posts. This pass uses the same real posts across all three modes. The scores are my design review and carry equal weight. They apply to Home and its project picker.

The same scale applies to each criterion.

| Score | Meaning |
| ---: | --- |
| **0** | Unusable. The intended task cannot be completed. |
| **1–2** | Barely usable. Completing the task requires major workarounds. |
| **3–4** | Below average. The task is possible with significant friction. |
| **5** | Average and usable. The task works at an ordinary level of quality. |
| **6–7** | Above average. The experience is coherent, with some rough edges. |
| **8–9** | Excellent. The experience is polished, with only minor issues. |
| **10** | Perfect. There is no meaningful improvement to make for this criterion. |

| Criterion | What earns a higher score | Browse | Like or pass | Full-screen |
| --- | --- | ---: | ---: | ---: |
| Spacing and rhythm | Related items sit close together. Section boundaries are distinct and the screen has room to breathe. | 6 | 6 | 5 |
| Alignment and proportions | Media, text, and controls align with the grid and use the viewport well. | 6 | 6 | 5 |
| Typography | Few meaningful sizes and weights, readable line length, and graceful wrapping. | 6 | 6 | 6 |
| Visual hierarchy | The post leads. Actions and status compete only when they deserve attention. | 7 | 6 | 6 |
| Grouping and order | The post, insights, project choices, and proposals follow without repeated controls. | 7 | 6 | 6 |
| Icon clarity and affordances | Familiar symbols communicate a clear action. Tappable areas and the next scroll destination are evident. | 6 | 6 | 5 |
| Gesture and scroll behavior | Movement feels predictable and horizontal gestures work alongside vertical scrolling. | 7 | 6 | 6 |
| Motion and feedback | State changes are visible, proportionate and easy to follow. | 5 | 5 | 5 |
| Phone ergonomics | Reachable controls, readable details, and clear edges when more content is available. | 6 | 6 | 7 |
| Desktop ergonomics | The layout uses horizontal space and supports wheel, trackpad and keyboard. | 7 | 5 | 5 |
| Accessibility and recovery | Accessible control names, visible focus, and a way back from mistakes. | 6 | 6 | 5 |
| Loading and content variation | Delayed media, missing footage, long names and empty sections hold together. | 5 | 5 | 5 |
| **Average** | Straight mean of all 12 scores, rounded to one decimal | **6.2** | **5.8** | **5.5** |

Browse gets the highest score because real posts expose the next section without an extra decision, and the desktop layout keeps the poster and metadata together. Like or pass works for triage. Once the reader scrolls below the post, the decision icons are out of sight and the transition to the next card is abrupt. Full-screen gives the poster priority on phones, but the same composition leaves considerable unused space around portrait media on desktop. The sheet was replaced by a scroll-to-details section. A physical-device test and full keyboard audit are still outside this review.

| Before | After | Why |
| --- | --- | --- |
| Separate buttons for Insights and Projects | Insights and Projects follow the post in all three feeds | The reader can keep scrolling to discover the next section. |
| Text buttons for Like and Pass, visible post and insight arrows, help icon beside the creator | Labeled heart and X controls, native scrolling, and insight cards without arrows | Visible controls are reserved for actions the gesture alone cannot communicate. |
| Project rows repeated in a second list | Compact project grid with one disclosure for the remaining projects | Shorter scan, with each project shown once. Three local brand icons are available and other projects use initials. |

Saved VibeScroll references informed the rubric. The design-rules post suggested restrained type scales and section spacing. The UX-laws posts prompted checks for proximity, a clear priority, and tappable items that look interactive. Nessie's motion breakdown prompted a separate score for state feedback and motion restraint. [Spacing and typography](https://scroll.companynerve.com/app/nn7d15ckc9p6xsx0z7sd09w7298fey3s/posts/px7f0mh8dnp0aypn0acgf6j6js8g21g3) · [Grouping and affordances](https://scroll.companynerve.com/app/nn7d15ckc9p6xsx0z7sd09w7298fey3s/posts/px78c2ccrch73zbv55trnf69rd8ff9ch) · [Motion and loading](https://scroll.companynerve.com/app/nn7d15ckc9p6xsx0z7sd09w7298fey3s/posts/px76mwh8n60et1ghnz2ngm9zx98g3kg0)

The [November 13 review](WEBSITE-REDESIGN-REVIEW.md) records the original version. The November 14 screenshots are in the ignored local directory `outputs/home-refinement-2026-11-14`.
