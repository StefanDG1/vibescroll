# Quiz onboarding with a shared Home preview

R146 corrects the agent's interpretation of R145 on November 2, 2026. The owner never requested removal of the quiz. The requested replacement applies to the recommended-post picker: show recommendations directly in the existing Home experience and let users scroll.

The owner now requests the complete [V1/V2 review](ONBOARDING-V1-V2-REVIEW.md) under R148 before application implementation. This shorter document records the correction; use the review for the proposed screen sequence, research, visual references and remaining approval. Simplify each screen, not the useful step count. Connect later is approved and does not block app entry.

## Intended flow

R149 makes the proposal link-first: explain lost useful links and difficulty applying ideas, then teach send → understand → apply. Define product terms in context. Existing saves/imports are optional; the Home preview and retained result teach the flow without requiring prior source-platform saving.

1. Keep the resumable onboarding quiz. Improve its goal and interest questions, adapt relevant steps for developers/founders and teams, and preserve existing answers. Use one clear question per screen and visible choices without dropdowns.
2. Explain what each step enables with concise copy and step-specific graphics. Show how a link becomes insights and how insights become a project plan. Keep the mascot removed. Use purposeful transitions, selection feedback, back navigation and reduced-motion support.
3. Use the quiz answers to choose eligible ready recommendations. Render them directly with the existing Home feed, post reader, insight cards and proposal components, through an adapter for authorized guest data and actions. Do not build a separate onboarding gallery or ask users to pick a card before seeing the real reader.
4. Guide the user in place through the real post and its insights. Keep search available as a secondary control. Scrolling uses the established desktop/mobile Home behavior. Preserve the earlier one-complete-result preview contract; scrolling metadata does not grant additional full results or private/catalog access.
5. Create the account, then include a dedicated Connect your assistant step. Recommend ChatGPT and offer another supported MCP client such as Codex. MCP setup belongs in onboarding, not only in advanced settings. Keep GitHub/repository setup optional, preserve the Pro paywall and store the exact return destination. After verified access, keep the chosen cached result once, return to Home and continue the real project/proposal workflow. Existing users do not repeat completed connections.

## Required MCP setup

R147 adds ChatGPT connection or equivalent MCP access to onboarding as a core app requirement. R148 resolves the access question: offer Connect later and allow app entry through the normal Pro gate. After skipping, show the concise credit explanation in the review. After verified connection, prefer supported assistant work without another activation checkbox. Keep provider, entitlement and actual executor requirements; a connection alone does not establish automatic Events processing.

Reuse the existing connection guide, public descriptor and account-scoped OAuth mechanism. Present ChatGPT first, with a supported alternative client. Preserve valid existing grants and automatically permitted personal/joined-team defaults, explicit disabled access, current membership and each member's own Pro. Do not add another library-scope checklist or require recreation of the working plugin.

Explain only the immediate action: connect the chosen client, return to VibeScroll and check its observed status. Keep progress and the chosen post through external navigation and offer retry/resume when connection is incomplete. Treat issuing a grant, successful authentication and a successful host tool call as separate observations. Do not display Connected solely because a link was clicked. Use a supported return/connection receipt when available and one bounded read-only MCP check after the account has the entitlement needed for that read. OAuth setup before payment does not bypass paid library or processing access.

Connecting MCP lets the assistant access authorized retained context and use supported proposal tools. It does not establish hosted subscription inference or enable the Events monitor. Automatic background analysis remains separate from ordinary MCP connection, with its actual readiness and provider requirements. No model request, credit charge or source acquisition follows merely from connecting.

## Implementation order

- Restore the quiz entry and preserved-answer/back/resume behavior. Keep useful R145 fixes to choices, consent sequencing, motion and error recovery.
- Identify the existing Home reader components and extract only the minimum data/action adapter required for the guest preview. Keep anonymous authorization and preview limits outside the view.
- Add explanatory graphics and polished stage transitions. Avoid duplicate tutorial text, extra mandatory choices and decorative loading delays.
- Verify quiz to shared feed, full-preview boundaries, sign-in/assistant/GitHub/paywall resumption and post-access return. Cover an existing connection, incomplete external setup, expired/revoked access, retry and a read-only host check. Implement app-entry blocking only after the owner clarifies that gate. Check desktop/mobile, both themes, keyboard focus and reduced motion. Capture each step before publication.

## Current state

Website3748525/backend796b2cf remain the last verified live build. That website removed the quiz and uses a separate searchable starter gallery. Its production receipt records actual behavior; it does not establish acceptance of that mistaken design. This correction is a plan and instruction update only. No application correction or new deployment is claimed.
