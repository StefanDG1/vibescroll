---
name: VibeScroll widget
description: Host-native saved knowledge with current evidence and explicit project review.
colors:
  bg: "#fff"
  surface: "#f8f8f8"
  hover: "#efeff0"
  ink: "#202123"
  muted: "#6a6c73"
  line: "#e5e6e8"
  accent: "#087762"
  positive: "#e9f5f0"
  dark-bg: "#202123"
  dark-surface: "#292a2d"
  dark-hover: "#36373b"
  dark-ink: "#ececf1"
  dark-muted: "#b0b1b8"
  dark-line: "#424349"
  dark-accent: "#8be2c5"
  dark-positive: "#253f36"
  focus: "#108c77"
  error: "#ad3535"
  dark-error: "#ffaaaa"
typography:
  headline:
    fontFamily: "var(--font-sans, ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif)"
    fontSize: "28px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.025em"
  title:
    fontFamily: "var(--font-sans, ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif)"
    fontSize: "22px"
    fontWeight: 550
    lineHeight: 1.45
    letterSpacing: "-0.02em"
  row-title:
    fontSize: "16px"
    fontWeight: 550
    lineHeight: 1.5
    letterSpacing: "-0.015em"
  body:
    fontFamily: "var(--font-sans, ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif)"
    fontSize: "13px"
    lineHeight: 1.8
  claim:
    fontSize: "14px"
    lineHeight: 1.85
  label:
    fontSize: "12px"
  metadata:
    fontSize: "10px"
rounded:
  tag: "5px"
  control: "8px"
  field: "10px"
  evidence: "11px"
  card: "12px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "20px"
  xl: "25px"
  page: "32px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.bg}"
    rounded: "{rounded.control}"
    padding: "0 14px"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 14px"
  search-field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.muted}"
    rounded: "{rounded.field}"
    padding: "11px 13px"
  navigation-item:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.control}"
    padding: "11px 13px"
  status-badge:
    backgroundColor: "{colors.positive}"
    textColor: "{colors.accent}"
    rounded: "{rounded.tag}"
    padding: "5px 8px"
  source-card:
    rounded: "{rounded.card}"
    padding: "20px"
  evidence-list:
    rounded: "{rounded.evidence}"
    padding: "0 17px"
---

# Design System: VibeScroll widget

## Overview

**Creative North Star: "Library desk"**

This document governs `apps/widget` only. The approved Operate direction combines A's Library desk, B's inline cited cards and C's project review. The owner prioritizes the small inline ChatGPT widget; the expanded workspace is secondary. Quiet neutral panels keep a saved claim, its current source evidence and its next action close together. The host supplies the sans-serif family and theme. The widget adds compact controls, line-based structure and restrained mint status accents.

The widget is a working view inside ChatGPT or Codex. Its design authority is `APPROVED-DIRECTION.md`, the code-led Library desk seed `d0b8b751`; the website's Atlas and marketing systems remain separate. Extraction uses `src/style.css`, `src/app.tsx`, `src/components.tsx`, `src/host.tsx`, `src/library-edit.tsx` and `src/evidence-filing.tsx`. The six original images in the repository's `.impeccable/review` directory are illustrative DEV fixtures. `finish-review.md` records ship for three scored corrections only. Those images establish no live host or production acceptance.

The compact follow-up adds `compact-card-bridge.png`, `compact-status-bridge.png` and `compact-card-mobile-bridge.png` in that review directory. They capture generated production HTML through a local AppBridge with synthetic scoped responses, including the 320px dark card. `compact-finish-review.md` records ship for the sole status identity/truth correction. Five local AppBridge scenarios pass, as reported in the follow-up handoff. This evidence does not establish actual ChatGPT/Codex, OAuth or production-account acceptance. The follow-up changes behavior documentation, not the visual world or tokens.

The compact citation refinement uses `compact-five-references-bridge.png` and the updated `compact-card-mobile-bridge.png`. These synthetic local AppBridge captures show the generated production card at 680px light and 320px dark. `compact-citations-finish-review.md` identified clipped source titles; `compact-citations-finish-verdict.md` records ship for the resolved source-title correction only. The builder reports six AppBridge checks plus passing widget types, lint and build. This evidence establishes no live-host, CSP, OAuth, production-account or whole-widget acceptance.

