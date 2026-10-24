# ADR 146: a compatible private Work Cloud release

Date: October 24, 2026. Status: compatible backend/frontend published; production video acceptance pending.

## Decision

Release a narrow Cloud slice over the serving backend schema while keeping the complete product on main. The full product migration adds indexes whose cumulative backfill and storage costs are not yet defensibly bounded within this run's US$3 ceiling. Do not remove those features, substitute a smaller acceptance plan or silently authorize the migration.

The compatible slice adds no table, index, cron, dependency or retained analysis store. It widens only the existing sources validator for a private work_cloud job and its ordered observation receipt. The old paired-job validator remains accepted. Cloud jobs have no paired-device authority. Source completion, citations, knowledge, export, recovery and deletion retain the existing records and authorization boundaries.

## Private execution boundary

Both text and single-video processing require the configured personal-account allowlist, default-off route gates, recent app authentication, explicit analysis:execute OAuth permission and matching current app grant. An existing read or local-processing grant gains no Cloud execution authority. The approval binds source generation, content, policy, grant version, requested model and effort. Claims bind a random lease token and caller correlation identifier. That identifier and model/runtime reports are not provider attestation.

Text retains its forty-second lease and three-minute deadline. Media has a three-minute lease within a fixed fifteen-minute deadline, one permitted source invocation, 50 MiB source bytes, ten minutes, 48 sampled frames, 200 speech segments and 120,000-byte result/preparation limits. Retained reports remain private; raw audio/video and pixels stay in the provider task. App deletion cannot attest provider history deletion or cancellation. No automatic provider dispatch, pooled subscription, public catalog contribution, paid API fallback, repository requirement or commercial-provider approval follows.

Prepare the supported host, restricted internet permission, verified tools and model before claiming. Report missing prerequisites in structured form without credentials. A preparation report does not start work or verify a result. Never bypass network controls, TLS, isolation or unavailable settings.

## Recovery

The existing source projection returns an owner-only current unclaimed handoff after checking the source, generation, input, active grant/client and route gates. Refreshing or reopening the post recovers its instructions without making another approval or claim. The existing status refresh clears them after claim, expiry, withdrawal or changed authority. A claimed unresolved attempt stays unknown; it is not reassigned automatically.

Cloud expiry and its derived-data cleanup use finite restore-lock deferrals. The new derived cleanup chain also has a total 32-page budget across sections. Exhaustion records retention attention; it does not claim physical deletion. Older callers retain their existing contracts. A stale generation can scrub only its own derived evidence and cannot retry against or alter a newer job.

## Release evidence

The compatible source schema test compares actual exported validators and all indexes with 346b718. A fresh server prediction must independently confirm no source table scan/backfill, unchanged existing indexes/components and no new allocation before publication. An ephemeral discarded preflight schema ID is not the published schema ID. Bind actual start, wait and finish to the same real schema ID.

The final local full check passed at16:29 UTC after the review fixes, with1,019 JavaScript checks,19 native and15 Python checks, three hosted skips, types, lint and both builds. Exact-head CI and actual publication are recorded separately in implementation status. No Cloud video end-to-end production success, public customer availability or speed claim is made by this decision. Keep the reserved owner-test post unanalyzed.

## Published checkpoint, October 24

The [production receipt](../operations/evidence/launch-20261024-cloud-compatible-production.json) records exact compatible source `bcb8662`, acknowledged backend finish, staged checks, promotion and canonical health. The guard halt happened after the server commit and concerns the valid old/target definition-path union; no deployment retry is authorized by that halt. Private configuration is enabled for the existing allowlist. The new provider execution permission is registered, while renewed consent, host tool exposure and a real source-to-cited-result run remain pending. Full-main features and index migration remain separate.
