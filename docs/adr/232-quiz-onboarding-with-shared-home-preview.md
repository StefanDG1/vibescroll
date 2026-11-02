# ADR232: Keep the quiz and reuse Home for recommended posts

Status: owner clarification R146, November 2, 2026. Planned correction; not deployed.

The owner wants an improved onboarding quiz with clearer steps, better animations and graphics explaining the app. The agent incorrectly removed the quiz under ADR231. That interpretation is superseded.

Keep the quiz and its saved answers. Replace only the recommended-post picker with the existing Home feed and shared post, insight and proposal components. Personalize eligible ready recommendations using quiz answers and teach the real interactions in place. Keep the mascot removed, copy concise and choices visible without dropdowns.

Preserve the existing one-complete-preview, account before optional GitHub/payment, verified Pro, stored progress and personal/team authorization contracts. A shared view does not grant a guest the authenticated Home query or unrestricted actions. Adapt authorized data/actions at the boundary and keep one component implementation.

Record deployed behavior separately from desired behavior. Ask about ambiguous changes that remove a previously requested flow before implementation. Follow [the corrected design and ordered work](../design/SEARCH-FIRST-ONBOARDING.md).
