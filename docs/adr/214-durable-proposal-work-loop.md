# ADR 214: durable proposal work loop

Status: design chosen; implementation in progress. October 31, 2026. Owner request R125.

## Caller workflow

The client reads a saved proposal and its discussion, adds a comment using a stable key, requests a quote for generating/refining the current plan, and starts that exact quote. A durable job reports actual queued/running/ready/failed/unknown state. Validated output advances the proposal version only if the source/project/reviewed version remains current. The user approves the displayed version and starts its one issue-publication operation. Repeated calls reconcile the same operation.

## Reuse decision

Keep the existing proposals, whole-post context, precise credit reserve/settle helpers, Gateway Contributor adapter pattern, GitHub App authorization/publication/recovery transport, frozen handoff and signed feedback. Older integrations.draftPlan requires accepting a proposal before drafting an execution plan and does not satisfy the feed's pre-approval discussion workflow; preserve it rather than silently changing that contract.

Use the official Convex Agent component for persistent messages, exposed through proposal-authorized functions. Its supported standalone create/save/list helpers allow durable human/model discussion without adding another agent loop, embedding model or hosted conversation service. A custom root messages table or a bounded message array inside proposal.detail would duplicate that storage and eventually lose history.

Add a small typed proposal-operation outbox for durable idempotency, generation/approval states, reservations and provider receipts. It stores operation identity and message references, not a second conversation log. Compare this with overloading existing execution runs: those runs require coding approval, executor and allowed paths, so reusing them would misrepresent planning as execution. The dedicated planning/publication operation is the simpler correct boundary.

## Types and boundaries

- Proposal work binding: existing exact analysis version/evidence, complete insight IDs, repository/base/profile/selection, proposal version and actor. The Agent thread reference is server-owned optional proposal detail, not a user-provided authority.
- Discussion: stable message key, author identity, reviewed proposal version, text and timestamp. Queries authorize current proposal/source/project access before reading its thread; writes derive the author from the authenticated session. MCP model messages remain attributed as model content.
- Generation: quote identity, finite credits/API budget, current context hash, retained discussion boundary, job state, provider receipt and resulting version. Provider uncertainty preserves its reservation; a duplicate key never starts another inference call. Profile-based output explicitly does not claim repository code inspection.
- Approval/publication: reviewed version/context, frozen title/body and marker, repository identity, actor and durable dispatch state. One external write per operation; unknown acknowledgements use authoritative reconciliation. Edits cannot silently rebind approved work.
- UI: reuse the accepted ArtifactCard, progress/error/credit components and modal controls. Persist discussion and recover input; show operation states rather than fabricated streaming or chain-of-thought. After confirmed issue creation expose its URL and exact copyable implementation prompt.

## Compatibility and verification

The Agent component and operation table are additive. Prepare the actual new topology offline and review new empty tables/indexes; require no populated-table scan/backfill or unrelated component/auth/cron change. Old zero-component-change release packages cannot authorize this deployment. Preserve all existing rows, balances and unknown holds.

Cover cross-account access, duplicate/concurrent messages, delayed/stale generated output, known versus unknown provider failure, exact credit settlement, simultaneous edit/approve, GitHub rejection/timeout/reconciliation and signed status binding. Test website/MCP parity, reload/navigation, mobile keyboard and the unchanged feed/Library before one funded staged release. Paid canaries and a public issue require their actual existing authorization; no test doubles count as live acceptance.

Primary API reference consulted: [Convex Agent messages](https://docs.convex.dev/agents/messages), including standalone saveMessage and paginated listMessages/listUIMessages. Installed package source and types remain the implementation authority.

## Project-data provider decision

The public-video Contributor permission does not authorize sending private project profiles or discussion under Contributor terms. An unreleased standard-Muse candidate was rejected after the owner challenged its value. The plan tariff instead selects `zai/glm-5.3-flash` through the existing Gateway, pinned to DeepInfra with `disallowPromptTraining:true`. No eligible route means failure, without another model/provider fallback. Muse Contributor stays the public-video baseline. This changes no existing video tariff, public price or balance.

The official endpoint registry observed October31 lists DeepInfra at USD0.075/M input and USD0.25/M output, no training and structured output. The bounded plan quote reserves up to3 legacy credits, USD0.02 provider maximum,160,000 UTF-8 bytes for the complete request and8,000 billed output tokens at high reasoning. Settlement accumulates integer nanodollars plus USD0.001 infrastructure before one final credit rounding. The disabled policy needs an exact new proposal-inference reservation before a paid canary; the earlier USD0.11 standard-Muse request was not approved or used.

The owner's October29 video benchmark made GLM an inexpensive candidate, with content-dependent errors; it does not establish plan-writing quality. DeepSeek remains a candidate, but its cheapest route returned no usable bounded original-reel answer in that pilot. Test an actual structured plan before promoting a default. No paid proposal request has occurred at this checkpoint.

Sources: [GLM endpoints](https://ai-gateway.vercel.sh/v1/models/zai/glm-5.3-flash/endpoints), [MiMo Flash endpoints](https://ai-gateway.vercel.sh/v1/models/xiaomi/mimo-v2.6-flash/endpoints), [Contributor model](https://vercel.com/ai-gateway/models/muse-spark-1.3-contributor), [no-training routing](https://vercel.com/docs/ai-gateway/security-and-compliance/disallow-prompt-training). Recheck exact route pricing and conditions before enabling a changed tariff.
