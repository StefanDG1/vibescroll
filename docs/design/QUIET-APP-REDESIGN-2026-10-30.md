# Quiet app redesign

Mode: implementation reference. Owner requirement R102. October 30, 2026.

## Brief and choices

The owner requests a quick, uncluttered redesign resembling assistant-ui and Codex, using suitable shadcn components and a different icon family. This refines the shared-reader direction in [the demo plan](../strategy/CHAT-FIRST-DEMO.md); it does not implement that entire reader, proposal workflow or embedded ChatGPT UI.

Use familiar neutral surfaces, compact navigation, a clearly identifiable link composer and quiet saved-post rows. Keep the existing VibeScroll brand and user-selected light/dark appearance. Preserve the older five-action mobile navigation and the Library's saved tree/folder interactions. Keep secondary information available through progressive disclosure instead of a dashboard full of competing panels.

Light palette: white `#ffffff`, rail `#f8f8f8`, text `#242424`, secondary text `#636367`, divider `#e7e7e9`, primary action `#29292b`. Dark palette: canvas `#181818`, rail `#141414`, panel `#202020`, text `#eeeeef`, secondary text `#b0b0b4`, divider `#343437`. Retain semantic success/error distinctions. Use the platform sans-serif stack with a modest heading scale and generous space around the composer; do not introduce font downloads.

Layout: quiet sidebar, compact workspace header and a bounded content column. The home starts with one current next step and a link composer, followed by recent posts and projects. Overview charts, connections/activity and library preferences are expandable. The Posts page keeps actual authenticated thumbnails and live status in simple rows. The compact home projection does not include image authority; its recent links use decorative icons rather than inventing image access or adding a new backend read.

Review against the brief: avoid a new grid of decorative cards, animated primary buttons and duplicated Save calls to action. Prefer the current working controls over adding a full chat runtime or replacing the backend. Remove the home CTA sheen and the duplicate capture CTA when the composer already serves that action.

## Components and icons

The app already uses React19, Radix, Tailwind and a shadcn-style Button primitive in `@companynerve/ui`. Keep those primitives. No shadcn MCP tools are connected in this session; use the [official shadcn documentation](https://ui.shadcn.com/docs/components/sidebar), not similarly named third-party paid registries. A newly connected MCP server is not necessary for the small visual change.

Use [Iconoir](https://iconoir.com/) for primary navigation, composer and recent-project icons. Its regular outlines fit the requested style. Phosphor was also inspected through its [official React repository](https://github.com/phosphor-icons/react). Iconoir's free MIT set was selected for this pass. Ten distinct SVGs were copied from the official `v7.12.1` release into a small local React module, with the complete copyright/licence beside it. There is no icon package, hosted icon service, new dependency or licence purchase. Existing secondary/evidence icons need not all migrate at once.

Two saved-insight searches, `icons` and `shadcn`, each examined at most25 permitted posts and returned no matching insight within that coverage. Both still had a next cursor, so this is not a claim that the whole library contains no relevant information. No analysis job or write was triggered by these searches.

## Implementation and verification

- `quiet.css` supplies the app-only layout and appearance overrides after the existing styles. Public pages retain their existing composition.
- `console.tsx` adds the quiet shell, direct Proposals navigation and an expandable library-preferences section. Role, grants, funding and task settings stay enforced as before.
- `studio-home.tsx` moves charts/activity to an initially closed disclosure and mounts their components only on expansion. Recent links and projects remain immediately available.
- `recent-posts.tsx` keeps the existing metadata, pagination, authenticated thumbnails and reactive updates, with quieter row styling and a decorative navigation arrow.
- Iconoir assets and MIT notice are retained under `apps/starter/components/icons`.

The full offline check passed before the final decorative home-icon adjustment: formatting/validation, zero lint findings, all types,1,554 Vitest cases with3 hosted skips, Node/Python checks with existing skips, and both production builds. After that adjustment, the starter TypeScript check and its production build passed again. A local production-build `/demo` request returned200 with the shell, navigation icon paths, synthetic-data label, recent section and closed overview present. This is server-rendered verification, not visual acceptance. The text/background pairs measure15.52:1 and5.98:1 for light text/secondary text, and15.31:1 and8.21:1 in dark mode; this is not a full accessibility audit. Changed tracked source and the new CSS/icon/design files passed secret scanning with zero findings. The final documentation check validated364 documents and12 skill snapshots.

Chrome's normal browser-harness connection initially requested remote-debugging access after the owner reported clicking Allow. The browser-harness utility was updated from0.1.8 to0.1.13 using its supported installation procedure; the initial self-update failed because Windows held the running entrypoint, then the external installer succeeded. The alternative isolated Chrome launch was rejected by automatic approval review with `blocked by policy`; it was not retried through another launcher. The normal connection subsequently succeeded. Browser-only checks passed on the built synthetic demo at1440×1000 and390×844: light/dark appearance, no horizontal overflow, mobile navigation, sidebar collapse/expand, deferred overview mounting and dismissal of the Save dialog. Visual review corrected faint icons, duplicate desktop branding, a dark welcome rectangle and inherited yellow mobile Save styling. The original light preference was restored. These are local checks, not authenticated production acceptance.

No deployment, schema change, data migration, paid model request or spending occurred for this redesign. Direct hosted ChatGPT-plan work stays paused, and the old embedded widget stays disabled. Keep the approved Vercel/funding boundaries when a reviewed release is ready.
