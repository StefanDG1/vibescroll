---
name: vibescroll-project-review
description: Apply saved VibeScroll insights to a selected project, save or revise a private proposal from chat, and resume a saved proposal in another chat.
---

# Review project relevance

1. Obtain the named/selected project's current granted context through `get_profile(profileId)`. A selected repository grants no code access or execution authority.
2. For a saved post, read `get_project_application_context` with the chosen project and exact analysis/insight selection. Use its references and contextHash. Its project profile is not inspected repository code. Inspect separately authorized code before making concrete implementation claims; ask focused questions when needed.
3. Keep relevant, no-fit, already implemented, unsupported, needs-context and deferred outcomes distinct. Missing evaluation pages are not evidence that the full library was reviewed.
4. Discuss a proposal in the current chat. When the user asks to save it, use `save_project_proposal` with the returned exact context, selected analysis/insight IDs, expectedVersion=0 and a stable operation key. The server supplies evidence references. Keep useful, no-fit and uncertain judgments distinct; do not fabricate repository inspection or measured benefit.
5. To resume, use `list_project_proposals`, follow bounded cursors and retrieve a chosen ID with `get_project_proposal`. To revise, read the current body/version/review, obtain the matching current context, preserve the same source/project/analysis binding and save with expectedVersion, expectedReview and a fresh key. If stale, read and reconcile the edit. Never retry by overwriting a newer version or a reviewer decision. Preserve the returned ID for other chats.
6. For a legacy server-returned evaluation, `draft_project_suggestion` remains available with its exact evaluation ID/hash and grant version. Do not invent those identifiers to save a chat-written proposal.
7. Use the returned review URL for website review. Saving or accepting a planning judgment does not publish an issue or authorize implementation. Chat-written profile-level drafts remain planning-only until the supported inspected-context/handoff flow exists. Record an explicitly requested source judgment through `record_feedback`; do not turn it into a claimed measured outcome.

Explain the supported relevance, limitations and next reviewed action. A private draft starts no new analysis, spending, coding or publication. Never promote hypothetical benefit to a measured outcome.
