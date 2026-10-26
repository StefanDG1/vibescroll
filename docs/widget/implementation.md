# Widget implementation candidate

Date: 26 October 2026. Base: `75fe204ab04eae4b2210581de1603a8e9a379b43`, the compatible Cloud/Events PR 186 head. Branch: `codex/widget-ui-20261026`. This record describes local implementation, not a deployment or completed public launch.

The owner approved A for the expanded Library, B for compact conversation results, and C for project review. The scope is the ChatGPT/Codex widget. The website keeps its current design and adds only connection setup. The complete [research and plan](research-and-plan.md) remains the target; the table below identifies the actual boundary of this candidate.

## Implemented behavior

- Host-native light/dark shell, workspace selection, responsive navigation, contextual evidence inspector, narrow detail/back navigation and keyboard focus restoration.
- Bounded library/source search and pagination, Scroll, Tree/Folders topic navigation over loaded current records, selected-insight comparison and cited context attachment.
- Explicit link saving with a stable retry key and canonical receipt. Where current grant and host capabilities allow it, a deliberate save-and-analyze action sends an exact-source request to the existing Work Cloud flow. Save only does not send that request. Unknown/recovering work stays distinct. The widget does not create a second execution pipeline.
- Current status cards with visible-only adaptive polling, explicit refresh and terminal stop. Workspace authority refreshes while visible and on focus. Workspace/grant changes and authority-read failure discard cached private query records.
- All five source judgments through the existing versioned feedback command, including corrections while the view remains open.
- Selected project context/evaluations, private draft preparation, private proposal reader and exact proposal review URLs. Editing, plans, coding, billing, privacy and publication use protected app destinations under current permissions.
- Native global/thread entrypoints, inline result resources, file viewer entrypoint, reauthorized citation resources, mentions, and deliberately selected context attachments. Host capability failures have explicit recovery messages.
- Strict bounded `.vibescroll` snapshot export/viewer. Snapshots confer no authority to import or read live records. Export includes selected claims and citation locations, never raw transcripts, media, signed URLs or credentials.
- Public `/connect`, plain `/connect/agent` and JSON `/connect/descriptor`, plus a portable plugin source package with nine workflow skills.

## Full plan coverage

| Work package                | Local candidate                                                                                                                 | Remaining completion condition                                                                                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WP00 baseline and inventory | Implemented, ADR 161 records the compatible base and authority boundaries                                                       | Rebase only after checking serving Cloud contracts                                                                                                                                |
| WP01 SDK/resources          | Three self-contained resources built; modern host bridge and capability handling                                                | Actual ChatGPT and Codex rendering/read-tool acceptance                                                                                                                           |
| WP02 projections/contracts  | Five read projections, bounded inputs, versioned routes/export schemas, current grant/source/project validation, negative tests | Expand strict output DTO coverage before adding new write commands; no unrestricted dispatcher                                                                                    |
| WP03 self-service setup     | Public guide, descriptor, agent prompt and existing OAuth handoff                                                               | Verify fresh supported customer OAuth/client registration in both hosts; server client registry is host registration, not a user limit                                            |
| WP04 shell/lifecycle        | Implemented; responsive and keyboard checks on illustrative records                                                             | Real-host access-loss/reconnect/account matrix                                                                                                                                    |
| WP05 save/Cloud             | Existing commands, receipts, explicit same-chat Work Cloud request and status; existing Events unchanged                        | Real-host save-to-result, reopen, duplicate/unknown and opted-in notification journeys on the exact deployment; analysis-on-save outside an active chat remains a separate bridge |
| WP06 knowledge              | Routine browse, evidence, search, Scroll, topics, compare and feedback implemented                                              | Topic filing/rename/reparent use protected app until reviewed versioned MCP write commands exist                                                                                  |
| WP07 projects               | Read context/evaluations, prepare/read private proposals, protected exact review                                                | Project creation/context confirmation, proposal/plan edits and execution approval remain protected app workflows; richer inline mutations need explicit new contracts/scopes      |
| WP08 sensitive workflows    | Usage/privacy/account handoffs, mentions/context, snapshot export/viewer                                                        | Real-host download/file/mention capabilities and return-to-item verification; financial data is not exposed by knowledge scope                                                    |
| WP09 skills                 | All nine source skills, examples and portable metadata/icons                                                                    | Installed-plugin behavioral evaluations and host metadata import verification                                                                                                     |
| WP10 acceptance             | Focused access/protocol/contracts, types/lint/build and bounded browser review                                                  | Full account/role/host/Cloud/load/accessibility staging acceptance; fixture screenshots are not those receipts                                                                    |
| WP11 public release         | Operator steps and rollback prepared                                                                                            | Compatible deployment, host acceptance, public OAuth setup, directory preparation/review and release evidence                                                                     |

Nothing in this candidate upgrades an existing grant, changes entitlement checks, enables paid fallback, authorizes coding or publishes data. A03/A06/A14/A16/A18/A23/A25/A26/A30/A32 of the complete acceptance matrix are not claimed passed by local screenshots or focused tests.

## Code map

`apps/widget` owns the client and code-native design previews. `packages/widget` owns routes, setup text, snapshot contracts and generated HTML. `packages/mcp/widget.ts` registers host tools/resources and reauthorized mentions. `convex/assistantWidget.ts` owns current authorized read projections; `convex/assistantHttp.ts` keeps the existing authenticated operation switch. `plugins/vibescroll` contains portable plugin source and nine skills.

The widget makes no direct authenticated network request and stores no tokens in browser storage. Tool calls go through the host bridge to existing server authentication and current grant checks. Query cache is in memory and keyed by workspace and grant version. Explicit context, comparison and export actions reauthorize the selected sources before disclosing cached claims and reject changed evidence. Export snapshots are separate read-only records. Browser-shipped resources contain no design brief or fixture module.

## Free and open-source components

The implementation uses React, TypeScript, Vite, Tailwind CSS, OpenAI Apps SDK UI, MCP Apps, OpenAI MCP extensions, TanStack Query, Zod and Lucide. Package versions and transitive fixes are pinned in the lockfile. Apps SDK UI is 0.2.2; OpenAI extensions 0.2.1 uses compatible MCP Apps 1.7.5 and SDK 1.32.1 while the existing server stays on SDK 2.3.1. Server resource registration uses the native server API instead of the SDK-1-only helper.

The first production dependency audit found lodash, KaTeX and fast-uri advisories in the new dependency graph. Overrides pin lodash 4.18.1, KaTeX 0.18.2 and fast-uri 3.1.9. A second production audit returned zero advisories. Dependency versions and supported host behavior still require maintenance; these pins do not certify future compatibility.

## Verification scope

Focused regression: 41 tests across widget contracts, actual stateless MCP dispatch, current/revoked/stale source grants and existing assistant access. Full typecheck, lint, widget resource build and application production build are recorded in implementation-status. A first test run had incorrect expected citation/status labels in a new assertion; the assertion was corrected to check the intended behavior. The first audit failure is preserved separately from its patched result.

Browser review uses labeled illustrative records only. It covers 1440px light/dark Library, 680px inline card, 320px detail/project navigation and no horizontal overflow. Keyboard focus checks cover search/URL wrappers and detail/back restoration. No live customer write, charge, Cloud job, deploy, merge or plugin account upload was performed. Full repository CI and real-host acceptance remain release requirements.
