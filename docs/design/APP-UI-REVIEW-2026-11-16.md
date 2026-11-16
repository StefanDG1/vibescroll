# Website design and verification · November 16, 2026

Home opens directly to the first ready post. Browse is the single layout. The desktop rail retains the VibeScroll icon and gives the source and its insights separate columns. Phones use one vertical reading path beneath a compact source header. Both show retained evidence, recommended projects, other actual projects, and proposals from Home. Full post links keep the ordered content and add source evidence and advanced settings at the bottom.

## How the screens connect

~~~mermaid
flowchart LR
    M["Marketing site"] --> L["VibeScroll public site"]
    L --> G["Guest onboarding"]
    L --> D["Discover, collections and editions"]
    L --> H["Docs and Help"]
    D --> E["Edition, evidence and Save review"]
    G --> A["Home"]
    E --> A
    A --> S["Save sheet"]
    A --> P["Posts"]
    A --> R["Full post"]
    A --> C["Proposal composer"]
    P --> K["Knowledge, Trends and Shared"]
    P --> R
    R --> C
    A --> W["Work"]
    W --> J["Projects and project detail"]
    W --> V["Proposals and exact plan"]
    W --> T["Tasks, Activity and Improvements"]
    C --> V
    A --> U["Account"]
    U --> Y["Connections, Computers, Usage and Privacy"]
    U --> B["Billing, Team and workspace settings"]
    U --> F["Profile and workspace management"]
~~~

The title and media appear once per post in the scrolling feed. Insight cards expand in place and link to their evidence. Project choices and existing proposals remain in the feed. The full post has the same order and adds source evidence and advanced settings. Posts is the canonical list and links to the exact post route. Existing Library links resolve to the same reader. Work stays accessible from the main navigation. Workspace management is a deliberate entry from Account, with a recovery screen when the normal app entry has no usable workspace.


## Review scale

The table uses the [same twelve dimensions as the prior review](HOME-UI-SCORECARD.md), weighted equally. Zero means unusable, five means average and usable, and ten means perfect. Eight is the minimum average for a screen. The scores are design judgments based on the screenshots and observed inputs in the listed states.

| Sp | Al | Ty | Hi | Gr | Ic | Sc | Mo | Ph | De | Ac | Lo |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Spacing | Alignment | Typography | Hierarchy | Grouping | Icon clarity | Scroll and gestures | Motion and feedback | Phone ergonomics | Desktop ergonomics | Accessibility and recovery | Loading and content variation |

## Iterations

| Pass | Changes | Screenshot and interaction findings |
| --- | --- | --- |
| Starting point | November 15 Browse and the existing app shell | Browse scored 7.8. Posts and the reader reached 8 in the checked states. Several supporting views had gated or missing fixtures. |
| First pass | A shared palette, clearer tabs, ranked categories, and recent saves | The core screens fit at phone and desktop sizes. The consent choice needed less vertical space and the desktop Posts rows left much of the right side empty. |
| Second pass | Compact phone source, keyboard insight rail, scoped Save form, recovery states | Browser input confirmed keyboard evidence selection, project selection, Save retry and return focus. Returning from a full post exposed list restoration and missing media issues. |
| Third pass | Removed the Home title and picker, restored Posts query and scroll, and put desktop list metadata in a right column | Two older layout URLs opened Browse without a top bar. The next screenshot pass exposed an oversized tablet poster, a cut-off fourth insight on desktop, and an unlabeled floating settings control. |
| Refined | Bounded tablet media, fit four insights when space permits, and put reader project and evidence actions in the desktop reading column | The tablet brings project choices into the first viewport. The desktop reader keeps the source visible while reading or working in the other column. Save keeps fields through a rejected request. |
| Populated Home | A single compact disclosure for each saved proposal and a link to its exact reader | An actual older post exposed the proposal without repeated controls. The source, evidence, projects and proposal stay in one browsing flow. |

## Core screens

