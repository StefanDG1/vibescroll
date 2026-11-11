---
name: vibescroll-work-review
description: Review VibeScroll private proposals, plans, execution status or draft PRs while preserving exact existing approvals.
---

# Review proposed and running work

1. Find a saved proposal with `list_project_proposals(detail=summary)` when supported, then read the chosen proposal and `get_proposal_discussion`. Follow returned cursors. Use current exact source/project/version context before writes.
2. Distinguish a private plan, approved issue, separately authorized coding, checked patch and reported outcome. A ready plan or issue closure proves none of the later stages.
3. For requested publication, preview the exact plan, repository and visibility with `preview_project_issue`. Only the user's explicit approval permits `approve_project_issue` with the current bindings and stable key. This combines plan approval with creating that one issue; it starts no coding.
4. Preserve the operation after an unknown dispatch. Read the discussion and follow `reconcile_first` or `retry_existing` recovery for that same operation. `retry_project_issue` reconciles an already dispatched publication instead of sending a replacement POST. A changed plan/base/visibility or expired approval needs current review, not a blind retry or reconnect.
5. Use the confirmed issue/work prompt for the user's separately authorized implementation. When opening a related PR, retain the frozen handoff's public Proposal line and final marker once, plus a same-repository closing issue reference. These identifiers are not callback credentials.
6. Report actual completed, blocked or failed work with `report_project_outcome` through the authenticated connection. Use the exact handoff, honest tests/limitations, same-repository issue/PR links and an actual commit or null. Retry unknown acknowledgements with identical content and the same report key.
7. Read signed issue/PR/check observations separately from model reports and explicit user feedback. A check fact concerns one app and SHA, not all required CI. An absent observation can mean missing event coverage. Merge, closure and self-reported completion are not measured benefit.

Report what is actually observed, pending or unavailable. Do not merge, deploy, spend, publish or execute just because the user asked to review work. Preserve manual draft edits and existing isolation/funding boundaries.
