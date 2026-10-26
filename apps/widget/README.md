# VibeScroll MCP widget

`pnpm dev:widget` serves the labeled fixture at `http://127.0.0.1:4318/?demo=1`. The production app needs an MCP Apps host bridge and never uses a browser session or embeds OAuth tokens.

`pnpm build:widget` builds workspace, inline card and read-only file viewer independently into self-contained HTML and updates `packages/widget/resources.generated.ts`. Root production builds run this first. Preserve that generated source when shipping the server. The development fixture module is rejected by the production bundle guard.

Architecture, rollout and honest full-plan coverage live in `docs/widget/implementation.md` and `docs/operations/mcp-widget.md`. This is a separate native widget design boundary; approved direction is in `APPROVED-DIRECTION.md` and built design tokens are in this directory's `DESIGN.md`.
