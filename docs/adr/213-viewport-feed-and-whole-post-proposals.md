# ADR 213: viewport feed and whole-post proposals

Status: backend accepted in production; website staged pending final browser acceptance. October 31, 2026. Owner requirements R123/R124.

## Decision

The owner's fidelity correction supersedes ADR212's natural-height desktop columns. Use the four selected renders as the visual reference. Source and insights share one bordered pane; project plans have a separate pane. Keep desktop columns inside the available viewport, with scrolling for long insights and plan text. Show creator above the desktop poster, categories, description and reactions below it, compact next-post navigation and ready-plan topic fit inside each proposal header. Remove the redundant feed toolbar. Settings open a modal side panel.

Use native vertical proximity snapping, smooth next-post navigation and a visible next-card peek. Mobile has successive source, insight and plan stages, each fitting above its navigation with a peek of the following stage/post. Do not intercept wheel or keyboard globally. Respect reduced motion and retain the existing accessible insight control, modal focus handling, lazy neighborhood reads and Library Tree/Folders.

Insight expansion is reading state only. New proposal drafts resolve all authorized insights from the exact retained post version on the server. Raise the former eight-insight context/binding limit to the analysis maximum of twenty; preserve all evidence references and retry identity. Optional explicit MCP insight subsets remain available when deliberately requested. Do not rewrite existing saved proposals or regenerate any analysis.

The source-wide context is considered when planning; it does not require every insight to appear in the plan. A compact preview cannot silently narrow the saved proposal context. Keep the same transactional save, current project revision, context hash and unknown-outcome retry behavior.

## Honest incomplete controls

Likes and share totals have no durable backend yet. Production shows unavailable totals and a disabled Like control; native sharing or copying a post link works without claiming a new VibeScroll intake event. Only the labeled synthetic demo uses sample counts and local likes. Plan discussion and combined issue publication are shown disabled with an explanation until their persistence/publication adapters are implemented. Existing full-plan and manual-draft workflows remain reachable through their panels.

## Verification

Require whole-post context/save/replay tests beyond eight insights, exact version/auth isolation tests, full local checks and exact CI. Verify four theme/viewport geometries, actual native snapping, in-place settings, mobile nested scrolling and unchanged eight-case Library regression against the production build. The shared composer also requires the official MCP Apps bridge regression. A compatible backend publication must preserve actual no-scan/no-backfill/schema/index/component guards before releasing its website client. No fresh analysis, model API call, OAuth scope or billing migration is needed.

[Backend/staging acceptance receipt](../operations/evidence/launch-20261031-feed-fidelity-staged.json). The main website remains the prior accepted commit until same-build promotion and canonical verification.
