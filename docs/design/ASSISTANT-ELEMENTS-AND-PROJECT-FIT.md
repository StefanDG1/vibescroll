# Analysis status, credit use and project fit

Mode: implementation plan. Owner requests R113 and R114, October30,2026.

## Component choices

Reuse website components in the compact MCP reader. Preserve Library Tree/Folders and the quiet five-destination shell. Put detail behind disclosures and keep one clear proposal action. Use the existing type, teal, border and dark-theme tokens,44px action targets and reduced-motion behavior.

The official assistant-ui ChainOfThought primitive is legacy and requires a message runtime. Its current grouped-message replacement also needs that runtime. ErrorPrimitive requires a message context. VibeScroll's source jobs already have their own authoritative state. Adapt the standalone Elements AgentPlan and ErrorState instead of installing a second chat or inference runtime. Their MIT notice is retained at `licenses/assistant-ui-elements-3fa379f.txt`, pinned to assistant-ui/assistant-ui commit3fa379f814dadb02b9f9ad04e31c2d2ba92df094.

Progress shows observed preparation, transcript/screenshots, analyzer wait, inference and persistence stages. It shows no model reasoning, invented percentage or ETA. An unknown outcome offers review, never an automatic retry. Failed reanalysis keeps the incumbent analysis available. Safe user-facing errors do not expose provider output.

## Delivery order

1. Status/error adapters, real source integration, synthetic browser gallery and phone/desktop checks. Preserve existing reactive updates and financial admission rules.
2. Adapt the CostMeter presentation to credits. Derive used/reserved/available from actual pools, distinguish expired unresolved holds, and never infer total use from ten recent entries. Do not change balances, tariffs or rounding.
3. Start the ScoreBreakdown presentation with an explicitly named **topic-fit** rubric from retained post categories and confirmed project purpose/goals/features. Explain matched and unmatched categories. This is a discovery hint, not a success probability, code audit or overall benefit score. Rank strong matches first and make Draft proposal prominent without artificially increasing scores.
4. Add bounded authorized proposal history and similarity. Cache by analysis version, repository/profile revision, rubric and history revision. Same-post history is not similar-post history. Open an existing matching proposal instead of duplicating it. Unknown history, activity and project priority must remain unknown. Synchronization timestamps are not user activity.
5. Expand the rubric only after meaningful data exists: relevance, actionable opportunity, novelty/prior use, evidence confidence, recency/importance supplied by the user, and measured proposal outcomes. Version weights. Separate topic fit from outcome/model quality. A/B testing and model rankings remain the moat roadmap, not claims about today's score.
6. Use tooltip icon buttons for secondary actions with one accessible name, focus/hover help and touch access. Use provider logos only alongside supported provider/model choices. Inspect dependencies and trademark/asset terms before copying logos. A logo does not prove provider support. Avoid a new tooltip dependency when existing controls suffice.

The owner asked for high initial scores to encourage proposals. Prefer understandable scores and strong recommendations grounded in real signals; do not add a favorable constant or fabricate prior success. Proposal creation remains deliberate and separate from implementation authority.

## Inspiration and evidence

The saved000h component-library insights support copy/customization and documented keyboard behavior. They are not assistant-ui insights. The retained Liquid-gooey and Coucou posts also describe different libraries/products. Do not relabel them. Use assistant-ui's own documentation and pinned source for its contracts.

- [Elements](https://www.assistant-ui.com/elements)
- [Agent plan](https://www.assistant-ui.com/elements/agent-plan)
- [Error state](https://www.assistant-ui.com/elements/error-state)
- [Legacy ChainOfThought](https://www.assistant-ui.com/docs/primitives/chain-of-thought)
- [Error primitive](https://www.assistant-ui.com/docs/primitives/error)
- [Score breakdown](https://www.assistant-ui.com/elements/score-breakdown)
- [Cost meter](https://www.assistant-ui.com/elements/cost-meter)
- [Tooltip icon button](https://www.assistant-ui.com/elements/tooltip-icon-button)
- [Logos](https://www.assistant-ui.com/elements/logos)

## Acceptance

Local implementation, exact CI, website publication and real-host acceptance are distinct. Test native keyboard/disclosure/recovery interactions, viewport bounds and dark/light themes. Keep numeric credit calculations in integer units and final-only rounding. Test mixed expiry/revocation/unknown holds. Topic scores must fall when matches disappear, must not match non-goals, and must not imply history was searched. No analysis run is required to verify these presentation components. Update current state only after actual publication.

## Accepted first subset

Websiteb8162b5 and the bundled MCP reader publish observed stages/safe errors, a credit meter from actual pools and topic-coverage-v1 on suggested projects. Exact CI, canonical website checks and ten local compact-protocol cases passed. The score is source-wide and the suggested list remains bounded to three matching projects. History/similarity, duplicate-proposal opening, meaningful activity/priority, outcome scoring, tooltip/logo integration and per-run credit breakdown remain future steps. No fresh real-host score interaction is claimed by the local protocol result. [Production receipt](../operations/evidence/launch-20261030-assistant-elements-production.json).

ADR217 is the next local candidate: topic-history-priority-v2 keeps the displayed coverage fraction, samples authorized historical post categories and actual accepted proposals, offers personal priority inside the existing disclosure, and opens a current same-post plan by default. Current project/source revisions and history/preferences determine its fingerprint; Convex tracks those dependencies. The MCP context tool gains bounded same-post hints without reauthorization or including history in approval hashes. Signed GitHub observations, authenticated agent reports and unknown measured benefit remain separate. Publication and native acceptance are pending; this does not establish prediction accuracy or a customer outcome ranking.

October31 checkpoint: ADR217 is live at6d1ff38 with actual bounded history and sampled Trends. Existing MCP same-post hints passed. [Receipt](../operations/evidence/launch-20261031-history-trends-production.json). M2 correction work preserves returned priority revisions, keeps zero-overlap existing plans with honest scores and prevents older Trends reads replacing live state. Native priority acceptance remains pending.
