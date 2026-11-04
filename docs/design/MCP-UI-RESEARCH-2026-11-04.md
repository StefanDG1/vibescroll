# MCP UI reuse research, November 4, 2026

Mode: reference. Research supports R153. This is a source and architecture review, not a claim that the proposed UI is deployed.

## Verified sources

Public repository metadata and READMEs were read through browser-harness on November 4. Counts are snapshots, not quality guarantees. No packages were installed.

| Repository                                                                     |   Stars | Verified role                                                                                 | Decision                                                                                                        |
| ------------------------------------------------------------------------------ | ------: | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| [assistant-ui](https://github.com/assistant-ui/assistant-ui)                   |  12,948 | React chat primitives, standalone components, custom runtimes, accessibility and streaming UI | Preferred component source; use standalone Elements for server job state and reuse existing VibeScroll readers. |
| [shadcn/ui](https://github.com/shadcn-ui/ui)                                   | 127,360 | Customizable component source under MIT                                                       | Reuse existing primitives for drawers, menus, skeletons, buttons and accessible layout.                         |
| [Motion](https://github.com/motiondivision/motion)                             |  34,905 | React and JavaScript animation library under MIT                                              | Optional for transitions that existing CSS cannot express clearly. Measure bundle impact before adding it.      |
| [MCP Apps](https://github.com/modelcontextprotocol/ext-apps)                   |   3,047 | Official UI bridge, host lifecycle, examples and web-app conversion guidance                  | Already pinned at 1.7.5. Use its supported lifecycle and test harness instead of writing a bridge.              |
| [OpenAI Apps SDK examples](https://github.com/openai/openai-apps-sdk-examples) |   2,385 | Inline/fullscreen components, authenticated tools and persisted widget state                  | Reference host behavior and examples. Current official docs take precedence over older README workarounds.      |
| [prompt-kit](https://github.com/ibelick/prompt-kit)                            |   3,146 | Copyable AI-interface components built with shadcn                                            | Alternative for a missing primitive; avoid a second competing component system.                                 |

The first, second, third, fifth and sixth repositories report MIT. MCP Apps' current LICENSE describes an MIT-to-Apache-2.0 transition and CC-BY-4.0 documentation. Verify the exact pinned code/component license before copying or upgrading. Do not describe the whole current repository as MIT. The nonexistent assistant-ui/assistant-ui-mcp repository was excluded. The former origin-space/originui redirects to cosscom/ui and is unnecessary for this plan.

None of these repositories implements VibeScroll's workspace authorization, wallet, immutable analysis, shared catalog and processing pipeline together. Their useful contribution is UI, protocol and testing infrastructure.

## Component review

The current [Elements catalogue](https://www.assistant-ui.com/elements) and these individual pages were read:

| Component                                                          | Application                                                                                                                                                |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Job progress](https://www.assistant-ui.com/elements/job-progress) | Observed preparation/analysis stages and the final receipt. Use indeterminate motion when no measured fraction exists.                                     |
| [Task card](https://www.assistant-ui.com/elements/task-card)       | Compact inline source/job card with elapsed time, current state, result and expansion.                                                                     |
| [Loader](https://www.assistant-ui.com/elements/loading-state)      | Short initialization and metadata loading. Reduced-motion alternative required.                                                                            |
| [Error state](https://www.assistant-ui.com/elements/error-state)   | An actionable failure in the same card, preserving saved content and input.                                                                                |
| [Agent plan](https://www.assistant-ui.com/elements/agent-plan)     | Actual proposal-generation steps when available; no invented chain of thought.                                                                             |
| [Cost meter](https://www.assistant-ui.com/elements/cost-meter)     | Adapt presentation to exact VibeScroll credits: available, held, maximum and settled. Do not substitute model dollar/token examples for wallet accounting. |

These pages document standalone props-driven use without an assistant-ui runtime/provider. Inspect copied source dependencies and license at implementation. Keep existing shared insight, settings and proposal components where they already fit.

## Official host contract

The [MCP UI guide](https://developers.openai.com/plugins/build/chatgpt-ui) describes iframe UI, JSON-RPC over postMessage, initialization, tool-input/tool-result notifications and current tool-result rendering. The [reference](https://developers.openai.com/plugins/reference) specifies display modes, persisted widget state, safe areas and CSP. Server display metadata and runtime capabilities both matter. A preferred fullscreen resource does not itself create a richer React tree.

An ordinary tool-result notification is not evidence that arbitrary asynchronous backend changes push into an existing card. Phase 3 uses supported MCP reads with visible, bounded polling. Website Convex subscriptions remain in the website adapter. Direct iframe Convex access is not required for this plan; it would require a separately reviewed scoped capability and CSP contract.

Do not embed the authenticated Next.js site or copy browser cookies into ChatGPT. Reuse its presentation/components behind the MCP OAuth adapter. Preserve versioned resources for older conversations. Host approval can delay tool input; an initially absent payload is a loading state, not an automatic connection failure.

## Source-derived architecture findings

- Both apps/widget/index.html and card.html mount CompactApp through main.tsx. The older WidgetApp is not the active workspace entry.
- open_vibescroll already returns a knowledge-authorized snapshot. CompactApp ignores it and calls get_profile, which requires context:read. A knowledge-only widget can fail unnecessarily.
- CompactApp chooses an explicit profile or the sole discovered profile. It bypasses the backend's selectedProfile default-workspace resolver.
- widget_browse reads workspace saved-source projections. It does not invoke canonical catalogBrowse. A catalog service organization is not the catalog browsing UI.
- Selected-source next_offset and page coverage are discarded. An empty intermediate page can be mislabeled as an empty library.
- get_job_status exposes stages, pending versions, maximum/settled credits and failure information. The UI reduces this to a coarse state and skips status for an already-ready result with pending reanalysis.
- Both widget forms omit balances by contract. Library read permission is not access to financial history. A small authenticated self-account summary needs an explicit contract.
- Automatic Save can throw during preparation admission inside the capture mutation. A known capacity refusal can therefore roll back the new saved source and return no persistent receipt.

These are code findings. The owner's desktop blank UI is not attributed to a particular bridge or browser failure without its actual runtime evidence. In the referenced conversation, the returned quota failure had no successful saved-source receipt; a running analysis card could not truthfully be inferred from it.

## Alternatives and synthesis

Candidate A keeps compact and expanded shells and extracts shared controllers/components. It is the quickest incident correction, but navigation and proposal behavior could continue to drift. Candidate B shares one responsive ApplicationScene between website and fullscreen, with a separate inline presentation. It offers stronger reuse but extracting all of Home first would delay the actual repair.

The independent review scored A/B respectively: incident speed 5/2, long-term reuse 3/5, boundary clarity 4/5, change risk 4/2, honest progress/funding 4/4. The synthesis uses A as the migration structure and B as the destination. Bootstrap and controller contracts come first, followed by one shared content frame, then feed/reader/proposals. The inline card remains focused. No duplicate business rules or new paid synchronization service are introduced.
