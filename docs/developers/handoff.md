Use one **Approve & create issue** action for the exact saved plan. Then follow the same work record without treating issue creation as implementation.

## Preview and approve one issue

1. Read the current proposal and discussion. If generation is pending or unknown, reconcile it before choosing a plan to publish.
2. Call `preview_project_issue` to check the repository, visibility, current version and context hash.
3. Show the exact plan and publication destination to the user.
4. After the user's explicit approval of that plan and issue creation, call `approve_project_issue` with the returned binding, acknowledgement and a stable key.
5. Read `get_proposal_discussion` for confirmed publication and the issue link.

Preview starts no publication. Approval queues the frozen issue operation and starts no coding or model generation. GitHub access is separate from VibeScroll OAuth. A stale plan needs another read and review; an old approval cannot authorize a changed payload.

`prepare_project_issue` supports a private frozen handoff for an independently authorized publishing integration. It prepares text and completion instructions without publishing. Prefer the combined approval path for the normal workflow.

## Recover the existing publication

If publication is queued, keep its operation ID. If GitHub setup fails, repair that setup and use `retry_project_issue` for the same saved operation. If dispatch is ambiguous, reconcile by authoritative lookup. Do not create a replacement issue or send a second publication after dispatch.

Open the confirmed issue or copy its work prompt to the intended assistant. Coding, spending, merging and deployment still depend on the user's actual implementation instructions. Existing post insights are reused; issue creation needs no repeated video analysis.

## Report and inspect outcomes

An implementing assistant can call `report_project_outcome` through its authenticated connection for the exact handoff. Include an honest completed, blocked or failed status, actual same-repository work links, and the actual commit or null. Keep the same report key and content after an unknown reply.

Signed GitHub observations and authenticated assistant reports remain separate evidence. Issue state is bound to the confirmed publication. A PR can associate itself by including that issue's exact proposal locator and handoff marker plus a same-repository closing reference. Signed observations retain its head/merge commit and individual check facts. The implementing assistant should preserve these public identifiers from the issue instructions; they grant no callback access. Full PR/check acceptance still depends on the App's enabled events and actual deliveries. An individual successful check is not proof all CI passed. Issue closure, a model report or a merged PR alone does not establish measured benefit.

Use `record_feedback` for the user's explicit judgment about current source evidence. A judgment or reported outcome does not silently alter the plan's review or authorize further work. See [host support and verification](/docs/mcp/host-support).
