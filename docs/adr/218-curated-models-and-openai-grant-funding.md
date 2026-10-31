# ADR218: curated API models and promotional OpenAI funding

Date: October31,2026. Status: implementation plan, not live inference.

## Use the existing preparation and version store

Keep the accepted yt-dlp/FFmpeg/transcription worker and immutable prepared transcript/JPEG bundle. Add ordinary OpenAI Responses as a provider choice for the managed API route. Reuse current source authority, reservations, unknown-outcome handling, result validation, versions and shared publication. Do not duplicate media or build another queue/database. The legacy serialized executor name `gateway` represents the managed API execution class for compatibility; actual transport/provider/model/funding provenance must identify direct OpenAI accurately. Older requests still choose Muse Contributor without changes.

One server registry defines accepted model IDs, supported reasoning, output/input bounds, current nominal rates and credit bands. Muse Contributor remains the existing1x public-video baseline. GPT-6 Luna is the first bounded OpenAI candidate. GPT-6.1 Sol can be listed as account available but remains unavailable for execution until its own acceptance. Do not enable every listed account model or change the private GLM proposal route from a public-video canary.

## Count the exact multimodal request

The official image guide has not yet listed the newer Luna/Sol image-token multipliers. Do not infer those multipliers from older model families or from JPEG byte size. The supported `POST /v1/responses/input_tokens` accepts the actual model, instructions, images, reasoning and structured-output configuration. Its count includes request formatting. Count the exact semantic packet before generation and bind that count to its hash; bound total billed output, including hidden reasoning, with max_output_tokens. Reuse a successful count only for the exact model/packet/format/effort revision.

Use integer nanodollars for token-rate arithmetic and explicit started-minute credit bands. Round only the final charge/display. Keep nominal provider cost, promotional funding and cash expense distinct. A maximum reservation is not expected cost or a settled invoice.

## Restrict funding and capability

The owner's linked API organization has an unused eligible grant and no started paid API billing plan. A restricted project key was created, encrypted with Windows DPAPI in ignored operator storage and tested only with model listing and a synthetic input-token count. No source or inference was used. The current account grants Luna and Sol; the max-effort structured schema counted49tokens. Exact account IDs, grant amounts/expiry and key material are private operational records.

Use the server secret boundary and an explicit finite funding policy, expiry and actor/job allowance. No purchases, Auto Recharge, purchased-credit fallback, another provider fallback, ChatGPT session pooling or API-key Codex use. The current provider contract automatically uses purchased credits after free credits when purchased funds exist; the grant by itself is not a promo-only API guarantee. Keep the no-paid-billing prerequisite explicit and stop routing if that prerequisite or grant authority changes. The test reservation is bounded under the existing medium-term allowance. Do not invent authority for unlimited nominal API spend.

## Acceptance in order

1. Registry and exact quote/settlement tests, including unknown IDs, unsupported effort, expiry, exhausted allowance, changed rates, cache hits, fractional rates and final-only rounding.
2. Direct Responses adapter with exact-byte image checks, real input token count, bounded structured output and retained returned usage/output before validation. Controlled failures preserve unknown holds and never retry/substitute models automatically.
3. One retained-evidence Luna canary within the existing nominal USD0.025 test envelope. Preserve the incumbent and create a new independently attributed version only after validation.
4. Integrate a small route-specific model/effort control using suitable existing/assistant-ui primitives. Hide unavailable choices and show credit bands. Model selection does not change OAuth or source permission.
5. Exact CI, compatible publication and app/MCP read-back. An old host tool schema may need the supported Refresh tools action for new optional model fields; do not recreate the working app or claim new-field host acceptance without invoking it.

Sources actually inspected: [token-counting guide](https://developers.openai.com/api/docs/guides/token-counting), [count endpoint](https://developers.openai.com/api/reference/resources/responses/subresources/input_tokens/methods/count), [image guide](https://developers.openai.com/api/docs/guides/images-vision), [API benefit](https://developers.openai.com/api/docs/guides/chatgpt-api-credits), [Luna](https://developers.openai.com/api/docs/models/gpt-6-luna), [Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol). Account/model metadata acceptance is not production analysis acceptance.
