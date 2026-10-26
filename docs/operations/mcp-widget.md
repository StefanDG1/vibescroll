# Run the MCP widget candidate

## Preview locally

Run `pnpm install --frozen-lockfile --ignore-scripts`, then `pnpm dev:widget` from the repository root. Open `http://127.0.0.1:4318/?demo=1`. Add `&theme=dark` for the dark fixture. Inline fixture: `/card.html?demo=1`. Design alternatives remain under `/designs/?style=a`, `b` or `c`.

These are labeled development fixtures. They make no live account, processing or mutation calls. Production HTML rejects the fixture identifiers during the build. Without a host bridge, the production widget shows connection recovery instead of using browser cookies.

## Build and register

1. Run `pnpm build:widget`. It builds each single-file entry independently and writes `packages/widget/resources.generated.ts`. Commit this generated resource with the source so older tool messages can retain the versioned resource path.
2. Run relevant checks. The repository's full PR checks remain required before a release PR, independently of focused development checks.
3. Deploy the compatible backend including `assistantWidget.ts` and the assistant HTTP switch using the existing controlled rollout and provider gates. This candidate adds no table, index, component, cron or backfill.
4. Build the frontend from that same candidate. Set `MCP_WIDGET_ENABLED=true` only for the intended verification environment and matching backend. This is a frontend server variable; it exposes no credential to the widget.
5. Authenticate each target host through its supported OAuth flow. Preserve the canonical `https://scroll.companynerve.com/mcp` resource audience and registered public host clients. Do not invent unrestricted dynamic registration or disable callback checks.
6. Refresh plugin tool discovery and verify `open_vibescroll`, resources, app-only calls, inline results, current user/workspace identity and unsupported-host recovery separately in ChatGPT and Codex.

## Verify before public enablement

Use a test account and a permitted rights-cleared source. Check empty/multiple workspaces, context-less knowledge access, expired/revoked/changed grants, viewer role, stale source evidence, account switch, search pagination, untimed/timed citations and deliberate context attachment. A private proposal read must not start coding or publication. Exact protected review must land on the intended draft.

Check one explicitly requested save-and-analyze using the already-working Work Cloud path. Record canonical source/job IDs, current status, generation/revision, cited result, close/reopen and duplicate/uncertain recovery. Do not rerun unknown work or change to credits. Confirm Save only separately. Native Events and out-of-chat analysis triggering retain their independent current setup and evidence requirements.

Check file open/export, mentions, keyboard navigation, 320px layout, dark mode and 200% text in actual hosts. Standalone fixture behavior is not a host receipt. Do not make a purchase or create a live paid job merely to verify connection readiness.

## Roll back

Disable `MCP_WIDGET_ENABLED` in the frontend and redeploy the last compatible reviewed frontend through the normal rollout procedure. Existing headless MCP commands, jobs, grants and Events remain unchanged. Keep versioned resource source available for old conversation recovery; a resource read never restores revoked data permission. Keep the additive read projections until no deployed frontend calls them. No data deletion or schema rollback is needed.

## Release package

`plugins/vibescroll` is a portable source candidate, not an installed or directory-approved release. Preserve the existing app identity when importing it. Public listing review, publisher metadata, reviewer access, cases/demo and verified URLs need their normal submission workflow. No dashboard binding or reviewer credential is stored in this directory. Adding the MCP URL alone does not install its nine skills.
