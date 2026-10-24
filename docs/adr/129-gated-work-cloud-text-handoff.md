# ADR 129: a gated Work Cloud text handoff

Status: accepted for local implementation; official-host and production acceptance pending. Date: October 24, 2026.

## Decision

Extend `sources.personalAnalysis` with a versioned `work_cloud` executor alongside its unchanged paired-computer branch. Preserve the existing device index, queues, source records, citation validators and knowledge/category projections. Cloud jobs have no device authority. Supplied text and already retained cited source revisions are supported by this preparatory stage. Raw URLs without retained evidence, uploads, ordered media, service intents and public imports are rejected. This does not pass the real-video or complete C3 requirement.

Require a new explicit `analysis:execute` OAuth scope and matching app grant. Existing read, intake and local-analysis grants gain no execution authority. The private-library owner reviews the exact input hash, grant version, requested model/effort and own-subscription route with zero API spend, using recent authentication. Approval expires after fifteen minutes. No repository connection, installation, paid provider, workflow dispatch or automatic host wake-up follows.

Bind the source's next generation, original selected grant reference, retained revision/content, output schema, pipeline policy and input hash. Do not mutate the user's grant when approval advances the source generation. A first claim binds the current OAuth consent, supplied host task ID and one random token. Persist its hash and return the token once. A claim lasts forty seconds and can be renewed only within its fixed three-minute execution deadline. Input, heartbeat and result operations recheck the current account, membership, private owner, grant/client/version, consent, task, token, source rights/retention, generation and input.

The host receives the existing output JSON schema as a canonical JSON string, an exact run ID and registered citations. The string preserves reserved JSON Schema keys that Convex cannot return as object keys. Completion uses the same validator and atomic source/category/knowledge/notification commit as paired analysis. Each insight must cite registered evidence. Identical completion retries can acknowledge the stored hash under current authority; changed output cannot overwrite it. No service artifact or shared catalog entry is produced.

The MCP result argument is a bounded JSON string, preserving the existing 256-element traversal limit. Only the completion envelope may exceed the original ordinary request bounds. Raw byte limits apply before dispatch; canonical input and result each have a 120,000-byte cap. Bearers stay in the existing supported OAuth transport and never enter job arguments or storage.

An unresolved claimed attempt cannot be erased by replacing source input or selecting another executor. Preserve its existing job metadata as `unknown` after a permitted replacement, while discarding the old source bytes. Privacy deletion and recovery retain their existing scrubbing authority. Deletion, a server lease and cancellation cannot establish that a provider task stopped or refunded allowance. Unknown work is not automatically retried, reassigned or sent to credits.

## Release boundary

`WORK_CLOUD_TEXT_ENABLED` and `WORK_CLOUD_TEXT_VERIFIED` default to false. The existing narrow personal-account eligibility, private ownership and all restore/provider controls remain required. Host task IDs and reported settings are correlation data, not provider attestation. A configured flag or passing fixture does not prove commercial permission, enforced cancellation, resource limits, actual model settings, media acquisition or execution in an official host.

The source page offers one-shot review only for an eligible configured text route. It distinguishes requested settings, app-access revocation and unresolved host usage. General Cloud setup, proactive Events, real link/video return, private project/plan execution and contribution still require their remaining engineering and actual acceptance. Preserve the full R/P/N/C/M scope and existing paired/managed behavior.

The full product backend remains undeployed. The private alternative deployment guard passes offline tests but unconditionally refuses activation because archive size, storage/read amplification, retries and retention costs remain unproved. It changes no original guard or live deployment. Keep the same US$3 cumulative ceiling and all existing holds; no new hosted operation is authorized by this ADR.
