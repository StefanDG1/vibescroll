---
name: vibescroll-project-review
description: Apply saved VibeScroll insights to a selected project, save or revise a private proposal from chat, and resume a saved proposal in another chat.
---

# Review project relevance

1. Discover the intended project through `get_profile(profileId, detail=summary)` when supported. Read full context only for the selected project. A selected repository grants no code access or execution authority.
2. Read `get_project_application_context` with the exact source, project and intended analysis version. Use all post insights by default, up to twenty. Narrow `insightIds` only when the user asks. Preserve returned IDs, references and contextHash. The project profile is not inspected code. Inspect separately authorized code before concrete implementation claims.
3. Keep relevant, no-fit, already implemented, unsupported, needs-context and deferred outcomes distinct. Missing evaluation pages are not evidence that the full library was reviewed.
4. Write and refine the plan in the active chat by default, then persist requested text with `save_project_proposal`. Use exact context and all selected insight IDs, `expectedVersion=0` for creation and a stable key. This uses host reasoning without an API rewrite. The server supplies citations.
5. To resume, prefer `list_project_proposals(detail=summary)` and follow its scoped cursor. Open one ID with `get_project_proposal` and read `get_proposal_discussion` when discussion matters. For an edit, obtain current body/version/review and matching context, preserve the binding, and use current expected values plus a new key. Reconcile stale edits; never overwrite intervening changes. Retry an unknown save only with identical content and its original key.
6. For a legacy server-returned evaluation, `draft_project_suggestion` remains available with its exact evaluation ID/hash and grant version. Do not invent those identifiers to save a chat-written proposal.
7. Save requested discussion with `add_proposal_message`; it generates no model reply. Only when the user chooses hosted generation, use `quote_project_plan` and show the route/maximum before `start_project_plan` or a quoted `reply_to_project_plan`. Missing credits never silently switch routes. Read existing operation state after a `reconcile_first` response.
8. Use the returned review URL for website review. When the user wants an issue, show `preview_project_issue`'s exact plan/repository/visibility. Only explicit approval permits the combined `approve_project_issue` action with current bindings and key. An issue starts no coding. Use `vibescroll-work-review` for publication recovery and outcomes.

Explain the supported relevance, limitations and next reviewed action. A private draft starts no new analysis, spending, coding or publication. Never promote hypothetical benefit to a measured outcome.
