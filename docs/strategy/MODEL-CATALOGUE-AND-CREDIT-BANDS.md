# Curated models, reasoning and credit groups

Mode: reference. Owner direction: October 29,2026. Status: researched implementation plan; no model/price/provider was activated.

Use [the single-Pro pricing plan](PRO-PRICING-AND-CREDITS.md). Muse 1.3 Contributor is the 1× baseline. More expensive models spend more of the user's credits rather than increasing the cost assigned to every baseline analysis. Group similar complete costs into simple bands, initially 1×, 2×, 5×, 10× and 20×; add larger bands only when needed. A model is not priced by its brand or release date.

## Curated catalogue

Keep a short reviewed list, not every Gateway model. The owner does not need OpenAI models older than GPT5.6 Sol; this is a lower bound, not a requirement to expose every intermediate model. Preserve old result provenance without offering obsolete new-run choices.

| Family                 | Candidate                                                             | Evidence and disposition                                                                                                                                                                                               |
| ---------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Baseline               | `meta/muse-spark-1.3-contributor`                                     | Owner benchmark includes high reasoning at USD0.0034287. Default1× for compatible public material. Provider Contributor conditions still apply.                                                                        |
| OpenAI                 | `openai/gpt-6.1-sol`, optionally `openai/gpt-6.1-terra`               | Current benchmark evidence; preserve exact reasoning and provider provenance. Medium common-source runs do not establish highest-setting cost/quality. GPT5.6 Sol remains historical/optional, not a required default. |
| Gemini                 | `google/gemini-4-argon`                                               | Best native-video candidate in the completed benchmark; can also receive prepared evidence. Cost/quality differs from Muse. Do not add low-quality old Flash variants merely because cheap.                            |
| Claude                 | `anthropic/claude-sonnet-5.5`, `anthropic/claude-opus-5.5`            | Present with vision in the inspected Gateway catalogue. Source-to-insights quality, reasoning settings, region and full price quote remain untested. Keep unavailable until accepted.                                  |
| Open-weight candidates | MiMo2.6 Pro; selective newer alternatives from the existing benchmark | Do not repeat the entire sweep. Validate the actual weight/code licence, hosted terms, vision/structured output, citations and content-sensitive failures before calling a model open source or recommending it.       |

The October 29 public Gateway catalogue contains these IDs. Catalogue availability is not provider permission, app integration, quality acceptance or execution evidence. It also showed GPT5.6 Sol's standard token rates above GPT6.1 Sol; older does not imply cheaper or a useful default. Do not expose fast/batch variants as separate confusing choices unless their distinct behavior is required and accepted.

## Highest reasoning and honest credit quotes

Store exact provider/model ID, supported reasoning settings, highest supported setting, input/image limits, total billed-output cap including reasoning, route/region, prices, cost-band version, recipe/prompt version and acceptance state server-side. The server computes the quote; the browser cannot invent a multiplier or choose an arbitrary model ID. Bind reservations/completion to that model, effort, budget and version.

Budget each group's highest supported reasoning inside a finite token/time limit. Lower reasoning can have the same clearly displayed tariff. Unbounded output, extra tools or a larger evidence packet needs a new quote. Hidden reasoning can consume the output cap before visible JSON completes; handle truncation as a failure, preserve its real cost and avoid automatic unlimited repair calls.

Estimate whole-job cost, including shared preparation/ASR and per-model billed input/output, region and initial cache-write cost. Round the ratio up to the next band. Under the calculator's example 50k input/12k billed-output cap, the current OpenAI examples fall provisionally into 10×/20×; these are design quotes, not accepted public prices or claimed completed high-setting runs. Recompute when limits or prices change. Do not price the Muse allowance as though it ran those models.

Keep expected cost and reservation maximum separate. The common-source Muse high observation is about USD0.00343, not a guaranteed constant or the maximum possible invoice. An all-calls-hit-the-token-ceiling stress budget must not silently become expected spend or a demand-validated subscription price. Reasoning effort alone does not specify token usage.

Show the selected model, reasoning and total credit quote before starting. Compatible ready-cache reads remain zero analysis credits. Deliberate fresh versions have new quotes. A customer's supported ChatGPT subscription is a separate funding route: host capabilities determine available models, no founder account pooling, and no API inference bill where none was incurred. Infrastructure units can still apply. Never use paid API fallback silently.

## Reuse a model picker

The owner confirmed assistant-ui as the preferred source for suitable new or substantially rebuilt assistant components on October 29, 2026. Apply this beyond the model selector when a component fits the actual interaction. Share the resulting VibeScroll presentation between the website and future embedded view through thin host adapters. Preserve existing components that already work, keep backend acceptance first, and do not adopt a second inference runtime merely to reuse a UI component. This preference is recorded in AGENTS.md for future agents.

The current application already uses React19, Tailwind4 and Radix. It has no model-picker library, cmdk or complete chat framework installed. There is no need to replace the existing backend or build a chat UI to select models.

Preferred component to evaluate: [assistant-ui ModelSelector](https://www.assistant-ui.com/docs/ui/model-selector). Its documented standalone mode supports grouped/searchable providers and configurable reasoning controls; the application can hold value/effort without adopting the full assistant-ui runtime. Its related full-page ModelPicker supports price/capability chips. Use the compact popover in normal setup, with credit-band labels and only relevant accepted choices. [Repository licence](https://github.com/assistant-ui/assistant-ui/blob/main/LICENSE) is MIT; preserve notices and inspect the exact component/dependencies before copying.

Smaller alternative: [Vercel AI Elements ModelSelector](https://elements.ai-sdk.dev/components/model-selector). It supplies a cmdk-based searchable, keyboard-navigable grouped model palette with logos, but reasoning and VibeScroll quotes need composition. It fits shadcn/Tailwind conventions and does not require moving inference into a new frontend runtime. [Repository licence](https://github.com/vercel/ai-elements/blob/main/LICENSE) is Apache2.0. A plain [shadcn Combobox](https://ui.shadcn.com/docs/components/combobox) is the lowest-level fallback.

Use a shared curated registry for app setup, per-analysis selection and future embedded UI, filtered by actual funding route and supported capabilities. Keep search optional for a short list, put Recommended first, display `1× · 1 credit/min` rather than raw API token prices, and show reasoning only for models that support it. Advanced route/provider details stay outside the everyday flow. Avoid automatically installing the whole component catalogue or a second chat framework. Component research is not deployment; backend link-to-insights acceptance remains first.

## Acceptance

- [ ] Verify exact installed component licence/dependencies and integrate only the needed selector with existing styling.
- [ ] Model/effort/quote uses one server-authoritative registry and hides unavailable routes.
- [ ] Test keyboard, mobile, long names, provider groups, reasoning changes, unknown/stale model IDs and unsupported settings.
- [ ] Test band rounding, minute boundaries, maximum reasoning/output, changed prices, cache hits and immutable reanalysis history.
- [ ] Run bounded quality checks for newly added models under a separate actual allowance; the current two-preparation/one-Muse test does not fund Claude/Gemini sweeps.
- [ ] Verify real whole-flow cost before promising margins, performance or supported model availability.

Sources inspected October 29: [Gateway catalogue](https://ai-gateway.vercel.sh/v1/models), the completed owner benchmark in `outputs/model-research/2026-10-29/`, the component documentation/licences above, and [OpenAI reasoning cost controls](https://developers.openai.com/api/docs/guides/reasoning). No paid inference or package installation was needed for this research.