| Screen or checked state | Sp | Al | Ty | Hi | Gr | Ic | Sc | Mo | Ph | De | Ac | Lo | Average | Main evidence or deduction |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Home | 8 | 8 | 8 | 9 | 9 | 9 | 9 | 8 | 8 | 8 | 8 | 8 | **8.33** | First post starts at the top. A 390 px touch run distinguished horizontal evidence scrolling from vertical page scrolling. Portrait media retains side margins on wide layouts. |
| Posts | 8 | 9 | 8 | 8 | 9 | 8 | 8 | 8 | 8 | 9 | 8 | 8 | **8.25** | Search, sort and filters fit on phones. Desktop aligns dates and insight counts separately. Browser Back restored the filtered query, then reopened a previously loaded second page and returned keyboard focus to the exact row. |
| Full post and Library alias | 8 | 9 | 8 | 8 | 9 | 8 | 8 | 8 | 8 | 9 | 8 | 8 | **8.25** | One source and the same evidence rail, with project choices, proposals, source evidence and advanced settings below. Missing media uses a compact row. |
| Knowledge category directory | 8 | 8 | 8 | 8 | 9 | 8 | 8 | 8 | 8 | 8 | 8 | 7 | **8.00** | Search opens the exact category filter. The snapshot contains actual category counts. Live topic management and ranking need their own data check. |
| Trends recent saves | 9 | 8 | 8 | 8 | 8 | 8 | 8 | 8 | 8 | 9 | 8 | 7 | **8.08** | Bar labels match a bounded recent-save sample. The live engagement-history branch needs a populated account check. |
| Shared knowledge empty | 8 | 8 | 8 | 8 | 9 | 8 | 8 | 8 | 8 | 9 | 8 | 7 | **8.08** | A clear empty state returns to Posts. Populated and revoked grants require independent verification. |
| Shared library access gate and unavailable post | 8 | 8 | 8 | 8 | 8 | 8 | 8 | 8 | 8 | 8 | 9 | 7 | **8.00** | Access states link to Settings or the library. The enabled catalog needs authorized populated records. |
| App recovery panel | 8 | 8 | 9 | 9 | 8 | 8 | 8 | 8 | 8 | 8 | 8 | 8 | **8.17** | A failed detail request keeps a clear retry and a route back to the app. |
| Save | 8 | 8 | 8 | 9 | 9 | 8 | 8 | 8 | 9 | 8 | 8 | 8 | **8.25** | Browser inputs kept the pasted link through retry and Escape. A locally saved source appeared once. Upload and processing have separate eligibility and progress states. |
| Expanded insight and frame viewer | 8 | 8 | 8 | 9 | 9 | 8 | 9 | 8 | 8 | 9 | 8 | 8 | **8.33** | Selected title expands in place. A permitted frame opened and decoded. Escape restored the invoking control. |
| Project proposal composer from Home | 8 | 8 | 8 | 8 | 9 | 8 | 8 | 8 | 8 | 8 | 8 | 8 | **8.08** | The actual project selection opens the composer directly. The snapshot does not exercise provider submission. |

For the other families, see the [Work review](WORK-UI-REVIEW-2026-11-16.md), [Account review](ACCOUNT-UI-REVIEW-2026-11-16.md), and [public website and onboarding review](PUBLIC-UI-REVIEW-2026-11-16.md). Their score tables include each measured screen. The [screen and loading ledger](APP-SCREEN-AND-LOADING-LEDGER.md) covers route aliases, handoffs and intended pending and error states.

## Evidence

Private browser captures and receipts are under outputs/app-review-2026-11-16, outputs/account-review-2026-11-16 and outputs/public-ui-review-2026-11-16. The retained snapshot contains 236 posts. Core route captures use CSS viewport widths 320, 390, 768 and 1440. The refined pass rendered 40 of 40 requested cases, including intentional access and recovery screens, with no horizontal layout overflow. Chrome's accessibility tree returned names for all captured link, button, textbox and combobox controls. Keyboard and emulated touch checks cover common paths. This review has no physical handset or live screen-reader session. The subsequent interaction passes exercised mobile double-tap, six distinct projects, a saved proposal, delayed Posts, a no-results reset, and the empty-project branch. Production builds ran ten public and synthetic views across both sites at 390 and 1440 pixels.

The snapshot shares the visual components and page routes with hosted VibeScroll. It keeps accesses and data for unavailable providers gated. The account review uses isolated synthetic data for selected populated states. App and public example labels apply to synthetic examples only. Live auth, payments, provider writes, and populated collaboration access remain separate operational checks.

The saved design-rules post informed spacing and a small type scale. A mobile UI post informed the decision to simplify the phone feed and keep only a visible next action when it adds information. The UX laws and Nessie motion posts informed the project choices, responsive feedback, and reduced-motion checks. The design-skills post guided the Impeccable audit of hierarchy, spacing and responsive behavior. [Design rules](https://scroll.companynerve.com/app/nn7d15ckc9p6xsx0z7sd09w7298fey3s/posts/px7f0mh8dnp0aypn0acgf6j6js8g21g3) · [Mobile hierarchy](https://scroll.companynerve.com/app/nn7d15ckc9p6xsx0z7sd09w7298fey3s/posts/px79yg3s5ecmyspa87x3swhs858gsr45) · [UX laws](https://scroll.companynerve.com/app/nn7d15ckc9p6xsx0z7sd09w7298fey3s/posts/px78c2ccrch73zbv55trnf69rd8ff9ch) · [Motion](https://scroll.companynerve.com/app/nn7d15ckc9p6xsx0z7sd09w7298fey3s/posts/px76mwh8n60et1ghnz2ngm9zx98g3kg0) · [Design skills](https://scroll.companynerve.com/app/nn7d15ckc9p6xsx0z7sd09w7298fey3s/posts/px7a6t512k73b0a37ypf9szvks8g2fea)
