# ADR 164: one pinned setup download before a Cloud job

Date: October 26, 2026. Status: unpublished candidate; private setup tests passed, automatic media unaccepted.

## Decision

Provide one immutable, tools-only website ZIP for the existing native Cloud setup message. Include the eleven accepted caption package files, their manifest, both standalone decoder adapters and the project license. Keep every accepted v2/v3 source pin unchanged. Do not require GitHub access or a repository checkout. The public bundle contains no user data, model weights, interpreter binaries or credentials.

Use a content-hashed URL, exact archive size/SHA256 and per-file pins. Build a canonical stored ZIP with fixed metadata across Windows and Linux. The offline verifier reconstructs the archive and refuses changed files, unexpected expansion or a mismatched committed asset. Unpacking requires flat regular files, exact membership and finite size limits before execution. Install only the two pinned pure Python caption wheels through the existing no-hook installer.

Caption readiness does not imply ASR readiness. The real supplied TikTok metadata inspection succeeded but returned no supported captions. A separately reviewed private CPython 3.13.17 runtime, twenty-four wheel files and the existing English Whisper model passed an offline synthetic initialization/transcription test. Its first attempt stopped at the unchanged 1.5 GiB cache bound. Read-only inventory identified three owned partial model downloads. Exact-name/size cleanup after canonical pin verification restored the original bound; the final test used the real model and kernel network denial. Their creation cause is unknown. No automatic download retry is approved by this evidence.

## Preserve approval while preview metadata arrives

A pending app-Save intent binds the source title and revision. The existing asynchronous preview could rewrite those fields before consumption and make the otherwise current intent disappear. Two regression cases reproduced that failure, with and without a thumbnail. During an unconsumed intent, retain preview metadata and assets in their existing projection while preserving the approved title/revision. Use the same validated text-update rules across preview completion branches. Actual user edits still invalidate the intent through the unchanged source hash. Do not refresh approval from provider metadata or weaken grant, rights, retention or generation checks.

## Validation and limits

The actual native caption setup verified source pins and prepared two synthetic caption segments and two JPEGs without ASR; the image viewer displayed a generated frame. The ASR test used a generated tone, with one actual model constructor and one transcription call, producing zero segments. This is setup evidence, not speech accuracy. Known synthetic files were reported removed. Verified caches remain; provider-history deletion is not attested.

The website archive has not been fetched by the native host or deployed. Complete local/CI verification of both branches, exact release checks, current lease control and one funded event-triggered app-Save-to-real-result test before enabling automatic analysis. Preserve all saved data, original-image repair, unknown/reserved posts and provider/privacy/release gates. [Sanitized setup receipt](../operations/evidence/launch-20261026-native-cloud-tools.json).
