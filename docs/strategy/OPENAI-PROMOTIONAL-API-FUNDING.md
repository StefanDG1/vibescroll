# Use promotional OpenAI API funding first

Owner request R127, October31,2026. Status: official benefit, account linkage and grant verified; runtime routing not implemented. This supplements the single-Pro pricing/model plan and follows the short-term proposal loop. It does not replace Muse Contributor for public-video analysis or activate a new paid provider.

## Verified external contract

[Official OpenAI documentation](https://developers.openai.com/api/docs/guides/chatgpt-api-credits) states that eligible Pro subscriptions can link to an API organization owned by the subscriber. Current tiers provide USD100/200/500 per subscription billing cycle. The first grant is prorated, unused credits expire each cycle, and later grants renew automatically while the benefit and subscription remain eligible. Subscription age must be at least seven days; API and subscription email must match. Organization ownership and actual account eligibility remain separate checks.

The linked organization consumes free API credits before purchased credits. With no remaining balance, requests fail with credit_balance_exhausted. Existing purchased credits can be consumed automatically after the free balance, so free credits alone do not prove a zero-cash guarantee. Do not enable purchases or Auto Recharge. The documented benefit covers Responses text/code/image understanding and other eligible platform APIs. It explicitly excludes Codex usage through API keys and does not extend signed-in ChatGPT/Codex limits.

## Intended request flow

1. User selects a supported OpenAI model and approves its normal VibeScroll credit quote.
2. Reuse retained preparation: transcript and actual JPEGs for analysis, or complete saved insights and confirmed project profile for proposals.
3. Use a scoped server-only project key belonging to the verified linked API organization, through the Responses API or an explicitly verified Gateway BYOK route. Prefer the direct supported Responses adapter unless Gateway is proven to preserve organization billing and lower complexity. Vercel's ordinary managed key does not establish use of OpenAI promotional credits.
4. Reserve the user's exact model/effort tariff once and a finite operator funding envelope. Record the model, route, organization/project reference, grant period and tariff version without secrets. No model substitution or coding starts from funding preference alone.
5. Retain bounded response/usage before validation. Settle the user once, preserving unknown outcomes. The provider's free-credit ordering handles the subsidy; do not transfer provider credits to users or expose the API key.
6. On exhaustion, expiry, rate limit or unknown funding, preserve the pending result/hold and report the actual state. A purchased-credit or Gateway-paid fallback requires an already authorized explicit policy and its own finite cash allowance. No automatic top-up.

## Small acceptance steps

- Read the actual linked organization's grant, balance, expiry and purchased-credit/Auto Recharge state without changing another product's settings. If unclaimed and several organizations exist, have the owner confirm the exact receiving organization before activation; changing it later requires support.
- Create/configure one restricted service project/key through supported tooling after choosing that organization. Store it through the existing server secret boundary, never in chat, browser storage, screenshots or Git.
- Verify account-available exact model IDs, Responses structured output, image access, actual current token rates and a bounded high-reasoning policy. The older one-rate OPENAI_ALLOWED_MODELS adapter is not a multi-model tariff catalogue.
- Test one tiny funded request, authoritative usage and expiry/exhaustion/replay failures. Then add prepared-evidence analysis and project-plan adapters using the existing reservation/outbox and validation contracts. Do not rerun media for a retained-evidence comparison.
- Release only after exact tests/CI and canonical acceptance. Document actual grant-funded versus paid charges. Add model selection and shared-cache compatibility as their existing work package becomes ready.

## Margin treatment

Keep model credit bands based on sustainable nominal delivery cost, including preparation, storage, failures and support. Promotional funding reduces current cash expense; it is not new revenue or a permanent reduction in model list prices. Track nominal API cost, promotional credit consumed, paid API cash expense and other infrastructure separately. Count the founder's existing monthly Pro subscription once in operating cost. Model both subsidized launch months and the case where the credit expires or is fully used. Do not promise an80% net margin from a temporary grant.

Authenticated API Platform billing confirms an existing linked ChatGPT subscription and an unused available grant. The grant page confirms its issue and expiry dates. Payment methods shows that a paid API billing plan has not started. Account-specific amounts/dates and the browser receipt belong in ignored operator records. The exact organization/project ID and separately displayed Auto Recharge control remain unverified. No claim flow, new key, OpenAI inference, purchase, top-up or routing change has occurred for R127. No owner action is needed to activate the already linked benefit.
