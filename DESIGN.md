---
name: VibeScroll Atlas
description: Cool surfaces, stable Library navigation, inline evidence and recorded project trails.
colors:
  canvas: "#f5f8fa"
  panel: "#ffffff"
  ink: "#182e42"
  subtle: "#526578"
  line: "#dce5eb"
  muted: "#eaf0f4"
  primary: "#166b58"
  primary-foreground: "#ffffff"
  accent: "#bce8da"
  accent-ink: "#134b40"
  dark-canvas: "#121b23"
  dark-panel: "#1b2833"
  dark-ink: "#e7f0f7"
  dark-subtle: "#a9bac8"
  dark-line: "#354652"
  dark-muted: "#263642"
  dark-primary: "#87dfc1"
  dark-primary-foreground: "#102d24"
  save: "#f8cf50"
  save-ink: "#18272d"
  legacy-primary: "#f4f4f4"
  legacy-primary-ink: "#141414"
  legacy-primary-hover: "#d8d8d8"
  amber: "#f3c785"
  diagram-blue: "#92c5ed"
  diagram-violet: "#d5ade9"
typography:
  headline:
    fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "clamp(24px, 2.2vw, 32px)"
    fontWeight: 550
    lineHeight: 1.3
  studio-headline:
    fontSize: "clamp(26px, 3vw, 38px)"
    lineHeight: 1.18
    letterSpacing: "-0.025em"
  topic-title:
    fontSize: "14px"
    lineHeight: 1.35
  library-headline:
    fontSize: "36px"
    letterSpacing: "-0.025em"
  hybrid-title:
    fontSize: "14px"
    lineHeight: 1.35
  mobile-label:
    fontSize: "11px"
    lineHeight: 1.2
  mobile-category:
    fontSize: "13px"
  insight-title:
    fontSize: "15px"
    fontWeight: 650
    lineHeight: 1.4
  body:
    fontSize: "14px"
    lineHeight: 1.6
  insight:
    fontSize: "14px"
    lineHeight: 1.5
  metadata:
    fontSize: "12px"
    lineHeight: 1.4
rounded:
  chip: "5px"
  proposal-bubble: "999px"
  field: "9px"
  control: "10px"
  insight: "12px"
  panel: "14px"
  node: "16px"
  composer: "18px"
  circle: "50%"
spacing:
  small: "8px"
  compact: "10px"
  row: "12px"
  standard: "16px"
  branch: "18px"
  section: "20px"
  panel: "24px"
components:
  button-primary:
    backgroundColor: "{colors.legacy-primary}"
    textColor: "{colors.legacy-primary-ink}"
    rounded: "{rounded.control}"
    padding: "10px 17px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.legacy-primary-hover}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "10px 17px"
    height: "44px"
  mobile-save:
    backgroundColor: "transparent"
    textColor: "{colors.subtle}"
    height: "56px"
  mobile-save-icon:
    backgroundColor: "{colors.save}"
    textColor: "{colors.save-ink}"
    rounded: "{rounded.circle}"
    size: "48px"
    padding: "12px"
  field:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "10px 12px"
    height: "44px"
  navigation-item:
    textColor: "{colors.subtle}"
    rounded: "{rounded.field}"
    padding: "10px 12px"
    height: "44px"
  navigation-item-selected:
    backgroundColor: "{colors.muted}"
    textColor: "{colors.ink}"
  chip:
    backgroundColor: "{colors.muted}"
    textColor: "{colors.ink}"
    rounded: "{rounded.chip}"
  panel:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.panel}"
    padding: "24px"
  topic-node:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.node}"
    padding: "14px"
    height: "76px"
  hybrid-category:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.insight}"
    padding: "10px"
    width: "210px"
  hybrid-category-mobile:
    width: "200px"
  hybrid-search:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.insight}"
    padding: "10px 12px"
  hybrid-switch:
    rounded: "{rounded.insight}"
    padding: "3px"
  hybrid-tray:
    backgroundColor: "transparent"
    padding: "0"
  insight-card:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.insight}"
    padding: "0"
  proposal-bubble:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.panel}"
    rounded: "{rounded.proposal-bubble}"
    padding: "0 6px"
    height: "24px"
---

# Design System: VibeScroll Atlas

## Overview

**Creative North Star: "Scroll's knowledge atlas"**

The app uses cool canvas, white reading surfaces, navy ink and teal selection. Its matching dark theme keeps the same hierarchy. Quiet borders and compact icon-led cards let saved knowledge and the next permitted action lead. Device setting is the default appearance; Account offers Light and Dark overrides.

