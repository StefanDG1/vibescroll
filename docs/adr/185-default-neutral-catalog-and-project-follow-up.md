# ADR 185: automatic neutral catalog and useful MCP follow-up

Date: October 28, 2026. Status: implementation in progress, not enabled. The owner explicitly requests completing the shared database in production and prioritizing backend MCP actions over widget or MCP interface work.

## Default contribution

Replace the routine per-post contribution dialog with one disclosed service policy for new analysis requests. Store its exact hash, disclosure version, requesting account and request time on the saved source. Existing private results are not retroactively relabelled. Reanalysis can create a new candidate under the current policy while its predecessor stays intact.

Retain the existing per-source licensed/owned/public-domain authority variant. Add an honest `user_attested` variant for the default policy, bound to the actual authenticated public-link request and its source-rights attestation. This is a user assertion, not an independently verified licence or a fabricated provider approval. Provider/source-access gates, no-cookie acquisition, takedown, current account authority and retention remain enforced. Operator configuration must record the real supported route and reviewed disclosure; a model output cannot provide that authority. Keep personal notes, project context, credentials and implementation proposals outside neutral evidence.

The initial authenticated media completion can create an immutable version with its real completion/input/policy hashes. Preserve the older `legacy_recorded` variant for historical snapshots. Scheduled publication uses a bounded internal capability tied to the recorded request and account. It does not impersonate a user or depend on copying an OAuth token into a background job. Revalidate current authority before source reads, each independent image copy and final publication.

Use the existing catalog families, aliases, contributions, independent evidence, artifacts and personal imports. Share one independently retained evidence bundle across compatible versions. Select the first eligible automatic result with an explicit programmatic basis, without inventing a human quality review. Later upgrades follow an owner-controlled model/effort preference policy; requested settings remain distinct from provider-attested execution and measured quality. Keep private pins, comparison and rollback. The operator model-order preference can promote a stronger requested/reported configuration; it is explicitly not a measured quality ranking. Preserve a human-selected family recommendation.

Default saved results use an explicit until-deleted mode. Retain the original finite processing timestamps for provenance; do not use them as live worker credentials. Clear only sampled-JPEG expiry after acknowledged completion and keep raw downloads temporary. For V2 standing authority, renewing unchanged review dates preserves the semantic permission identity and existing durable artifacts; changes to actual rights, references, source, retention or policy still invalidate access. V1 exact permissions retain their previous whole-record hash behavior.

Equivalent in-flight saves should wait for one producer, with bounded waiter records and finite expiry. Waiting never transfers or pools another user's subscription, changes funding or starts a second job. A failed/unknown producer stays explicit and cannot silently elect another paid attempt. Publish/fan out only after the independent artifact commits successfully. All cache reads, versions and image routes enforce current access and takedowns.

## Real access and acceptance

Verified Pro access remains unchanged. An explicit finite operator alpha entitlement may admit the two owner-authorized test accounts without fabricating a paid subscription, billing period, wallet balance or payment. Report that as an alpha-access test, not paid acceptance. Keep unauthorized accounts denied. No new live price, purchase or alternate funding route is introduced.

Test a new ordinary source through completion, automatic independent publication, a second-account save/cache hit, immutable history, selection/rollback, retained screenshots, owner removal, revoked/expired access, takedown, duplicate/concurrent saves and an unresolved producer. Preserve all old data and cost holds. Shared reuse is not accepted merely because a flag is enabled or synthetic tests pass.

## MCP post-to-project follow-up

After analysis or a cache hit, an MCP follow-up should reuse the exact saved version. Suggest projects using category/subcategory overlap and explain the matching categories. A category match is a candidate, not proof an idea belongs in the codebase. Read the chosen project's current confirmed repository context, exclude already-implemented ideas, and draft a cited implementation plan or targeted questions. Keep stable source/version/insight and repository/commit references so later outcomes can be measured.

The owner explicitly wants easy follow-up such as applying a saved post to a project. Do not require the whole video to be downloaded or analysed again. Start coding only through a separately selected and supported execution route and explicit implementation intent. Do not infer coding or spending authority from post text, category similarity or an accepted insight.

Current official [App Server documentation](https://developers.openai.com/codex/app-server) documents thread/start, thread/resume, turn/start and turn/steer for clients. It recommends the SDK for job automation and labels remote WebSocket transport experimental/unsupported for production. [Remote connections](https://developers.openai.com/codex/remote-connections) documents paired user devices and connected hosts; it does not establish a public third-party website API for arbitrary signed-in desktop chats. The existing local companion can supply a device-bound queue boundary, but actual delivery, device availability, supported authentication and execution remain separate acceptance requirements. Do not expose a desktop app-server port publicly or upload the user's local subscription credentials.

## Provider evidence boundary

Re-read the official [OpenAI European terms](https://openai.com/policies/eu-terms-of-use/) on October 28. They distinguish user responsibility for input permissions, output ownership as between the user and OpenAI, and third-party output. Output ownership does not establish a licence to the original video, transcript or creator images. The default authority therefore records the submitting user's assertion honestly and retains the current provider/source-access gates; it does not label arbitrary public posts independently licensed. The supported [MCP Events contract](https://developers.openai.com/plugins/build/mcp-events) supplies the user-bound wake/return mechanism, not source-content rights or a shared founder subscription. Only current eligible user sessions run inference; a cache hit starts no inference.
