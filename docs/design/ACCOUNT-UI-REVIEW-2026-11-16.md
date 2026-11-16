# Account UI review · November 16, 2026

Scores use the owner’s scale from the [Home UI scorecard](HOME-UI-SCORECARD.md). A 0 is unusable, 5 is average and usable, and 10 is perfect. Each screen’s average weights all 12 criteria equally. These judgments apply to the rendered states below. The threshold for this pass is 8.0 average per screen.

## Iterations

| Pass | Account | Connections | Billing | What changed in the comparison set |
| --- | ---: | ---: | ---: | --- |
| November 15 | 7.0 | 6.0 | — | Grouped account links and basic read-only states. The baseline did not score Billing. |
| 1 | 7.4 | 7.2 | 7.4 | Shared page shell, role-aware sections, stronger headings, and smaller offer presentation. First-visit consent crowded the phone view and the profile card needed a full-width target. |
| 2 | 8.0 | 7.6 | 7.8 | One profile target, contextual back paths, and separate active-plan controls. The narrow billing and operator forms needed more visual review. |
| 3–4 | 8.2 | 7.9 | 8.0 | Real keyboard input verified route focus and cookies. Added the GitHub split, support paths and neutral availability states. The runtime selector still suggested a choice while setup was unavailable. |
| 5–6 | 8.33 | 8.17 | 8.25 | Populated fixture screenshots exposed the narrow quote checkbox alignment and light Team input color. Both were corrected. Pairing moved into validated, explicitly labeled stages. |
| 7 | **8.33** | **8.25** | **8.25** | Connections uses both columns, shows a plain runtime summary when setup cannot be read, and offers GitHub and credential actions to the roles authorized to use them. |
| 8 | **8.33** | **8.25** | **8.25** | Interactive fixture review improved keyboard focus in pairing and moderation, fit the full fingerprint confirmation on a phone, and added report-specific loading and recovery. Workspace settings gained a desktop split. Audit rows regained second-level timestamps. |

## Final scores

| Screen | Spacing | Alignment | Type | Hierarchy | Grouping | Affordance | Scroll | Feedback | Phone | Desktop | Access | States | Average |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Account | 9 | 8 | 8 | 9 | 9 | 8 | 8 | 8 | 8 | 9 | 8 | 8 | **8.33** |
| Profile | 8 | 8 | 9 | 9 | 9 | 8 | 8 | 8 | 8 | 8 | 8 | 7 | **8.17** |
| Connections | 8 | 9 | 8 | 9 | 9 | 8 | 8 | 8 | 8 | 9 | 8 | 7 | **8.25** |
| Computers | 8 | 8 | 8 | 9 | 9 | 8 | 8 | 8 | 9 | 8 | 9 | 7 | **8.25** |
| Usage | 8 | 8 | 9 | 9 | 9 | 8 | 8 | 8 | 8 | 9 | 8 | 7 | **8.25** |
| Privacy | 8 | 8 | 8 | 9 | 9 | 8 | 8 | 8 | 8 | 8 | 8 | 8 | **8.17** |
| Billing | 8 | 8 | 9 | 9 | 9 | 8 | 8 | 8 | 8 | 9 | 8 | 7 | **8.25** |
| Plan quote | 8 | 8 | 9 | 9 | 9 | 8 | 8 | 8 | 8 | 8 | 8 | 7 | **8.17** |
| Workspace settings | 8 | 8 | 8 | 8 | 9 | 8 | 8 | 8 | 8 | 9 | 8 | 7 | **8.08** |
| Team | 8 | 8 | 8 | 9 | 9 | 8 | 8 | 8 | 8 | 9 | 8 | 7 | **8.17** |
| Audit log | 8 | 8 | 8 | 8 | 9 | 8 | 8 | 8 | 8 | 8 | 8 | 7 | **8.00** |
| Launch checks | 8 | 8 | 8 | 8 | 9 | 8 | 8 | 8 | 8 | 9 | 8 | 7 | **8.08** |
| Workspaces | 8 | 8 | 9 | 9 | 9 | 8 | 8 | 8 | 8 | 9 | 8 | 8 | **8.33** |
| Invoice reporting | 8 | 8 | 8 | 9 | 9 | 8 | 8 | 8 | 8 | 8 | 8 | 7 | **8.08** |
| Moderation access | 8 | 8 | 8 | 8 | 8 | 8 | 8 | 8 | 8 | 8 | 8 | 8 | **8.00** |
| Moderation queue | 8 | 8 | 8 | 8 | 9 | 8 | 8 | 8 | 8 | 8 | 9 | 7 | **8.08** |

