# One Cloud assistant per user

October29 owner update: allow at least ten additional videos using their own subscription; subscription usage is outside the cash budget. [ADR189](../adr/189-server-enforced-cloud-worker-allowance.md) adds finite backend admission rather than prompt counters. The exact saved TikTok is being processed first. General Monitoring remains paused pending deployment/configuration. Phone Save routing is fixed at4c72afd with unchanged OAuth/grant. Preserve Vercel's ceiling and historical holds.

The October 28 native-task audit found no exposed atomic run cap, concurrency limit or compare-and-swap field. Do not make successful source processing depend on the model self-editing a remaining-budget counter in its prompt. Keep finite operator allowances in canonical backend/operator state and bind canaries to exact sources until server enforcement exists. A prompt counter and a scheduled RRULE COUNT do not enforce an event execution cap. The first real two-slot test stopped on that self-edit; same-generation operator continuation completed it without another slot. [Actual evidence](../operations/evidence/launch-20261028-tiktok-continuation-production.json).

Mode: product direction and implementation plan. October 28, 2026. Status: planned, not deployed. The owner wants one useful, predictably named chat instead of multiple setup prompts or repeated reconnection. They are using the current setup prompt now and explicitly defer redesign until later. Read this with [simple setup and proposal feedback](SIMPLE-SETUP-AND-CLOSED-LOOP-PROPOSALS.md).

## Default experience

Recommend one native Cloud task per user named **VibeScroll Assistant**. Reuse the user's existing VibeScroll task instead of creating another worker on every setup, update or post. The app remains the primary place to save posts, see progress and open retained results. Other chats may save links through MCP or request follow-up using the same authorized library. A completion is delivered to its subscribed task and saved post; do not promise an unsolicited reply in every originating chat.

The default task can handle the user's authorized workspaces through separately bound grants/subscriptions. Do not pool users, subscriptions or private repository context. The current implementation configures one profile in its generated message; multi-workspace setup in one task needs separate acceptance. A project-specific coding chat may remain useful, with explicit project/base/plan/funding approval. Do not force all coding and foreground conversation into the analysis monitor.

## Replace the long setup message

Prepare a goal-based MCP setup action that returns the current bounded setup instructions and actual access/runtime prerequisites. The user should make one short request such as "Enable automatic VibeScroll analysis" in an eligible Work Cloud chat. The host creates or updates its native task and event subscriptions. VibeScroll's server does not fabricate a callback, subscription secret, supported runtime or model entitlement.

Offer Open assistant and Resume controls using a validated user/host-provided chat link. Record that link separately from execution authority. Do not invent a public third-party ChatGPT chat-creation API or depend on undocumented prompt/deep-link parameters. Keep the supported manual entry path until a simpler route passes with an independent account. The technical setup belongs in tools and help, not a required long prompt for every user action.

Keep subscription renewal automatic through the supported native protocol. Authentication, token expiry, refresh, disconnection, quota and a paused task are separate states. Normal updates should preserve grants and stable subscription identity when semantics are unchanged. Actual scope changes still require provider consent. Developer rescanning of changed MCP tools/events does not mean users must recreate their OAuth app.

## Fix status before adding more controls

The current Connections component passes media feature availability into its task picker. That is not proof the monitor is running. An active standing grant can coexist with a paused or missing monitor, while the separate API-key card says disconnected even though own-subscription Cloud uses no API key. The owner found this confusing in production.

Read actual current subscription/host status and distinguish access enabled, monitoring, not monitoring and needs attention. Use Paused only when the host actually reported it; expiration alone does not prove a deliberate pause. Do not call a configured grant Connected to a running monitor. Hide unrelated paid API and local setup under the selected route's Advanced controls. Unchanged Continue must preserve the existing semantic grant version; the backend already has that idempotence check.

## Implementation and acceptance

1. Finish the backend project-follow-up work before returning to this deferred setup redesign.
2. Add one bounded read-only setup action and explicit current task status. Reuse the current OAuth scopes where they already cover the action.
3. Update the existing task with the preset name through supported host behavior. Detect duplicate task/subscription attempts and reuse the existing identity.
4. Replace the normal long-prompt card with the short entry/return flow, retaining technical instructions in Advanced/help.
5. Test a new account, an existing paused pilot, unchanged preferences, a model change, a revoked connection, token/subscription refresh and two workspaces. Verify the actual tool/runtime/model availability before any source claim.
6. Test one Save from the app and one ordinary MCP chat link with the worker chat closed. Confirm one job, retained output and no paid fallback. Measure wake delay separately from acquisition, preparation, reasoning and upload times. A 2xx event acknowledgement is not proof of execution.

The owner's current prompt submission is not evidence these changes are implemented or that the old exact-source pilot has become a general monitor. Read back its actual task configuration and subscriptions before making that claim.

## Provider evidence

Re-read the official [MCP Events documentation](https://developers.openai.com/plugins/build/mcp-events) on October 28. It specifies that users ask ChatGPT what to monitor, events return to the subscribed chat, subscriptions are refreshed through events/subscribe and separately delivered events may be grouped according to task batching settings. It requires MCP 2.0 protocol 2026-07-28 and supported Work/Cloud hosts. Its testing section requires rescanning changed tools/events. It does not establish a VibeScroll website API for silently creating an arbitrary user's ChatGPT chat, a universal model entitlement, infinite execution authority or a no-setup customer acceptance result.
