# Run the reviewed caption-first Cloud package

This package prepares private evidence. It does not contain MCP credentials, launch a Cloud host or authorize source access. It admits single Instagram/TikTok videos; other platform cohorts remain separate. All actual host, source, permission, quota and lease checks still apply.

## Prepare tools once

Run `python scripts/build-cloud-media-package.py --build` from a reviewed checkout. The fixed file list excludes source media, account files and credentials. The generated archive contains the exact files bound by `cloud-extractor.lock.json`. Check the archive/source hashes before installing it in a separate tools-only directory.

Install `requirements-captions.lock` with `--require-hashes --no-index --only-binary=:all: --no-deps` during setup. A separate `_deps` directory beside the scripts is supported. It keeps the existing legacy downloader/ASR cache unchanged. Python 3.10 or newer supports the caption path; the pinned English ASR fallback requires its separately verified Python 3.13/model runtime. Caption success needs no ASR import or model cache.

If the managed host has no pip, use the reviewed `prepare_cloud_dependencies.py --directory /absolute/tools/_deps` during this same explicit setup. It fetches only the two pinned pure-Python wheels, verifies both before extraction, rejects redirects/traversal/symlinks and retains wheel license metadata in a fresh directory. It runs no installation hooks and does not bootstrap a package manager or change the old environment. Source execution never invokes this installer automatically.

New media-v3 uses yt-dlp 2026.10.21 and pysubs2 1.9.0. Existing media-v2 keeps its 2026.08.19 executable/toolchain binding. A tool version is not proof that an arbitrary platform URL can be acquired. Verify current enforced isolation/network/resource policy before requesting or claiming work. Never use cookies, disable TLS verification, fetch remote executable components or silently switch to a paid provider.

## Execute one current media-v3 lease

1. Save/reuse the post, obtain its approved job and claim once through the existing MCP tools. Reconcile a lost claim rather than replacing it.
2. Read `work_cloud_input`. Save its bounded response plus the current task correlation as a private context file. Keep lease/OAuth credentials out of command arguments, package files and logs.
3. Run `cloud_job.py inspect --directory /absolute/new-job --context-file /absolute/context.json --url APPROVED_CANONICAL_URL`. It verifies package hashes and downloader version before inspecting the source. The directory must be fresh and private. Publish the returned small native metadata with `work_cloud_metadata`.
4. Run `cloud_job.py acquire --directory /absolute/new-job`. It resumes the same resolved information within the original acquisition deadline and acquires bounded video/audio and up to four caption candidates. It does not revisit the source page. Native provider locators stay in private task files.
5. Disable source networking through the host's supported enforcement. A CLI flag is a declaration, not evidence of enforcement. Run `cloud_job.py prepare --directory /absolute/new-job --source-network-disabled`. Supply a verified model directory and explicit `--asr-language en` only when an English fallback is needed and ready. The execution deadline bounds preparation. Renew the actual MCP lease between bounded steps or through the host's supported asynchronous execution controls.
6. Inspect the exact generated JPEG files. Write `observations.json` with frame IDs and descriptions of what was actually seen. Do not call generated images inspected merely because FFmpeg produced them.
7. Run `cloud_job.py bind --directory /absolute/new-job`. Submit its `preparation.json` with `work_cloud_prepare`. Upload every prepared JPEG with `work_cloud_frame`, checking each acknowledgement. Do not route base64 pixels through model prose.
8. Analyze the selected transcript and inspected imagery. Return structured insights citing only bound evidence through `work_cloud_complete`, then fetch the same saved result. A ready result requires actual frame attachments for caption-aware observations.
9. Reconcile uncertain acknowledgements before any retry. Delete raw task media, locators, context and temporary results within the approved deadline after required acknowledgements. Keep the reviewed tools cache separate. Do not claim provider-history deletion from filesystem cleanup.

## Restore screenshots on an existing completed result

The app owner first approves an exact preparation with `workCloudEvidenceRepair.approve` through the authenticated recovery control. This preserves the original analysis, preparation, generation and expired analysis lease. It grants no new analysis or publication.

Claim `work_cloud_repair_claim` once with a new correlation, then read `work_cloud_repair_input`. The fresh repair lease is short and bound to current consent/grant/retention. Reacquire only the owner-authorized source and verify its exact original asset bytes before decoding. `restore_cloud_frames.restore_frames` reproduces the recorded operator recipe once per frame. A different source or JPEG hash stops the repair; do not change accepted observations to fit new bytes.

Renew only the still-active repair lease with `work_cloud_repair_heartbeat` between bounded steps. Its approval deadline is fixed; raw task files have a separate explicit cleanup target. An expired repair cannot be revived.

Return matching JPEGs through `work_cloud_frame` with `repair=true` and the fresh repair lease, then acknowledge `work_cloud_repair_complete`. Missing required images cannot be marked complete. Changed authority after storage I/O queues the unattached object for cleanup. Reopening an expired analysis lease or overwriting the accepted analysis is never part of repair. Image restoration alone does not verify the transcript against speech.

## Managed-host preparation readiness

Check actual Python imports and a generated video/caption preparation before claiming a real job. New Cloud preparation uses the admitted FFmpeg/FFprobe for JPEG encoding, dimensions and small pixel comparisons; Pillow is not a Cloud dependency. Frame output is at most81920bytes so it fits the existing staged preparation transport. Review actual caption-first success without ASR or model initialization.

The bounded launcher preserves only standard proxy/no-proxy and certificate variable names from the trusted managed environment. Never print their values or substitute a direct connection. This is necessary to keep its restricted enforcement transport. Acquisition networking must still be admitted by the host, and decoding/ASR must run with actual source networking disabled. An available downloader binary alone does not prove those controls.
