This walkthrough reads an existing analyzed post and saves a project plan written in the chat. It starts no paid analysis or implementation job.

## Connect once

1. Sign in to ChatGPT or Codex using the account and usage route you want.
2. Connect the existing VibeScroll plugin/MCP endpoint and complete VibeScroll OAuth. Follow [the connection guide](/connect) for the supported host setup.
3. Ask: “Use VibeScroll to list my available workspaces and saved insights. Do not start analysis or spend credits.” The assistant can use `get_profile` and `search`.

If the result requires a workspace selection, choose one of the returned workspaces. If it requires authentication, use the host's connection flow. A profile-selection error is not a reason to create another plugin.

## Read a post and a project

Ask: “Use the saved insights from this post to suggest a plan for my selected project. Read the current VibeScroll project context first. Write the plan here without starting an API plan job.”

The assistant can retrieve a chosen search result with `fetch`, then read `get_project_application_context` for the exact post/version and project. The context includes saved insights and a confirmed project profile. It does not contain inspected repository code. Grant separate repository access if you want code-specific verification.

Pagination fields matter: a short or empty page is not proof that the whole library has been searched. The assistant should follow the returned cursor when needed.

## Save and resume the plan

1. Discuss changes in the chat. This uses your host's model allowance.
2. Ask the assistant to save the agreed plan with `save_project_proposal`, using the exact returned context hash and version references. A first save uses `expectedVersion=0` and a stable operation key.
3. Open the returned VibeScroll review URL. The same saved proposal can be found later through `list_project_proposals` and `get_project_proposal`.

An edit must first read the current version/review and context. A stale version means reconcile the newer result, not overwrite it or start another proposal to hide the conflict.

## Publish only the reviewed issue

Ask to preview the exact GitHub issue with `preview_project_issue`. If you approve that proposal version and exact payload, the assistant can use `approve_project_issue` with the returned binding and operation key. GitHub authorization and repository access are separate requirements.

The tool publishes the approved issue; it does not automatically start Codex implementation. An unknown publication result must be reconciled, not blindly retried. A later `report_project_outcome` is an assistant report; signed GitHub observations and verified tests remain distinct evidence.
