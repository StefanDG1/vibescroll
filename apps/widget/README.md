# VibeScroll MCP widget

`pnpm dev:widget` serves the labeled fixture at `http://127.0.0.1:4318/?demo=1`. The production app needs an MCP Apps host bridge and never uses a browser session or embeds OAuth tokens.

`pnpm build:widget` builds workspace, inline card and read-only file viewer independently into self-contained HTML and updates `packages/widget/resources.generated.ts`. Starter production builds regenerate the widget before Next.js, including the filtered build used by Vercel. Preserve that generated source when shipping the server. The development fixture module is rejected by the production bundle guard.

Architecture, rollout and honest full-plan coverage live in `docs/widget/implementation.md` and `docs/operations/mcp-widget.md`. This is a separate native widget design boundary; approved direction is in `APPROVED-DIRECTION.md` and built design tokens are in this directory's `DESIGN.md`.

The compact card is the first host acceptance target. When the widget flag is enabled, normal `save_link` and `fetch` results advertise the card resource and include a validated client-only route. Structured headless results stay unchanged. Status polling does not advertise another card for every poll.

The development-only `/harness/?resource=card` page uses the official AppBridge with an opaque sandbox iframe and the actual generated production HTML. It proxies only authored fixture records, never the live server. Run `exec(open('apps/widget/harness/check.py', encoding='utf-8').read())` inside Browser Harness for the bounded protocol check. The check reuses one test tab and closes it when complete. Its receipts cover inline results, status, unsupported context, host file reading and 320px dark rendering. This is not real ChatGPT/Codex or OAuth acceptance.
