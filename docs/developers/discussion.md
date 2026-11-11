Keep plan feedback and revisions attached to one saved proposal. Another chat can read the same discussion without recreating the draft.

## Read and persist discussion

1. Call `get_proposal_discussion` for the saved proposal.
2. Follow `continueCursor` when older messages are needed.
3. Discuss the plan in the active chat using the full retained post context.
4. Save requested feedback or a chat-written response with `add_proposal_message`, the current version and a stable key.

This persistence call generates no model answer on VibeScroll's servers. The host's model allowance covers the conversation. Save an agreed plan revision through `save_project_proposal` using its current binding.

If an edit is stale, reread and reconcile intervening feedback. If an acknowledgement is unknown, keep the same key and identical text. Neither state calls for a duplicate proposal. Missing access or evidence needs its specific recovery, rather than paid generation.

## Choose hosted generation explicitly

If you want VibeScroll to generate the plan, call `quote_project_plan`. Review its exact version, quote ID and maximum credits. The quote itself reserves nothing.

Use `start_project_plan` for the accepted generation quote. Use `reply_to_project_plan` when the user chooses a quoted reply that saves their message and queues a refinement atomically. Ordinary `add_proposal_message` remains the persistence route without paid generation.

Read `get_proposal_discussion` to distinguish queued, running, ready, failed and unknown operations. Insufficient user credits and unavailable provider capacity are different blockers. Preserve unknown exposure and do not switch funding or start replacement work. A changed quote needs a new review.

A ready plan can still need project context or revision. Completed generation is not issue approval. Existing insights remain reusable without another video analysis. When the exact plan is ready for publication, continue with [the issue handoff](/docs/workflows/handoff).