The later published cache correction has a bounded actual-host receipt at `docs/operations/evidence/launch-20261026-mcp-widget-cache-publication.json`. At frontend `a7a48cb6a4e10f023c78e581ac64d2b6ac3039a7`, the refreshed existing ChatGPT plugin received current HTML with developer CSP enforcement on. Native pointer disclosure displayed two, five and two citation rows, retained toggle focus and opened the host's expanded Library with four bounded rows. Live keyboard activation did not pass that automation. Actual Codex rendering, fresh customer OAuth and the full accessibility and access matrix remain open. Serving baseline `97dfa2c` inherits this earlier compact receipt; it establishes no source-judgment write acceptance.

The source-review follow-up adds `src/source-review.tsx` without changing the approved visual world or token values. The opened synthetic AppBridge captures `inline-source-review-desktop.png`, `inline-source-review-mobile.png` and `expanded-source-review-mobile.png` show the full claim, source evidence, saved note and all five choices at 680px light and 320px dark/light. Thirteen compiled AppBridge cases pass in `.impeccable/review/feedback-final-contract-bridge.log`, including 44px judgment targets in expanded Library and Scroll at 320px. The finish review found one shared judgment-target gap; the same reviewer recorded that correction resolved and ship in the conversation only. The single detector result at `.impeccable/review/feedback-detector.json` has zero primary findings and 44 incumbent CSS advisories, with no new style finding. Eighteen new backend cases and 48 focused MCP/access/schema cases pass. These local results establish no real-host feedback write, account import or deployment. The final offline check passed full types, lint and both builds, with 1323 Vitest, 19 Node and 70 Python passes; three hosted and seven Windows-inapplicable cases remain skipped. Matching staged and production verification remains pending.
Later actual-host evidence is recorded separately in `docs/operations/evidence/launch-20261026-mcp-widget-cache-publication.json`. Commit `a7a48cb6a4e10f023c78e581ac64d2b6ac3039a7` rendered the current compact card in an existing-account ChatGPT session with developer CSP enforcement on. Native pointer disclosure changed the reference rows from two to five and back, retained focus, and opened the native expanded panel with bounded Library navigation. Live keyboard activation did not pass that automation. This receipt verifies those recorded card and Library reads only; Codex visual acceptance, fresh-customer OAuth, the full access and accessibility matrix, and richer editing remain open. The earlier cached-card observation retains its original non-pass.

The topic editor follow-up adds `topic-editor-desktop-bridge.png` and `topic-editor-mobile-bridge.png` under `.impeccable/review`. These are valid synthetic AppBridge captures of generated production HTML, including the 320px dark editor. `topic-editor-detector.json` contains the one detector pass with no findings. The fresh finish reviewer found that closing the disclosure could discard an unresolved change. The form now remains mounted after its first reveal. The same reviewer cleared that scored recovery fix only and returned ship for that fix in the conversation handoff. The topic-editor handoff recorded ten passing local scenarios in `library-final-bridge.log` and the then-current `widget-bridge-result.json`, including collapse during save and after a lost reply with one write and one receipt reconciliation. The current aggregate result has since grown to fifteen scenarios. These checks establish no live edit acceptance, scope or grant mutation, deployment, or whole-widget acceptance. Earlier compact and actual-host evidence retains its own scope.

The inline idea-filing follow-up adds `inline-idea-filing-desktop.png` at 680px light and `inline-idea-filing-mobile.png` at 320px dark under the repository's `.impeccable/review`. The builder opened both valid captures after the final fix. They show compiled production HTML through a synthetic AppBridge, not actual ChatGPT editing. The fresh finish reviewer found an empty-page continuation bug; the same reviewer cleared that scored fix and returned ship for that fix only in the conversation handoff. No separate review file was created. `filing-bound-navigation-bridge.log` and the current `widget-bridge-result.json` record fifteen passing local scenarios, including an empty filtered first filing page that retains manual continuation without cursor draining. The one detector pass in `filing-detector.json` found zero primary findings and 44 incumbent CSS advisories at lines 1336 and earlier, with none in the new filing styles at line 1443 onward. Those advisories do not become design rules. Builder checks report 29 filing backend cases and 62 scoped cases passing. The full check before the final UI fix reported 1364 passes and three skips, 19 Node passes, and 67 Python passes with five skips; types and the widget build passed after that fix. Filing remains default off and unpublished. These checks establish no live editing, new OAuth consent, production schema release, deployment or whole-widget acceptance. Earlier compact, topic-editor and actual-host evidence retains its original scope.