This is the owner-authorized October 9 application world, extracted from the built code. Its boundary is the Atlas shell, Home, Library, Projects, Account and capture. The public marketing world remains Scroll's charcoal studio. The app logo uses the actual favicon artwork and links to Home. Home and the mobile header no longer show the mascot or top account control under [ADR 097](docs/adr/097-stable-mobile-library-navigation.md). Original Scroll artwork remains part of the public marketing identity; this correction introduces no shipping raster artwork. Product authority remains in [PRODUCT.md](PRODUCT.md), with the selected interaction scope in [the Atlas implementation contract](docs/design/ATLAS-IMPLEMENTATION-CONTRACT-20261009.md).

**Key Characteristics:**

- Cool light surfaces and matching dark surfaces with teal selection.
- Favicon Home link and authenticated account avatar.
- Stable saved-topic branches, scoped remembered position and evidence expanded inside each insight row.
- Fully wrapped insight titles, semantic icons and right-side bubbles for proven exact open-proposal totals.
- Five phone actions: Home, Library, Save, Projects, Account.
- Short pointer-triggered motion with immediate keyboard actions and a still alternative.
- Loaded-record statistics and explicitly recorded project trails.

## Colors

The frontmatter records the effective Atlas light palette and its dark counterparts from `atlas.css`; it also records retained control and chart colors that still appear in the application.

### Primary

- **Deep teal / Dark mint:** active selection, focus, topic icons and recorded connectors. The primary foreground follows the selected theme.
- **Soft teal / Accent ink:** filled selected representation and appearance controls.
- **Legacy primary / Legacy primary ink:** retained bright primary controls, with the established dimmer hover response. These remain distinct from token-driven teal controls.

### Secondary

- **Warm Save / Save ink:** the phone's central circular SVG, opening capture. The label uses theme Subtle, including dark appearance; dark Save ink is confined to the yellow SVG.
- **Amber:** original Scroll warmth and retained chart attention states.
- **Diagram blue and violet:** retained labeled state and cited-group distinctions. Color does not establish benefit or quality.

### Neutral

- **Cool canvas and White panel:** page, rail, toolbar, cards, fields and menus.
- **Navy ink and Secondary ink:** reading text and supporting explanation; placeholders use secondary ink at full opacity.
- **Quiet line and Muted surface:** borders, branch stems, active rail rows and informational tags.
- **Dark canvas, panel, ink, subtle, line and muted:** matching roles when the device or Account selects dark appearance.

The category selection fill mixes theme Teal at 8% with Panel. Insight icon backgrounds use the same selection fill or blue at 16%, yellow at 18% and purple at 16% mixed with Panel. The semantic icon key determines the pastel tone, so reordering records does not change it. These incumbent `color-mix()` tints follow the existing theme; they introduce no new permission or outcome state. Closed categories lose the active fill and border.

**The Recorded Meaning Rule.** Selection and connectors describe returned records; neither color nor a line establishes permission, independent corroboration or benefit.

## Typography

**Display Font:** Inter with system-ui, Apple system, BlinkMacSystemFont, Segoe UI and sans-serif fallbacks.
**Body Font:** the same declared stack; the root layout does not load Inter through `next/font`.
**Label/Mono Font:** UI monospace for code and serialized detail.

**Character:** a compact reading hierarchy with medium headings and sentence case labels. Evidence remains readable beside the branching structure.

### Hierarchy

- **Headline:** inherited page title; Library uses a 36px heading, reduced to 30px on phones.
- **Studio headline:** the next action on Home; phone Atlas overrides it to 23px.
- **Topic title:** multiword category names wrap at word boundaries for up to three lines. Single-word names retain one line and ellipsis; the accessible name stays complete.
- **Body / Insight:** full unchanged claims use 14px; stored descriptive insight titles use 15px and weight 650, reduced to 14px on phones. Titles wrap fully and rows grow naturally. Legacy records without a title use the unchanged claim as a display fallback.
- **Metadata:** source and proposal detail use 12px; phone row metadata and bottom labels use 11px. Categories use 14px, reduced to 13px on phones, and toolbar labels use 13px, reduced to 12px. The 11/12/13/14/15px scale is retained intentionally for the operative density and does not reduce hit areas.

**The Reading Hierarchy Rule.** Keep title, explanation and metadata distinct through scale, weight and neutral contrast; use concise sentence case labels instead of ornamental eyebrows.

## Layout

