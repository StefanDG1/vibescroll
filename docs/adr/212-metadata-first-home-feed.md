# ADR 212: metadata-first Home feed

Status: first feed checkpoint accepted in production. October30–31,2026. Owner requirements R115-R122.

## Decision

Implement the selected four [refined references](../design/references/home-feed-2026-10-30/README.md) as an incremental working feed. Desktop has a source column, expandable insights and saved project plans. Mobile starts with a tall poster/creator overlay, then scrolls through the same post's insights and plans before the next post. All columns participate in page scrolling. Preserve the five destinations, standalone post/proposal routes and Library Tree/Folders.

Home receives one existing indexed personal metadata page. Cursor pages append without duplicating or reordering existing IDs. Only ready posts enter the analyzed feed. Empty filtered pages do not trigger an unbounded cursor drain: an automatic continuation needs a new browsing gesture after the first batch. Load more remains available. Pending and failed saves remain on Posts.

Full details load only for the active post and its immediate neighbors. Abort distant requests, ignore late responses and retain at most three analyses. The normal-session `/api/feed/[id]` route checks source/workspace access through existing Convex queries and returns a narrow projection. It strips full transcripts, evidence payloads and project profiles. It calculates the existing deterministic topic recommendations on the server. No new Convex function, schema/index, analysis admission or inference call is added.

The active neighborhood uses the existing metadata subscription. Source generation, selected-version/revision and update changes invalidate retained details. The first live observation also reconciles any earlier HTTP response. Access loss clears rendered content and aborts pending reads. Focus revalidates the active neighborhood. Returning to a distant post may reread its analysis; browsing never reprocesses media or debits analysis credits.

Reuse Library's InsightCardControl, SettingsPanel, retained-thumbnail fallback, ProjectFitBreakdown and the actual replay-safe ProjectProposalComposer. Adapt assistant-ui ArtifactCard into an accessible expandable saved-plan card under its retained MIT notice. A saved relevant plan can show its real topic coverage even when collapsed. A planning seed is labeled Draft. Initially show three saved plans and reveal further returned plans explicitly.

## Scope boundary

This checkpoint reads saved plans and creates the existing versioned manual planning seed. It does not pretend to generate a complete AI plan or persist an unsupported chat conversation. Inline version-bound discussion, quoted generated plans, the single Approve & create issue action and copyable work handoff remain the next delivery steps in the [standing plan](../design/HOME-FEED-AND-PLAN-REVIEW.md). Existing issue handoff/MCP capabilities are unchanged. Likes, artificial engagement counts, a fake player and fabricated assistant messages are absent.

Home's compact rail is scoped to Home. Other pages keep their previous shell. The repeated Home header/top Save and setup card are removed from this reading surface; Save remains reachable in navigation and setup remains in Connections. Source details retain advanced management/evidence options.

## Acceptance

- Cursor overlap, bounded detail windows and source-read keys have deterministic tests.
- The loading controller covers distant-request cancellation/late responses, gesture-gated filtered paging, same-cursor manual retry, access loss and initial live/HTTP version races.
- The route tests workspace binding, access failure, non-ready exclusion and projection minimization. The existing whole-route authentication test must include the new route in the proxy matcher.
- Saved-plan tests cover real score disclosure while collapsed and withholding ready-plan treatment from a planning seed.
- Production-build browser checks cover desktop/mobile and both themes, no horizontal overflow, natural column overflow, five destinations, mobile cue above navigation, native click/Enter expansion, evidence dialog Escape/focus restoration and Next post focus.
- Recheck all eight existing desktop/mobile, light/dark, Tree/Folders Library cases. Browser checks use synthetic saved-result fixtures; actual private Home acceptance remains separate.
- Preserve monetary/provider gates. One compatible frontend release requires exact CI, actual fixed Basic/normal queue settings, staged verification and same-build promotion. No backend publication or fresh media test belongs to this checkpoint.

Production acceptance: [exact-commit CI, staged/same-build publication and canonical evidence](../operations/evidence/launch-20261031-home-feed-production.json). Websitecd78c9b is live; backend8e97e18 is unchanged. Inline discussion, generation and combined issue publication remain open.