**Key Characteristics:**

- Small inline cited cards are the first-priority experience; expansion is explicit.
- Evidence stays beside the selected claim on wide screens.
- Native controls and semantic Lucide icons carry the actions.
- Project stages and authoritative receipts describe recorded state.
- Light and dark appearance follow the host.

## Colors

The palette uses neutral canvas and ink, with mint reserved for semantic accents. Frontmatter records the literal CSS values; `dark-*` entries replace the corresponding light variables under the dark root.

### Primary

- Accent mint marks evidence references, selected feedback, checkbox selection and positive text. Positive tint supplies the associated status background and text-selection fill.
- Focus mint is the fixed keyboard outline for ordinary controls. Search and URL field wrappers instead use the current theme's accent.

### Neutral

- Canvas is the main working background. Surface separates the rail, search field and selected insight without raising them.
- Hover supplies active navigation and control backgrounds. Ink and muted distinguish current content from supporting source metadata.
- Line separates rows, panels and card edges. Dark equivalents preserve the same assignments.
- Error red and its dark equivalent identify visible failures alongside explanatory text and recovery controls.

**The Semantic Mint Rule.** Use mint for evidence and recorded state. Primary actions use reversed ink and canvas.

## Typography

Use the host's `--font-sans`, with the system stack in frontmatter as fallback. There are no custom font assets and no marketing display face in the widget. This native type choice is explicitly approved for Operate.

Page headings use the headline role. Section headings use title; insight rows use row-title. Body copy inherits the compact body size, while metadata ranges through 10px to 12px. The current implementation also contains 9px mobile navigation labels; that small annotation size is descriptive evidence, not a new minimum for future controls.

Evidence detail has a larger reading hierarchy: its title is 25px with 1.45 line height and its claim uses the claim role, capped at 70ch. The dedicated detail route uses a 30px title and 16px claim. Inline detail uses a 20px title and 13px claim. Titles and claims wrap; claims and source references permit long-word breaking. Page headings reduce to 25px at the mobile breakpoint.

**The Readable Claim Rule.** Preserve complete claim and source wording. Let text wrap and the container grow.

## Layout

The expanded shell has a 208px rail, a header at least 66px tall and a main area capped at 1500px with page padding. Library uses a two-column grid, `minmax(0, 1fr) minmax(280px, 0.8fr)`. The evidence inspector has a left divider and 25px left inset. Selecting an insight on desktop updates this inspector without navigating away from the list. Checkbox comparison selection is separate from opening an insight.

Source cards use three equal columns with 16px gaps. Project review uses three equal columns with 18px gaps for current evaluations, private proposals and plans/runs/PRs. Those stages express distinct review records rather than completion percentages.

- At 1050px and below, the rail becomes 175px, main padding becomes 25px, source cards use two columns and project stages become one column. The Library inspector minimum becomes 250px.
- At 760px and below, the rail disappears, the header becomes at least 58px tall and main padding becomes `23px 18px 85px`. Library and topic layouts stack; source cards use one column. Opening an insight uses a dedicated detail route with Back to library. Five fixed bottom destinations provide Home, Library, Save, Projects and Account, with safe-area padding.
- At 380px and below, horizontal page padding becomes 14px. Search takes the full tool-row width; tabs and action gaps tighten. Long titles and controls continue to wrap.
- Compact inline results have 20px padding, a small product heading, an explicit expand action and cited detail. When the current connection permits feedback, a collapsed Review this source disclosure follows the source and conversation actions. Its first opening loads the private saved judgment; the initial card does not read it. Inline cards omit application navigation. Expansion requests the host's fullscreen mode; errors remain visible if that request fails.

Normal save and fetch responses attach the compact resource with client-only route metadata. The card opens the saved-source status or cited result directly. Status reads remain headless so refresh and polling do not add repeated cards to the conversation. The expanded workspace remains available through the explicit expand control.

Explicit route navigation focuses the labelled main region. Returning from detail to Library focuses the invoking insight button using its saved key. These focus handoffs preserve keyboard orientation; the current fixture review does not establish all host, zoom or physical-device behavior.

## Elevation & Depth