The inherited desktop shell keeps a 244px rail, 64px toolbar and main content capped at 1120px. The rail narrows at 1050px. Earlier 720px shell and 700px Atlas declarations remain in the cascade; the final mobile correction applies at 760px and below, with 16px 12px 110px main padding. The mobile header hides the workspace strip, status and rail opener. The favicon logo links to Home. The same five bottom controls remain on every app page in Home, Library, Save, Projects, Account order. The fixed strip uses five equal columns, safe-area padding and at least 76px height; selected destinations have a 28px underline. Save is a transparent action with a raised 48px yellow SVG circle and an 11px theme-Subtle label.

Library is capped at 1040px with 20px inset, removed on phones. The heading and search share a row. A separate stationary toolbar has two equal segments containing Tree/Folders and Personal/Business, capped at 600px on desktop. It stays in the same position across representation and filing changes; it is not sticky to the viewport. Tree displays one authored filing root. Every returned sibling keeps its saved order in a horizontal scrolling row; the frontmatter records the wider desktop and phone card widths, with a 10px gap. Selection does not reorder or automatically scroll a card. Multiword Tree cards grow from a 64px minimum height for up to three lines at word boundaries; single-word cards retain their existing one-line ellipsis. From any node, Tree and Folders follow returned only-child chains until a leaf, fork or topic with both direct evidence and a child. They never open individual insights automatically. Explicit collapse remains authoritative, and paths stay bounded to twelve levels. Folders uses 12px indentation, reduced to 10px on phones, retains a 52px minimum card height that grows with wrapped text, and expands only the chosen path. Unorganized legacy topics retain their returned roots.

Both views place stacked evidence inside the selected branch. Rows have an 80px minimum selection area, 42px semantic icons and descriptive insight titles; phone icons are 36px. Titles wrap fully, and rows grow with their content. A row expands its full original claim, source title, source link and exact recorded proposals within the row. Both views initially show five returned insights; More insights reveals five more and explicitly appends further authorized evidence pages through the same disabled-while-loading action. Appending preserves position; fresh selection or revalidation resets evidence. Navigation stays mounted when evidence arrives. The evidence list resets on its topic, insight generation and revision key. Workspace/scope changes and search resets also clear in-memory place and pending scroll restoration; the fresh authorized page supplies the saved place or available overview. Runtime SVG connectors use measured category rectangles and skip hidden levels. Tree includes the selected topic-to-insights connector, and both views repeat the topic name beside Insights. The earlier pair grid, stepped composition and detached source pane remain historical under ADR 097. ADR098 governs title, icon and restoration behavior; ADR099 supersedes category and title clamps. [ADR 100](docs/adr/100-lazy-library-and-choice-free-branches.md) permits choice-free chains, retains returned metadata and governs five-row evidence, lazy paging and exact open-proposal bubbles.

**The Touch Target Rule.** Interactive controls keep at least a 44px target; small type and icons do not justify a smaller hit area. Informational chips are not controls.

## Elevation & Depth

Thin borders and tonal surfaces establish depth. Earlier topic-node variants retain a small ambient shadow and teal selection ring. Current category and insight rows use borders and tonal selection. Menus retain floating depth, and dialogs use the inherited dim backdrop. Insight cards own their enclosure; source headings do not gain a duplicate card wrapper.

### Shadow Vocabulary

- **Topic ambient** (`0 3px 12px rgb(18 46 66 / 4%)`): saved topic nodes at rest.
- **Topic selection** (`0 0 0 2px color-mix(in srgb, var(--primary) 14%, transparent)`): the selected topic.
- **Menu floating** (`0 12px 32px #0006`): the account menu.

## Shapes

Soft rounded rectangles define the atlas. Current categories, insight rows, search, toolbar containers and More insights controls use Insight corners. Segmented toolbar buttons retain Field corners, and icon backgrounds retain Control corners. The 9/10/12px control radii are intentionally retained for operative density. Earlier topic-node variants retain Node corners; general panels use Panel and ordinary informational badges use Chip. Right-side open-proposal indicators reserve a 24px slot. One proposal uses a centered 12px solid teal dot; two or more use pill corners, a 24px height and at least 24px width. Proposal-stage markers and authenticated avatars are circles. The favicon supplies the app identity; line icons identify media, navigation and recorded stages.

## Components

### Buttons

Retained primary controls use the Legacy primary palette and medium weight (550); secondary controls are transparent with the quiet outline. Atlas button and link responses name background-color and border-color at 120ms ease-out. Focus uses a two-pixel theme-primary outline with a three-pixel offset. Disabled controls retain explicit unavailable state and inherited reduced opacity. Token-driven shared buttons may use theme Primary rather than the legacy fill.

### Chips

Status and tag badges use Muted with Ink and Chip corners. Small labels supplement readable state text. Synthetic records remain labeled; a badge never implies complete analysis.

