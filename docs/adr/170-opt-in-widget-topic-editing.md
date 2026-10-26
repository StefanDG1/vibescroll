# ADR 170: opt-in topic editing inside the widget

Date: 26 October 2026. Status: local implementation, disabled in production.

## Decision

Add rename, pin/unpin, folder and alternative-name editing to the expanded widget's Topics view. Preserve the approved native ChatGPT styling and compact conversation card. Source membership changes, topic merges/splits and project writes remain separate work.

Use three app-only MCP operations: `widget_library_state`, `widget_library_edit` and `widget_library_receipt`. Each requires current OAuth, registered-client and application-grant `knowledge:read` plus new `knowledge:write` scopes. Editing additionally requires an active writer membership, full-library grant, current grant version and an active topic in the same readable workspace. Selected-source grants cannot edit shared topic metadata.

`MCP_WIDGET_LIBRARY_EDITING_ENABLED` defaults off in the frontend and backend. Old grants receive no scope upgrade. The connection form offers the new explicit permission only for a configured client that offers it. Saving that permission requires the flag, read access and whole-library selection.

## Commands and recovery

Commands bind an explicit user action to topic and layout versions and a stable request key. The atomic mutation applies the metadata change and retains its minimal receipt in `assistantLibraryCommands` for thirty days. It hashes the input instead of retaining edited names in the receipt. Actor/workspace deletion and bounded maintenance remove receipts.

An uncertain transport outcome remains uncertain. Check the retained receipt before retrying the same payload/key. A changed topic or grant requires review of current state. Closing the editor disclosure preserves an outstanding command and its recovery state. Leaving the topic or changing authority never replays a command automatically. Reopening reads current state; receipts do not grant access to revoked records.

Rename and pin increment topic version. Folder and aliases increment layout version. Parent validation reuses a bounded twelve-level same-workspace, active-parent and cycle check. Metadata edits do not enqueue synthesis, media analysis, coding or publication. The receipt explicitly returns `processing_started: false`.

## Release boundary

This phase adds one table and four indexes. It cannot use the earlier no-schema-change publication receipt. Review the additive schema and current serving backend before a separate release. Ship compatible frontend contracts before enabling backend `actions.organize` emission. Keep all feature flags off until provider/client scope configuration and deliberate customer consent are ready. Refresh the existing plugin rather than replacing its identity.

Local compilation uses the pinned Convex generator's pure API template. Normal offline codegen refused to run without `CONVEX_DEPLOYMENT`; that failure is retained. No hosted codegen or backend push is claimed. Production deployment, real-host edit acceptance and fresh consent remain open.

## Evidence

Focused tests cover current/revoked/stale permissions, selected grants, viewer roles, idempotency and conflicting keys, stale topic/layout versions, parent cycles, receipt access/expiry and no processing dispatch. Actual strict HTTP transport tests exercise the real operation router and mutation, including correlated rejection. The development-only AppBridge harness covers editing, receipt recovery, read-only absence and the 320px dark layout with synthetic records. Screenshots and these tests do not certify live OAuth or host editing.
