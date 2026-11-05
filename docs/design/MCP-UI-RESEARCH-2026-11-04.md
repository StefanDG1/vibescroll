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

## Animation and discovery follow-up

R154 requests more animation/design research, relevant skills, MCP app references and VibeScroll evidence. It then asks for a visually engaging search experience that connects real returned sources into useful insights. The selected four product renders remain the visual authority; this is an interaction refinement.

### Additional libraries

Public repository metadata, relevant READMEs and Motion Primitives' documentation index were read. These are additional snapshots from the same research session.

| Repository                                                        |  Stars | Disposition                                                                                                                                                                                                                       |
| ----------------------------------------------------------------- | -----: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Motion Primitives](https://github.com/ibelick/motion-primitives) |  6,897 | MIT copyable components built with Motion/Tailwind. Evaluate Animated Group, Transition Panel, Animated Number and Morphing Dialog. The project is beta; pin and review copied components.                                        |
| [AutoAnimate](https://github.com/formkit/auto-animate)            | 13,958 | MIT, automatic add/remove/reorder transitions. A smaller alternative for simple layout changes; do not stack it with Motion on the same elements.                                                                                 |
| [Animate UI](https://github.com/imskyleen/animate-ui)             |  4,885 | Animated primitives for Radix/Base UI/React Aria. Its current license is MIT plus Commons Clause, with component redistribution restrictions. Exclude from the default reusable MIT component stack pending exact-license review. |
| [Magic UI](https://github.com/magicuidesign/magicui)              | 23,084 | MIT alternative for selected effects. Keep promotional effects out of the core reader/search and avoid duplicating the existing component system.                                                                                 |
| [Phosphor React](https://github.com/phosphor-icons/react)         |  1,790 | MIT icon alternative for a deliberate family-wide trial. Current Lucide remains coherent and installed; do not mix icon families randomly.                                                                                        |
| [Iconoir](https://github.com/iconoir-icons/iconoir)               |  4,618 | MIT alternate outlined family. Evaluate at actual 16-24px sizes before any system-wide replacement.                                                                                                                               |

The recommended implementation is existing CSS/primitives plus Motion where layout continuity warrants it, with selected Motion Primitives source and assistant-ui Elements. AutoAnimate is an alternative, not another mandatory dependency. Standalone job/error components do not require a second AI chat service.

### Design and motion decisions

| Before                                           | After                                                                            | Why                                                                   |
| ------------------------------------------------ | -------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Blank or repeated spinner, then raw post tiles   | Stable loading frame, actual source/insight arrivals, then insight-first results | Communicate observed work and leave the user with useful content.     |
| One generic progress animation for every phase   | Abstract activity before results; citation connections only after real results   | Visual richness must not manufacture backend observations.            |
| Expanded inline mini-application                 | One focused card, up to two primary actions, detail in fullscreen                | Follow the host's conversation model and preserve mobile readability. |
| Simulated percent or forced multi-second loading | Immediate cached result; short transitions on real state changes                 | Do not turn a performance improvement into a deliberate wait.         |
| Large effects on every interaction               | Brief press/expand/state feedback, reduced-motion equivalent                     | Keep frequently repeated actions responsive.                          |

Motion proposal: roughly 100-160ms press feedback, 160-240ms source/insight reveal, and 200-280ms expanding/morphing surfaces. These are design targets, not measured backend times. Animate opacity/transform where possible, preserve interrupted interactions, and avoid animating a credit number through misleading intermediate balances. Do not change layout dimensions through generic badge/span selectors; earlier Library CSS corruption makes local component styles important.

### MCP app visual references

The [official UI guidelines](https://developers.openai.com/plugins/concepts/ui-guidelines) and their illustrated inline playlist, map, restaurant/media and fullscreen examples were inspected, including the actual overview image. The [examples guide](https://developers.openai.com/plugins/build/examples) points to the Pizzaz gallery. These are official design references, not independently verified popularity rankings or live acceptance of third-party apps.

Useful patterns are content imagery first, concise metadata, few actions, consistent system typography/spacing, and expansion into a richer context. Inline guidance specifies no nested scrolling, tabs or deep navigation; primary actions are limited to two. Host system colors/fonts and safe areas apply. Reuse website structure and components while adapting host tokens instead of nesting duplicate website chrome.

### Existing VibeScroll evidence

Authorized, bounded ranked searches for animation, loading, assistant-ui and MCP returned existing retained insights. Four exact-post reads were attempted; three succeeded and one host read failed, so the latter remains search-excerpt evidence only. Search is lexical, indexed and sometimes partial; this is not an exhaustive or semantic corpus review.

The retained results support these design candidates: Motion Primitives reuse, short numeric changes, stable skeleton layouts, consistent font weights/icons, large-text checks and starting polish at frequent interactions. The installed Emil design-engineering skill is itself discussed in a saved post. Another saved post suggests Impeccable, shadcn MCP and browser observation. Creator recommendations are leads, not measured product outcomes.

Do not adopt artificial pre-paywall delays, mascots, ambient shaders, confetti or claimed automatic “taste improvement” from those posts as requirements. Existing owner choices and actual product behavior take precedence. Exact source mappings and account-authorized tool receipts remain private; no new analysis or public sharing was started.

### Skills and experiments

Use frontend-design for composition within the approved visual direction, Emil design engineering for timing/interaction decisions, Impeccable's distill/adapt/audit/polish workflows for bounded refinement, and web-design-guidelines for accessibility review. These skills are already available. Load only the workflow needed for the task; do not run conflicting redesign passes or install another overlapping skill set.

The local interaction study compares Connected and Quiet treatments using three real saved-result snapshots. It contains no provider/network calls until a user explicitly opens a source link. Desktop 1440px, mobile 390px and narrow 320px checks pass, with both themes, reduced motion, source dialog and Escape. A first selector expected visible theme text rather than its accessible aria-label; the corrected check passed. This is local preview evidence only. The real phase must prove initial host input/result, bounded search pages, cancellation, final references and actual ChatGPT rendering.

## November5 sandbox persistence verification

An official AppBridge iframe with an opaque origin rejects localStorage. A direct-origin Vite preview therefore did not establish that unsent proposal text survives Work unmount/reopen. Keep the failing receipt and test the actual sandbox boundary.

The [current OpenAI UI documentation](https://developers.openai.com/plugins/build/chatgpt-ui#manage-state) supports optional widgetState/setWidgetState. The setter is synchronous. Use the structured privateContent field for bounded UI-only drafts and pending operation identities, preserve unrelated host state, and feature-detect the extension. Keep a bounded in-memory fallback for other hosts. Widget state is not authoritative business storage; sent discussions, saved plans and approvals remain in VibeScroll. Never send unsent text through model-context updates merely to persist it.