Under ADR101, one open proposal uses a centered solid 12px theme Teal dot in a transparent 24px slot. Two or more use theme Teal with Panel text, pill corners and tabular numerals at 12px and weight 700. Accessible names always include the exact count. They sit on the right of insight cards and category nodes before the chevron. Show an indicator only when every bounded proposal page is complete and exact; pending pages, unknown state, caps or malformed hierarchy withhold it. Deduplicate proposal IDs across citations and descendant categories rather than adding child counts. Zero has no bubble.

### Cards / Containers

General panels retain 24px padding and Panel corners. Insight rows use a thin line border and Insight corners. Their selection button has 12px padding, reduced to 10px on phones. Expanded detail uses 14px padding and an internal top divider; full source headings and recorded proposals stay inside the row. Trace cards use 16px padding and Node corners, with Canvas-filled action rows and centered downward arrows.

### Inputs / Fields

Fields use Panel, Ink and Line, with Field corners and 10px 12px padding. Search and capture placeholders use Subtle at full opacity; caret uses Ink. Native capture choice menus remain inside the active dialog, preserving keyboard selection and focus return. Escape closes the choice menu before capture. Capture records its opener synchronously before the full-editor refresh can disable Save or move focus. On close, it restores that opener only while access is valid and the element remains connected, enabled, visible and outside BODY; otherwise it uses an enabled visible header or phone Save control. Failed or obsolete opening and access loss clear the saved opener.

### Navigation

The desktop rail uses subtle text, line icons and a muted selected/hover fill. Phone navigation uses theme-primary active text; the centered yellow Save SVG opens the reviewed capture dialog and its label uses theme Subtle. Source and shared Library pages select Library. Proposal, improvement and run pages select Projects. Other Account destinations preserve the Account current-page marker. Bottom Account opens the existing dropdown upward; the mobile top account control is absent. Account exposes appearance and motion preferences alongside existing workflow destinations. Appearance offers Device setting, Light and Dark, following live device changes in Device setting mode. Account retains appearance, Usage, Billing, Computers, Privacy, Cookie preferences, version, Account & sign out and Website destinations; the Account page keeps the other workflow links. WorkOS passes the current authenticated user's HTTPS OAuth picture, with a first-name initial when absent or failed. It fetches no other user profile.

### Saved topic atlas and insight links

Tree is the default; Folders provides an expanded alternative over the same returned IDs and exact evidence. The current filing root opens by default. Browser preferences store representation, filing, topic, closed branch, expanded insight and bounded page/row scroll under workspace/scope keys. Only identifiers and geometry are stored. Topic and closed-branch IDs restore after the fresh authorized page returns them; expanded insight IDs must match its returned members. Missing or revoked topics discard insight and geometry. Missing saved entries use Tree and the available filing overview. Scope and search resets clear pending restoration; access loss clears saved preferences. Personal/Business roots are authored filing containers, independent of access scope. A missing counterpart can appear as an empty local filing template with no evidence, totals or grant. Library access view uses only server-returned permitted scopes; team libraries retain Workspace. Missing parents remain separate roots. The explicit deterministic category helper uses no model call and preserves saved manual layout versions.

Category cards preserve the established desktop and phone widths. Multiword names use normal word-boundary wrapping for up to three lines. Tree uses a 64px minimum height for these cards; Folders retains a 52px minimum and grows naturally with the label. Single-word names keep ellipsis rather than splitting a word. Measured connectors follow the resulting rectangles; ordered horizontal rows, active treatment and branch motion retain their existing behavior.

The stored insight title leads each row, wraps fully and lets its row grow naturally. Future analysis asks for a descriptive three-to-seven-word title and an icon from the fixed semantic whitelist. A deterministic fallback displays legacy records and persists an omitted icon at new completion without rewriting historical claims or starting reanalysis. Icons describe subject, never confidence. Activating an insight expands the unchanged full claim, full source title and source navigation inside that row. View source evidence uses the shared outline Button with link semantics and a 44px target. Demo rows abbreviate Synthetic example to Example while the explicit synthetic banner and full source title retain context.

One indexed five-proposal page loads alongside a topic browse batch. Further topic and proposal pages share a near-viewport sentinel with one initial automatic attempt and a new wheel, touch-browse or navigation-key gesture for each later batch. Cursor changes alone cannot drain pages, duplicate cursor attempts are fenced and hidden tabs do not page. Load more topics remains the accessible fallback. Returned metadata and ancestors remain available without the former forty-node eviction; bounded server pages, twelve-level paths and authority checks remain. Focus/scope/search revalidation replaces metadata and clears previous proposal proof. Category paging reuses open evidence, and failed reads clear the view for Retry loading library. No per-card queries, whole-table scans, inference or provider polling follow.

