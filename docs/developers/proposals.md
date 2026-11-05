Turn a saved post's insights into a private project proposal, then resume that same proposal from another chat or the website.

## Read the full post context

1. Find the intended project through `get_profile` and read the saved analysis.
2. Call `get_project_application_context` with the exact source, project and intended analysis version.
3. Use all returned post insights by default, up to twenty. Pass a narrower insight selection only when the user requests it.
4. Keep its context hash, version, insight IDs and repository references for the save.

A project profile is not inspected repository code. Inspect separately authorized code before making code-specific implementation claims. Keep no-fit, already implemented, unsupported, needs-context and deferred judgments visible.

If analysis is still pending, follow the existing [analysis state](/docs/workflows/analyze). A ready shared result needs no repeated model job. If project access or retained evidence is unavailable, resolve that exact limitation before saving a claimed evidence-backed plan.

## Write in chat and save

Ask: "Discuss a plan here using this post's full insights. Save the agreed proposal without starting an API generation job."

Use your host's reasoning to write the proposal. Persist it with `save_project_proposal`, using `expectedVersion=0` for creation and one stable key. The server supplies citations. Saving supplied text starts no paid generation, issue publication or coding.

The visible result is a durable proposal ID and review URL. `draft_project_suggestion` remains a separate route for an exact existing server evaluation; do not invent evaluation IDs for a chat-written plan.

## Resume and revise

Find the proposal with `list_project_proposals`, following its cursor even across empty filtered pages. Open the selected ID with `get_project_proposal`.

Before editing, read its current version, review state and context. Keep the source, project, analysis and insight binding. Save with the current expected version and review plus a new key for that intentional edit. If the response is unknown, retry identical content with the same key. If it is stale, reconcile the newer record before saving.

Use [discussion](/docs/workflows/discussion) to keep feedback with the proposal. A saved draft remains separate from [Approve & create issue](/docs/workflows/handoff).
