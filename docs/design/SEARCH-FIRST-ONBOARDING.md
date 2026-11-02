# Quiz onboarding with a shared Home preview

R146 corrects the agent's interpretation of R145 on November 2, 2026. The owner never requested removal of the quiz. The requested replacement applies to the recommended-post picker: show recommendations directly in the existing Home experience and let users scroll.

## Intended flow

1. Keep the resumable onboarding quiz. Improve its goal and interest questions, adapt relevant steps for developers/founders and teams, and preserve existing answers. Use one clear question per screen and visible choices without dropdowns.
2. Explain what each step enables with concise copy and step-specific graphics. Show how a link becomes insights and how insights become a project plan. Keep the mascot removed. Use purposeful transitions, selection feedback, back navigation and reduced-motion support.
3. Use the quiz answers to choose eligible ready recommendations. Render them directly with the existing Home feed, post reader, insight cards and proposal components, through an adapter for authorized guest data and actions. Do not build a separate onboarding gallery or ask users to pick a card before seeing the real reader.
4. Guide the user in place through the real post and its insights. Keep search available as a secondary control. Scrolling uses the established desktop/mobile Home behavior. Preserve the earlier one-complete-result preview contract; scrolling metadata does not grant additional full results or private/catalog access.
5. Preserve account creation, optional pre-payment GitHub/repository selection, current Pro paywall and stored return destination. After verified access, keep the chosen cached result once, return to Home and continue the real project/proposal workflow. Existing users do not repeat onboarding.

## Implementation order

- Restore the quiz entry and preserved-answer/back/resume behavior. Keep useful R145 fixes to choices, consent sequencing, motion and error recovery.
- Identify the existing Home reader components and extract only the minimum data/action adapter required for the guest preview. Keep anonymous authorization and preview limits outside the view.
- Add explanatory graphics and polished stage transitions. Avoid duplicate tutorial text, extra mandatory choices and decorative loading delays.
- Verify quiz to shared feed, full-preview boundaries, sign-in/GitHub/paywall resumption and post-access return. Check desktop/mobile, both themes, keyboard focus and reduced motion. Capture each step before publication.

## Current state

Website3748525/backend796b2cf remain the last verified live build. That website removed the quiz and uses a separate searchable starter gallery. Its production receipt records actual behavior; it does not establish acceptance of that mistaken design. This correction is a plan and instruction update only. No application correction or new deployment is claimed.