Library includes only open proposals. Closed, rejected and merged records remain in Projects; deleted records, stale evaluations and mismatched exact source/insight/generation/revision citations stay excluded. Current publication versions and bound run observations remain required. An exact-reference index checks up to twenty memberships and twelve ancestors per reference; a cap, unknown lifecycle state or malformed hierarchy withholds totals. Expanded proposals show title, project, recorded state and up to 500 characters of description, visually clamped to two lines. The whole row opens the existing authorized exact-draft review route. The read-only labeled synthetic demo contains three distinct open proposals and two closed/merged records in Projects, with fixed citations and matching full proposal/source routes. Connections grant no coding, publication or spending approval.

Category correction remains version-bound. Library options contains the Move disclosure named for the selected topic, the Parent category destination and the Move topic action, alongside access view, explicit deterministic organization and coverage. The form stays inside those options. Empty or partial pages explain missing coverage. Native circle-help disclosures carry small metric and connection explanations with readable labels and 44px targets. Essential errors and task controls stay visible; advanced evidence representations remain reachable.

**The Cited Group Rule.** Display a connection only when all of its exact source, generation, revision and insight references exist in current permitted evidence. A connection is an explained cited group; neither its line nor topic membership proves causation or agreement.

### Home and proposal trails

Home's state-based next action leads, followed by loaded-record statistics with count definitions, readiness/decision distributions, a bounded knowledge preview and vertical source/proposal/run links. Unknown data remains distinct from zero. Source provenance and recorded run links remain separate from merge or benefit.

Projects lead with selected projects and existing proposals. Setup and evidence exploration stay in disclosures. The proposal trail labels Saved post and Saved plan only when source-ID and immutable-plan evidence support them; missing run and PR states remain explicit. A saved plan label does not claim an independently reviewed plan or grant execution authority.

**The Recorded Outcome Rule.** Present saving, evaluation, issue, PR, merge, deployment and benefit as separate recorded facts. A judgment is not a measured comparison, and a merged PR alone does not establish benefit.

### Motion

Pointer branch switching closes the old branch before opening the next with 220ms height/opacity phases and cubic-bezier(0.22, 1, 0.36, 1). Insight expansion uses a 200ms height/opacity transition. Nested completion callbacks consume the close/open handoff once. Closed branches and evidence immediately receive inert and aria-hidden. Keyboard, live device reduced motion and interface-motion-off actions are immediate. Detail arrival does not remount navigation or replay an entry animation. Outgoing stale evidence is discarded and measured connectors omit hidden rows. Representation changes retain only current authorized evidence. Capture retains its 180ms opacity and 8px entry. CSS control responses remain 120ms ease-out. Library metadata, insight and proposal placeholders use react-loading-skeleton 3.5.0, MIT, with Line/Panel tones and a 1.6s shimmer. System reduced motion and interface-motion-off suppress it. Motion causes no inference or recurring browse polling.

### Candidate verification boundary

ADR100 local checks report 569 unit passes with three external skips, 28 authentication passes, Python suites of 6/6/3, five Basic-build checks and both builds. The native Chrome viewport-emulation receipt at `private/lazy-library-browser-20261009.json` reports PASS at 320/390/768/1440px for the bounded Library refinement. The fresh finish reviewer identified obsolete persistence descriptions; this refresh addresses those documentation findings. Whole-library composition, hero and drift gates remain open. These checks establish no production release, real historical-proposal acceptance, independent human comprehension, physical-phone motion, provider/cost settlement or whole-plan acceptance. Earlier dated evidence keeps its original version and scope.

ADR099 local synthetic native evidence at `private/library-label-controls-browser-20261009.json` reports PASS for complete insight titles, a 64px two-line Customer experience Tree card, intact single-word labels, stationary bottom navigation across Tree/Folders and no overflow at 320/390/768/1440px. The builder opened the five captures under `.impeccable/review/library-labels/`: `mobile-tree.png`, `mobile-folders.png`, `mobile-320.png`, `desktop.png` and `mobile-dark.png`. Builder reports record 557 unit passes with three external skips, 28 authentication passes, Python suites of 6/6/3, five Basic-build checks, both builds and a passing dependency audit. Finish review and exact release verification remain pending. These local checks do not verify production topic moves, independent comprehension, physical-device behavior or full V1 acceptance. ADR098 and earlier evidence retain their original version and scope.