Working panels are flat. Background tones and thin borders separate regions. No card hover lift or decorative cast shadow is defined. The fixed notification is the one recurring elevated element, with `0 8px 30px #0002`; it sits above the workspace and above mobile navigation.

**The Flat Workspace Rule.** Use tone and borders for persistent panels. Reserve the recorded shadow for transient notifications.

## Shapes

Controls use compact, gently rounded rectangles. The control, field, evidence and card radii in frontmatter form the recurring vocabulary; nearby 7px and 9px values appear in secondary controls and selectors. Tags are tighter than cards. Avatars and scroll-step buttons are circular. Borders are generally 1px using line, while active Library tabs use a 2px ink underline.

## Components

### Buttons

The shared action wraps the Apps SDK UI Button with `pill={false}`. Primary actions reverse ink and canvas; secondary actions use transparent backgrounds and line borders. Local action styling sets a 40px minimum height, 13px type and weight 550. Busy actions show a labelled context with a Lucide loading icon and disable repeated submission. Disabled controls use half opacity and the default cursor. Outline hover uses hover tone. SDK styling remains part of the actual control presentation.

Keyboard-visible controls use a 2px focus outline offset by 3px. Navigation rows, tabs, protected source actions, source-review summaries and judgment choices use at least 44px height, but the current header refresh and inline expand controls are smaller. The native source-review summary retains browser focus styling. Do not describe the entire current widget as meeting a universal 44px target.

### Chips

Status badges pair semantic text with positive tint and accent. Neutral tags use a line border with compact metadata. Feedback choices are buttons with `aria-pressed`; recorded selection adds accent border and positive tint. Status meaning must remain in text rather than color alone.

Source judgments use the existing compact rounded-button treatment with 12px labels, 8px vertical and 12px horizontal padding, and a 44px minimum height. The five choices wrap with 7px gaps. The selected state reflects the canonical saved judgment, and its matching unchanged note disables a duplicate submission. A note correction makes that same choice available again.

### Cards / Containers

Source and work cards use card radius, a line border and 20px padding. Project review cards use evidence radius and 18px padding. Evidence lists group citation rows inside one outlined container, separate adjacent rows with line and preserve the full source title. Insight list rows use bottom dividers; selection adds surface tone and field radius.

Compact citation rows use two equal flexible columns for the exact reference and source title, with a 12px gap and 10px vertical padding. Both columns allow long-word breaking. Complete source titles wrap even at 320px; the card grows to fit them.

### Inputs / Fields

Search has a surface background and field radius. URL capture is outlined and wraps its submit action below the field on narrow screens. Both wrappers use a 2px theme-accent `:focus-within` outline offset by 3px, so the inner input's suppressed outline does not hide focus. Optional notes are labelled, vertically resizable textareas. Failures use visible alert text with a retry or retained request where supported.

### Navigation

Expanded navigation combines semantic Lucide icons and text in rows at least 44px tall. Active rows use hover tone and stronger ink. Library view controls use an underline; Tree/Folders and scroll/list selectors expose pressed state. Mobile navigation uses labelled icons and `aria-current` for the current route. Workspace selection and refresh stay in the header. Compact inline results have no application navigation.

### Topic organization

Expanded Topics exposes Organize topic only when the current connection advertises organization authority. This capability defaults off and requires explicit `knowledge:write` consent from a whole-library writer. The editor never acquires that consent itself. Read-only connections retain topic evidence and protected-app recovery.

Use a native details disclosure inside the existing flat evidence container. Its summary has a 40px minimum height; the container uses evidence radius, a line border and `14px 16px` padding. Name and Folder and aliases are separate fieldsets with legends and top dividers. Labelled native input, select and vertically resizable textarea controls use control radius, a canvas background and theme-accent keyboard focus. Actions wrap within the available width; error and result text break long words. These are scoped editor styles, not new global tokens.

First reveal lazily loads the current topic and layout versions. Closing the disclosure hides the form but preserves its mounted state, including a pending request and its recovery controls. Rename and pin submit separately from folder and aliases. Folder choices describe the currently loaded topic page; an existing folder outside that page keeps an explicit label. Names follow the current field limits and aliases accept up to eight names, one per line.

