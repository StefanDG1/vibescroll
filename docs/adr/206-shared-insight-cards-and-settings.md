# Shared insight cards and focused post settings

Date: October 30, 2026. Status: deployed at website c80038b; backend unchanged. Owner requirements R105–R108.

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

Acceptance: corrected root checks, final types/build, dependency audit, changed-source secret scan and exact CI41050137306 passed. Same-build promotion and canonical exact health passed. Actual post interaction includes four cards, retained540×960 preview, separate evidence, lazy transcript navigation, nested Escape/focus and phone geometry. Actual production Library Tree/Folders switching passed. A phone screenshot timed out; no screenshot acceptance is claimed. See [the dated receipt](../operations/evidence/launch-20261030-insight-cards-production.json). Project hints are discovery-only; the complete application/proposal bridge and real priority/activity signals remain open.