Historical ADR098 evidence includes the local synthetic native PASS at `private/insight-presentation-browser-scope-fix-20261009.json`, following the final build. The earlier `private/insight-presentation-browser-20261009.json` and its preceding failures remain historical. Its six recaptured and inspected captures under `.impeccable/review/insight-presentation/` are `mobile.png`, `mobile-expanded.png`, `mobile-folders.png`, `user-320.png`, `desktop.png` and `mobile-dark.png`. The dark capture shows Product open and Customer experience closed and unhighlighted. The reviewer initially returned fix for stale documentation and scope restoration, then cleared those two named fixes. [The committed ADR098 receipt](docs/operations/evidence/vibescroll-insight-presentation-20261009.json) records 557 unit passes with three external skips, 28 authentication passes, Python suites of 6/6/3, five Basic-build checks, both builds and 17 targeted restoration regression passes. It records canonical production verification for application `306a0ec01ff85d167b7ea676d9a62006d8e38098`, alpha `0.1.0-alpha.20261009130048.g306a0ec01ff8`; documentation main `8672456` is historical. Actual owner-page titles, inline unchanged claims, closed-category treatment, remembered Folders/expanded insight, search-clear recovery, Account version and 320/390/412/1440px fit were verified within that release scope. No alternate access scope or current exact proposal was available in the sampled production view; their positive checks remain helper/code or synthetic evidence. Physical-device motion, independent comprehension, OAuth picture delivery, provider/cost settlement and full V1 acceptance remain unverified. This release does not verify ADR099.

The earlier ADR097 native local receipt at `private/mobile-navigation-final-browser-20261009.json` reports PASS at requested/actual widths 320, 390, 412, 768, 1440 and 1600. Its nine captures under `.impeccable/review/` and later committed production receipt retain their original correction scope; they do not verify ADR098 or ADR099.

The local synthetic receipt does not establish physical-device smoothness, independent comprehension, actual OAuth picture delivery, provider/cost settlement or full V1 acceptance. ADR098 production acceptance is limited to its separately recorded release scope; ADR099 finish review and production verification remain pending. The preceding ADR 095/096 grid, its 78% drift FAIL and hard veto under `.impeccable/review/diff/hero`, the earlier stacked captures and recorded animation counts remain historical. They are neither current composition instructions nor passes for this revision.

The preceding October 9 reviewer scored all eight original fixes resolved in [the public Atlas evidence receipt](docs/operations/evidence/vibescroll-atlas-20261009.json). This covers the supplied candidate fix evidence, including hierarchy geometry, project-link geometry, source scopes, access-loss capture recovery, truthful trail labels, accessible surfaces, first-viewport density and visibility refresh. It is not a whole-surface audit, production release or full V1 acceptance. Real authenticated deployed-data acceptance, independent browser and physical-device testing, and provider/cost settlement remain separate.

The subsequent capture focus-recovery review cleared the bounded code correction and supplied local authenticated compact-path keyboard receipt at 390px and 1440px. Escape returned focus to Save and Enter reopened capture after the actual full-workspace refresh. Disconnected/disabled-opener fallback and access-loss suppression were reviewed in code only. Exact deployed-release compact keyboard acceptance remains pending; the original eight-fix verdict keeps its unchanged scope. This correction changes no palette, layout, tokens or visual world.

### Historical evidence

The historical serving application before the ADR097 correction was `aacdc9ce237d82aab0ccf544c24c9c3342eab104`, version `0.1.0-alpha.20261009085602.gaacdc9ce237d`, with documentation main `0b670c4`, supplied in the release handoff. Those identifiers are historical and do not establish the current candidate deployment.

Historical October 9 release e68fc3e52946 was Ready Production with canonical health/version, populated Library/Home reads and compact header capture recovery at 390/1440 in [the committed receipt](docs/operations/evidence/vibescroll-atlas-20261009.json). That release supersedes only its preceding candidate production-pending statements. It did not verify the later ADR097 correction; its separate release receipt below records that acceptance. Review scopes and independent/physical/provider/cost gates remain unchanged.

The receipts below retain their original dates and acceptance limits. Their earlier visual descriptions are historical; the Atlas tokens and rules above define the current application candidate. Public policy and marketing styling remain outside this replacement.

Local evidence comprises six handler tests and the labeled synthetic native packet in `.impeccable/review/private-library/proof.json`, including 320/390/768/1440px checks, saved-step resumption, combined-view confirmation, source filing, empty/error feedback and bounded export. The finish reviewer cleared the scored corrections within that candidate scope. Fixture routes were removed from the application before final builds; real-account, production, second-account and genuine analysis acceptance remain pending.

October 7 finish disposition is ship for the scoped saved-grants spacing correction only. `.impeccable/review/knowledge-grants/fix-mobile-active-controls.png` (390px), `fix-desktop-active.png` (1440px) and `mobile-recipient-reading.png` (390px) capture labeled synthetic local controls and reading. They do not establish real grants, second-account consent, provider/auth acceptance or production deployment. This merge preserves Scroll's studio and the existing token primitives.

