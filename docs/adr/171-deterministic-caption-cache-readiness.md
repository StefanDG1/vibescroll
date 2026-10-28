# ADR 171: verify caption cache readiness deterministically

Date: October 26, 2026. Status: implementation candidate.

## Reproduced failure

The second actual automatic saved-link action stopped before requesting a job. Its improvised preflight compared 1,087 regular dependency files with a sealed count of 1,085 hashed payload files. Read-only diagnosis found no drift. The other two files are the wheels' RECORD self-entries, whose own CSV rows deliberately have no hash. Every original payload and source pin matched. No cache repair or deletion was needed.

## Decision

Add a standard-library-only caption_cache_readiness.py helper. Verify both RECORD files against exact reviewed byte/hash pins, then verify every declared payload hash and size. Require exactly one unhashed self-entry per RECORD. Reject extra or missing files, duplicate/traversal names, symlinks, special files, unexpected directories and changed bytes. Bound traversal, individual files and total bytes. Print separate hashedPayloadFiles, recordSelfEntries and totalRegularFiles fields. Do not compare unlike counts.

The CLI fixes the supported pins and offers no record override, installation, network, import of either third-party package, cache mutation or source/job access. Python -I -B keeps it isolated from user Python configuration and avoids bytecode writes. This helper verifies integrity only; it grants no source, provider/network, model, image, funding or lease authority. Retain actual host admission, V2 decoder denial and all other readiness checks.

Distribute it as a separately pinned setup/preflight helper alongside the existing standalone decoder adapters. Keep the accepted eleven-file extraction package and current media policy/hash unchanged. Preserve the previous immutable website ZIP for retained tasks. Fresh generated setup instructions must invoke this helper rather than inventing another file-count assertion.

## Evidence

Eight synthetic integrity cases pass locally, with the Windows symlink case explicitly skipped on this host. Cases cover the RECORD count distinction, same-size payload tampering, changed RECORD authority, extra bytecode/files, missing payloads, unexpected directories, path traversal and symlinks. Two independently downloaded, checksum-verified pinned wheel archives also pass the helper: 1,085 hashed payloads, two RECORD self-entries, 1,087 regular files, 10,842,844 bytes. No third-party code was imported.

Exact CI, native helper acceptance, the next automatic media attempt and production website distribution remain separate. The previous automatic stop and subsequent manual read-only diagnosis are retained; no automatic analysis success is claimed.

## Operational phase correction after automatic acquisition

The next automatic run passed the verifier, acquired the104-second TikTok and accepted native metadata, then stopped on a contradictory operational instruction prohibiting model construction during both preflight and the job lease. Preflight remains static. Actual authorized preparation may initialize the separately verified local model under fresh V2 when captions are unavailable; it still cannot install dependencies, download weights or repair caches during the lease. The existing local_whisper implementation requires that initialization. An independent source review confirmed the distinction. This corrects instructions, not the media policy/hash or source authority. The consumed generation1 remains unknown and nonreplayable; provider usage/deletion stay unverified.
