# Shared insight cards and focused post settings

Date: October 30, 2026. Status: local candidate. Owner requirements R105–R108.

## Decision

Extract the existing Library insight row into `InsightCardControl`. Library keeps its expansion state, remembered selection, category icon/tone order, proposal badges and drilldown. Posts reuse that same control with a separate sibling gear button and an expandable insight body. No duplicate card design or additional UI dependency is introduced.

Lead the post with the retained source preview, brief overview and insights. Remove the informational Shared analysis and personal-note cards from the main reader without deleting any notes, associations or versions. Put management, history, transcript, source editing, legacy project evaluation, retention and publication in Post settings. Evidence has its own per-insight drawer. Retain actual permission/funding checks inside those controls.

Use the app's existing native dialog approach. Open on an explicitly named gear, support Escape and close/backdrop dismissal, trap focus through native modality, restore the prior focused element and lock background scroll. Mount settings children on first opening and keep them mounted afterward. Transcript/caption links open and focus their exact section even before the drawer has mounted; ordinary later openings do not jump to an old section.

Restore Home, Explore, Save, Work and Account as the five main destinations. Work contains Projects, Proposals and Tasks using current routes. Connections lives under Account. Separate Posts URLs and Home entry remain.

## Project hints and limits

Compute at most three topic-overlap hints from already-authorized source and confirmed connected repository context on the server. Reuse the existing category matcher, prefer positive profile sections and exclude non-goals. Return only project identifiers, names and matched topics. Bind hints to the displayed analysis version and hide them after that version changes until refreshed. There is no inference, additional query or credit charge.

These are source-level discovery hints, not a repository suitability assessment. Review opens existing project context. It does not apply an insight, create a proposal or authorize coding. The complete source-to-proposal button is still open. Explicit priority and meaningful project activity fields do not exist in the current projection; sync timestamps must not substitute for them. Add actual signals before claiming recency/importance ranking.

## Verification

Require full local checks and final TypeScript, actual drawer/card desktop and phone interaction, unchanged Library behavior, exact CI and staged same-build promotion. Parent source authorization/evidence tests inspect drawer contents through a test-only presenter. Separate real-component tests verify lazy closed/open rendering. Browser acceptance must cover Escape/focus, nested evidence/transcript navigation, mobile overflow and background scroll. No backend publication or analysis run is required.