Historical October 7 exact-post review captures in `.impeccable/review/assistant-access/` and project-context captures retain their original evidence scope. Their paginated post picker and recurring polling describe the earlier implementation, superseded here. The eight October 7 `.impeccable/review/assistant-scope/` captures are explicitly synthetic at 320, 390, 768 and 1440 CSS pixels, with a top and consent-review capture at each width and focus/metrics emulation. The finish reviewer marked the persistence correction ship at that fix scope only; the supplied visual matrix matched. They establish scoped visual review and native fixture checks, not production grant/tool acceptance, independent comprehension or physical-device testing. The durable studio identity and recovery tokens remain unchanged.

The October 7 repair follows a real-production reproduction of an inert menu outside the dialog. Local synthetic checks at 390px and 1440px verified open menus inside the viewport without page overflow, pointer transcript selection and keyboard Home/Enter URL selection. Private evidence is retained in `private/vibescroll-dialog-choice-menu-390.png`, `private/vibescroll-dialog-choice-menu-1440.png`, `private/vibescroll-dialog-choice-desktop.png` and `private/vibescroll-dialog-choice-proof.json`. The finish disposition covers this synthetic control only; it does not establish production saving, deployment or whole-plan acceptance.

The October 7 reviewer cleared this narrow Usage refinement with no material fixes. Populated genuine-staging captures in `.impeccable/review/usage-20261007/` cover 390, 1440 and 1567 CSS pixels with no horizontal page overflow. These are viewport emulations; they do not establish every dynamic state, physical-device, production candidate, provider-invoice or full V1 acceptance. No new palette, artwork, type or motion convention follows from this addition.

The incumbent toast, Sign in again label and native anchor remain unchanged. October 7 evidence in `.impeccable/review/reauth-route-20261007/browser-proof.json` records the source-specific link at 390, 1440 and 1567 CSS pixels and a later pathname/query check. The client received a simulated HTTP 400 before backend dispatch in a genuine staging session with a genuine source; no source edit occurred. The fresh reviewer cleared this routing correction. Its report retains the narrower evidence available at review time, before the later query check. These captures and checks do not establish live OAuth completion, production recovery, independent human or physical-phone acceptance, or full V1 acceptance.

October 7 documentation evidence is the implemented Explore, connection map and canvas plus their scoped design-recipe styles. The fixed desktop/phone captures, desktop-tree-final.png, mobile-tree-final.png, phone-320-tree.png and tablet-768-tree.png in .impeccable/review/knowledge-explore/ retain the local synthetic review. proof.json records native Escape closing, focus return and no horizontal overflow; fix-target-proof.json records the native structure summary's visible mint focus ring. Independent finish review cleared all five corrections: representation/recovery/disclosure targets, summary focus, canvas count fit, overview scale explanation and matching evidence-pagination copy. The ship disposition is LOCAL SYNTHETIC FRONTEND SLICE only. It establishes no real authentication, provider, source, permission, production, customer-result or full V1 acceptance.

The October 8 fix-only finish disposition is ship for responsive network framing, centered topic-root entry and the complete Combine ideas label. The final seven labeled synthetic captures in `.impeccable/review/visual-dashboard-20261008/` are `home-1440.png`, `home-390.png`, `network-1440.png`, `network-390.png`, `network-evidence-390.png`, `tree-1440.png` and `tree-390.png`. The reviewer opened all seven; builder evidence records zoom/reset and Enter/Escape focus return. The verdict at `private/vibescroll-visual-dashboard-finish-review-final-20261008.md` resolves the three existing findings only. It does not establish whole-surface, authenticated customer, human keyboard, physical-device or production acceptance. User-supplied diagrams remain direction references; the implemented diagrams are native code and add no shipping raster artwork.

The subsequent sparse-network framing review follows an actual production capture with a blank lead-in above 22 nodes. The settled local synthetic replacements at `.impeccable/review/visual-dashboard-20261008/framing-fix/network-1440.png` and `network-390.png` show evidence at the canvas entry. `private/vibescroll-network-framing-review-20261008.md` clears the occupied-origin correction locally and retains the prior three findings within this change scope. The 20-isolated-idea regression and reported 539 passing tests, three skips, 28 authentication tests and both builds are builder evidence. The larger production population after this fix remains pending recapture; this bounded verdict adds no whole-surface or production acceptance.

