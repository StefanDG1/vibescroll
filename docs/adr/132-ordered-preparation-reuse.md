# ADR 132: reuse verified ordered preparation after a failed analysis

Status: accepted for local implementation; production acceptance pending. Date: October 24, 2026.

## Decision

Reuse the existing source, personal job and prepared-object records. New ordered preparations can carry an optional immutable `personal-ordered-preparation-v1` stamp containing original generation, stable input and pipeline bindings, and the actual existing sandbox creation receipt. Save prepared-object ETags. Never manufacture these fields for old preparations.

Require the same source/workspace, exact ordered input and metadata, raw/prepared asset IDs, keys, ETags, hashes, bytes, types, retention and rights. Bind the actual current preparation runtime, decoder and versioned policy. Require the original compute reservation to be dispatched and settled. Read the complete source-specific reservation prefix with a one-hundred-row ceiling; any nonsettled/unknown row or exceeded bound blocks retry. A prior active device claim must first reconcile. This is a bounded preparation-history check, not a new analysis counter or queue.

Only a terminal failed/expired paired analysis can reuse preparation. A terminal preflight can reuse an already rebased stamped handoff only when its exact prepared hash proves that earlier reuse. Canceled, unknown, mismatched-generation and unstamped work retain their existing boundaries. Reuse never authorizes automatic retry or promises free inference.

Fresh explicit own-plan approval still binds the actual account, current image-capable model/effort and supported protocol. Rebind raw/prepared asset execution generations and current input/prepared hashes atomically. Preserve the original preparation generation, actual receipt, preparedAt and expiry. A fresh account/model/ASR preflight must pass again before analysis. Only then skip another decoder workflow and compute reservation. An identical preflight acknowledgment cannot clear a later analysis claim or another source.

Keep pure preparation runtime/schema functions in `packages/contracts`, with a compatible facade at their old server import path. Native media imports use explicit `.ts`. Preserve the packaged runner's provider-path exclusion; do not broaden the allowlist to make an import pass. Existing unstamped rows can complete through the ordinary preparation route without a retroactive reuse claim.

## Evidence and limits

[The receipt](../operations/evidence/launch-20261024-ordered-preparation-reuse.json) records 1,533 passing offline tests and three hosted skips, both builds, all types, native packaging and retained failures. This was checked before forwarding to separately tested PR145; exact combined-head CI remains required. Original flags, funding/provider/privacy controls, signed-distribution requirements and the same US$3 cap remain. No provider or hosted request was made. The model/local transcription may run again; fixture reuse is not an observed customer saving or provider stop/usage attestation.