Busy or unresolved changes disable the fields. Success requires a canonical receipt matching the connection, grant, topic, operation, request key and resulting versions. Its `processing_started` value is false; topic organization dispatches no processing. An uncertain reply retains Check change result. Retry same change appears only after reconciliation returns no confirmed receipt and reuses the exact change and request key. Review current topic reloads current authority and versions for a deliberate new change. A closed and reopened disclosure must preserve this recovery path.

### Idea filing

File this idea is a collapsed native details disclosure inside the cited inline card. The claim, complete source evidence and existing evidence actions remain visible. The same component appears in expanded source detail and Scroll. It renders only when the current connection advertises organization authority and the insight has an exact source, generation, revision and insight reference. The default-off editing gate, whole-library `knowledge:read`, new explicit `knowledge:write` consent and current writer authority remain required. The widget never acquires consent itself.

A thin top divider, 20px top margin and 8px top padding separate the disclosure from the card actions. Its summary has a 44px minimum height and weight 550. Labelled native selects span the available width, use control radius, canvas and line colors, and retain native appearance. Selects use the theme-accent focus outline. Filing actions wrap with an 8px gap; error and result text break long words. These scoped styles reuse the current system without adding tokens or app navigation.

First reveal reads current filings and permitted destination topics. Closing the disclosure keeps the revealed form mounted. Current topic filing selects an exact membership; a removed filing carries a Removed label and Restore to this topic. Move to topic offers loaded permitted topics and the explicit Move idea action. Remove from this topic removes that membership. Moving retains the prior membership as removed so it can be restored. These actions change topic organization only. The saved source, its access and analysis state stay unchanged.

Each filing read examines up to twelve memberships and filters historical or unavailable records. A page can therefore show no current filing while returning a next cursor. Empty copy describes the loaded pages and retains Load more idea filings whenever continuation exists. Destination choices also describe loaded permitted topics and offer Load more destination topics where available. Neither cursor advances automatically. A missing current filing points to the full library to add or find one, without claiming that the whole library is empty.

Busy or unresolved commands disable fresh changes. An unknown reply retains the exact request through disclosure collapse and offers Check filing result. A successful change requires a confirmed receipt matching the request and its authority. A missing receipt enables Retry same filing with the same payload and key. Review current filings reloads current authority and versions before a deliberate new decision. Leaving the card or changing authority does not replay a command after unmount.

The same unpublished candidate receipt table preserves topic-edit receipts and adds an optional evidence receipt plus a source cleanup index, for five indexes total. This remains one candidate table relative to production. Schema release and explicit provider, client and user consent are separate release steps. A local receipt or screenshot does not establish either step or actual ChatGPT editing.

### Evidence and project review

The selected detail includes coverage, full claim, source evidence and the protected source action. Add to conversation deliberately attaches only the selected content and citation. Its availability follows host capabilities, with a visible explanation when unsupported. Feedback refers to the exact source version and shows the returned saved version. Its receipt does not claim measured benefit.

Compact detail initially displays the first two returned evidence references, or all when fewer are returned. When more than two exist, Show N more references reveals the remaining returned references and becomes Show fewer references. The same native button exposes `aria-expanded` and `aria-controls` and retains focus. This disclosure uses local state and makes no RPC. The full claim, complete source titles, Open source evidence and Add to conversation remain available. Attachment still uses the complete selected insight context, independently of the visible reference rows. Expanded workspace detail displays the full returned reference list without this disclosure. Coverage value `ordered_media` reads Timestamped media evidence; the label does not imply complete coverage.

The compact saved-source status card leads with the authoritative source title, or an explicit shortened source-ID fallback when no title is returned. The current status appears below it, followed by neutral result or recovery guidance. Refresh status reconciles the same source, and View source opens its current result. Do not infer a Cloud route from a saved or completed status. The removed fixed Cloud eyebrow is not part of the component.

Snapshot export requests a host-native download for the selected bounded content. Host acceptance is reported as acceptance, not proof of a file saved on disk. An unsupported or rejected download exposes a labelled, read-only JSON field that the user can copy into a `.vibescroll` file. Opening a host-provided file requires the advertised `openai/resource` capability and validates the bounded snapshot; viewing it does not import data or grant execution authority.

When a saved analysis preference is present, the save form initially selects Save only for this source. The user can deliberately uncheck it to ask the existing Work Cloud flow to process that one source. This preserves the global preference. Saving alone does not start duplicate analysis, and running or uncertain work retains recovery guidance.