October 2 native Chrome checks covered 320, 360, 390, 412, 768 and 1440 CSS pixels without page overflow. Private captures include plan-editor-local-mobile.png and plan-editor-staging-saved-mobile.png. Saving the labeled staging plan created version 2 and a 64-character hash; it did not start coding. These checks do not certify the generated recommendation's usefulness or a full PR journey.

Documentation evidence: effective `product.css` followed by `studio.css`, `studio-home.tsx`, `scroll-character.tsx`, original asset provenance and the October 7 local desktop/phone captures in `.impeccable/review/studio/`. The synthetic captures establish visual evidence only. Finish disposition is scoped to the owner-pinned contract provenance and visible phone workspace fixes. This undeployed first slice is not full V1 acceptance, a deployment, a customer-data demonstration or completed roadmap work. Earlier component verification above retains its original scope; no new detector-pass claim is made.

The implemented personal-video UI shows prepare, transcribe and analyze stages, an explicit automatic-analysis permission choice, private frame access and original transcript inspection. Current and completed steps brighten their labels; pending work uses a spinner. Recorded verification now includes a real production upload whose generation-one personal-alpha analysis completed automatic Whisper transcription and sampled-frame ChatGPT analysis using gpt-5.6-sol at medium reasoning. This observed completion does not establish global production readiness, legal approval or audiovisual completeness.

Retain the existing dark overview, main-point cards and 44 px controls. The actual local detail stayed readable at 320/360/390/412/768/1440 without page overflow. A filtered library with zero rows still returned its separately authorized selected source. Native clicking, reload and background refresh passed; an initial automation reloaded before asynchronous navigation finished and was corrected. Invalid/deleted source links reveal no private record. This verifies source navigation and its states, not a complete mobile execution/PR journey.

## Do's and Don'ts

### Do:

- **Do** use cool light and matching dark surfaces with theme-primary selection.
- **Do** use the favicon Home link and current authenticated avatar; keep all five bottom controls stable across app pages.
- **Do** keep loading, empty, ready, success and error feedback tied to actual state.
- **Do** preserve visible keyboard focus, 44px controls and live reduced-motion behavior.
- **Do** keep evidence, scope and recorded-outcome limits explicit.

### Don't:

- **Don't** turn filing templates into access scopes, invent parent links, exact totals, analysis completeness or benefit.
- **Don't** make a pointer reveal delay keyboard reading or action.
- **Don't** detach evidence from its insight row, remount navigation on evidence arrival, reorder siblings, traverse a fork or direct-evidence/child choice automatically, or auto-open an insight.
- **Don't** publish private reference screenshots or turn a scoped fix verdict into production or full V1 acceptance.

October 9 ADR097 release receipt: application `e9a7b2b527e46fd9bc3bd23e06e46b19b364ed27`, alpha `0.1.0-alpha.20261009103606.ge9a7b2b527e4`, is verified on canonical production at the bounded owner-page scope. This supersedes ADR097's preceding production-pending statements only; it does not verify the later ADR098 candidate. The fresh reviewer cleared the two named corrections after recapture. Actual Tree/Folders controls remain stationary, real claims expand inline, and requested 320/390/412/1440 widths fit. The first-name initial is observed; OAuth-image delivery, physical-device motion and full V1 acceptance remain unverified. Earlier failed fidelity and 846px Folder results remain historical evidence. [The mobile navigation receipt](docs/operations/evidence/vibescroll-mobile-navigation-20261009.json) records the exact serving source for ADR097.

October 10 ADR102 connector correction: each Tree branch owns its lines inside its Motion clipping/fade container, with a matching parent stem. Pre-paint local-frame measurements update retained paths without React geometry state renders. Closing accessibility does not erase visible lines early. The existing palette, category layout, same Tree/Folders navigation, sequential switching and reduced-motion behavior remain unchanged. Native local synthetic frame evidence is recorded separately from production and physical-device evidence.

October 10 ADR103 supersedes ADR101 appearance: every positive right-side bubble shows its number, including one, in the same 24px slot. Parent totals still count distinct exact open proposals while the owner clarifies how shared proposals should contribute to child sums.

## October 11: proposal count drilldown

ADR105 preserves distinct open-proposal totals, including numbered one. Both Library views use separate 44px bubble buttons; selecting them leaves the current branch and insight unchanged. The native mobile sheet and centered desktop dialog list unique current open proposals with project, short description, lifecycle and available specific related topics. Full review uses the existing proposal route. A question-mark help control explains why overlapping child totals may exceed their parent. Counts and lists reuse loaded bounded authorized pages, with no per-node requests. Incomplete or invalidated proof clears the sheet; zero and closed proposals have no Library bubbles. Close and Escape restore visible opener focus without scrolling.
