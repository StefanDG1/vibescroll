# ADR 105: Distinct proposal totals and bubble drilldown

Status: accepted by the owner, October 11, 2026.

## Decision

Keep distinct current open proposals as the count unit. A proposal cited under several child topics contributes once to each applicable ancestor, so overlapping child totals need not add to the parent. This resolves ADR103's pending aggregation question. Every positive total, including one, remains numbered; zero and incomplete totals remain hidden.

In both Tree and Folders, tapping a right-side bubble opens its unique open proposals without changing the branch or expanding the insight. A separate 44px button avoids nested controls. Show each proposal's title, short description, project, current lifecycle and most specific available related topics. Selecting the proposal follows the existing full review route. Closed and merged proposals remain in Projects.

A question-mark control explains: "A proposal can relate to several topics. Each total counts it once." The drilldown repeats a concise explanation. Mobile uses a native modal sheet with a scrollable list, visible close control, Escape and native focus containment. Closing returns focus without scrolling the tree. Desktop uses the same content in a centered dialog.

## Data and authority

Reuse the existing bounded, authorized proposal projection. Bubble opening performs no backend request, inference or record change. Lists and totals deduplicate by proposal ID and use the same lifecycle predicate; exact source generation, revision and insight identity remain mandatory. List entries are derived from current pages, never retained copies. A changed scope, missing selection, invalidated or incomplete proof removes the sheet. Related-topic labels come only from returned metadata. Local Show more reveals five more already loaded proposals.

## Verification

Test parent and leaf totals, shared references, duplicate lifecycle replacements, stale revisions, incomplete proof and unavailable topic metadata. Verify separate bubble/category activation, project routing, focus, small viewports, both themes and both representations. Local fixtures are labeled synthetic; they do not establish real positive historical-proposal, physical-phone or independent-user acceptance. Record exact release evidence separately.
