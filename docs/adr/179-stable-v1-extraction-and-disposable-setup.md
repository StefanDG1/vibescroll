# ADR 179: stable v1 extraction and disposable setup

Date: October 28, 2026. Status: local checks passed; native setup and automatic source acceptance tracked separately.

## Decision

The owner prioritizes a stable v1 over repairing historical incomplete test results. Stop spending on exact screenshot reconstruction for the original disputed Reel. Use the existing authorized source-deletion flow for that identified incomplete result. Do not infer permission to delete every failed, unknown, reserved or valid library item. Preserve budget history and sanitized failure receipts even when test content is deleted. App deletion queues storage deletion; it does not prove provider erasure.

Continue the caption-first downloader and require the complete transcript, actual prepared screenshots, thumbnail and cited insights before claiming an automatic video result passed. A source failure must remain a failure, with its fixed diagnostic, rather than a successful result assembled from partial or fabricated evidence. The current caption-first media contract and publication, privacy and funding gates remain authoritative.

## Setup changes

Fetch the unchanged public tool pins in batches of at most four. Join every worker in a batch before continuing, including failure paths. A failed batch permits no following batch, install or automatic retry. Report setup phase timings so wall-clock improvement can be measured in the native environment rather than inferred from concurrency alone.

The immutable bootstrap also accepts an explicit optional fresh model directory. It downloads only the original four revision-bound model files, verifies every byte size and SHA256, then atomically publishes the existing model manifest. It never constructs a model, transcribes, repairs an existing directory or downloads source media. Model redirects stay on provider-owned HTTPS hosts. The command shares one 900-second setup deadline; all 29 public downloads remain within the existing sealed plan. Setup stays outside a source lease, with the existing combined-cache and runtime limits. Default runtime-only invocation still downloads no model.

Reuse only currently verified caches. The observed unexpected generated model partials and previously changed model bytes have an unknown cause. Do not attribute them to a library or host without evidence. Removal of a specifically identified bad cache or temporary file requires checking its resolved path, ownership and absence of owned writers. Preserve sanitized receipts and valid canonical files. Do not weaken strict model verification to make readiness pass.

## Verification

Sixteen focused Python cases pass, including actual overlapping download workers, failure joining without retry, exact model pins, damaged sibling preservation, expired setup, atomic readiness and provider redirect bounds. The full local check passes validation, lint, types, test suites and both production builds. Windows isolation tests retain their explicit platform skips.

The native candidate completed its 29 public downloads and runtime setup in 86.675 seconds. Independent verification passed 25 runtime artifacts, 24 versions, 2,229 installed payloads and four canonical model pins, then rejected an unexpected sixth model file. This is successful provisioning with blocked readiness, not an accepted source analysis. Subsequent cleanup/readiness and a fresh actual app Save require their own recorded outcomes. The new bootstrap has not been published to the website merely because it was attached to the private native task.

No plugin feature, OAuth client, grant, scope, schema or provider configuration changes belong to this decision. Keep Vercel included usage below USD20 and retain all previous spending holds.

## Accepted private outcome

The exact identified temporary file was removed after stable inventory/hash checks and completion of owned writers. Strict model verification passed before and after, without another download or weaker rules; actual V2 socket denial passed. The cause of the temporary file remains unknown.

A subsequent actual app Save, with ChatGPT closed, automatically produced15 transcript segments,7 retained JPEGs and a matching thumbnail,3 insights and19 references from a29.548-second Reel. All displayed transcript segments, actual JPEG bytes/hashes/dimensions, canonical MCP retrieval and the full-size viewer passed. Save-to-result took417.742seconds; source-job approval to completion took315.058seconds. These timings include native scheduling and agent work, not just extraction. This is one accepted private run, not a reliability percentage or a manually certified transcription benchmark. The finite pilot paused after its reserved job.

Exact Linux CI40681199434 passed for candidatec7ce9df. The frontend and new immutable bootstrap were published through one staged Basic build and same-build promotion, with canonical checks and normal domain assignment restored. The backend and plugin did not change. See the [sanitized acceptance and release receipt](../operations/evidence/launch-20261028-stable-v1-reel.json).
