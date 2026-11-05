# Public MCP reference and authentication boundaries

Date: November 1, 2026. Status: implemented and locally checked; publication recorded separately. Owner request R135.

## Decision

Use Fumadocs16.17.9 for the public `/docs` navigation, search and document shell, with manifest-selected repository Markdown. Keep conceptual explanation, first workflow, generated tool inputs, output meanings, skills/Events and Convex efficiency on separate pages. Use labeled request and branch diagrams that remain readable on phones. Public documentation and search read only these authored assets; they do not query Convex or expose private operational state.

Generate input reference data from the real full-feature registry with a synthetic `tools/list` request. A unit test rejects drift without executing a tool. Retain the current MCP input/output and authentication behavior. The source contains53 full-feature descriptors, including gated execution and UI tools; this is not the count every host sees. Nine end-user plugin skills are different from repository coding skills, a manually configured MCP connection and the saved native monitor.

Host-authenticated model reasoning uses that user's host allowance. VibeScroll OAuth authorizes data and supported actions. Persisting a chat-authored plan does not dispatch API inference. Explicit hosted start tools retain their quoted credit/provider funding. This does not enable general commercial ChatGPT login inference on VibeScroll's servers or establish authentication forever.

## Efficiency findings

Selected-profile discovery can return five full project profiles. Search matches text across five examined posts per page. Ordinary results duplicate JSON in text and structured content; fetch nests serialized analysis text. Source-derived bounds are documented, but precise billed Convex reads/bytes per tool are unmeasured. Proposed metadata-first reads, authorized indexed search, compact versioned output and sanitized metrics require a later acceptance slice, not silent compatibility or authorization changes in this release.

## Verification

Manifest/path/link/anchor/search-index isolation and real-registry drift tests pass. Existing1516main,54auth and176knowledge cases passed, along with Node/Python checks. The first build exposed missing Tailwind theme context in the separate documentation stylesheet. Adding the framework's documented Tailwind import fixed the production build. Desktop and390px diagram layout and public search are checked in the browser. See the dated publication receipt for exact CI and production, which are not inferred from local checks.

Sources: [Fumadocs](https://www.fumadocs.dev/docs/manual-installation/next), [MIT source](https://github.com/fuma-nama/fumadocs), [MCP concepts](https://developers.openai.com/plugins/concepts/mcp-server), [OAuth](https://developers.openai.com/plugins/build/auth), [plugin packaging](https://developers.openai.com/plugins/build/plugins).
