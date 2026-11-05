# MCP documentation and efficiency

Mode: explanation. Owner requirement R135, November 1, 2026.

R137 approves the core [flow-based improvement plan](MCP-FLOWS-AND-IMPROVEMENTS-REVIEW.md) for implementation. Follow its [execution ledger](MCP-FLOWS-IMPLEMENTATION.md) for grouped reference pages, skills, output contracts, measured reads, funding, host workflows and feedback. The eight [additional suggestions](MCP-LATER-SUGGESTIONS.md) remain saved for later.

The public reference must explain the current implementation, not an idealized MCP integration. Separate conceptual architecture, a first-use tutorial, tool/schema reference, output/error reference and an efficiency audit. Generate tool descriptors from the actual registry without connecting to production or executing a tool. Use synthetic examples. Keep private profiles, tokens, transcripts and operational funding records out of public assets.

## Technology decision

Fumadocs is an MIT-licensed React/Next.js documentation framework. Its supported Next.js 16/Tailwind 4 stack matches this application. Use its documentation layout, mobile navigation and local search, with the existing safe Markdown renderer and an explicit public content manifest. No CMS, hosted search, database queries, model call or executable user MDX is needed. Nextra is a credible Next.js alternative; introducing a second site or replacing the app's configuration is unnecessary. shadcn supplies interface primitives, not the content/reference source of truth.

The manifest controls published files. The MCP registry supplies the tool names, descriptions, input schemas, OAuth scopes and annotations. A deterministic generation check detects drift. Hand-authored pages explain actual outputs, funding and permission boundaries that descriptors alone do not express.

Both public Markdown and descriptors compile to checked JSON artifacts. This avoids runtime filesystem tracing and prevents the docs search route from bundling unrelated application/operator files. The existing generator and normal test suite verify both artifacts; regenerate with `node scripts/generate-mcp-reference.mjs` after changing either the registry or public Markdown.

Sources: [Fumadocs installation](https://www.fumadocs.dev/docs/manual-installation/next), [MIT source](https://github.com/fuma-nama/fumadocs), [Nextra](https://nextra.site/docs), [OpenAI MCP concepts](https://developers.openai.com/plugins/concepts/mcp-server), [OpenAI authentication](https://developers.openai.com/plugins/build/auth).

## Acceptance

- Public pages explain discovery, skills, user subscription usage, exact tool schema and result meanings.
- Diagrams show chat → MCP → authentication → Convex and cached/fresh analysis paths.
- The nine end-user plugin skills are distinct from repository coding skills and the saved native monitor prompt. Source presence does not establish installation in a custom connection.
- Host-authenticated model reasoning needs no VibeScroll-held OpenAI token. VibeScroll OAuth controls library/project access; it does not convert hosted API calls into subscription inference.
- Source-derived read/page/byte limits are labeled. Returned JSON bytes are not claimed to be total Convex database bandwidth or an exact bill.
- Search, keyboard navigation, anchors and narrow-screen layout work without a Convex call.
- Existing app/Library layout and MCP tool behavior remain unchanged.

## Proposed optimization sequence after alignment

1. Measure sanitized response bytes, handler latency and actual Convex function/database metrics for representative synthetic or owner-authorized reads. Keep document reads, DB bytes, network response, image bytes and model context separate.
2. Make profile discovery metadata-first; retrieve one project's context only when needed. Preserve compatibility for existing clients.
3. Avoid nested serialized analysis payloads in a versioned response. Test text-only and structured-content hosts before reducing duplicated JSON.
4. Replace the current five-post-per-page text scan with an authorized indexed search if measurements justify it. A partial page must never mean no matches in the whole library.
5. Reuse canonical immutable analysis/evidence by reference, retain private associations and project overlays, and preserve authorization on every read. Never share authenticated responses through a public cache.

These are recommendations, not completed performance improvements or permission to weaken current authorization. The next five product priorities remain recorded in the medium-term plan and R135.
