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

This document governs `apps/widget` only. The approved Operate direction combines A's Library desk, B's inline cited cards and C's project review. Quiet neutral panels keep a saved claim, its current source evidence and its next action close together. The host supplies the sans-serif family and theme. The widget adds compact controls, line-based structure and restrained mint status accents.

The widget is a working view inside ChatGPT or Codex. Its design authority is `APPROVED-DIRECTION.md`; the website's Atlas and marketing systems remain separate. Extraction uses `src/style.css`, `src/app.tsx`, `src/components.tsx` and `src/host.tsx`, checked against the six current images in the repository's `.impeccable/review` directory. `finish-review.md` records ship for three scored corrections only. Those images are illustrative DEV fixtures, not live host or production acceptance.

**Key Characteristics:**

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
- Compact inline results have 20px padding, a small product heading, an explicit expand action and cited detail. They omit application navigation and feedback controls. Expansion requests the host's fullscreen mode; errors remain visible if that request fails.

Explicit route navigation focuses the labelled main region. Returning from detail to Library focuses the invoking insight button using its saved key. These focus handoffs preserve keyboard orientation; the current fixture review does not establish all host, zoom or physical-device behavior.

## Elevation & Depth

Working panels are flat. Background tones and thin borders separate regions. No card hover lift or decorative cast shadow is defined. The fixed notification is the one recurring elevated element, with `0 8px 30px #0002`; it sits above the workspace and above mobile navigation.

**The Flat Workspace Rule.** Use tone and borders for persistent panels. Reserve the recorded shadow for transient notifications.

## Shapes

Controls use compact, gently rounded rectangles. The control, field, evidence and card radii in frontmatter form the recurring vocabulary; nearby 7px and 9px values appear in secondary controls and selectors. Tags are tighter than cards. Avatars and scroll-step buttons are circular. Borders are generally 1px using line, while active Library tabs use a 2px ink underline.

## Components

### Buttons

The shared action wraps the Apps SDK UI Button with `pill={false}`. Primary actions reverse ink and canvas; secondary actions use transparent backgrounds and line borders. Local action styling sets a 40px minimum height, 13px type and weight 550. Busy actions show a labelled context with a Lucide loading icon and disable repeated submission. Disabled controls use half opacity and the default cursor. Outline hover uses hover tone. SDK styling remains part of the actual control presentation.

Keyboard-visible controls use a 2px focus outline offset by 3px. Navigation rows, tabs and protected source actions use at least 44px height, but the current header refresh and inline expand controls are smaller. Do not describe the entire current widget as meeting a universal 44px target.

### Chips

Status badges pair semantic text with positive tint and accent. Neutral tags use a line border with compact metadata. Feedback choices are buttons with `aria-pressed`; recorded selection adds accent border and positive tint. Status meaning must remain in text rather than color alone.

### Cards / Containers

Source and work cards use card radius, a line border and 20px padding. Project review cards use evidence radius and 18px padding. Evidence lists group citation rows inside one outlined container, separate adjacent rows with line and preserve the full source title. Insight list rows use bottom dividers; selection adds surface tone and field radius.

### Inputs / Fields

Search has a surface background and field radius. URL capture is outlined and wraps its submit action below the field on narrow screens. Both wrappers use a 2px theme-accent `:focus-within` outline offset by 3px, so the inner input's suppressed outline does not hide focus. Optional notes are labelled, vertically resizable textareas. Failures use visible alert text with a retry or retained request where supported.

### Navigation

Expanded navigation combines semantic Lucide icons and text in rows at least 44px tall. Active rows use hover tone and stronger ink. Library view controls use an underline; Tree/Folders and scroll/list selectors expose pressed state. Mobile navigation uses labelled icons and `aria-current` for the current route. Workspace selection and refresh stay in the header. Compact inline results have no application navigation.

### Evidence and project review

The selected detail includes coverage, full claim, source evidence and the protected source action. Add to conversation deliberately attaches only the selected content and citation. Its availability follows host capabilities, with a visible explanation when unsupported. Feedback refers to the exact source version and shows the returned saved version. Its receipt does not claim measured benefit.

Project stages keep evaluation, private draft and execution review distinct. Viewing a board or preparing a draft grants no coding, spending, publication or deployment authority. Preserve the existing security and copy decisions when extending these components.

### Theme, motion and state

The MCP host bridge applies document theme and host style variables, including font family. It listens for host-context changes and switches the widget's dark class. Account explains that appearance follows the host; the widget has no independent appearance toggle. DEV `theme=dark` is a fixture control only.

The only authored animation is the loading icon's one-second linear rotation. `prefers-reduced-motion: reduce` stops it. Loading uses output content; view failures and action errors expose alerts; notifications use output with a labelled dismiss action. Empty bounded pages explain their limited scope and retain available manual loading or recovery actions.

## Do's and Don'ts

### Do:

- Do use host-native type and host-provided theme changes.
- Do keep the complete claim, source evidence and explicit next action together.
- Do preserve native keyboard controls, labelled fields, visible focus and route focus recovery.
- Do retain authoritative receipts, current source versions and explicit recovery text.
- Do distinguish fixture review from live host and production acceptance.
- Do reuse the existing original brand asset where an icon asset is required. No raster artwork ships in this widget build.

### Don't:

- Don't import the website's palette, custom fonts or marketing composition into this widget.
- Don't invent whole-library counts, progress percentages or measured-benefit claims.
- Don't treat selection, draft preparation or review as execution approval.
- Don't add application navigation to inline cited cards.
- Don't infer complete accessibility or host acceptance from the six fixture screenshots.

Not canonized: the existing uppercase sidebar group label, letter-v brandmark and small annotation sizes are not reusable design rules. The native font is an owner-approved host convention. Removed generic insight eyebrows remain removed; no decorative illustration or new raster is part of this system.