Spacing and alignment measure section rhythm, target bounds and relationships between columns. Type and hierarchy measure legibility and the order in which important details become visible. Grouping measures the proximity of related controls. Affordance measures whether a link, disclosure, selection or submit action looks like its actual behavior. Scroll measures navigation with native scrolling, keyboard and viewport changes. Feedback covers progress, error placement, and reduced motion. Phone and Desktop cover the responsive layouts. Access covers keyboard use, labels, and recovery. States covers real data, synthetic populated data, and empty, denied, and unavailable branches observed here.

The layout follows the saved typography and grouping research, uses fewer visible choices for advanced settings, and limits motion to short changes with reduced-motion support. [Typography and spacing](https://scroll.companynerve.com/app/nn7d15ckc9p6xsx0z7sd09w7298fey3s/posts/px7f0mh8dnp0aypn0acgf6j6js8g21g3) · [UX laws](https://scroll.companynerve.com/app/nn7d15ckc9p6xsx0z7sd09w7298fey3s/posts/px78c2ccrch73zbv55trnf69rd8ff9ch) · [Motion](https://scroll.companynerve.com/app/nn7d15ckc9p6xsx0z7sd09w7298fey3s/posts/px76mwh8n60et1ghnz2ngm9zx98g3kg0)

## Reviewed screens and states

| Screen | Route | Reviewed evidence |
| --- | --- | --- |
| Account | `/app/[org]/account` | Workspace identity and groups, appearance controls, account links, keyboard route focus. |
| Profile | `/account` | Workspace-aware back link, account data and sign-out surfaces, neutral missing profile fields. |
| Connections | `/app/[org]/connections` | Recorded GitHub state, informational runtime choices, credential disclosure, retry affordance, and role-gated controls in static rendering. |
| Computers | `/app/[org]/runners` | Empty state, runner setup link, and synthetic invalid, workspace-mismatch, pending, confirmation, cancel, and approved request states. |
| Usage | `/app/[org]/usage` | Unavailable credit data with Billing path, and synthetic metered balance and activity. |
| Privacy | `/app/[org]/privacy` | Account and workspace data links where available, cookie preferences and Escape, reduced-motion control. |
| Billing | `/app/[org]/billing` | Offer with unavailable account data, and synthetic active plan, credit balance, plan choices and management. |
| Plan quote | `/app/[org]/billing/change/[id]` | Recovery for an unavailable quote, and synthetic quote amount presentation, quote times and acknowledgement. |
| Workspace settings | `/app/[org]/settings` | Workspace identity, availability of catalogue controls and links to privacy, audit and team. |
| Team | `/app/[org]/team` | Restricted membership details, viewer access rule, and synthetic admin roster and invitation form. |
| Audit log | `/app/[org]/audit` | Non-readable log state and synthetic populated event list. |
| Launch checks | `/app/[org]/launch-checks` | No report state and synthetic report with passed, failed and unverified totals. |
| Workspaces | `/app/workspaces` | Authorized workspace list and destination. The active workspace is preserved as the recovery path. |
| Invoice reporting | `/account/invoices` | Access gate and synthetic queued and submitted invoice records with exact receipt references. |
| Moderation access | `/app/moderation` | Operator access gate and safe return. |
| Moderation queue | `/app/moderation` | Synthetic report loading, recovery, exact edition inspection, confirmation, dismissal, and empty states. |

## Verification

- Account pages were reviewed in Chromium at 1440 × 940 and 390 × 844 dark, and 320 × 740 light with reduced motion. Each of the 15 routes rendered one level-one heading without horizontal overflow across the three widths.
- Eight populated synthetic fixtures were rendered from app components and captured at the same widths. These include Billing, plan quote, Usage, Team, Invoices, Computers, Audit log and Launch checks. Fixture pages disabled form submissions and external provider activity.
- Real browser input verified theme and motion controls, keyboard link activation and route focus, cookie preferences and Escape, credential disclosure, Connections and Launch checks navigation, workspace and profile return context, and Usage to Billing.
- Twenty-three interactive fixture checks passed for moderation and pairing. They exercised real clicks, entered invalid and cross-workspace requests, verified keyboard focus while reviewing and dismissing reports, and confirmed that revisiting a pending pairing request did not issue another mock start.
- Static tests verified role separation in Connections and Team, missing billing reads, exact plan quotes, and invoice receipt states. Production operator access, physical-device pairing, screen-reader output, provider authorizations, team mutations, and payment handoffs still need direct verification. The score of 7 for most account-backed state dimensions reflects those limits.

Private browser receipts and screenshots are in `outputs/account-review-2026-11-16/`. `pass8-*` covers the routes above. `fixture-*` covers the populated synthetic states and `fixture-live-*` records the simulated browser interactions. Review and code changes were made in the local checkout.