Project stages keep evaluation, private draft and execution review distinct. Viewing a board or preparing a draft grants no coding, spending, publication or deployment authority. Preserve the existing security and copy decisions when extending these components.

### Source judgment review

Review this source is a native details/summary disclosure in compact cards. A thin line separates it from the cited result, with 20px top margin and 8px top padding. Its open content uses the same controller as expanded source detail and Scroll. Expanded views show the review body directly. The compact disclosure adds no navigation or separate edit route.

The body asks How useful is this source? and explains that the current connection's judgment applies to this exact source version. It displays the saved action and version above Useful, Not relevant, Already implemented, Unsupported and Later. A labelled, vertically resizable Optional note field has an 8px radius, line border, canvas background and 10px by 12px padding. It retains the host's font and exposes theme-accent focus. Text and recovery controls wrap at 320px; the card grows to fit the content. Choosing a judgment saves the trimmed note with it. Judgment saved · Version N appears only after the write acknowledgement and a matching canonical keyed read.

The existing knowledge:read and feedback:write permissions govern this component. Its indexed read checks at most 51 records and returns only the current actor/client's judgment for the exact source generation and revision. The server supplies a stable first-request key, and an incomplete bounded lookup offers Review this source in VibeScroll rather than an empty editable state. Before saving, the controller rechecks the connection authority fingerprint. Failed access or a changed identity hides private fields and blocks submission until authoritative recovery.

An uncertain reply keeps the request while the disclosure is collapsed. Check saved judgment reconciles its existing key; Retry same judgment retains its payload, key and expected version. A conflicting newer judgment requires Review current judgment before a correction. Unmounting does not replay the command. Browser storage contains no notes or tokens. Recording a judgment starts no processing and grants no analysis, sharing, funding, coding or publication authority. The confirmation explicitly distinguishes a recorded judgment from measured benefit.

### Theme, motion and state

The MCP host bridge applies document theme and host style variables, including font family. It listens for host-context changes and switches the widget's dark class. Account explains that appearance follows the host; the widget has no independent appearance toggle. DEV `theme=dark` is a fixture control only.

The only authored animation is the loading icon's one-second linear rotation. `prefers-reduced-motion: reduce` stops it. Loading uses output content; view failures and action errors expose alerts; notifications use output with a labelled dismiss action. Empty bounded pages explain their limited scope and retain available manual loading or recovery actions.

Saved-source status performs its initial authorized read even when the document is hidden. Repeated polling runs only while the document is visible and the returned job state is active, with its interval bounded to 60 seconds. Hidden documents pause polling. Uncertain status offers reconciliation rather than starting replacement work. Compact status changes use a polite live region.

## Do's and Don'ts

### Do:

- Do use host-native type and host-provided theme changes.
- Do keep the complete claim, source evidence and explicit next action together.
- Do preserve native keyboard controls, labelled fields, visible focus and route focus recovery.
- Do retain authoritative receipts, current source versions and explicit recovery text.
- Do load and confirm the current connection's exact-source judgment before showing saved review state.
- Do distinguish fixture review from live host and production acceptance.
- Do reuse the existing original brand asset where an icon asset is required. No raster artwork ships in this widget build.

### Don't:

- Don't import the website's palette, custom fonts or marketing composition into this widget.
- Don't invent whole-library counts, progress percentages or measured-benefit claims.
- Don't treat selection, draft preparation or review as execution approval.
- Don't add application navigation to inline cited cards.
- Don't infer complete accessibility or host acceptance from fixture screenshots or local AppBridge scenarios.

Not canonized: the existing uppercase sidebar group label, letter-v brandmark and small annotation sizes are not reusable design rules. The native font is an owner-approved host convention. Removed generic insight eyebrows remain removed; no decorative illustration or new raster is part of this system.

## Combined candidate evidence

The integration branch combines the already reviewed topic editor, idea filing and source-review components without changing the approved visual world or tokens. The320px dark `integrated-card-mobile.png` capture shows both compact disclosures open after one idea move and one source judgment. The builder opened it and checked the full claim, evidence, labels, saved note and independent confirmations. Twenty-two pre-existing AppBridge cases and one combined case pass. These are synthetic compiled-resource checks; they establish no new production schema, edit consent or actual-host write acceptance. Earlier finish reviews retain only their originally scored scope.
